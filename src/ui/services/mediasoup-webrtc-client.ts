import * as mediasoupClient from 'mediasoup-client';
import { SimulcastConfig } from 'common/config.interface';

export class MediasoupClient {
  private device!: mediasoupClient.Device;
  private producerTransport!: mediasoupClient.types.Transport;
  private producers: Map<string, mediasoupClient.types.Producer> = new Map();
  // 通过 classId 映射到 producer 列表（一个 classId 可能有多个 producer，如音视频）
  private producersByClassId: Map<string, mediasoupClient.types.Producer[]> = new Map();

  constructor() {
    this.device = new mediasoupClient.Device();
  }

  async loadDeviceWithCapabilities(rtpCapabilities: any) {
    const cleanRtpCapabilities = JSON.parse(JSON.stringify(rtpCapabilities));
    await this.device.load({ routerRtpCapabilities: cleanRtpCapabilities });
  }

  async createProducerTransportFromServer(transportInfo: any): Promise<void> {
    if (this.producerTransport) {
      return;
    }

    this.producerTransport = this.device.createSendTransport({
      id: transportInfo.id,
      iceParameters: transportInfo.iceParameters,
      iceCandidates: transportInfo.iceCandidates,
      dtlsParameters: transportInfo.dtlsParameters,
    });

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
  }

  // 推送视频流
  async produceVideo(
    track: MediaStreamTrack,
    classId: string,
    simulcastConfigs?: SimulcastConfig[],
  ): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');

    // 检查该 classId 是否已有活跃的视频 producer
    const existingProducers = this.producersByClassId.get(classId) || [];
    const hasActiveVideoProducer = existingProducers.some((p) => p.kind === 'video' && !p.closed);

    if (hasActiveVideoProducer) {
      return;
    }

    try {
      const encodings = simulcastConfigs?.map((config) => ({
        rid: config.rid,
        scaleResolutionDownBy: config.scaleResolutionDownBy,
        maxBitrate: config.maxBitRate,
        maxFramerate: config.maxFramerate,
      }));

      const producer = await this.producerTransport.produce({
        track,
        ...(encodings && encodings.length > 0 ? { encodings } : {}),
        appData: { classId }, // 传递 classId
      });

      this.producers.set(producer.id, producer);

      // 将 producer 添加到 classId 映射中
      const classProducers = this.producersByClassId.get(classId) || [];
      classProducers.push(producer);
      this.producersByClassId.set(classId, classProducers);
    } catch (error) {
      console.error('视频流推送失败:', error);
      throw error;
    }
  }

  // 推送音频流
  async produceAudio(track: MediaStreamTrack, classId: string): Promise<void> {
    if (!this.producerTransport) throw new Error('传输通道未创建');

    // 检查该 classId 是否已有活跃的音频 producer
    const existingProducers = this.producersByClassId.get(classId) || [];
    const hasActiveAudioProducer = existingProducers.some((p) => p.kind === 'audio' && !p.closed);

    if (hasActiveAudioProducer) {
      return;
    }

    try {
      const producer = await this.producerTransport.produce({ track, appData: { classId } });
      // 将 producer 存储到 Map 中
      this.producers.set(producer.id, producer);

      // 将 producer 添加到 classId 映射中
      const classProducers = this.producersByClassId.get(classId) || [];
      classProducers.push(producer);
      this.producersByClassId.set(classId, classProducers);
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
    this.producersByClassId.clear();
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
      this.producerTransport = null!;
    }
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
