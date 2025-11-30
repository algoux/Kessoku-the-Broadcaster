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

export function getFFmpegpath() {
  let ffmpegPath: string;
  let ffprobePath: string;

  if (isDevelopment()) {
    ffmpegPath = '/opt/homebrew/bin/ffmpeg';
    ffprobePath = '/opt/homebrew/bin/ffprobe';
  } else {
    ffmpegPath = path.join(
      process.resourcesPath,
      'ffmpeg',
      process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg',
    );

    ffprobePath = path.join(
      process.resourcesPath,
      'ffmpeg',
      process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe',
    );
  }

  return {
    ffmpegPath,
    ffprobePath,
  };
}
