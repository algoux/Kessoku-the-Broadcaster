import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, Tray } from 'electron';
import { isDevelopment, ipcMainHandle, ipcMainOn } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath, getAssetsPath } from './utils/path-resolver';
import { WebSocketService } from './services/websocket-service';
import { VideoRecordingService } from './services/video-recording-service';
import { createTray } from './utils/tray';
import * as fs from 'fs';

let loginWindow: BrowserWindow;
let mainWindow: BrowserWindow;
let webSocketService: WebSocketService;
let videoRecordingService: VideoRecordingService;
const SERVICE_URL: string = 'http://localhost:3001';

app.setAboutPanelOptions({
  applicationName: 'Kessoku the Broadcaster',
  applicationVersion: app.getVersion(),
  copyright: '© 2024 algoUX all rights reserved.',
  authors: ['algoUX'],
  website: 'https://kessoku-broadcaster.example.com',
});

function showWindow(window: BrowserWindow) {
  window.on('ready-to-show', () => {
    window.show();
  });
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    width: 420,
    height: 520,
    resizable: false,
    show: false,
    titleBarStyle: 'hiddenInset',
  });

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
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    show: false,
    width: 1280,
    height: 720,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
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
  ipcMainHandle('handle-replay-request', async ({ classId, seconds }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }

    try {
      console.log(`处理回看请求: classId=${classId}, seconds=${seconds}`);
      const result = await videoRecordingService.cutVideo(classId, seconds);

      if (result.success && result.filePath) {
        // 通知渲染进程视频已准备好
        if (mainWindow) {
          mainWindow.webContents.send('replay-video-ready', {
            classId,
            filePath: result.filePath,
            seconds,
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

// 设置 IPC 处理器
function setupIpcHandlers() {
  // 登录并连接到服务器
  ipcMainHandle('login', async (playerName: string) => {
    // 初始化 WebSocket 服务（如果还没有初始化）
    if (!webSocketService) {
      webSocketService = new WebSocketService(SERVICE_URL);
    }

    if (!webSocketService) {
      return { success: false, error: '未连接服务器' };
    }

    const success = await webSocketService.connect(playerName);

    if (success && loginWindow) {
      loginWindow.close();
      loginWindow = null;
      mainWindow = createMainWindow();
      webSocketService.setMainWindow(mainWindow);
      showWindow(mainWindow);
    }
    return { success };
  });

  // 渲染进程通知推流开始成功
  ipcMainOn('streaming-started', ({ producerId, kind, rtpParameters }) => {
    if (webSocketService) {
      webSocketService.notifyStreamingStarted(producerId, kind, rtpParameters || {});
    }
  });

  // 渲染进程通知推流停止
  ipcMainOn('streaming-stopped', ({ producerId }) => {
    if (webSocketService) {
      webSocketService.notifyStreamingStopped(producerId);
    }
  });

  // 获取连接状态
  ipcMainHandle('get-connection-status', () => {
    return webSocketService
      ? webSocketService.getConnectionStatus()
      : { connected: false, socketId: null };
  });

  // 获取路由器 RTP 能力
  ipcMainHandle('get-router-rtp-capabilities', () => {
    return webSocketService ? webSocketService.getRouterRtpCapabilities() : null;
  });

  // 创建推流传输通道
  ipcMainHandle('create-producer-transport', async () => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.createProducerTransport();
  });

  // 连接推流传输通道
  ipcMainHandle('connect-producer-transport', async ({ transportId, dtlsParameters }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.connectProducerTransport(transportId, dtlsParameters);
  });

  // 创建推流生产者
  ipcMainHandle('create-producer', async ({ kind, rtpParameters }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.createProducer(kind, rtpParameters);
  });

  // 上报设备状态
  ipcMainHandle('report-device-state', async ({ devices, isReady }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    webSocketService.reportDeviceState(devices, isReady);
    return { success: true };
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

  ipcMainHandle('cut-video', async ({ classId, seconds }) => {
    if (!videoRecordingService) {
      return { success: false, error: '录制服务未初始化' };
    }
    return await videoRecordingService.cutVideo(classId, seconds);
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

app.whenReady().then(() => {
  setupIpcHandlers();
  createLoginWindow();
});
