import fs from 'fs';
import path from 'path';
import os from 'os';

import { app, BrowserWindow, desktopCapturer } from 'electron';
import { isDevelopment, ipcMainHandle, ipcMainOn, ipcWebContentsSend } from './utils/index';
import { getPreloadPath, getUIPath } from './utils/path-resolver';
import { WebSocketService } from './services/websocket-service';
import { VideoRecordingService } from './services/video-recording-service';
import { ConfigManager } from './services/config-manager';
import { createTray } from './utils/tray';
import log from 'electron-log';
import type { DeviceInfo, TrackInfo } from './typings/data';

import {
  UpdateConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
} from 'common/config.interface';

function getRespErrorMessage(resp: { success: boolean; msg?: string }, fallback: string) {
  return resp.msg || fallback;
}

// 配置日志路径到用户目录
const homeDir = os.homedir();
const appDir = path.join(homeDir, '.Kessoku-the-Broadcaster');
const logsDir = path.join(appDir, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// 设置日志文件路径
log.transports.file.resolvePathFn = () => path.join(logsDir, 'main.log');
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

log.info('应用启动', { version: app.getVersion(), platform: process.platform });

app.setName('Kessoku the Broadcaster');

let loginWindow: BrowserWindow;
let mainWindow: BrowserWindow;
let settingsWindow: BrowserWindow;
let webSocketService: WebSocketService;
let videoRecordingService: VideoRecordingService;
let configManager: ConfigManager = new ConfigManager();

app.setAboutPanelOptions({
  applicationName: app.getName(),
  applicationVersion: app.getVersion(),
  copyright: '© 2019-present algoUX. All Rights Reserved.',
  authors: ['algoUX'],
  website: 'https://algoux.org',
});

function showWindow(window: BrowserWindow) {
  window.on('ready-to-show', () => {
    window.show();
  });
}

function createLoginWindow() {
  log.info('创建登录窗口');
  loginWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 720,
    height: 500,
    resizable: false,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' && { frame: false }),
  });
  log.info('登录窗口创建完成');

  if (isDevelopment()) {
    loginWindow.loadURL('http://localhost:5123/#login');
    showWindow(loginWindow);
  } else {
    loginWindow.loadFile(getUIPath(), {
      hash: 'login',
    });
    showWindow(loginWindow);
  }
}

function createMainWindow() {
  log.info('创建主窗口');
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    show: false,
    width: 1280,
    height: 720,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' && { frame: false }),
  });

  setupMainWindowIpcHandlers(mainWindow);

  handleCloseEvents(mainWindow);

  if (isDevelopment()) {
    mainWindow.loadURL('http://localhost:5123/');
  } else {
    mainWindow.loadFile(getUIPath());
  }

  createTray(mainWindow);

  handleCloseEvents(mainWindow);
  return mainWindow;
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 500,
    height: 600,
    resizable: false,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' && { frame: false }),
    vibrancy: 'sidebar', // 或 'sidebar'
    visualEffectState: 'active',
  });

  // 窗口关闭时清空引用
  settingsWindow.on('closed', () => {
    settingsWindow = null!;
  });

  if (isDevelopment()) {
    settingsWindow.loadURL('http://localhost:5123/#settings');
    showWindow(settingsWindow);
  } else {
    settingsWindow.loadFile(getUIPath(), {
      hash: 'settings',
    });
    showWindow(settingsWindow);
  }
}

/**
 * 设置通用 IPC 处理器
 * @description 负责与渲染进程通信，并处理来自服务器的请求
 */
