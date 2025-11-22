// 渲染进程服务 - 处理主进程的 IPC 通信和 MediaSoup 推流
import { MediasoupClient } from './mediasoup-webrtc-client';
import type { DeviceInfo } from 'common/modules/home/home.interface';

export class RendererService {
  private mediasoupClient: MediasoupClient | null = null;
  private isInitialized: boolean = false;

  // 推流请求回调（支持 classIds 参数）
  public onStreamingRequest: ((classIds: string[]) => Promise<void>) | null = null;
  public onStopStreamingRequest: (() => Promise<void>) | null = null;

  constructor() {
    this.setupIpcListeners();
  }

  // 初始化 MediaSoup 客户端
  async initialize() {
    if (this.isInitialized) return;

    try {
      this.mediasoupClient = new MediasoupClient();
      this.isInitialized = true;
      console.log('✅ 渲染进程服务初始化成功');
    } catch (error) {
      console.error('❌ 渲染进程服务初始化失败:', error);
      throw error;
    }
  }

  // 设置 IPC 监听器
  private setupIpcListeners() {
    // 监听主进程的推流请求（携带 classIds）
    window.electron.onStreamingRequest(async ({ requestedBy, classIds }) => {
      console.log(`📡 收到推流请求，来自: ${requestedBy}, classIds:`, classIds);
      if (this.onStreamingRequest) {
        await this.onStreamingRequest(classIds || []);
      }
    });

    // 监听主进程的停止推流请求
    window.electron.onStopStreamingRequest(async ({ requestedBy }) => {
      console.log(`📡 收到停止推流请求，来自: ${requestedBy}`);
      if (this.onStopStreamingRequest) {
        await this.onStopStreamingRequest();
      }
    });
  }

  // 上报设备状态到服务器
  async reportDeviceState(devices: DeviceInfo[], isReady: boolean) {
    try {
      console.log('📤 [渲染服务] 准备上报设备状态:', {
        devices,
        isReady,
        deviceCount: devices.length,
      });
      await window.electron.reportDeviceState(devices, isReady);
      console.log('✅ [渲染服务] 设备状态上报成功');
    } catch (error) {
      console.error('❌ [渲染服务] 设备状态上报失败:', error);
      throw error;
    }
  }

  // 开始推流
  async startStreaming(streams: MediaStream[]) {
    if (!this.mediasoupClient) {
      throw new Error('MediaSoup 客户端未初始化');
    }

    try {
      // 加载 Device
      await this.mediasoupClient.loadDevice();

      // 创建推流传输通道
      await this.mediasoupClient.createProducerTransport();

      // 推送所有流
      for (const stream of streams) {
        await this.mediasoupClient.produceStream(stream);
      }
    } catch (error) {
      console.error('推流失败:', error);
      throw error;
    }
  }

  // 停止推流
  async stopStreaming() {
    if (!this.mediasoupClient) return;

    try {
      this.mediasoupClient.stopProducing();
    } catch (error) {
      console.error('停止推流失败:', error);
      throw error;
    }
  }

  // 获取连接状态
  async getConnectionStatus() {
    return await window.electron.getConnectionStatus();
  }

  // 获取推流状态
  getStreamingStatus() {
    if (!this.mediasoupClient) {
      return { total: 0, active: 0, byKind: {} };
    }
    return this.mediasoupClient.getProducerStatus();
  }

  // 清理资源
  cleanup() {
    if (this.mediasoupClient) {
      this.mediasoupClient.disconnect();
      this.mediasoupClient = null;
    }

    // 移除 IPC 监听器
    window.electron.removeAllListeners('start-streaming-request');
    window.electron.removeAllListeners('stop-streaming-request');

    this.isInitialized = false;
  }
}
