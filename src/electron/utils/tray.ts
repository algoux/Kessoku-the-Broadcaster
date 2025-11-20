import { app, BrowserWindow, Menu, Tray } from 'electron';
import path from 'path';
import { getAssetsPath } from './path-resolver';

// let tray: Tray | null = null;
// let currentWindow: BrowserWindow | null = null;

// export function createTray(window: BrowserWindow) {
//   if (tray) {
//     currentWindow = window;
//     updateTrayMenu();
//     return tray;
//   }

//   currentWindow = window;
//   tray = new Tray(
//     path.join(getAssetsPath(), process.platform === 'darwin' ? 'livingTemplate.png' : 'living.png'),
//   );

//   updateTrayMenu();
//   return tray;
// }

// export function updateTrayWindow(window: BrowserWindow) {
//   currentWindow = window;
//   if (tray) {
//     updateTrayMenu();
//   }
// }

// function updateTrayMenu() {
//   if (!tray || !currentWindow) return;

//   tray.setContextMenu(
//     Menu.buildFromTemplate([
//       {
//         label: '显示窗口',
//         click: () => {
//           if (currentWindow) {
//             currentWindow.show();
//             if (app.dock) {
//               app.dock.show();
//             }
//           }
//         },
//       },
//       {
//         label: '退出',
//         click: () => {
//           app.quit();
//         },
//       },
//     ]),
//   );
// }

// export function getTray() {
//   return tray;
// }

export class TrayManager {
  tray!: Tray;
  currentWindow!: BrowserWindow;

  createTray(window: BrowserWindow) {
    if (this.tray) {
      this.currentWindow = window;
      this.updateTrayMenu();
      return this.tray;
    }

    this.currentWindow = window;
    this.tray = new Tray(
      path.join(
        getAssetsPath(),
        process.platform === 'darwin' ? 'livingTemplate.png' : 'living.png',
      ),
    );

    this.updateTrayMenu();
    return this.tray;
  }

  updateTrayWindow(window: BrowserWindow) {
    this.currentWindow = window;
    if (this.tray) {
      this.updateTrayMenu();
    }
  }

  updateTrayMenu() {
    if (!this.tray || !this.currentWindow) return;

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: '显示窗口',
          click: () => {
            if (this.currentWindow) {
              this.currentWindow.show();
              if (app.dock) {
                app.dock.show();
              }
            }
          },
        },
        {
          label: '退出',
          click: () => {
            app.quit();
          },
        },
      ]),
    );
  }

  get getTray() {
    return this.tray;
  }
}
