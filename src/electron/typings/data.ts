import fs from 'fs';

export type {
  RespSuccess,
  RespError,
  Resp,
  RequestLoginDTO,
  ContestInfo,
  TrackInfo,
  DeviceInfo,
  TransportInfo,
  RequestStartBroadcast,
  RequestStopBroadcast,
  ProduceParams,
  ProduceResponse,
  CompleteConnectTransportParams,
  ConfirmReadyResponse,
  ReplayRequest,
  StopReplayRequest,
  RequestCreateClip,
  RequestCreateClipAck,
} from 'common/typings/broadcaster.types';

export interface RecordingData {
  classId: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  chunks: Buffer[];
}

/**
 * 已结束或正在进行的录制文件，时间为本地毫秒时间戳
 */
export interface RecordingFile {
  filePath: string;
  startTime: number;
  endTime: number | null;
}