function setupIpcHandlers() {
  /**
   * 登陆状态
   */
  ipcMainHandle(
    'login',
    async ({ alias, userId, token }: { alias: string; userId: string; token: string }) => {
      try {
        const config = configManager.getConfigData;
        webSocketService = new WebSocketService(
          config.serviceURL || 'https://rl-broadcast-hub.algoux.cn',
          config.servicePath,
          config.clientId,
        );

        const connected = await webSocketService.connect(alias, userId, token);

        if (!connected) {
          return { success: false, error: '连接服务器失败' };
        }

        configManager.updateUserConfig({ userId, broadcasterToken: token });
        configManager.updateCompetitionConfig({ alias });

        if (loginWindow) {
          loginWindow.close();
          loginWindow = null;
        }
        mainWindow = createMainWindow();
        webSocketService.setMainWindow(mainWindow);
        showWindow(mainWindow);
        log.info('登录成功', { alias, userId, token });
        return { success: true };
      } catch (error) {
        log.error('登录失败:', error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  ipcMainHandle('logout', async () => {
    try {
      if (configManager && webSocketService) {
        await webSocketService.cancelReady();
        configManager.clearUserConfig();
      }
      app.quit();
      log.info('登出成功');
      return { success: true };
    } catch (error) {
      log.error('登出失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 获取连接状态
  ipcMainHandle('getConnectionStatus', () => {
    const status = webSocketService ? webSocketService.getConnectionStatus() : 'disconnected';
    return status as 'connected' | 'disconnected' | 'connecting';
  });

  // 获取比赛信息
  ipcMainHandle('getContestInfo', async () => {
    return await webSocketService.getContestInfo();
  });

  /**
   * 推流相关
   */
  ipcMainHandle(
    'connectProducerTransport',
    async ({ dtlsParameters }) => {
      const resp = await webSocketService.completeConnectTransport({ dtlsParameters });
      if (!resp.success) {
        throw new Error(getRespErrorMessage(resp, '连接 transport 失败'));
      }
    },
  );

  ipcMainHandle('createProducer', async ({ trackId, kind, rtpParameters }) => {
    const resp = await webSocketService.produce({ kind, rtpParameters, trackId });
    if (!resp.success) {
      throw new Error(getRespErrorMessage(resp, '推流失败'));
    }
    return { id: resp.data!.producerId };
  });

  ipcMainHandle('completeStopBroadcast', async ({ requestId }) => {
    webSocketService.completeStopBroadcast(requestId);
    return { success: true };
  });

  ipcMainHandle('reportDeviceState', async ({ devices, isReady }) => {
    if (isReady && devices && devices.length > 0) {
      const tracks: TrackInfo[] = devices.map((device: DeviceInfo) => {
        const track: TrackInfo = {
          trackId: device.classId,
          type: device.type,
          name: device.name,
        };

        // 根据设备类型添加 video 或 audio 配置
        if (device.type !== 'microphone' && device.settings) {
          track.video = {
            width: device.settings.width,
            height: device.settings.height,
            frameRate: device.settings.frameRate,
            sampleRate: device.settings.sampleRate || 0,
            simulcastConfigs: device.settings.simulcastConfigs,
          };
        } else if (device.type === 'microphone' && device.settings) {
          track.audio = {
            sampleRate: device.settings.sampleRate,
            channelCount: device.settings.channelCount,
          };
        }
        return track;
      });

      const resp = await webSocketService.confirmReady(tracks);
      if (resp.success && resp.data) {
        console.log('confirmReady 成功，通知渲染进程初始化 transport');
        ipcWebContentsSend('transportReady', mainWindow.webContents, {
          transport: resp.data.transport,
          routerRtpCapabilities: resp.data.routerRtpCapabilities,
        });
      }

      return { success: resp.success };
    } else {
      // 取消就绪前，先清理所有 producer 和 transport
      ipcWebContentsSend('cleanupMediaResources', mainWindow.webContents, {});
      const resp = await webSocketService.cancelReady();
      return { success: resp.success };
    }
  });

  /**
   * 配置管理
   */
  ipcMainHandle('getAppConfig', async () => {
    return configManager.getConfigData;
  });

  ipcMainHandle('getDevicesConfig', async () => {
    return configManager.getDevicesConfig;
  });

  ipcMainHandle('hasDevicesConfig', async () => {
    return configManager.hasDevicesConfig();
  });

  ipcMainHandle('updateConfig', async (data: UpdateConfigDTO) => {
    configManager.updateConfig(data);
  });

  ipcMainHandle('clearVideoCache', async () => {
    try {
      const cachePath = configManager.getConfigData.appConfig?.videoCachePath;
      if (!cachePath || !fs.existsSync(cachePath)) {
        return { success: false, error: '缓存目录不存在' };
      }

      // 读取目录中的所有文件
      const files = fs.readdirSync(cachePath);
      let deletedCount = 0;

      // 删除所有文件
      for (const file of files) {
        const filePath = `${cachePath}/${file}`;
        const stat = fs.statSync(filePath);

        if (stat.isFile()) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }

      console.log(`清理缓存完成，删除 ${deletedCount} 个文件`);
      return { success: true, deletedCount };
    } catch (error) {
      console.error('清理缓存失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  ipcMainHandle('updateAudioConfig', async (data: UpdateAudioConfigDTO[]) => {
    configManager.updateAudioConfig(data);
  });

  ipcMainHandle(
    'updateVideoConfig',
    async ({ data, type }: { data: UpdateVideoConfigDTO[]; type: 'camera' | 'screen' }) => {
      configManager.updateVideoConfig(data, type);
    },
  );

  ipcMainHandle('getPlatformInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
    };
  });

  /**
   * Windows 窗口控制
   */
  ipcMainOn('windowMinimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMainOn('windowMaximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMainOn('windowClose', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });

  ipcMainOn('openSettingsWindow', () => {
    createSettingsWindow();
  });

  ipcMainHandle('startContinuousRecording', async (classId) => {
    if (!videoRecordingService) {
      videoRecordingService = new VideoRecordingService();
    }
    return videoRecordingService.startRecording(classId);
  });

  ipcMainHandle('stopContinuousRecording', async (classId) => {
    if (!videoRecordingService) {
      return { success: false };
    }
    return videoRecordingService.stopRecording(classId);
  });

  // todo
  // 回看推流相关
  ipcMainHandle('readVideoFile', async (filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer.buffer;
    } catch (error) {
      console.error('读取视频文件失败:', error);
      throw error;
    }
  });

  ipcMainHandle('getRecordingBlob', async ({ classId, arrayBuffer }) => {
    if (!videoRecordingService) {
      throw new Error('录制服务未初始化');
    }
    await videoRecordingService.saveRecordingChunk(classId, arrayBuffer);
  });

  ipcMainHandle('cutVideo', async ({ classId, startTime, endTime }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }
    return await videoRecordingService.cutVideo(classId, startTime, endTime);
  });
}

function setupMainWindowIpcHandlers(mainWindow: BrowserWindow) {
  ipcMainHandle('getSources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
  });

  ipcMainOn('hasReady', () => {
    if (mainWindow) {
      mainWindow.hide();
      if (app.dock) {
        app.dock.hide();
      }
    }
  });

  ipcMainHandle('handleReplayRequest', async ({ classId, startTime, endTime }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }

    try {
      console.log(`处理回看请求: classId=${classId}, startTime=${startTime}, endTime=${endTime}`);
      const result = await videoRecordingService.cutVideo(classId, startTime, endTime);

      if (result.success && result.filePath) {
        // 通知渲染进程视频已准备好
        if (mainWindow) {
          ipcWebContentsSend('replayVideoReady', mainWindow.webContents, {
            classId,
            filePath: result.filePath,
            startTime,
            endTime,
          });
        }
      }

      return result;
    } catch (error) {
      console.error('处理回看请求失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });
}

/**
 * 处理主窗口的关闭事件，防止应用退出，改为隐藏窗口
 * @param mainWindow 主窗口引用
 */
const handleCloseEvents = (mainWindow: BrowserWindow) => {
  let willClose = false;

  mainWindow.on('close', (e) => {
    if (willClose) {
      return;
    }
    e.preventDefault();
    mainWindow.hide();
    if (app.dock) {
      app.dock.hide();
    }
  });

  app.on('before-quit', () => {
    willClose = true;
  });

  mainWindow.on('show', () => {
    willClose = false;
  });
};

app.whenReady().then(async () => {
  log.info('Electron 应用就绪');
  setupIpcHandlers();

  const appConfig = configManager.getConfigData;
  const alias = appConfig?.competitionConfig?.alias;
  const userId = appConfig?.userConfig?.userId;
  const token = appConfig?.userConfig?.broadcasterToken;

  if (alias && userId && token) {
    log.info('检测到配置文件，尝试自动登录', { alias, userId });

    try {
      if (!webSocketService) {
        webSocketService = new WebSocketService(
          configManager.getConfigData.serviceURL || 'https://rl-broadcast-hub.algoux.cn',
          configManager.getConfigData.servicePath,
          configManager.getConfigData.clientId,
        );
      }
      const connected = await webSocketService.connect(alias, userId, token);

      if (connected) {
        mainWindow = createMainWindow();
        log.info('自动登录成功');
        webSocketService.setMainWindow(mainWindow);
        showWindow(mainWindow);
        return; // 自动登录成功，不显示登录窗口
      } else {
        log.info('自动登录失败，显示登录窗口');
      }
    } catch (error) {
      log.error('自动登录出错', error);
      console.error('自动登录出错:', error);
    }
  }
  // 自动登录失败或没有配置，显示登录窗口
  log.info('显示登录窗口');
  createLoginWindow();
});

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  log.error('未捕获的异常', error);
  console.error('未捕获的异常:', error);
});

// 捕获未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
  log.error('未处理的 Promise 拒绝', { reason, promise });
  console.error('未处理的 Promise 拒绝:', reason);
});

// 应用退出时的日志
app.on('will-quit', () => {
  log.info('应用即将退出');
});

app.on('quit', () => {
  log.info('应用已退出');
});
