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
  // 打包后使用 process.resourcesPath，开发时使用项目目录
  if (isDevelopment()) {
    return path.join(app.getAppPath(), 'resources');
  } else {
    return path.join(process.resourcesPath, 'resources');
  }
}

export function getFFmpegpath() {
  let ffmpegPath: string;
  let ffprobePath: string;

  const platform = process.platform;
  const arch = process.arch;

  let platformDir: string;
  if (platform === 'darwin') {
    platformDir = arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  } else if (platform === 'win32') {
    platformDir = arch === 'arm64' ? 'win-arm64' : 'win-x64';
  } else if (platform === 'linux') {
    platformDir = arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  } else {
    throw new Error(`不支持的平台: ${platform}-${arch}`);
  }

  const ffmpegName = platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const ffprobeName = platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

  if (isDevelopment()) {
    const resourcesPath = path.join(app.getAppPath(), 'resources', 'ffmpeg', platformDir);
    ffmpegPath = path.join(resourcesPath, ffmpegName);
    ffprobePath = path.join(resourcesPath, ffprobeName);
  } else {
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg', platformDir, ffmpegName);
    ffprobePath = path.join(process.resourcesPath, 'ffmpeg', platformDir, ffprobeName);
  }

  return {
    ffmpegPath,
    ffprobePath,
  };
}
