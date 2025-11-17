import { ipcMain, WebContents, WebFrameMain } from "electron";
import { getUIPath } from "./path-resolver";
import { pathToFileURL } from "url";

export function isDevelopment() {
  return process.env.NODE_ENV === "development";
}

export function ipcMainHandle<Key extends keyof EventPayloadMapping>(
  key: Key,
  handler: () => EventPayloadMapping[Key],
) {
  ipcMain.handle(key, (event) => {
    // @ts-ignore
    validateEventFrame(event.senderFrame);
    return handler();
  });
}

export function ipcWebContentsSend<Key extends keyof EventPayloadMapping>(
  key: Key,
  webContents: WebContents,
  payload: EventPayloadMapping[Key],
) {
  webContents.send(key, payload);
}

export function validateEventFrame(frame: WebFrameMain) {
  console.log("Validating frame URL:", frame.url);
  if (isDevelopment() && new URL(frame.url).host === "localhost:5123") {
    return;
  }
  if (frame.url !== pathToFileURL(getUIPath()).toString()) {
    throw new Error("Unauthorized frame access");
  }
}
