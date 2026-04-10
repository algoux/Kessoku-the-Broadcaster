import fs from 'fs';

export type {
  RespSuccess,
  RespError,
  Resp,
  RequestLoginDTO,
  ContestInfo,
  TrackInfo,
  TransportInfo,
  RequestStartBroadcast,
  ProduceParams,
  ProduceResponse,
  CompleteConnectTransportParams,
  ConfirmReadyResponse,
} from 'common/typings/broadcaster.types';

export interface RecordingData {
  classId: string;
  filePath: string;
  writeStream: fs.WriteStream;
  startTime: number;
  chunks: Buffer[];
}
