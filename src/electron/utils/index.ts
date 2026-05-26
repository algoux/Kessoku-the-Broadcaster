import { ipcMain, WebContents, WebFrameMain } from 'electron';

export function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

export function ipcMainHandle<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: (
    ...args: EventArgMapping[Key]
  ) => EventPayloadMapping[Key] | Promise<EventPayloadMapping[Key]>,
) {
  ipcMain.handle(key, (_, ...args) => {
    return handler(...(args as EventArgMapping[Key]));
  });
}

export function ipcMainOn<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: (...args: EventArgMapping[Key]) => void,
) {
  ipcMain.on(key, (_, ...args) => {
    return handler(...(args as EventArgMapping[Key]));
  });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key],
) {
  webContents.send(key, payload);
}
