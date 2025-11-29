import RecordRTC from 'recordrtc';
import { Device } from 'common/modules/home/home.interface';

export class RecorderService {
  rollingRecordsMap: Map<string, any> = new Map();
  replayVideos: Map<string, HTMLVideoElement> = new Map();

  // 回看推流 - 从裁剪的视频文件创建流并推送
  async startReplayStreaming(classId: string, filePath: string, seconds: number) {
    try {
      // 读取视频文件
      const arrayBuffer = await window.electron.readVideoFile(filePath);
      const blob = new Blob([arrayBuffer], { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);
      const video = document.createElement('video');
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0.01';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-9999';
      video.muted = true; // 必须静音才能自动播放
      video.autoplay = true;
      video.src = videoUrl;
      document.body.appendChild(video);

      // 等待视频加载元数据
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('视频加载失败'));
      });

      await video.play();
      this.replayVideos.set(classId, video);
      // 先捕获流再播放(避免播放被中断)
      const stream = (video as any).captureStream() as MediaStream;
      return stream;
    } catch (error) {
      console.error('回看推流失败:', error);
      throw new Error('回看推流失败');
    }
  }

  // 停止回看推流
  stopReplayStreaming(classId: string) {
    try {
      const video = this.replayVideos.get(classId);
      if (video) {
        video.pause();
        const url = video.src;
        video.src = '';
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        if (url) {
          URL.revokeObjectURL(url);
        }
        this.replayVideos.delete(classId);
        console.log(`回看推流已清理: classId=${classId}`);
      }
    } catch (error) {
      console.error('停止回看推流失败:', error);
      throw new Error('停止回看推流失败');
    }
  }

  // 开始滚动录制 - 单个连续录制,定期保存到文件
  async startRollingRecord(device: Device) {
    if (!device.stream || !device.classId) {
      console.warn(`设备 ${device.name} 缺少必要的 stream 或 classId`);
      return;
    }

    // 如果该 classId 已经有录制实例，先停止
    if (this.rollingRecordsMap.has(device.classId)) {
      const existingRecord = this.rollingRecordsMap.get(device.classId);
      if (existingRecord.recorder) {
        existingRecord.recorder.stopRecording(() => {
          existingRecord.recorder.destroy();
        });
      }
    }

    try {
      // 通知主进程开始录制
      await window.electron.startContinuousRecording(device.classId);

      // 创建单个连续录制器,使用 timeSlice 实时发送数据
      const recorder = new RecordRTC(device.stream, {
        type: 'video',
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000,
        timeSlice: 1000, // 每 1 秒发送一次数据
        ondataavailable: async (blob: Blob) => {
          // 实时发送到主进程
          try {
            await window.electron.sendRecordingBlob(device.classId, blob);
          } catch (error) {
            console.error('发送录制数据失败:', error);
          }
        },
      });

      recorder.startRecording();

      // 保存录制实例
      this.rollingRecordsMap.set(device.classId, {
        recorder,
        mimeType: 'video/webm;codecs=vp9',
        deviceId: device.id,
        deviceName: device.name,
        startTime: Date.now(),
      });
    } catch (error) {
      console.error(`启动设备 ${device.name} (${device.classId}) 录制失败:`, error);
    }
  }
}
