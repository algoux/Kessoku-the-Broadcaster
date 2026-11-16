import { Device } from '@/typings/data';
import type { DeviceManager } from './device-manager';

interface RollingRecord {
  recorder: MediaRecorder;
  mimeType: string;
  deviceId: string;
  deviceName: string;
  startTime: number;
}

export class RecorderService {
  rollingRecordsMap: Map<string, RollingRecord> = new Map();

  // ponytail: 不保存取消订阅函数，两个服务都随 home view 一起创建和销毁
  constructor(deviceManager: DeviceManager) {
    deviceManager.on('stream-started', (device) => {
      if (deviceManager.isVideoDevice(device)) void this.startRollingRecord(device);
    });
    // 配置变更后，仅对正在录制的设备重启录制
    deviceManager.on('config-saved', (device) => {
      if (this.rollingRecordsMap.has(device.classId)) void this.startRollingRecord(device);
    });
    deviceManager.on('device-removed', (device) => {
      void this.stopRollingRecord(device.classId);
    });
  }

  // 停止录制并通知主进程关闭录制文件
  async stopRollingRecord(classId: string) {
    const record = this.rollingRecordsMap.get(classId);
    if (!record) return;
    this.rollingRecordsMap.delete(classId);

    try {
      // 等 stop 事件，确保最后一块数据先于 stopContinuousRecording 发出
      if (record.recorder.state !== 'inactive') {
        await new Promise<void>((resolve) => {
          record.recorder.addEventListener('stop', () => resolve(), { once: true });
          record.recorder.stop();
        });
      }
      await window.electron.stopContinuousRecording(classId);
    } catch (error) {
      console.error(`停止设备 ${record.deviceName} (${classId}) 录制失败:`, error);
    }
  }

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
