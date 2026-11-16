import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { getFFmpegpath } from '../utils/path-resolver';
import log from 'electron-log';
import { RecordingData, RecordingFile } from './../typings/data';

export interface ClipCutResult {
  success: boolean;
  filePath?: string;
  /** 片段实际起止（本地毫秒时间戳），起点对齐到关键帧 */
  actualStartTime?: number;
  actualEndTime?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  videoCodec?: string;
  audioCodec?: string;
  errorCode?: string;
  error?: string;
}

export class VideoRecordingService {
  private recordingFiles: Map<string, RecordingData> = new Map();
  /** 每个设备的录制文件历史，用于精彩回放按时间定位 */
  private recordingHistory: Map<string, RecordingFile[]> = new Map();
  private cacheDir: string;
  private ffmpeg = ffmpeg;

  constructor() {
    const homeDir = os.homedir();
    const appDir = path.join(homeDir, '.Kessoku-the-Broadcaster');
    this.cacheDir = path.join(appDir, 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      log.info('创建缓存目录', { path: this.cacheDir });
      console.log(`创建缓存目录: ${this.cacheDir}`);
    }

    const { ffmpegPath, ffprobePath } = getFFmpegpath();
    log.info('FFmpeg 路径', { ffmpegPath, ffprobePath });
    if (!fs.existsSync(ffmpegPath) && !fs.existsSync(ffprobePath)) {
      throw new Error('未检测到 ffmpeg');
    }
    this.ffmpeg.setFfmpegPath(ffmpegPath);
    this.ffmpeg.setFfprobePath(ffprobePath);
  }

