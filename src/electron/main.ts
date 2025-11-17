import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, Tray } from 'electron';
import { isDevelopment, ipcMainHandle } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath } from './utils/path-resolver';
import fs from 'fs';
import { createTray, updateTrayWindow } from './utils/tray';

let loginWindow: BrowserWindow | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

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

  updateTrayWindow(mainWindow);

  handleCloseEvents(mainWindow);

  return mainWindow;
}

function handleCloseEvents(mainWindow: BrowserWindow) {
  let willClose = false;

  mainWindow.on('close', (e) => {
    if (willClose) return;
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
}

app.on('ready', () => {
  createLoginWindow();

  ipcMain.on('loginSuccess', () => {
    if (loginWindow) {
      loginWindow.close();
      loginWindow = null;
    }
    mainWindow = createMainWindow();
  });

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
});
