const electron = require('electron');
import {
  UpdateConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
} from 'common/config.interface';
import type {
  CompleteConnectTransportParams,
  DeviceInfo,
  ProduceParams,
} from 'common/typings/broadcaster.types';

function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]) => void,
) {
  console.log('[Preload] 设置 IPC 监听器:', key);
  const cb = (_: Electron.IpcRendererEvent, payload: EventPayloadMapping[Key]) => {
    console.log('[Preload] 收到 IPC 消息:', key, payload);
    callback(payload);
  };
  electron.ipcRenderer.on(key, cb);
  return () => {
    electron.ipcRenderer.off(key, cb);
  };
}

export function ipcSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  ...args: EventArgMapping[Key]
) {
  electron.ipcRenderer.send(key, ...args);
}

electron.contextBridge.exposeInMainWorld('electron', {
  getSources: () => ipcInvoke('getSources'),
  hasReady: () => {
    ipcSend('hasReady');
  },
  // WebSocket 相关方法
  login: (alias: string, userId: string, token: string) => {
    return ipcInvoke('login', { alias, userId, token });
  },
  logout: () => {
    return ipcInvoke('logout');
  },
  getConnectionStatus: () => {
    return ipcInvoke('getConnectionStatus');
  },
  getContestInfo: () => {
    return ipcInvoke('getContestInfo');
  },
  connectProducerTransport: (dtlsParameters: CompleteConnectTransportParams['dtlsParameters']) => {
    return ipcInvoke('connectProducerTransport', { dtlsParameters });
  },
  createProducer: (params: ProduceParams) => {
    return ipcInvoke('createProducer', params);
  },
  completeStopBroadcast: (requestId: string) => {
    return ipcInvoke('completeStopBroadcast', { requestId });
  },
  reportDeviceState: (devices: DeviceInfo[], isReady: boolean) => {
    return ipcInvoke('reportDeviceState', { devices, isReady });
  },
  // IPC 监听器方法
  onStreamingRequest: (callback: (data: EventPayloadMapping['startStreamingRequest']) => void) => {
    return ipcOn('startStreamingRequest', callback);
  },
  onStopStreamingRequest: (callback: (data: { classIds: string[]; requestId?: string }) => void) => {
    return ipcOn('stopStreamingRequest', callback);
  },
  onCleanupMediaResources: (callback: (data: Record<string, never>) => void) => {
    return ipcOn('cleanupMediaResources', callback);
  },
  onReplayRequest: (
    callback: (data: { classId: string; startTime: string; endTime: string }) => void,
  ) => {
    return ipcOn('replayRequest', callback);
  },
  onReplayVideoReady: (
    callback: (data: {
      classId: string;
      filePath: string;
      startTime: string;
      endTime: string;
    }) => void,
  ) => {
    return ipcOn('replayVideoReady', callback);
  },
  onStopReplayRequest: (callback: (data: { classId: string }) => void) => {
    return ipcOn('stopReplayRequest', callback);
  },
  onConnectionStateChanged: (
    callback: (state: 'connected' | 'disconnected' | 'connecting') => void,
  ) => {
    return ipcOn('connectionStateChanged', callback);
  },
  onTransportReady: (callback: (data: EventPayloadMapping['transportReady']) => void) => {
    return ipcOn('transportReady', callback);
  },
  // 视频录制相关
  startContinuousRecording: (classId: string) => {
    return ipcInvoke('startContinuousRecording', classId);
  },
  stopContinuousRecording: (classId: string) => {
    return ipcInvoke('stopContinuousRecording', classId);
  },
  sendRecordingBlob: async (classId: string, blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    return ipcInvoke('getRecordingBlob', { classId, arrayBuffer });
  },
  cutVideo: (classId: string, startTime: string, endTime: string) => {
    return ipcInvoke('cutVideo', { classId, startTime, endTime });
  },
  readVideoFile: (filePath: string) => {
    return ipcInvoke('readVideoFile', filePath);
  },
  handleReplayRequest: (classId: string, startTime: string, endTime: string) => {
    return ipcInvoke('handleReplayRequest', { classId, startTime, endTime });
  },
  openSettingsWindow: () => {
    ipcSend('openSettingsWindow');
  },
  getAppConfig: () => {
    return ipcInvoke('getAppConfig');
  },
  getDevicesConfig: () => {
    return ipcInvoke('getDevicesConfig');
  },
  hasDevicesConfig: () => {
    return ipcInvoke('hasDevicesConfig');
  },
  updateVideoConfig: (data: UpdateVideoConfigDTO[], type: 'camera' | 'screen') => {
    return ipcInvoke('updateVideoConfig', { data, type });
  },
  updateAudioConfig: (data: UpdateAudioConfigDTO[]) => {
    return ipcInvoke('updateAudioConfig', data);
  },
  updateConfig: (data: UpdateConfigDTO) => {
    return ipcInvoke('updateConfig', data);
  },
  clearVideoCache: () => {
    return ipcInvoke('clearVideoCache');
  },

  // 窗口控制
  minimizeWindow: () => {
    ipcSend('windowMinimize');
  },
  maximizeWindow: () => {
    ipcSend('windowMaximize');
  },
  closeWindow: () => {
    ipcSend('windowClose');
  },
  getPlatformInfo: () => {
    return ipcInvoke('getPlatformInfo');
  },
} satisfies Window['electron']);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
  ...args: EventArgMapping[Key]
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key, ...args);
}
