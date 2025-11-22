import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, Tray } from 'electron';
import { isDevelopment, ipcMainHandle } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath, getAssetsPath } from './utils/path-resolver';
import fs from 'fs';
import path from 'path';
import { WebSocketService } from './services/websocket-service';
import { createTray } from './utils/tray';

let loginWindow: BrowserWindow;
let mainWindow: BrowserWindow;
let webSocketService: WebSocketService;
const SERVICE_URL: string = 'http://localhost:3001';

function showWindow(window: BrowserWindow) {
  window.on('ready-to-show', () => {
    window.show();
  });
}

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    frame: true,
    webPreferences: {
      preload: getPreloadPath(),
    },
    show: false,
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
  });

  ipcMain.handle('getSources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
  });

  ipcMain.on('hasReady', () => {
    if (mainWindow) {
      mainWindow.hide();
      if (app.dock) {
        app.dock.hide();
      }
    }
  });

  handleCloseEvents(mainWindow);

  // 处理保存视频逻辑
  ipcMain.handle('saveVideo', async (event, arrayBuffer) => {
    const { filePath } = await dialog.showSaveDialog({
      title: '保存录制视频',
      defaultPath: `record-${Date.now()}.webm`,
      filters: [{ name: 'WebM Video', extensions: ['webm'] }],
    });

    if (filePath) {
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer));
      return filePath;
    }
    return null;
  });

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
  ipcMain.handle('login', async (_, playerName: string) => {
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
  ipcMain.on('streaming-started', (_, { producerId, kind, rtpParameters }) => {
    if (webSocketService) {
      webSocketService.notifyStreamingStarted(producerId, kind, rtpParameters || {});
    }
  });

  // 渲染进程通知推流停止
  ipcMain.on('streaming-stopped', (_, { producerId }) => {
    if (webSocketService) {
      webSocketService.notifyStreamingStopped(producerId);
    }
  });

  // 获取连接状态
  ipcMain.handle('get-connection-status', () => {
    return webSocketService
      ? webSocketService.getConnectionStatus()
      : { connected: false, socketId: null };
  });

  // 获取路由器 RTP 能力
  ipcMain.handle('get-router-rtp-capabilities', () => {
    return webSocketService ? webSocketService.getRouterRtpCapabilities() : null;
  });

  // 创建推流传输通道
  ipcMain.handle('create-producer-transport', async () => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.createProducerTransport();
  });

  // 连接推流传输通道
  ipcMain.handle('connect-producer-transport', async (_, { transportId, dtlsParameters }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.connectProducerTransport(transportId, dtlsParameters);
  });

  // 创建推流生产者
  ipcMain.handle('create-producer', async (_, { kind, rtpParameters }) => {
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    return await webSocketService.createProducer(kind, rtpParameters);
  });

  // 上报设备状态
  ipcMain.handle('report-device-state', async (_, { devices, isReady }) => {
    console.log('📥 [主进程] 收到设备状态上报请求:', {
      devices,
      isReady,
      deviceCount: devices?.length,
    });
    if (!webSocketService) {
      throw new Error('WebSocket 服务未初始化');
    }
    webSocketService.reportDeviceState(devices, isReady);
    console.log('✅ [主进程] 已转发到 WebSocket 服务');
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
