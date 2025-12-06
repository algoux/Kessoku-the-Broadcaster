import * as mediasoupClient from 'mediasoup-client';
import { SimulcastConfig } from 'common/config.interface';

export class MediasoupClient {
  private device!: mediasoupClient.Device;
  private producerTransport!: mediasoupClient.types.Transport;
  private producers: Map<string, mediasoupClient.types.Producer> = new Map();

  constructor() {
    this.device = new mediasoupClient.Device();
  }

  // 加载 Device
  async loadDevice() {
    if (!this.device || !this.device.loaded) {
      try {
        if (!this.device) {
          this.device = new mediasoupClient.Device();
        }

        // 从主进程获取路由器 RTP 能力
        const rtpCapabilities = await window.electron.getRouterRtpCapabilities();
        if (!rtpCapabilities) {
          throw new Error('无法获取路由器 RTP 能力');
        }

        await this.device.load({ routerRtpCapabilities: rtpCapabilities });
        console.log('Device 加载成功');
      } catch (error) {
        console.error('Device 加载失败:', error);
        throw error;
      }
    }
  }

  // 创建推流传输通道
  async createProducerTransport(): Promise<void> {
    if (!this.device) throw new Error('Device 未加载');
    if (this.producerTransport) {
      return;
    }

    try {
      const transportParams = await this.getTransportParams();

      this.producerTransport = this.device.createSendTransport(transportParams);

      // 监听连接事件
      this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await this.connectTransport(this.producerTransport!.id, dtlsParameters);
          callback();
        } catch (error) {
          errback(error as Error);
        }
      });

      this.producerTransport.on(
        'produce',
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            const { id } = await this.createProducer(kind, rtpParameters, appData);
            callback({ id });
          } catch (error) {
            errback(error as Error);
          }
        },
      );
    } catch (error) {
      console.error('推流传输通道创建失败:', error);
      throw error;
    }
  }

  // 推送视频流
  async produceVideo(track: MediaStreamTrack, simulcastConfigs?: SimulcastConfig[]): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');

    try {
      // 如果提供了 simulcastConfigs，使用它；否则使用默认配置
      const encodings =
        simulcastConfigs && simulcastConfigs.length > 0
          ? simulcastConfigs.map((config) => ({
              rid: config.rid,
              scaleResolutionDownBy: config.scaleResolutionDownBy,
              maxBitrate: config.maxBitRate,
              maxFramerate: config.maxFramerate,
            }))
          : [
              {
                rid: 'high',
                scaleResolutionDownBy: 1, // 不缩放 - 原始分辨率
                maxBitrate: 8000000, // 8Mbps
                maxFramerate: 60,
              },
              {
                rid: 'low',
                scaleResolutionDownBy: 2, // 分辨率缩小一半
                maxBitrate: 2000000, // 2Mbps
                maxFramerate: 30,
              },
            ];

      const producer = await this.producerTransport.produce({
        track,
        encodings,
        // 可选，让编码器更快进入目标码率
        codecOptions: {
          videoGoogleStartBitrate: 8000,
        },
      });

      // 将 producer 存储到 Map 中
      this.producers.set(producer.id, producer);

      console.log(`视频推流成功: producerId=${producer.id}`);
    } catch (error) {
      console.error('视频流推送失败:', error);
      throw error;
    }
  }

  // 推送音频流
  async produceAudio(track: MediaStreamTrack): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');
    try {
      const producer = await this.producerTransport.produce({ track });
      // 将 producer 存储到 Map 中
      this.producers.set(producer.id, producer);
      console.log(`音频推流成功: producerId=${producer.id}`);
    } catch (error) {
      console.error('音频流推送失败:', error);
      throw error;
    }
  }

  // 推送整个 MediaStream
  async produceStream(stream: MediaStream, simulcastConfigs?: SimulcastConfig[]): Promise<void> {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    if (videoTrack) {
      await this.produceVideo(videoTrack, simulcastConfigs);
    }
    if (audioTrack) {
      await this.produceAudio(audioTrack);
    }
  }

  // 停止推流
  stopProducing(): void {
    for (const [producerId, producer] of this.producers.entries()) {
      if (!producer.closed) {
        producer.close();
        // 通知主进程推流已停止
        window.electron.notifyStreamingStopped(producerId);
      }
    }
    this.producers.clear();
  }

  // 获取 Producer 状态
  getProducerStatus(): { total: number; active: number; byKind: Record<string, number> } {
    const active = Array.from(this.producers.values()).filter((p) => !p.closed);
    const byKind: Record<string, number> = {};

    active.forEach((producer) => {
      byKind[producer.kind] = (byKind[producer.kind] || 0) + 1;
    });

    return {
      total: this.producers.size,
      active: active.length,
      byKind,
    };
  }

  // 断开连接
  disconnect(): void {
    this.stopProducing();
    if (this.producerTransport) {
      this.producerTransport.close();
      this.producerTransport = null;
    }
    this.device = null;
  }

  // 获取 Transport 参数
  private async getTransportParams(): Promise<any> {
    return await window.electron.createProducerTransport();
  }

  // 连接传输通道
  private async connectTransport(transportId: string, dtlsParameters: any): Promise<void> {
    return await window.electron.connectProducerTransport(transportId, dtlsParameters);
  }

  // 创建推流生产者
  private async createProducer(
    kind: string,
    rtpParameters: any,
    appData?: any,
  ): Promise<{ id: string }> {
    return await window.electron.createProducer(kind, rtpParameters, appData);
  }
}
