import type { SimulcastConfig } from '../config.interface';
import type { Contest, User } from './srk.types';
import type { types as MediasoupTypes } from 'mediasoup-client';

/**
 * Broadcaster 通用响应结构
 */
export interface RespSuccess<T = unknown> {
  success: true;
  code?: 0;
  data?: T;
}

export interface RespError<T = unknown> {
  success: false;
  code?: number;
  msg?: string;
  data?: T;
}

export type Resp<T = void, E = unknown> = RespSuccess<T> | RespError<E>;

export type ConnectionState = 'connected' | 'disconnected' | 'connecting';

export type TrackType = 'screen' | 'camera' | 'microphone';

export interface RequestLoginDTO {
  alias: string;
  userId: string;
  token: string;
}

/**
 * 比赛信息响应（getContestInfo）
 */
export interface ContestInfo {
  /** 比赛别名 */
  alias: string;

  /** 比赛详情 */
  contest: Contest;

  /** 当前用户信息 */
  user: User;

  /** 服务端时间戳（毫秒） */
  serverTimestamp: number;
}

/**
 * 轨道（Track）信息
 */
export interface TrackInfo {
  trackId: string;
  type: TrackType;
  name: string;
  video?: {
    width: number;
    height: number;
    frameRate: number;
    sampleRate: number;
    simulcastConfigs?: SimulcastConfig[];
  };
  audio?: {
    sampleRate: number;
    channelCount: number;
  };
}

export interface DeviceReportSettings {
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channelCount?: number;
  simulcastConfigs?: SimulcastConfig[];
}

export interface DeviceInfo {
  classId: string;
  type: TrackType;
  name: string;
  settings?: DeviceReportSettings;
}

/**
 * Transport 信息
 */
export interface TransportInfo {
  id: string;
  iceParameters: MediasoupTypes.IceParameters;
  iceCandidates: MediasoupTypes.IceCandidate[];
  dtlsParameters: MediasoupTypes.DtlsParameters;
}

/**
 * 开始推流请求
 * 服务端要求选手端开始推流指定的轨道
 */
export interface RequestStartBroadcast {
  trackIds: string[];
}

/**
 * 停止推流请求
 * 服务端要求选手端停止推流指定的轨道
 */
export interface RequestStopBroadcast {
  trackIds: string[];
}

/**
 * Produce 请求参数
 */
export interface ProduceParams {
  trackId: string; // 设备的 classId，用于标识推流来源
  kind: MediasoupTypes.MediaKind;
  rtpParameters: MediasoupTypes.RtpParameters;
}

/**
 * Produce 响应数据
 */
export interface ProduceResponse {
  producerId: string;
  type: ProducerType;
  appData: MediasoupTypes.AppData;
}

export type ProducerType = 'simple' | 'simulcast' | 'svc' | (string & {});

/**
 * 完成连接 Transport 参数
 */
export interface CompleteConnectTransportParams {
  dtlsParameters: MediasoupTypes.DtlsParameters;
}

/**
 * 确认就绪响应数据
 */
export interface ConfirmReadyResponse {
  transport: TransportInfo;
  routerRtpCapabilities: MediasoupTypes.RtpCapabilities;
}

export interface ReplayRequest {
  trackId: string;
  startTime: string;
  endTime: string;
}

export interface StopReplayRequest {
  trackId: string;
}
