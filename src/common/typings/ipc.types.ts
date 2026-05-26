import type { DesktopCapturerSource } from 'electron';
import type {
  AppConfigInterface,
  AudioConfig,
  GetPlatformInfoDTO,
  UpdateAudioConfigDTO,
  UpdateConfigDTO,
  UpdateVideoConfigDTO,
  VideoConfig,
} from '../config.interface';
import type {
  CompleteConnectTransportParams,
  ConfirmReadyResponse,
  ConnectionState,
  ContestInfo,
  DeviceInfo,
  ProduceParams,
  RequestLoginDTO,
  Resp,
} from './broadcaster.types';

export interface OperationResult {
  success: boolean;
  error?: string;
}

export interface CreateProducerResult {
  id: string;
}

export interface CompleteStopBroadcastPayload {
  requestId?: string;
}

export interface ReportDeviceStatePayload {
  devices: DeviceInfo[];
  isReady: boolean;
}

export interface StreamingRequestPayload {
  classIds: string[];
}

export interface StopStreamingRequestPayload extends StreamingRequestPayload {
  requestId?: string;
}

export type EmptyPayload = Record<string, never>;

export interface ReplayRequestPayload {
  classId: string;
  startTime: string;
  endTime: string;
}

export interface StopReplayRequestPayload {
  classId: string;
}

export interface TransportReadyPayload {
  transport: ConfirmReadyResponse['transport'];
  routerRtpCapabilities: ConfirmReadyResponse['routerRtpCapabilities'];
}

export interface ReplayVideoReadyPayload extends ReplayRequestPayload {
  filePath: string;
}

export interface RecordingBlobPayload {
  classId: string;
  arrayBuffer: ArrayBuffer;
}

export interface VideoClipPayload {
  classId: string;
  startTime: string;
  endTime: string;
}

export interface VideoClipResult extends OperationResult {
  filePath?: string;
}

export interface ClearVideoCacheResult extends OperationResult {
  deletedCount?: number;
}

export interface DeviceConfigPayload {
  screens?: VideoConfig[];
  cameras?: VideoConfig[];
  microphones?: AudioConfig[];
}

export interface UpdateVideoConfigPayload {
  data: UpdateVideoConfigDTO[];
  type: 'camera' | 'screen';
}

export type EventPayloadMapping = {
  getSources: DesktopCapturerSource[];
  hasReady: void;

  login: OperationResult;
  logout: OperationResult;
  openSettingsWindow: void;
  getConnectionStatus: ConnectionState;
  getContestInfo: Resp<ContestInfo>;
  connectProducerTransport: void;
  createProducer: CreateProducerResult;
  completeStopBroadcast: OperationResult;
  reportDeviceState: OperationResult;

  startStreamingRequest: StreamingRequestPayload;
  stopStreamingRequest: StopStreamingRequestPayload;
  cleanupMediaResources: EmptyPayload;
  replayRequest: ReplayRequestPayload;
  stopReplayRequest: StopReplayRequestPayload;
  connectionStateChanged: ConnectionState;
  transportReady: TransportReadyPayload;

  handleReplayRequest: VideoClipResult;
  replayVideoReady: ReplayVideoReadyPayload;

  startContinuousRecording: OperationResult;
  stopContinuousRecording: OperationResult;
  getRecordingBlob: void;
  cutVideo: VideoClipResult;
  readVideoFile: ArrayBuffer;

  getAppConfig: AppConfigInterface;
  getDevicesConfig: DeviceConfigPayload;
  hasDevicesConfig: boolean;
  updateVideoConfig: void;
  updateAudioConfig: void;
  updateConfig: void;
  clearVideoCache: ClearVideoCacheResult;

  windowMinimize: void;
  windowMaximize: void;
  windowClose: void;

  getPlatformInfo: GetPlatformInfoDTO;
};

export type EventArgMapping = {
  getSources: [];
  hasReady: [];

  login: [RequestLoginDTO];
  logout: [];
  openSettingsWindow: [];
  getConnectionStatus: [];
  getContestInfo: [];
  connectProducerTransport: [CompleteConnectTransportParams];
  createProducer: [ProduceParams];
  completeStopBroadcast: [CompleteStopBroadcastPayload];
  reportDeviceState: [ReportDeviceStatePayload];

  startStreamingRequest: [StreamingRequestPayload];
  stopStreamingRequest: [StopStreamingRequestPayload];
  cleanupMediaResources: [EmptyPayload];
  replayRequest: [ReplayRequestPayload];
  stopReplayRequest: [StopReplayRequestPayload];
  connectionStateChanged: [ConnectionState];
  transportReady: [TransportReadyPayload];

  handleReplayRequest: [VideoClipPayload];
  replayVideoReady: [ReplayVideoReadyPayload];

  startContinuousRecording: [string];
  stopContinuousRecording: [string];
  getRecordingBlob: [RecordingBlobPayload];
  cutVideo: [VideoClipPayload];
  readVideoFile: [string];

  getAppConfig: [];
  getDevicesConfig: [];
  hasDevicesConfig: [];
  updateVideoConfig: [UpdateVideoConfigPayload];
  updateAudioConfig: [UpdateAudioConfigDTO[]];
  updateConfig: [UpdateConfigDTO];
  clearVideoCache: [];

  windowMinimize: [];
  windowMaximize: [];
  windowClose: [];

  getPlatformInfo: [];
};
