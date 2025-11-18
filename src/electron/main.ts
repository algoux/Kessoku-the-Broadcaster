import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, Tray } from 'electron';
import { isDevelopment, ipcMainHandle } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath } from './utils/path-resolver';
import fs from 'fs';
import { createTray, updateTrayWindow } from './utils/tray';
import { WebSocketService } from './services/websocket-service';

let loginWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let webSocketService: WebSocketService | null = null;

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
      devTools: isDevelopment(),
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

  tray = createTray(loginWindow);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
      devTools: isDevelopment(),
    },
    show: false,
    width: 1280,
    height: 720,
    minWidth: 1000,
    minHeight: 600,
  });

  if (isDevelopment()) {
    mainWindow.loadURL('http://localhost:5123/');
    showWindow(mainWindow);
  } else {
    mainWindow.loadFile(getUIPath(), {
      hash: 'home',
    });
    showWindow(mainWindow);
  }

  const resourcesManager = new ResourcesManager();

  ipcMainHandle('getStaticData', () => {
    return resourcesManager.getStaticData();
  });

  ipcMain.handle('getSources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
  });

  ipcMain.on('hasReady', () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  updateTrayWindow(mainWindow);
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

  return mainWindow;
}

// 设置 IPC 处理器
function setupIpcHandlers() {
  // 登录并连接到服务器
  ipcMain.handle('login', async (_, playerName: string) => {
    // 如果还没有主窗口，先创建它
    if (!mainWindow) {
      mainWindow = createMainWindow();
    }

    // 初始化 WebSocket 服务（如果还没有初始化）
    if (!webSocketService && mainWindow) {
      webSocketService = new WebSocketService(mainWindow);
    }

    if (!webSocketService) {
      return { success: false, error: 'WebSocket 服务未初始化' };
    }

    const success = await webSocketService.connect(playerName);

    if (success && loginWindow) {
      // 登录成功，关闭登录窗口，显示主窗口
      loginWindow.close();
      loginWindow = null;

      if (mainWindow) {
        mainWindow.show();
      }
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
}

// 处理登录成功后的逻辑（兼容旧代码）
ipcMain.on('loginSuccess', () => {
  if (loginWindow) {
    loginWindow.close();
    loginWindow = null;
  }
  if (!mainWindow) {
    mainWindow = createMainWindow();
  }
});

const handleCloseEvents = (window: BrowserWindow) => {
  window.on('closed', () => {
    // 清理 WebSocket 连接
    if (webSocketService) {
      webSocketService.disconnect();
    }

    if (tray && !tray.isDestroyed()) {
      tray.destroy();
    }
    app.quit();
  });
};

app.whenReady().then(() => {
  setupIpcHandlers();
  createLoginWindow();
});