  /**
   * 开始连续录制
   */
  startRecording(classId: string): { success: boolean; error?: string } {
    try {
      // 如果已经在录制,先停止
      if (this.recordingFiles.has(classId)) {
        this.stopRecording(classId);
      }

      const filePath = path.join(this.cacheDir, `${classId}_${Date.now()}.webm`);
      const writeStream = fs.createWriteStream(filePath);

      const startTime = Date.now();
      this.recordingFiles.set(classId, {
        classId,
        filePath,
        writeStream,
        startTime,
        chunks: [],
      });
      const history = this.recordingHistory.get(classId) || [];
      history.push({ filePath, startTime, endTime: null });
      this.recordingHistory.set(classId, history);

      return { success: true };
    } catch (error) {
      console.error(`启动录制失败:`, error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 停止录制
   */
  stopRecording(classId: string): { success: boolean } {
    const recording = this.recordingFiles.get(classId);
    if (!recording) {
      return { success: false };
    }

    try {
      recording.writeStream.end();
      this.recordingFiles.delete(classId);
      const file = this.recordingHistory
        .get(classId)
        ?.find((f) => f.filePath === recording.filePath);
      if (file) {
        file.endTime = Date.now();
      }
      return { success: true };
    } catch (error) {
      console.error(`停止录制失败:`, error);
      return { success: false };
    }
  }

  /**
   * 接收并保存录制的视频数据块
   */
  async saveRecordingChunk(classId: string, arrayBuffer: ArrayBuffer): Promise<void> {
    const recording = this.recordingFiles.get(classId);
    if (!recording) {
      throw new Error(`录制实例不存在: ${classId}`);
    }

    const buffer = Buffer.from(arrayBuffer);
    recording.chunks.push(buffer);
    recording.writeStream.write(buffer);

    // 定期清空缓冲
    if (recording.chunks.length >= 30) {
      await this.flushRecording(classId);
    }
  }

  /**
   * 清空缓冲区
   */
  private async flushRecording(classId: string): Promise<void> {
    const recording = this.recordingFiles.get(classId);
    if (recording) {
      recording.chunks = [];
    }
  }

  /**
   * 截取视频片段
   * @param classId 设备ID
   * @param startTime 起始时间 (HH:MM:SS 格式)
   * @param endTime 结束时间 (HH:MM:SS 格式)
   */
  async cutVideo(
    classId: string,
    startTime: string,
    endTime: string,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const recording = this.recordingFiles.get(classId);
    if (!recording) {
      return { success: false, error: '录制实例不存在' };
    }

    try {
      // 验证时间格式
      const startSeconds = this.parseTimeString(startTime);
      const endSeconds = this.parseTimeString(endTime);

      if (startSeconds < 0 || endSeconds < 0) {
        return { success: false, error: '时间格式错误，请使用 HH:MM:SS 格式' };
      }

      if (endSeconds <= startSeconds) {
        return { success: false, error: '结束时间必须大于起始时间' };
      }

      await this.flushRecording(classId);

      const inputPath = recording.filePath;
      const outputPath = path.join(this.cacheDir, `preview_${classId}_${Date.now()}.webm`);

      if (!fs.existsSync(inputPath)) {
        return { success: false, error: '录制文件不存在' };
      }

      const fileStats = fs.statSync(inputPath);
      if (fileStats.size === 0) {
        return { success: false, error: '录制文件为空' };
      }

      // 执行 FFmpeg 截取
      return await this.performFFmpegCut(inputPath, outputPath, startSeconds, endSeconds);
    } catch (error) {
      console.error('截取视频失败:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * 执行 FFmpeg 截取操作
   */
  private performFFmpegCut(
    inputPath: string,
    outputPath: string,
    startSeconds: number,
    endSeconds: number,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return new Promise((resolve) => {
      const duration = endSeconds - startSeconds;

      console.log(`FFmpeg 截取视频: 起始=${startSeconds}s, 时长=${duration}s`);

      this.ffmpeg(inputPath)
        .setStartTime(startSeconds)
        .setDuration(duration)
        .output(outputPath)
        .videoCodec('copy')
        .audioCodec('copy')
        .on('end', () => {
          console.log(`视频截取成功: ${outputPath}`);
          resolve({ success: true, filePath: outputPath });
        })
        .on('error', (err) => {
          console.error('FFmpeg 截取失败:', err);
          resolve({ success: false, error: err.message });
        })
        .run();
    });
  }

  /**
   * 解析时间字符串为秒数
   * 支持格式: "HH:MM:SS.ms" 或 "MM:SS.ms"
   */
  private parseTimeString(timeStr: string): number {
    try {
      const parts = timeStr.split(':');
      if (parts.length === 3) {
        // HH:MM:SS.ms
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseFloat(parts[2]);
        return hours * 3600 + minutes * 60 + seconds;
      } else if (parts.length === 2) {
        // MM:SS.ms
        const minutes = parseInt(parts[0], 10);
        const seconds = parseFloat(parts[1]);
        return minutes * 60 + seconds;
      } else if (parts.length === 1) {
        // 直接是秒数
        return parseFloat(parts[0]);
      }
    } catch (error) {
      console.error('解析时间字符串失败:', timeStr, error);
    }
    return 0;
  }

  /**
   * 执行实际的视频截取
   */
  private performCut(
    inputPath: string,
    outputPath: string,
    totalDuration: number,
    seconds: number,
    resolve: (value: { success: boolean; filePath?: string; error?: string }) => void,
  ): void {
    // 计算起始时间
    const startTime = Math.max(0, totalDuration - seconds);
    const actualDuration = Math.min(seconds, totalDuration);

    this.ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(actualDuration)
      .output(outputPath)
      .videoCodec('copy')
      .audioCodec('copy')
      .on('end', () => {
        resolve({ success: true, filePath: outputPath });
      })
      .on('error', (err) => {
        console.error('FFmpeg 截取失败:', err);
        resolve({ success: false, error: err.message });
      })
      .run();
  }

  /**
   * 按本地时间截取精彩回放片段
   * @description 使用 stream copy，不重编码；起点对齐到前一个关键帧，因此实际起点可能早于请求起点
   * @param startTime 请求起点（本地毫秒时间戳）
   * @param endTime 请求终点（本地毫秒时间戳）
   */
  async cutClip(
    classId: string,
    startTime: number,
    endTime: number,
    outputPath: string,
  ): Promise<ClipCutResult> {
    const file = (this.recordingHistory.get(classId) || []).find(
      (f) =>
        f.startTime <= startTime &&
        (f.endTime === null || f.endTime >= endTime) &&
        fs.existsSync(f.filePath),
    );
    if (!file) {
      return {
        success: false,
        errorCode: 'recording_range_missing',
        error: '本地录像未覆盖请求时间窗',
      };
    }

    const seekSeconds = (startTime - file.startTime) / 1000;
    const durationSeconds = (endTime - startTime) / 1000;
    const cut = await new Promise<{ success: boolean; error?: string }>((resolve) => {
      this.ffmpeg(file.filePath)
        .seekInput(seekSeconds)
        .setDuration(durationSeconds)
        .output(outputPath)
        .videoCodec('copy')
        .audioCodec('copy')
        .on('end', () => resolve({ success: true }))
        .on('error', (err) => resolve({ success: false, error: err.message }))
        .run();
    });
    if (!cut.success) {
      return { success: false, errorCode: 'clip_cut_failed', error: cut.error };
    }

    const probe = await new Promise<ffmpeg.FfprobeData | null>((resolve) => {
      this.ffmpeg.ffprobe(outputPath, (err, data) => resolve(err ? null : data));
    });
    const durationMs = Math.round(Number(probe?.format.duration) * 1000);
    const video = probe?.streams.find((s) => s.codec_type === 'video');
    const audio = probe?.streams.find((s) => s.codec_type === 'audio');
    if (!video || !(durationMs > 0)) {
      return { success: false, errorCode: 'media_validation_failed', error: '截取结果无有效视频' };
    }
    // 输入端定位 + stream copy 时，片段终点为 seek + duration，起点向前对齐到关键帧
    return {
      success: true,
      filePath: outputPath,
      actualStartTime: endTime - durationMs,
      actualEndTime: endTime,
      durationMs,
      width: video.width,
      height: video.height,
      videoCodec: video.codec_name,
      audioCodec: audio?.codec_name,
    };
  }

  /**
   * 截取片段首帧作为缩略图（JPEG）
   */
  extractThumbnail(videoPath: string, outputPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.ffmpeg(videoPath)
        // 取首帧，保持与视频一致的原生分辨率（单帧 JPEG 远小于 Hub 的 5 MiB 缩略图上限）
        .outputOptions(['-frames:v 1', '-q:v 3'])
        .output(outputPath)
        .on('end', () => resolve(true))
        .on('error', () => resolve(false))
        .run();
    });
  }

  /**
   * 清理临时文件
   */
  cleanup(): void {
    // 停止所有录制
    for (const classId of this.recordingFiles.keys()) {
      this.stopRecording(classId);
    }

    // 清理缓存目录(保留最近的文件)
    try {
      const files = fs.readdirSync(this.cacheDir);
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24小时

      files.forEach((file) => {
        const filePath = path.join(this.cacheDir, file);
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
        }
      });
    } catch (error) {
      console.error('清理临时文件失败:', error);
    }
  }
}
