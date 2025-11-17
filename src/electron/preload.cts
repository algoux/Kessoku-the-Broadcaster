const electron = require('electron');

electron.contextBridge.exposeInMainWorld('electron', {
  subscribeStatistics: (callback: (statistics: Statistics) => void) =>
    ipcOn('statistics', (stats: Statistics) => {
      callback(stats);
    }),
  getSources: () => electron.ipcRenderer.invoke('getSources'),
  saveVideo: (arrayBuffer) => electron.ipcRenderer.invoke('saveVideo', arrayBuffer),
  getStaticData: () => ipcInvoke('getStaticData'),
  setWindowTitle: (title: string) => {
    electron.ipcRenderer.send('setWindowTitle', title);
  }
} satisfies Window['electron']);

function ipcInvoke<Key extends keyof EventPayloadMapping>(
  key: Key,
): Promise<EventPayloadMapping[Key]> {
  return electron.ipcRenderer.invoke(key);
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
