// 渲染进程服务 - 处理主进程的 IPC 通信和 MediaSoup 推流
import { MediasoupClient } from './mediasoup-webrtc-client';
import { DeviceInfo } from '@/typings/data';
import { ConnectState } from '@/typings/data';

export class RendererService {
  public mediasoupClient: MediasoupClient | null = null;
  private isInitialized: boolean = false;
  connectState: ConnectState = ConnectState.CONNECTED;

  // 推流请求回调（只包含需要推流的 trackIds）
  public onStreamingRequest: ((data: { classIds: string[] }) => Promise<void>) | null = null;
  public onStopStreamingRequest: (() => Promise<void>) | null = null;

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
      try {
        // 加载设备能力
        await this.mediasoupClient.loadDeviceWithCapabilities(data.routerRtpCapabilities);

        // 创建 producer transport
        await this.mediasoupClient.createProducerTransportFromServer(data.transport);

        console.log('Transport 初始化成功');
      } catch (error) {
        console.error('Transport 初始化失败:', error);
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
    window.electron.onStopStreamingRequest(async () => {
      if (this.onStopStreamingRequest) {
        await this.onStopStreamingRequest();
      }
    });

    // 监听清理媒体资源的请求（cancelReady 或 disconnect 时触发）
    window.electron.onCleanupMediaResources(() => {
      if (this.mediasoupClient) {
        this.mediasoupClient.disconnect();
      }
    });
  }

  // 上报设备状态到服务器
  async reportDeviceState(devices: DeviceInfo[], isReady: boolean) {
    try {
      console.log('Reporting device state:', devices, 'isReady:', isReady);
      await window.electron.reportDeviceState(devices, isReady);
    } catch (error) {
      throw error;
    }
  }

  // 开始推流（transport 已在 confirmReady 时初始化）
  async startStreaming(
    streamData: Array<{ stream: MediaStream; classId: string; simulcastConfigs?: any[] }>,
  ) {
    // 开始推流，使用已初始化的 transport
    for (const data of streamData) {
      await this.mediasoupClient.produceStream(data.stream, data.classId, data.simulcastConfigs);
    }
  }

  async stopStreaming() {
    this.mediasoupClient.stopProducing();
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
  }
}
