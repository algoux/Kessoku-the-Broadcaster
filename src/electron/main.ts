import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, Tray } from 'electron';
import { isDevelopment, ipcMainHandle, ipcMainOn } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath, getAssetsPath } from './utils/path-resolver';
import { WebSocketService } from './services/websocket-service';
import { createTray } from './utils/tray';

let loginWindow: BrowserWindow;
let mainWindow: BrowserWindow;
let webSocketService: WebSocketService;
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
