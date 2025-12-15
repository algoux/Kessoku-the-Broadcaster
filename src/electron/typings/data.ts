import { Contest, User } from 'common/typings/srk.types';
import { SimulcastConfig } from 'common/config.interface';
import fs from 'fs';

/**
 * Broadcaster 通用响应结构
 */
export interface RespSuccess<T = any> {
  success: true;
  code?: 0;
  data?: T;
}

export interface RespError {
  success: false;
  code?: number;
  msg?: string;
  data?: any;
}

export type Resp<T = any> = RespSuccess<T> | RespError;

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
  serverTimeStamp: number;
}

/**
 * 轨道（Track）信息
 */
export interface TrackInfo {
  trackId: string;
  type: 'screen' | 'camera' | 'microphone';
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

/**
 * Transport 信息
 */
export interface TransportInfo {
  id: string;
  iceParameters: any;
  iceCandidates: any[];
  dtlsParameters: any;
}

/**
 * 开始推流请求
 */
export interface RequestStartBroadcast {
  trackIds: string[];
  transport: TransportInfo;
  routerRtpCapabilities: any;
}

/**
 * Produce 请求参数
 */
export interface ProduceParams {
  kind: 'audio' | 'video';
  rtpParameters: any;
  appData?: any;
  trackId: string; // 设备的 classId，用于标识推流来源
}

/**
 * Produce 响应数据
 */
export interface ProduceResponse {
  producerId: string;
}

/**
 * 完成连接 Transport 参数
 */
export interface CompleteConnectTransportParams {
  dtlsParameters: any;
}

export interface RecordingData {
  classId: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  chunks: Buffer[];
}
