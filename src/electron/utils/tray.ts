import { BrowserWindow, Menu, Tray, app, nativeImage } from 'electron';
import path from 'path';
import { getAssetsPath } from './path-resolver';
import log from 'electron-log';
import fs from 'fs';

export function createTray(mainWindow: BrowserWindow) {
  const iconName = process.platform == 'darwin' ? 'livingTemplate.png' : 'living.ico';
  const iconPath = path.join(getAssetsPath(), iconName);

  log.info('托盘图标路径', { iconPath, exists: fs.existsSync(iconPath) });

  if (!fs.existsSync(iconPath)) {
    log.error('托盘图标文件不存在', { iconPath });
    throw new Error(`托盘图标文件不存在: ${iconPath}`);
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    log.error('托盘图标加载失败', { iconPath });
    throw new Error(`托盘图标加载失败: ${iconPath}`);
  }

  const tray = new Tray(icon);
  log.info('托盘创建成功');

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '显示',
        click: () => {
          mainWindow.show();
          if (app.dock) {
            app.dock.show();
          }
        },
      },
      {
        label: '退出',
        click: () => app.quit(),
      },
    ]),
  );
}
