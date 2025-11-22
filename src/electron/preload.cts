const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
  sendFrameAction: (payload) => {
    ipcSend('sendFrameAction', payload);
  },
  subscribeStatistics: (callback: (statistics: Statistics) => void) =>
    ipcOn('statistics', (stats: Statistics) => {
      callback(stats);
    }),
  getSources: () => ipcInvoke('getSources'),
  saveVideo: (arrayBuffer) => ipcInvoke('saveVideo', arrayBuffer),
  getStaticData: () => ipcInvoke('getStaticData'),
  setWindowTitle: (title: string) => {
    ipcSend('setWindowTitle', title);
  },
  loginSuccess: () => {
    ipcSend('loginSuccess', undefined);
  },
  hasReady: () => {
    ipcSend('hasReady', undefined);
  },
  // WebSocket 相关方法
  login: (playerName: string) => {
    return ipcInvoke('login', playerName);
  },
  getConnectionStatus: () => {
    return ipcInvoke('get-connection-status');
  },
  getRouterRtpCapabilities: () => {
    return ipcInvoke('get-router-rtp-capabilities');
  },
  createProducerTransport: () => {
    return ipcInvoke('create-producer-transport');
  },
  connectProducerTransport: (transportId: string, dtlsParameters: any) => {
    return ipcInvoke('connect-producer-transport', { transportId, dtlsParameters });
  },
  createProducer: (kind: string, rtpParameters: any) => {
    return ipcInvoke('create-producer', { kind, rtpParameters });
  },
  notifyStreamingStarted: (producerId: string, kind: string, rtpParameters?: any) => {
    ipcSend('streaming-started', { producerId, kind, rtpParameters });
  },
  notifyStreamingStopped: (producerId: string) => {
    ipcSend('streaming-stopped', { producerId });
  },
  // 设备状态上报
  reportDeviceState: (devices: any[], isReady: boolean) => {
    return ipcInvoke('report-device-state', { devices, isReady });
  },
  // IPC 监听器方法
  onStreamingRequest: (callback: (data: { requestedBy: string; classIds: string[] }) => void) => {
    return ipcOn('start-streaming-request', callback);
  },
  onStopStreamingRequest: (callback: (data: { requestedBy: string }) => void) => {
    return ipcOn('stop-streaming-request', callback);
  },
  removeAllListeners: (channel: string) => {
    electron.ipcRenderer.removeAllListeners(channel);
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
  const cb = (_: Electron.IpcRendererEvent, payload: any) => callback(payload);
  electron.ipcRenderer.on(key, cb);
  return () => {
    electron.ipcRenderer.off(key, cb);
  };
}

function ipcSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  payload: EventPayloadMapping[Key],
) {
  electron.ipcRenderer.send(key, payload);
}
