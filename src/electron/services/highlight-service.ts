import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import log from 'electron-log';
import type { WebSocketService } from './websocket-service';
import type { VideoRecordingService } from './video-recording-service';
import type { RequestCreateClip, RequestCreateClipAck } from '../typings/data';

/** generation 为本地代次：Hub 每次下发同一任务项都会换发凭证，后到的下发取代先到的 */
type ClipItem = RequestCreateClip['items'][number] & { generation: number };

const UPLOAD_CHUNK_SIZE = 1024 * 1024;
/** 请求体按 16 KiB 片段匀速写出，避免整块突发挤占推流 */
const UPLOAD_SLICE_SIZE = 16 * 1024;
/** 未配置上行带宽时的上传限速 */
const DEFAULT_UPLOAD_LIMIT_MBPS = 8;
/** 上传限速下限：max(2 Mbps, 上行 − 2 × 推流码率)，系数依据精彩回放联合压测（浅缓冲路由器下 1.5 仍会丢包） */
const MIN_UPLOAD_LIMIT_MBPS = 2;
const STREAM_BITRATE_FACTOR = 2;
/** 连续失败的重试次数上限，退避 2/4/6/8/10/10s，可覆盖约 40s 的断网 */
const UPLOAD_MAX_RETRIES = 6;
/** 截取终点向后多取的时长，抵消时钟同步误差 */
const END_MARGIN_MS = 500;
/** 录制数据每秒落盘一次，截取前等待数据覆盖终点 */
const FLUSH_WAIT_MS = 1500;

class ClipError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** 令牌桶，允许欠账：取走后余额为负就等到补齐 */
class TokenBucket {
  private tokens = 4 * UPLOAD_SLICE_SIZE;
  private last = Date.now();
  /** bytes per ms */
  rate = 1;

  async take(n: number) {
    const now = Date.now();
    this.tokens = Math.min(4 * UPLOAD_SLICE_SIZE, this.tokens + (now - this.last) * this.rate);
    this.last = now;
    this.tokens -= n;
    if (this.tokens < 0) {
      await new Promise((resolve) => setTimeout(resolve, -this.tokens / this.rate));
    }
  }
}

/**
 * 精彩回放服务 - 处理 Hub 的切片请求：从本地录像截取片段并断点上传
 */
export class HighlightService {
  private cacheDir: string;
  private queue: Promise<void> = Promise.resolve();
  /** 任务项最新代次，收到新的下发后旧代处理会被放弃 */
  private latestGenerations: Map<string, number> = new Map();
  /** 所有上传共用，任务项串行处理，总速率不超过限速 */
  private bucket = new TokenBucket();

  constructor(
    private webSocketService: WebSocketService,
    private getVideoRecordingService: () => VideoRecordingService | undefined,
    private getBandwidth: () => { uplinkMbps?: number; streamBitrate: number },
  ) {
    this.cacheDir = path.join(os.homedir(), '.Kessoku-the-Broadcaster', 'cache');
  }

  /**
   * 接收切片请求，立即返回 ACK，任务项在后台依次处理
   */
  handleRequest(data: RequestCreateClip): RequestCreateClipAck {
    const { alias, userId } = this.webSocketService.getHttpContext();
    if (
      data.uca !== alias ||
      data.userId !== userId ||
      !Array.isArray(data.items) ||
      !data.items.length
    ) {
      return {
        accepted: false,
        errorCode: 'invalid_request',
        errorMessage: '切片请求与当前选手不匹配',
      };
    }
    if (!data.preferred?.containers?.includes('webm')) {
      return { accepted: false, errorCode: 'unsupported_media', errorMessage: '仅支持上传 WebM' };
    }

    for (const requested of data.items) {
      const item = {
        ...requested,
        generation: (this.latestGenerations.get(requested.itemId) || 0) + 1,
      };
      this.latestGenerations.set(item.itemId, item.generation);
      this.queue = this.queue
        .then(() => this.processItem(data, item))
        .catch((error) =>
          log.error('精彩回放处理异常', { taskId: data.taskId, itemId: item.itemId, error }),
        );
    }
    return { accepted: true };
  }

