import { app, BrowserWindow, ipcMain, dialog, desktopCapturer } from 'electron';
import { isDevelopment, ipcMainHandle } from './utils/index';
import ResourcesManager from './utils/resource-manager';
import { getPreloadPath, getUIPath } from './utils/path-resolver';
import fs from 'fs';
import { getTray } from './utils/tray';
import { createMenu } from './utils/menu';

function showMainWindow(mainWindow: BrowserWindow) {
  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });
}

app.on('ready', () => {
  const mainWindow = new BrowserWindow({
    webPreferences: {
      preload: getPreloadPath(),
    },
    show: false,
    width: 1280,
    height: 720,
    minWidth: 1000,
    minHeight: 600,
  });

  if (isDevelopment()) {
    mainWindow.loadURL('http://localhost:5123/');
    showMainWindow(mainWindow);
  } else {
    mainWindow.loadFile(getUIPath());
    showMainWindow(mainWindow);
  }

  const resourcesManager = new ResourcesManager();
  // resourcesManager.pollResources(mainWindow);

  ipcMainHandle('getStaticData', () => {
    return resourcesManager.getStaticData();
  });

  ipcMain.on('setWindowTitle', (event, title: string) => {
    mainWindow.setTitle(title);
  });

  // 处理获取屏幕源
  ipcMain.handle('getSources', async () => {
    return await desktopCapturer.getSources({ types: ['screen'] });
  });

  getTray(mainWindow);

  handleCloseEvents(mainWindow);

  createMenu(mainWindow);
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
