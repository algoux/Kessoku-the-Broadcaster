import {
  AppConfigInterface,
  UpdateAppConfigDTO,
  UpdateAudioConfigDTO,
  UpdateGlobalConfigDTO,
  VideoConfig,
  AudioConfig,
  RequestStartBroadcast,
} from 'common/config.interface';

import { Resp, ContestInfo } from './src/common/types/broadcaster.types';

declare global {
  type EventPayloadMapping = {
    getSources: Electron.DesktopCapturerSource[];
    saveVideo: string | null;
    hasReady: void;
    setWindowTitle: string;
    loginSuccess: void;

    // WebSocket 相关事件
    login: { success: boolean; error?: string };
    openSettingsWindow: void;
    'get-connection-status': 'connected' | 'disconnected' | 'connecting';
    'get-contest-info': Resp<ContestInfo>;
    'connect-producer-transport': void;
    'create-producer': { id: string };
    'report-device-state': { success: boolean };

    // 监听事件
    'start-streaming-request': {
      classIds: string[];
      transport?: any;
      routerRtpCapabilities?: any;
    };
    'stop-streaming-request': Record<string, never>;
    'replay-request': {
      classId: string;
      startTime: string;
      endTime: string;
    };
    'stop-replay-request': { classId: string };
    'connection-state-changed': 'connected' | 'disconnected' | 'connecting';

    // 回看相关事件
    'handle-replay-request': { success: boolean; filePath?: string; error?: string };
    'replay-video-ready': { classId: string; filePath: string; startTime: string; endTime: string };

    // 视频录制相关
    'start-continuous-recording': { success: boolean; error?: string };
    'stop-continuous-recording': { success: boolean };
    'get-recording-blob': void;
    'cut-video': { success: boolean; filePath?: string; error?: string };
    'read-video-file': ArrayBuffer;

    getAppConfig: AppConfigInterface;
    getDevicesConfig: {
      screens?: Array<{
        id: string;
        name: string;
        width: number;
        height: number;
        frameRate: number;
        sampleRate: number;
      }>;
      cameras?: Array<{
        id: string;
        name: string;
        width: number;
        height: number;
        frameRate: number;
        sampleRate: number;
      }>;
      microphones?: Array<{ id: string; name: string; sampleRate: number; channelCount: number }>;
    };
    hasDevicesConfig: boolean;
    updateVideoConfig: void;
    updateAudioConfig: void;
    updateAppConfig: void;
    updateGlobalConfig: void;
    clearVideoCache: { success: boolean; deletedCount?: number; error?: string };

    // 窗口控制
    'window-minimize': void;
    'window-maximize': void;
    'window-close': void;
  };

  // 扩展 Window 接口
  interface Window {
    electron: {
      getSources: () => Promise<Electron.DesktopCapturerSource[]>;
      saveVideo: (arrayBuffer: ArrayBuffer) => Promise<string | null>;
      setWindowTitle: (title: string) => void;
      loginSuccess: () => void;
      hasReady: () => void;
      // WebSocket 相关方法
      login: (
        alias: string,
        userId: string,
        token: string,
      ) => Promise<{ success: boolean; error?: string }>;
      getConnectionStatus: () => Promise<'connected' | 'disconnected' | 'connecting'>;
      getContestInfo: () => Promise<Resp<ContestInfo>>;
      connectProducerTransport: (transportId: string | null, dtlsParameters: any) => Promise<void>;
      createProducer: (params: {
        kind: string;
        rtpParameters: any;
        appData?: any;
      }) => Promise<{ id: string }>;
      // 设备状态上报
      reportDeviceState: (devices: any[], isReady: boolean) => Promise<{ success: boolean }>;
      // IPC 监听器方法
      onStreamingRequest: (callback: (data: RequestStartBroadcast) => void) => void;
      onStopStreamingRequest: (callback: (data: Record<string, never>) => void) => void;
      onReplayRequest: (
        callback: (data: { classId: string; startTime: string; endTime: string }) => void,
      ) => void;
      onReplayVideoReady: (
        callback: (data: {
          classId: string;
          filePath: string;
          startTime: string;
          endTime: string;
        }) => void,
      ) => void;
      onStopReplayRequest: (callback: (data: { classId: string }) => void) => void;
      onConnectionStateChanged: (
        callback: (state: 'connected' | 'disconnected' | 'connecting') => void,
      ) => void;
      removeAllListeners: (channel: string) => void;
      // 视频录制相关
      startContinuousRecording: (classId: string) => Promise<{ success: boolean; error?: string }>;
      stopContinuousRecording: (classId: string) => Promise<{ success: boolean }>;
      sendRecordingBlob: (classId: string, blob: Blob) => Promise<void>;
      cutVideo: (
        classId: string,
        startTime: string,
        endTime: string,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      readVideoFile: (filePath: string) => Promise<ArrayBuffer>;
      handleReplayRequest: (
        classId: string,
        startTime: string,
        endTime: string,
      ) => Promise<{ success: boolean; filePath?: string; error?: string }>;
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
      updateAppConfig: (data: UpdateAppConfigDTO) => Promise<void>;
      updateGlobalConfig: (data: UpdateGlobalConfigDTO) => Promise<void>;
      clearVideoCache: () => Promise<{ success: boolean; deletedCount?: number; error?: string }>;
      // 窗口控制
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
    };
  }
}

export {};
