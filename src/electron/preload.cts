const electron = require('electron');
console.log('Preload script loaded');
electron.contextBridge.exposeInMainWorld('electron', {
  subscribeStatistics: (callback: (statistics: Statistics) => void) =>
    ipcOn('statistics', (stats: Statistics) => {
      callback(stats);
    }),
  getSources: () => ipcInvoke('getSources'),
  saveVideo: (arrayBuffer) => ipcInvoke('saveVideo', arrayBuffer),
  getStaticData: () => ipcInvoke('getStaticData'),
  setWindowTitle: (title: string) => {
    electron.ipcRenderer.send('setWindowTitle', title);
  },
  loginSuccess: () => {
    electron.ipcRenderer.send('loginSuccess');
  },
  hasReady: () => {
    electron.ipcRenderer.send('hasReady');
  },
  // 新的 WebSocket 相关方法
  login: (playerName: string) => {
    return electron.ipcRenderer.invoke('login', playerName);
  },
  getConnectionStatus: () => {
    return electron.ipcRenderer.invoke('get-connection-status');
  },
  getRouterRtpCapabilities: () => {
    return electron.ipcRenderer.invoke('get-router-rtp-capabilities');
  },
  createProducerTransport: () => {
    return electron.ipcRenderer.invoke('create-producer-transport');
  },
  connectProducerTransport: (transportId: string, dtlsParameters: any) => {
    return electron.ipcRenderer.invoke('connect-producer-transport', {
      transportId,
      dtlsParameters,
    });
  },
  createProducer: (kind: string, rtpParameters: any) => {
    return electron.ipcRenderer.invoke('create-producer', { kind, rtpParameters });
  },
  notifyStreamingStarted: (producerId: string, kind: string, rtpParameters?: any) => {
    electron.ipcRenderer.send('streaming-started', { producerId, kind, rtpParameters });
  },
  notifyStreamingStopped: (producerId: string) => {
    electron.ipcRenderer.send('streaming-stopped', { producerId });
  },
  // 设备状态上报
  reportDeviceState: (devices: any[], isReady: boolean) => {
    return electron.ipcRenderer.invoke('report-device-state', { devices, isReady });
  },
  // IPC 监听器方法
  onStreamingRequest: (callback: (data: { requestedBy: string; classIds: string[] }) => void) => {
    electron.ipcRenderer.on('start-streaming-request', (_, data) => callback(data));
  },
  onStopStreamingRequest: (callback: (data: { requestedBy: string }) => void) => {
    electron.ipcRenderer.on('stop-streaming-request', (_, data) => callback(data));
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
