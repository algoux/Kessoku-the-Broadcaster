import { app, BrowserWindow, desktopCapturer } from 'electron';
import { isDevelopment, ipcMainHandle, ipcMainOn } from './utils/index';
import { getPreloadPath, getUIPath } from './utils/path-resolver';
import { WebSocketService } from './services/websocket-service';
import { VideoRecordingService } from './services/video-recording-service';
import { createTray } from './utils/tray';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConfigManager } from './services/config-manager';
import {
  UpdateAppConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
  UpdateGlobalConfigDTO,
} from 'common/config.interface';
import log from 'electron-log';

// 配置日志路径到用户目录
const homeDir = os.homedir();
const appDir = path.join(homeDir, '.Kessoku-the-Broadcaster');
const logsDir = path.join(appDir, 'logs');

// 确保日志目录存在
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
let webSocketService: WebSocketService;
let videoRecordingService: VideoRecordingService;
// const SERVICE_URL: string = 'http://localhost:3001';
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

  // 处理回看请求
  ipcMainHandle('handle-replay-request', async ({ classId, startTime, endTime }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }

    try {
      console.log(`处理回看请求: classId=${classId}, startTime=${startTime}, endTime=${endTime}`);
      const result = await videoRecordingService.cutVideo(classId, startTime, endTime);

      if (result.success && result.filePath) {
        // 通知渲染进程视频已准备好
        if (mainWindow) {
          mainWindow.webContents.send('replay-video-ready', {
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
      return { success: false, error: error.message };
    }
  });

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
  const settingsWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 500,
    height: 600,
    resizable: false,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32' && { frame: false }),
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

// 设置 IPC 处理器
function setupIpcHandlers() {
  // 登录并连接到服务器
  ipcMainHandle(
    'login',
    async ({ alias, userId, token }: { alias: string; userId: string; token: string }) => {
      try {
        // 重新初始化 WebSocket 服务，确保使用最新的配置
        const config = configManager.getConfigData;
        webSocketService = new WebSocketService(
          config.serviceURL || 'http://127.0.0.1:3001',
          config.servicePath,
          config.clientId,
        );

        // 使用传入的参数进行连接
        const success = await webSocketService.connect(alias, userId, token);

        if (success) {
          // 登录成功，保存到配置文件
          configManager.updateUserConfig({ userId, broadcasterToken: token });
          configManager.updateCompetitionConfig({ alias });

          if (loginWindow) {
            loginWindow.close();
            loginWindow = null;
          }
          mainWindow = createMainWindow();
          webSocketService.setMainWindow(mainWindow);
          showWindow(mainWindow);
        }
        return { success };
      } catch (error) {
        console.error('登录失败:', error);
        return { success: false, error: (error as Error).message };
      }
    },
  );

  ipcMainOn('openSettingsWindow', () => {
    createSettingsWindow();
  });

  // 获取连接状态
  ipcMainHandle('get-connection-status', () => {
    const status = webSocketService ? webSocketService.getConnectionStatus() : 'disconnected';
    return status as 'connected' | 'disconnected' | 'connecting';
  });

  // 获取比赛信息
  ipcMainHandle('get-contest-info', async () => {
    if (!webSocketService) {
      return {
        success: false,
        msg: 'WebSocket 服务未初始化',
      };
    }
    return await webSocketService.getContestInfo();
  });

  // 延迟启动连接状态检查定时器，确保init完成
  setTimeout(() => {
    const checkConnectionState = () => {
      if (webSocketService) {
        const state = webSocketService.getConnectionStatus();
        mainWindow?.webContents.send('connection-state-changed', state);
      }
    };

    // 定期检查连接状态
    setInterval(checkConnectionState, 1000);
  }, 2000);

  // 连接推流传输通道
  ipcMainHandle('connect-producer-transport', async ({ transportId, dtlsParameters }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    const resp = await webSocketService.completeConnectTransport({ dtlsParameters });
    if (!resp.success) {
      throw new Error((resp as any).msg || '连接 transport 失败');
    }
  });

  // 创建推流生产者
  ipcMainHandle('create-producer', async ({ kind, rtpParameters, appData }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    // 从 appData 中提取 classId 作为 trackId
    const trackId = appData?.classId || '';
    const resp = await webSocketService.produce({ kind, rtpParameters, appData, trackId });
    if (!resp.success) {
      throw new Error((resp as any).msg || '推流失败');
    }
    return { id: resp.data!.producerId };
  });

  // 上报设备状态（替换为 confirmReady）
  ipcMainHandle('report-device-state', async ({ devices, isReady }) => {
    if (isReady && devices && devices.length > 0) {
      // 转换设备信息为 TrackInfo 格式
      const tracks = devices.map((device: any) => {
        const track: any = {
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
      return { success: resp.success };
    } else {
      const resp = await webSocketService.cancelReady();
      return { success: resp.success };
    }
  });

  // 视频录制相关
  ipcMainHandle('start-continuous-recording', async (classId: string) => {
    if (!videoRecordingService) {
      videoRecordingService = new VideoRecordingService();
    }
    return videoRecordingService.startRecording(classId);
  });

  ipcMainHandle('stop-continuous-recording', async (classId: string) => {
    if (!videoRecordingService) {
      return { success: false };
    }
    return videoRecordingService.stopRecording(classId);
  });

  ipcMainHandle('get-recording-blob', async ({ classId, arrayBuffer }) => {
    if (!videoRecordingService) {
      throw new Error('录制服务未初始化');
    }
    await videoRecordingService.saveRecordingChunk(classId, arrayBuffer);
  });

  ipcMainHandle('cut-video', async ({ classId, startTime, endTime }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }
    return await videoRecordingService.cutVideo(classId, startTime, endTime);
  });

  // 登出
  ipcMainHandle('logout', async () => {
    try {
      // 1. 向服务端发送 cancelReady 事件
      if (webSocketService) {
        await webSocketService.cancelReady();
      }

      // 2. 清空本地配置文件的 userConfig 字段
      configManager.clearUserConfig();

      // 3. 退出应用
      app.quit();

      return { success: true };
    } catch (error) {
      log.error('登出失败:', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // 读取视频文件
  ipcMainHandle('read-video-file', async (filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath);
      return buffer.buffer;
    } catch (error) {
      console.error('读取视频文件失败:', error);
      throw error;
    }
  });

  ipcMainHandle('getAppConfig', async () => {
    return configManager.getConfigData;
  });

  ipcMainHandle('getDevicesConfig', async () => {
    return configManager.getDevicesConfig;
  });

  ipcMainHandle('hasDevicesConfig', async () => {
    return configManager.hasDevicesConfig();
  });

  ipcMainHandle('updateAppConfig', async (data: UpdateAppConfigDTO) => {
    configManager.updateAppConfig(data);
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

  ipcMainHandle('updateGlobalConfig', async (data: UpdateGlobalConfigDTO) => {
    configManager.updateGlobalConfig(data);
  });

  ipcMainHandle('getPlatformInfo', async () => {
    return {
      platform: process.platform,
      arch: process.arch,
    };
  });

  // 窗口控制
  ipcMainOn('window-minimize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.minimize();
  });

  ipcMainOn('window-maximize', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });

  ipcMainOn('window-close', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.close();
  });
}

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

  // 尝试自动登录
  const appConfig = configManager.getConfigData;
  const alias = appConfig?.competitionConfig?.alias;
  const userId = appConfig?.userConfig?.userId;
  const token = appConfig?.userConfig?.broadcasterToken;

  if (alias && userId && token) {
    log.info('检测到配置文件，尝试自动登录', { alias, userId });
    console.log('检测到配置文件，尝试自动登录...');

    // 初始化 WebSocket 服务
    if (!webSocketService) {
      webSocketService = new WebSocketService(
        configManager.getConfigData.serviceURL || 'http://127.0.0.1:3001',
        configManager.getConfigData.servicePath,
        configManager.getConfigData.clientId,
      );
    }

    try {
      const success = await webSocketService.connect(alias, userId, token);

      if (success) {
        log.info('自动登录成功');
        console.log('自动登录成功，创建主窗口');
        mainWindow = createMainWindow();
        webSocketService.setMainWindow(mainWindow);
        showWindow(mainWindow);
        return; // 成功则不显示登录窗口
      } else {
        log.warn('自动登录失败，显示登录窗口');
        console.log('自动登录失败，显示登录窗口');
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
