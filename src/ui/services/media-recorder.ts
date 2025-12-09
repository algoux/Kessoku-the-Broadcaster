import RecordRTC from 'recordrtc';
import { Device } from '@/typings/data';

export class RecorderService {
  rollingRecordsMap: Map<string, any> = new Map();

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
