import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';

// 设置 FFmpeg 路径
// macOS: 通过 Homebrew 安装 - brew install ffmpeg
// 也可以配置为使用打包的 ffmpeg 二进制文件
if (process.platform === 'darwin') {
  // macOS: 尝试使用 Homebrew 安装的 ffmpeg
  const homebrewFFmpegPath = '/opt/homebrew/bin/ffmpeg';
  const homebrewFFprobePath = '/opt/homebrew/bin/ffprobe';

  if (fs.existsSync(homebrewFFmpegPath)) {
    ffmpeg.setFfmpegPath(homebrewFFmpegPath);
  }
  if (fs.existsSync(homebrewFFprobePath)) {
    ffmpeg.setFfprobePath(homebrewFFprobePath);
  }
}

/**
 * 视频录制服务
 * 管理连续录制的视频文件,并支持 FFmpeg 截取最后 N 秒
 */
export class VideoRecordingService {
  private recordingFiles: Map<string, RecordingData> = new Map();
  private cacheDir: string;

  constructor() {
    // 创建用户目录下的缓存目录
    // macOS/Linux: ~/.Kessoku-the-Broadcaster/cache/
    // Windows: C:\Users\<用户名>\.Kessoku-the-Broadcaster\cache\
    const homeDir = os.homedir();
    const appDir = path.join(homeDir, '.Kessoku-the-Broadcaster');
    this.cacheDir = path.join(appDir, 'cache');

    // 确保目录存在
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      console.log(`创建缓存目录: ${this.cacheDir}`);
    }
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

      this.recordingFiles.set(classId, {
        classId,
        filePath,
        writeStream,
        startTime: Date.now(),
        chunks: [],
      });

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
   * 截取视频的最后 N 秒
   */
  async cutVideo(
    classId: string,
    seconds: number,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const recording = this.recordingFiles.get(classId);
    if (!recording) {
      return { success: false, error: '录制实例不存在' };
    }

    try {
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
      return await this.performFFmpegCut(inputPath, outputPath, seconds, recording);
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
    seconds: number,
    recording: RecordingData,
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    return new Promise((resolve) => {
      let detectedDuration = 0;

      ffmpeg(inputPath)
        .outputOptions(['-f', 'null'])
        .output('-')
        .on('codecData', (data) => {
          if (data.duration) {
            const duration = this.parseTimeString(data.duration);
            if (duration > 0) {
              detectedDuration = duration;
            }
          }
        })
        .on('progress', (progress) => {
          // 从进度信息中获取已处理的时间
          if (progress.timemark) {
            const duration = this.parseTimeString(progress.timemark);
            if (duration > 0) {
              detectedDuration = Math.max(detectedDuration, duration);
            }
          }
        })
        .on('end', () => {
          if (detectedDuration > 0) {
            this.performCut(inputPath, outputPath, detectedDuration, seconds, resolve);
          } else {
            // 使用录制开始时间估算
            const estimatedDuration = (Date.now() - recording.startTime) / 1000;
            this.performCut(inputPath, outputPath, estimatedDuration, seconds, resolve);
          }
        })
        .on('error', (err) => {
          console.error('扫描文件失败:', err);
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

    ffmpeg(inputPath)
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

interface RecordingData {
  classId: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  chunks: Buffer[];
}
