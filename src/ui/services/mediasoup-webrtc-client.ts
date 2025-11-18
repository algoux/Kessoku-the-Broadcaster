// MediaSoup 客户端服务 - 只负责 WebRTC 推流，不处理信令
import * as mediasoupClient from 'mediasoup-client';

export class MediasoupClient {
  private device: mediasoupClient.Device | null = null;
  private producerTransport: mediasoupClient.types.Transport | null = null;

  // 使用 Map 存储多个 producers
  private producers: Map<string, mediasoupClient.types.Producer> = new Map();

  private serverUrl: string;

  constructor(serverUrl: string = 'http://localhost:3001') {
    this.serverUrl = serverUrl;
    this.device = new mediasoupClient.Device();
  }

  // 加载 Device
  async loadDevice() {
    if (!this.device || !this.device.loaded) {
      console.log('📱 正在加载 Device...');
      try {
        // 如果 device 不存在，创建一个新的
        if (!this.device) {
          this.device = new mediasoupClient.Device();
        }

        // 从主进程获取路由器 RTP 能力
        const rtpCapabilities = await window.electron.getRouterRtpCapabilities();
        if (!rtpCapabilities) {
          throw new Error('无法获取路由器 RTP 能力');
        }

        await this.device.load({ routerRtpCapabilities: rtpCapabilities });
        console.log('✅ Device 加载成功');
      } catch (error) {
        console.error('❌ Device 加载失败:', error);
        throw error;
      }
    }
  }

  // 创建推流传输通道
  async createProducerTransport(): Promise<void> {
    if (!this.device) throw new Error('Device 未加载');
    if (this.producerTransport) {
      console.log('Producer Transport 已存在，跳过创建');
      return;
    }

    try {
      // 通过 IPC 获取 transport 参数
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

      // 监听推流事件
      this.producerTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          const { id } = await this.createProducer(kind, rtpParameters);
          callback({ id });
        } catch (error) {
          errback(error as Error);
        }
      });
    } catch (error) {
      console.error('推流传输通道创建失败:', error);
      throw error;
    }
  }

  // 推送视频流
  async produceVideo(track: MediaStreamTrack): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');

    try {
      const producer = await this.producerTransport.produce({
        track,
        encodings: [
          { maxBitrate: 2000000 }, // 2 Mbps
          { maxBitrate: 1000000 }, // 1 Mbps
          { maxBitrate: 500000 }, // 500 Kbps
        ],
        codecOptions: {
          videoGoogleStartBitrate: 1000,
        },
      });

      // 将 producer 存储到 Map 中
      this.producers.set(producer.id, producer);

      // 通知主进程推流已开始
      window.electron.notifyStreamingStarted(producer.id, 'video', producer.rtpParameters);
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

      // 通知主进程推流已开始
      window.electron.notifyStreamingStarted(producer.id, 'audio', producer.rtpParameters);
    } catch (error) {
      console.error('音频流推送失败:', error);
      throw error;
    }
  }

  // 推送整个 MediaStream
  async produceStream(stream: MediaStream): Promise<void> {
    const videoTrack = stream.getVideoTracks()[0];
    const audioTrack = stream.getAudioTracks()[0];

    if (videoTrack) {
      await this.produceVideo(videoTrack);
    }

    if (audioTrack) {
      await this.produceAudio(audioTrack);
    }
  }

  // 停止推流
  stopProducing(): void {
    // 关闭所有 producers
    for (const [producerId, producer] of this.producers.entries()) {
      if (!producer.closed) {
        producer.close();
        // 通知主进程推流已停止
        window.electron.notifyStreamingStopped(producerId);
      }
    }

    // 清空 producers Map
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
    console.log('🔌 MediaSoup 客户端已断开');
  }

  // === 私有方法：与服务器通信 ===

  // 获取 RTP Capabilities (这里应该通过 IPC 调用主进程)
  private async getRtpCapabilities(): Promise<any> {
    // TODO: 通过 IPC 从主进程获取
    // 暂时返回模拟数据
    return {
      codecs: [
        {
          mimeType: 'video/VP8',
          clockRate: 90000,
          rtcpFeedback: [
            { type: 'nack' },
            { type: 'nack', parameter: 'pli' },
            { type: 'ccm', parameter: 'fir' },
            { type: 'goog-remb' },
            { type: 'transport-cc' },
          ],
        },
        {
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
        },
      ],
      headerExtensions: [],
    };
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
  private async createProducer(kind: string, rtpParameters: any): Promise<{ id: string }> {
    return await window.electron.createProducer(kind, rtpParameters);
  }
}
