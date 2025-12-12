import * as mediasoupClient from 'mediasoup-client';
import { SimulcastConfig } from 'common/config.interface';

export class MediasoupClient {
  private device!: mediasoupClient.Device;
  private producerTransport!: mediasoupClient.types.Transport;
  private producers: Map<string, mediasoupClient.types.Producer> = new Map();

  constructor() {
    this.device = new mediasoupClient.Device();
  }

  // 加载 Device（使用提供的 rtpCapabilities）
  async loadDeviceWithCapabilities(rtpCapabilities: any) {
    if (!this.device || !this.device.loaded) {
      try {
        if (!this.device) {
          this.device = new mediasoupClient.Device();
        }

        // 通过 JSON 序列化/反序列化来清理对象，移除不可克隆的属性
        const cleanRtpCapabilities = JSON.parse(JSON.stringify(rtpCapabilities));

        await this.device.load({ routerRtpCapabilities: cleanRtpCapabilities });
        console.log('Device 加载成功（使用服务端 rtpCapabilities）');
      } catch (error) {
        console.error('Device 加载失败:', error);
        throw error;
      }
    }
  }

  // 使用服务端创建的 transport
  async createProducerTransportFromServer(transportInfo: any): Promise<void> {
    if (!this.device) throw new Error('Device 未加载');
    if (this.producerTransport) {
      return;
    }

    try {
      this.producerTransport = this.device.createSendTransport({
        id: transportInfo.id,
        iceParameters: transportInfo.iceParameters,
        iceCandidates: transportInfo.iceCandidates,
        dtlsParameters: transportInfo.dtlsParameters,
      });

      console.log('使用服务端 transport 创建成功');

      // 监听连接事件（新协议）
      this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          // 调用新协议的 completeConnectTransport
          await window.electron.connectProducerTransport(null, dtlsParameters);
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
      console.error('使用服务端 transport 创建失败:', error);
      throw error;
    }
  }

  // 推送视频流
  async produceVideo(
    track: MediaStreamTrack,
    classId: string,
    simulcastConfigs?: SimulcastConfig[],
  ): Promise<void> {
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
                rid: 'original',
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
        appData: { classId }, // 传递 classId
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
  async produceAudio(track: MediaStreamTrack, classId: string): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');
    try {
      const producer = await this.producerTransport.produce({ track, appData: { classId } });
      // 将 producer 存储到 Map 中
      this.producers.set(producer.id, producer);
      console.log(`音频推流成功: producerId=${producer.id}`);
    } catch (error) {
      console.error('音频流推送失败:', error);
      throw error;
    }
  }

  // 推送整个 MediaStream
  async produceStream(
    stream: MediaStream,
    classId: string,
    simulcastConfigs?: SimulcastConfig[],
  ): Promise<void> {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];
    if (videoTrack) {
      await this.produceVideo(videoTrack, classId, simulcastConfigs);
    }
    if (audioTrack) {
      await this.produceAudio(audioTrack, classId);
    }
  }

  // 停止推流
  stopProducing(): void {
    for (const [producerId, producer] of this.producers.entries()) {
      if (!producer.closed) {
        producer.close();
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
    return await window.electron.createProducer({ kind, rtpParameters, appData });
  }
}
