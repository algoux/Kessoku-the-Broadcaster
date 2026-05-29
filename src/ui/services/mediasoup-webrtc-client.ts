import * as mediasoupClient from 'mediasoup-client';
import {
  AppData,
  Device,
  MediaKind,
  Transport,
  Producer,
  RtpParameters,
} from 'mediasoup-client/types';
import { SimulcastConfig } from 'common/config.interface';
import type { TransportInfo } from 'common/typings/broadcaster.types';

type ProducerAppData = AppData & {
  classId: string;
};

export class MediasoupClient {
  private device!: Device;
  private producerTransport!: Transport;
  private producers: Map<string, Producer> = new Map();
  // 通过 classId 映射到 producer 列表（一个 classId 可能有多个 producer，如音视频）
  private producersByClassId: Map<string, Producer[]> = new Map();

  constructor() {
    this.device = new mediasoupClient.Device();
  }

  async loadDeviceWithCapabilities(rtpCapabilities: mediasoupClient.types.RtpCapabilities) {
    if (this.device.loaded) {
      return;
    }
    await this.device.load({ routerRtpCapabilities: rtpCapabilities });
  }

  async createProducerTransportFromServer(transportInfo: TransportInfo): Promise<void> {
    if (this.producerTransport && !this.producerTransport.closed) {
      return;
    }
    console.log('Creating producer transport with info:', transportInfo);

    this.producerTransport = this.device.createSendTransport({
      id: transportInfo.id,
      iceParameters: transportInfo.iceParameters,
      iceCandidates: transportInfo.iceCandidates,
      dtlsParameters: transportInfo.dtlsParameters,
    });

    // 监听连接事件（新协议）
    this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        console.log('transport 链接成功');
        await window.electron.connectProducerTransport(dtlsParameters);
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

    this.producerTransport.on('connectionstatechange', (state) => {
      console.log('producer transport state:', state);
      if (state === 'failed' || state === 'closed') {
        this.stopProducing();
      }
    });
  }

  isProducerTransportReady(): boolean {
    return !!this.producerTransport && !this.producerTransport.closed;
  }

  private buildVideoEncodings(simulcastConfigs?: SimulcastConfig[]) {
    if (!simulcastConfigs?.length) return undefined;

    const selectedConfig = simulcastConfigs[0];
    return [
      {
        ...(selectedConfig.scaleResolutionDownBy > 1
          ? { scaleResolutionDownBy: selectedConfig.scaleResolutionDownBy }
          : {}),
        maxBitrate: selectedConfig.maxBitRate,
        ...(selectedConfig.maxFramerate ? { maxFramerate: selectedConfig.maxFramerate } : {}),
      },
    ];
  }

  private rememberProducer(classId: string, producer: Producer) {
    this.producers.set(producer.id, producer);

    const classProducers = this.producersByClassId.get(classId) || [];
    classProducers.push(producer);
    this.producersByClassId.set(classId, classProducers);

    const cleanup = () => {
      this.producers.delete(producer.id);
      const remaining = (this.producersByClassId.get(classId) || []).filter(
        (item) => item.id !== producer.id && !item.closed,
      );
      if (remaining.length) {
        this.producersByClassId.set(classId, remaining);
      } else {
        this.producersByClassId.delete(classId);
      }
    };

    producer.on('transportclose', cleanup);
    producer.on('trackended', () => {
      producer.close();
      cleanup();
    });
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
      const encodings = this.buildVideoEncodings(simulcastConfigs);
      const producer = await this.producerTransport.produce({
        track,
        ...(encodings && encodings.length > 0 ? { encodings } : {}),
        appData: { classId }, // 传递 classId
      });

      this.rememberProducer(classId, producer);
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
      this.rememberProducer(classId, producer);
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
      const cloneVideoTrack = videoTrack.clone();
      await this.produceVideo(cloneVideoTrack, classId, simulcastConfigs);
    }
    if (audioTrack) {
      const cloneAudioTrack = audioTrack.clone();
      await this.produceAudio(cloneAudioTrack, classId);
    }
  }

  // 停止推流
  stopProducing(classIds?: string[]): void {
    const targetProducers = classIds?.length
      ? classIds.flatMap((classId) => this.producersByClassId.get(classId) || [])
      : Array.from(this.producers.values());

    for (const producer of targetProducers) {
      if (!producer.closed) {
        producer.close();
      }
      this.producers.delete(producer.id);
    }

    if (!classIds?.length) {
      this.producers.clear();
      this.producersByClassId.clear();
      return;
    }

    for (const classId of classIds) {
      const remaining = (this.producersByClassId.get(classId) || []).filter(
        (producer) => !producer.closed,
      );
      if (remaining.length) {
        this.producersByClassId.set(classId, remaining);
      } else {
        this.producersByClassId.delete(classId);
      }
    }
  }

  // 断开连接
  disconnect(): void {
    this.stopProducing();
    if (this.producerTransport) {
      this.producerTransport.close();
      this.producerTransport = null!;
    }
  }

  // 创建推流生产者
  private async createProducer(
    kind: MediaKind,
    rtpParameters: RtpParameters,
    appData: AppData,
  ): Promise<{ id: string }> {
    const { classId } = this.assertProducerAppData(appData);
    return await window.electron.createProducer({ trackId: classId, kind, rtpParameters });
  }

  private assertProducerAppData(appData: AppData): ProducerAppData {
    if (typeof appData.classId !== 'string') {
      throw new Error('producer appData 缺少 classId');
    }
    return appData as ProducerAppData;
  }
}
