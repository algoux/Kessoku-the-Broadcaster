import { Device } from '@/typings/data';

interface RollingRecord {
  recorder: MediaRecorder;
  mimeType: string;
  deviceId: string;
  deviceName: string;
  startTime: number;
}

export class RecorderService {
  rollingRecordsMap: Map<string, RollingRecord> = new Map();

  private getSupportedMimeType(): string {
    const mimeTypes = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];

    return mimeTypes.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
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
      if (existingRecord?.recorder && existingRecord.recorder.state !== 'inactive') {
        existingRecord.recorder.stop();
      }
      this.rollingRecordsMap.delete(device.classId);
    }

    try {
      // 通知主进程开始录制
      await window.electron.startContinuousRecording(device.classId);

      const mimeType = this.getSupportedMimeType();

      // 创建单个连续录制器,使用 timeSlice 实时发送数据
      const recorder = new MediaRecorder(device.stream, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 2500000,
      });

      recorder.ondataavailable = async (event: BlobEvent) => {
        if (!event.data.size) return;

        try {
          await window.electron.sendRecordingBlob(device.classId, event.data);
        } catch (error) {
          console.error('发送录制数据失败:', error);
        }
      };

      recorder.start(1000); // 每 1 秒发送一次数据

      // 保存录制实例
      this.rollingRecordsMap.set(device.classId, {
        recorder,
        mimeType: mimeType || recorder.mimeType,
        deviceId: device.id,
        deviceName: device.name,
        startTime: Date.now(),
      });
    } catch (error) {
      console.error(`启动设备 ${device.name} (${device.classId}) 录制失败:`, error);
    }
  }
}