  private async processItem(data: RequestCreateClip, item: ClipItem) {
    const isStale = () => this.latestGenerations.get(item.itemId) !== item.generation;
    const mediaPath = path.join(this.cacheDir, `clip_${item.itemId}_${item.generation}.webm`);
    const thumbnailPath = path.join(this.cacheDir, `clip_${item.itemId}_${item.generation}.jpg`);
    log.info('开始处理切片', { taskId: data.taskId, itemId: item.itemId, trackId: item.trackId });

    try {
      if (item.trackId.startsWith('microphone')) {
        throw new ClipError('unsupported_media', '音频轨道不支持精彩回放');
      }
      const videoRecordingService = this.getVideoRecordingService();
      if (!videoRecordingService) {
        throw new ClipError('recording_range_missing', '未在录制');
      }
      await this.reportProgress(data, item, 'client_processing', 10);

      // 服务端时间换算为本地时间
      const offset = await this.webSocketService.getServerTimeOffset();
      const startTime = data.startServerMs - offset;
      const endTime = data.endServerMs - offset + END_MARGIN_MS;
      const waitMs = endTime + FLUSH_WAIT_MS - Date.now();
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }

      const clip = await videoRecordingService.cutClip(item.trackId, startTime, endTime, mediaPath);
      if (!clip.success) {
        throw new ClipError(clip.errorCode || 'clip_cut_failed', clip.error || '截取失败');
      }
      const hasThumbnail = await videoRecordingService.extractThumbnail(mediaPath, thumbnailPath);
      if (isStale()) return;
      await this.reportProgress(data, item, 'client_processing', 30);

      const metadata = {
        actualStartServerMs: Math.round(clip.actualStartTime + offset),
        actualEndServerMs: Math.round(clip.actualEndTime + offset),
        durationMs: clip.durationMs,
        width: clip.width,
        height: clip.height,
        videoCodec: clip.videoCodec,
        audioCodec: clip.audioCodec,
        container: 'webm',
      };
      const thumbnail = hasThumbnail
        ? await this.uploadFile(data, item, thumbnailPath, 'thumbnail', 'image/jpeg', isStale)
        : undefined;
      if (thumbnail) {
        // 缩略图需先单独 complete，媒体 complete 时 Hub 才会关联；接口要求带 metadata
        await this.postJson(item, `/api/clips/uploads/${thumbnail.uploadId}/complete`, { metadata });
      }
      const media = await this.uploadFile(
        data,
        item,
        mediaPath,
        'media',
        'video/webm',
        isStale,
        (ratio) => this.reportProgress(data, item, 'uploading', 30 + Math.floor(ratio * 65)),
      );
      if (isStale()) return;

      await this.postJson(item, `/api/clips/uploads/${media.uploadId}/complete`, {
        metadata,
        thumbnail: thumbnail && {
          mimeType: 'image/jpeg',
          byteSize: thumbnail.size,
          checksumSha256: thumbnail.checksum,
          uploadId: thumbnail.uploadId,
        },
      });
      log.info('切片已提交 Hub 校验', {
        taskId: data.taskId,
        itemId: item.itemId,
        durationMs: clip.durationMs,
      });
    } catch (error) {
      if (isStale()) return;
      const code = error instanceof ClipError ? error.code : 'client_failed';
      log.error('切片处理失败', {
        taskId: data.taskId,
        itemId: item.itemId,
        code,
        error: (error as Error).message,
      });
      await this.reportProgress(data, item, 'failed', 0, code, (error as Error).message);
    } finally {
      fs.rmSync(mediaPath, { force: true });
      fs.rmSync(thumbnailPath, { force: true });
    }
  }

  /**
   * 创建上传会话并按 1 MiB 分块上传；网络错误时通过 HEAD 获取已确认 offset 续传，偏移冲突时以 409 返回的 offset 为准
   */
  private async uploadFile(
    data: RequestCreateClip,
    item: ClipItem,
    filePath: string,
    role: 'media' | 'thumbnail',
    mimeType: string,
    isStale: () => boolean,
    onProgress?: (ratio: number) => Promise<void>,
  ) {
    const size = fs.statSync(filePath).size;
    const checksum = await sha256(filePath);
    const limitMbps = this.getUploadLimitMbps();
    this.bucket.rate = (limitMbps * 1e6) / 8 / 1000;
    log.info('切片上传限速', { itemId: item.itemId, role, limitMbps });
    const created = await this.postJson<{ uploadId: string; uploadUrl: string; offset: number }>(
      item,
      `/api/clips/tasks/${data.taskId}/uploads`,
      {
        itemId: item.itemId,
        trackId: item.trackId,
        role,
        fileName: path.basename(filePath),
        mimeType,
        uploadLength: size,
        checksumSha256: checksum,
      },
    );

    let offset = created.offset;
    let retries = 0;
    /** 出错后先 HEAD 取 Hub 已确认的 offset 再继续，HEAD 失败同样计入重试 */
    let resync = false;
    const handle = await fs.promises.open(filePath, 'r');
    try {
      while (offset < size) {
        if (isStale()) {
          throw new ClipError('stale_generation', '已收到更新的切片请求');
        }
        try {
          if (resync) {
            const head = await this.request(item, created.uploadUrl, { method: 'HEAD' });
            if (head.status >= 500) {
              throw new Error(`查询上传进度失败: HTTP ${head.status}`);
            }
            if (head.status !== 204) {
              throw new ClipError('upload_rejected', `查询上传进度失败: HTTP ${head.status}`);
            }
            offset = Number(head.headers.get('Upload-Offset'));
            resync = false;
            continue;
          }
          const chunk = Buffer.alloc(Math.min(UPLOAD_CHUNK_SIZE, size - offset));
          await handle.read(chunk, 0, chunk.length, offset);
          let sent = 0;
          const body = new ReadableStream<Uint8Array>({
            pull: async (controller) => {
              if (sent >= chunk.length) {
                controller.close();
                return;
              }
              const slice = chunk.subarray(sent, sent + UPLOAD_SLICE_SIZE);
              await this.bucket.take(slice.length);
              sent += slice.length;
              controller.enqueue(slice);
            },
          });
          const resp = await this.request(item, created.uploadUrl, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/offset+octet-stream',
              'Content-Length': String(chunk.length),
              'Upload-Offset': String(offset),
            },
            body,
            duplex: 'half',
          } as RequestInit);
          if (resp.status === 204 || resp.status === 409) {
            // 409 时以 Hub 已确认的 offset 为准
            offset = Number(resp.headers.get('Upload-Offset'));
            retries = 0;
            await onProgress?.(offset / size);
            continue;
          }
          if (resp.status >= 500) {
            // Hub 重启期间网关返回 502 等，按网络错误退避后 HEAD 续传
            throw new Error(`上传失败: HTTP ${resp.status}`);
          }
          throw new ClipError('upload_rejected', `上传被拒绝: HTTP ${resp.status}`);
        } catch (error) {
          if (error instanceof ClipError || ++retries > UPLOAD_MAX_RETRIES) {
            throw error instanceof ClipError
              ? error
              : new ClipError('upload_failed', (error as Error).message);
          }
          await new Promise((resolve) => setTimeout(resolve, Math.min(retries * 2000, 10000)));
          resync = true;
        }
      }
    } finally {
      await handle.close();
    }
    return { uploadId: created.uploadId, size, checksum };
  }

  private async reportProgress(
    data: RequestCreateClip,
    item: ClipItem,
    status: 'client_processing' | 'uploading' | 'failed',
    progress: number,
    errorCode?: string,
    errorMessage?: string,
  ) {
    try {
      await this.postJson(item, `/api/clips/tasks/${data.taskId}/progress`, {
        itemId: item.itemId,
        status,
        progress,
        errorCode,
        errorMessage: errorMessage?.slice(0, 500),
      });
    } catch (error) {
      log.warn('切片进度上报失败', {
        taskId: data.taskId,
        itemId: item.itemId,
        error: (error as Error).message,
      });
    }
  }

  /** 上传限速（Mbps）：未配置上行带宽时取保守值 */
  private getUploadLimitMbps() {
    const { uplinkMbps, streamBitrate } = this.getBandwidth();
    if (!uplinkMbps) {
      return DEFAULT_UPLOAD_LIMIT_MBPS;
    }
    return Math.max(
      MIN_UPLOAD_LIMIT_MBPS,
      uplinkMbps - (STREAM_BITRATE_FACTOR * streamBitrate) / 1e6,
    );
  }

  /**
   * 网络错误与 5xx 退避重试；Hub 的建会话、complete、progress 接口均可重复调用
   */
  private async postJson<T = unknown>(item: ClipItem, route: string, body: unknown): Promise<T> {
    let resp: Response;
    for (let retries = 0; ; retries++) {
      try {
        resp = await this.request(item, route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (resp.status < 500 || retries >= UPLOAD_MAX_RETRIES) break;
      } catch (error) {
        if (retries >= UPLOAD_MAX_RETRIES) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min((retries + 1) * 2000, 10000)));
    }
    const result = await resp.json().catch(() => null);
    if (!result?.success) {
      throw new ClipError('hub_rejected', result?.msg || `Hub 请求失败: HTTP ${resp.status}`);
    }
    return result.data as T;
  }

  private request(item: ClipItem, route: string, init: RequestInit) {
    const { baseURL, alias } = this.webSocketService.getHttpContext();
    return fetch(`${baseURL}${route}`, {
      ...init,
      signal: AbortSignal.timeout(30000),
      headers: { ...init.headers, 'X-UCA': alias, 'X-Upload-Token': item.uploadToken },
    });
  }
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}
