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
} from 'common/typings/broadcaster.types';

export interface RecordingData {
  classId: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  chunks: Buffer[];
}
