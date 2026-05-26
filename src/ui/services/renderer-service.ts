// 渲染进程服务 - 处理主进程的 IPC 通信和 MediaSoup 推流
import { MediasoupClient } from './mediasoup-webrtc-client';
import { DeviceInfo } from '@/typings/data';
import { ConnectState } from '@/typings/data';
import type { SimulcastConfig } from 'common/config.interface';

export class RendererService {
  public mediasoupClient: MediasoupClient | null = null;
  private isInitialized: boolean = false;
  private transportReadyPromise: Promise<void> | null = null;
  connectState: ConnectState = ConnectState.CONNECTED;

  // 推流请求回调（只包含需要推流的 trackIds）
  public onStreamingRequest: ((data: { classIds: string[] }) => Promise<void>) | null = null;
  public onStopStreamingRequest: ((data: { classIds: string[] }) => Promise<void>) | null = null;

  constructor() {
    this.setupIpcListeners();
  }

  // 初始化 MediaSoup Client
  async initialize() {
    if (this.isInitialized) return;
    try {
      this.mediasoupClient = new MediasoupClient();
      this.isInitialized = true;
    } catch (error) {
      throw error;
    }
  }

  // 设置 IPC 监听器
  private setupIpcListeners() {
    // 监听 transport 就绪事件（confirmReady 响应后触发）
    window.electron.onTransportReady(async (data) => {
      console.log('收到 transport-ready 事件，立即初始化 transport');
      this.transportReadyPromise = (async () => {
        if (!this.mediasoupClient) {
          throw new Error('mediasoupClient 尚未初始化，无法处理 transport-ready');
        }

        // 加载设备能力
        await this.mediasoupClient.loadDeviceWithCapabilities(data.routerRtpCapabilities);

        // 创建 producer transport
        await this.mediasoupClient.createProducerTransportFromServer(data.transport);

        console.log('Transport 初始化成功');
      })();

      try {
        await this.transportReadyPromise;
      } catch (error) {
        console.error('Transport 初始化失败:', error);
        this.transportReadyPromise = null;
      }
    });

    // 监听主进程的推流请求（只包含需要推流的 trackIds）
    window.electron.onStreamingRequest(async (data) => {
      if (this.onStreamingRequest) {
        await this.onStreamingRequest({
          classIds: data.classIds || [],
        });
      } else {
        console.error('onStreamingRequest 回调未设置！');
      }
    });

    // 监听主进程的停止推流请求
    window.electron.onStopStreamingRequest(async (data) => {
      if (this.onStopStreamingRequest) {
        try {
          await this.onStopStreamingRequest({
            classIds: data.classIds || [],
          });
        } finally {
          if (data.requestId) {
            await window.electron.completeStopBroadcast(data.requestId);
          }
        }
      }
    });

    // 监听清理媒体资源的请求（cancelReady 或 disconnect 时触发）
    window.electron.onCleanupMediaResources(() => {
      if (this.mediasoupClient) {
        this.mediasoupClient.disconnect();
      }
      this.transportReadyPromise = null;
    });
  }

  async reportDeviceState(devices: DeviceInfo[], isReady: boolean) {
    try {
      await window.electron.reportDeviceState(devices, isReady);
    } catch (error) {
      throw error;
    }
  }

  async startStreaming(
    streamData: Array<{ stream: MediaStream; classId: string; simulcastConfigs?: SimulcastConfig[] }>,
  ) {
    if (!this.mediasoupClient) {
      throw new Error('MediaSoup Client 未初始化');
    }

    if (this.transportReadyPromise) {
      await this.transportReadyPromise;
    }

    if (!this.mediasoupClient.isProducerTransportReady()) {
      throw new Error('推流 transport 尚未初始化');
    }

    // 开始推流，使用已初始化的 transport
    for (const data of streamData) {
      await this.mediasoupClient.produceStream(data.stream, data.classId, data.simulcastConfigs);
    }
  }

  async stopStreaming(classIds?: string[]) {
    if (!this.mediasoupClient) {
      return;
    }
    this.mediasoupClient.stopProducing(classIds);
  }

  // 获取连接状态
  async getConnectionStatus() {
    return await window.electron.getConnectionStatus();
  }

  // 清理资源
  cleanup() {
    if (this.mediasoupClient) {
      this.mediasoupClient.disconnect();
      this.mediasoupClient = null;
    }
    this.isInitialized = false;
    this.transportReadyPromise = null;
  }
}
