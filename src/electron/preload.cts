const electron = require('electron');
import {
  UpdateAppConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
  UpdateGlobalConfigDTO,
} from 'common/config.interface';

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
    return ipcInvoke('get-connection-status');
  },
  getContestInfo: () => {
    return ipcInvoke('get-contest-info');
  },
  connectProducerTransport: (transportId: string | null, dtlsParameters: any) => {
    return ipcInvoke('connect-producer-transport', { transportId, dtlsParameters });
  },
  createProducer: (params: { kind: string; rtpParameters: any; appData?: any }) => {
    return ipcInvoke('create-producer', params);
  },
  // 设备状态上报
  reportDeviceState: (devices: any[], isReady: boolean) => {
    return ipcInvoke('report-device-state', { devices, isReady });
  },
  // IPC 监听器方法
  onStreamingRequest: (
    callback: (data: { classIds: string[]; transport?: any; routerRtpCapabilities?: any }) => void,
  ) => {
    return ipcOn('start-streaming-request', callback);
  },
  onStopStreamingRequest: (callback: (data: Record<string, never>) => void) => {
    return ipcOn('stop-streaming-request', callback);
  },
  onCleanupMediaResources: (callback: (data: Record<string, never>) => void) => {
    return ipcOn('cleanup-media-resources', callback);
  },
  onReplayRequest: (
    callback: (data: { classId: string; startTime: string; endTime: string }) => void,
  ) => {
    return ipcOn('replay-request', callback);
  },
  onReplayVideoReady: (
    callback: (data: {
      classId: string;
      filePath: string;
      startTime: string;
      endTime: string;
    }) => void,
  ) => {
    return ipcOn('replay-video-ready', callback);
  },
  onStopReplayRequest: (callback: (data: { classId: string }) => void) => {
    return ipcOn('stop-replay-request', callback);
  },
  onConnectionStateChanged: (
    callback: (state: 'connected' | 'disconnected' | 'connecting') => void,
  ) => {
    return ipcOn('connection-state-changed', callback);
  },
  removeAllListeners: (channel: string) => {
    electron.ipcRenderer.removeAllListeners(channel);
  },
  // 视频录制相关
  startContinuousRecording: (classId: string) => {
    return ipcInvoke('start-continuous-recording', classId);
  },
  stopContinuousRecording: (classId: string) => {
    return ipcInvoke('stop-continuous-recording', classId);
  },
  sendRecordingBlob: async (classId: string, blob: Blob) => {
    const arrayBuffer = await blob.arrayBuffer();
    return ipcInvoke('get-recording-blob', { classId, arrayBuffer });
  },
  cutVideo: (classId: string, startTime: string, endTime: string) => {
    return ipcInvoke('cut-video', { classId, startTime, endTime });
  },
  readVideoFile: (filePath: string) => {
    return ipcInvoke('read-video-file', filePath);
  },
  handleReplayRequest: (classId: string, startTime: string, endTime: string) => {
    return ipcInvoke('handle-replay-request', { classId, startTime, endTime });
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
  updateAppConfig: (data: UpdateAppConfigDTO) => {
    return ipcInvoke('updateAppConfig', data);
  },
  updateGlobalConfig: (data: UpdateGlobalConfigDTO) => {
    return ipcInvoke('updateGlobalConfig', data);
  },
  clearVideoCache: () => {
    return ipcInvoke('clearVideoCache');
  },

  // 窗口控制
  minimizeWindow: () => {
    ipcSend('window-minimize');
  },
  maximizeWindow: () => {
    ipcSend('window-maximize');
  },
  closeWindow: () => {
    ipcSend('window-close');
  },
  getPlatformInfo: () => {
    return ipcInvoke('getPlatformInfo');
  },
} satisfies Window['electron']);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
  ...args: any[]
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key, ...args);
}

function ipcOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  callback: (payload: EventPayloadMapping[Key]) => void,
) {
  console.log('[Preload] 设置 IPC 监听器:', key);
  const cb = (_: Electron.IpcRendererEvent, payload: any) => {
    console.log('[Preload] 收到 IPC 消息:', key, payload);
    callback(payload);
  };
  electron.ipcRenderer.on(key, cb);
  return () => {
    electron.ipcRenderer.off(key, cb);
  };
}

function ipcSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload?: EventPayloadMapping[Key],
) {
  electron.ipcRenderer.send(key, payload);
}
