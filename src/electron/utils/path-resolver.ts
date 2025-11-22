import path from 'path';
import { app } from 'electron';
import { isDevelopment } from './index';

export function getPreloadPath() {
  return path.join(app.getAppPath(), isDevelopment() ? '.' : '', 'dist/electron/preload.cjs');
}

export function getUIPath() {
  return path.join(app.getAppPath(), 'dist/ui/index.html');
}

export function getAssetsPath() {
  return path.join(app.getAppPath(), isDevelopment() ? '.' : '', 'resources');
}
