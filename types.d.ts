import {
  AppConfigInterface,
  UpdateConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
  VideoConfig,
  AudioConfig,
  GetPlatformInfoDTO,
} from 'common/config.interface';
import {
  CompleteConnectTransportParams,
  ConnectionState,
  ContestInfo,
  DeviceInfo,
  ProduceParams,
  Resp,
} from './src/common/typings/broadcaster.types';
import type {
  CreateProducerResult,
  EmptyPayload,
  EventArgMapping as IpcEventArgMapping,
  EventPayloadMapping as IpcEventPayloadMapping,
  OperationResult,
  ReplayRequestPayload,
  StopReplayRequestPayload,
  StopStreamingRequestPayload,
  StreamingRequestPayload,
  TransportReadyPayload,
  VideoClipResult,
} from './src/common/typings/ipc.types';

declare global {
  type EventPayloadMapping = IpcEventPayloadMapping;
  type EventArgMapping = IpcEventArgMapping;

  // 扩展 Window 接口
  interface Window {
    electron: {
      getPlatformInfo: () => Promise<GetPlatformInfoDTO>;
      getSources: () => Promise<Electron.DesktopCapturerSource[]>;
      hasReady: () => void;
      // WebSocket 相关方法
      login: (alias: string, userId: string, token: string) => Promise<OperationResult>;
      logout: () => Promise<OperationResult>;
      getConnectionStatus: () => Promise<ConnectionState>;
      getContestInfo: () => Promise<Resp<ContestInfo>>;
      connectProducerTransport: (
        dtlsParameters: CompleteConnectTransportParams['dtlsParameters'],
      ) => Promise<void>;
      createProducer: (params: ProduceParams) => Promise<CreateProducerResult>;
      completeStopBroadcast: (requestId: string) => Promise<OperationResult>;
      reportDeviceState: (devices: DeviceInfo[], isReady: boolean) => Promise<OperationResult>;
      onStreamingRequest: (callback: (data: StreamingRequestPayload) => void) => void;
      onStopStreamingRequest: (callback: (data: StopStreamingRequestPayload) => void) => void;
      onCleanupMediaResources: (callback: (data: EmptyPayload) => void) => void;

      // 回看相关逻辑（todo）
      onReplayRequest: (callback: (data: ReplayRequestPayload) => void) => void;
      onReplayVideoReady: (callback: (data: EventPayloadMapping['replayVideoReady']) => void) => void;
      onStopReplayRequest: (callback: (data: StopReplayRequestPayload) => void) => void;
      onConnectionStateChanged: (callback: (state: ConnectionState) => void) => void;
      onTransportReady: (callback: (data: TransportReadyPayload) => void) => void;
      // 视频录制相关
      startContinuousRecording: (classId: string) => Promise<OperationResult>;
      stopContinuousRecording: (classId: string) => Promise<OperationResult>;
      sendRecordingBlob: (classId: string, blob: Blob) => Promise<void>;
      cutVideo: (
        classId: string,
        startTime: string,
        endTime: string,
      ) => Promise<VideoClipResult>;
      readVideoFile: (filePath: string) => Promise<ArrayBuffer>;
      handleReplayRequest: (
        classId: string,
        startTime: string,
        endTime: string,
      ) => Promise<VideoClipResult>;
      openSettingsWindow: () => void;

      getAppConfig: () => Promise<AppConfigInterface>;
      getDevicesConfig: () => Promise<{
        screens?: Array<VideoConfig>;
        cameras?: Array<VideoConfig>;
        microphones?: Array<AudioConfig>;
      }>;
      hasDevicesConfig: () => Promise<boolean>;
      updateVideoConfig: (data: UpdateVideoConfigDTO[], type: 'camera' | 'screen') => Promise<void>;
      updateAudioConfig: (data: UpdateAudioConfigDTO[]) => Promise<void>;
      updateConfig: (data: UpdateConfigDTO) => Promise<void>;
      clearVideoCache: () => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
      // 窗口控制
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
  }
}

export {};
