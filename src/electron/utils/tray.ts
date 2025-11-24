import { BrowserWindow, Menu, Tray, app } from 'electron';
import path from 'path';
import { getAssetsPath } from './path-resolver';

export function createTray(mainWindow: BrowserWindow) {
  const tray = new Tray(
    path.join(getAssetsPath(), process.platform == 'darwin' ? 'livingTemplate.png' : 'living.png'),
  );

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
