import osUtils from 'os-utils';
import fs from 'fs';
import os from 'os';
import { BrowserWindow, ipcMain } from 'electron';
import { spawn, ChildProcess, exec } from 'child_process';
import path from 'path';
import { ipcWebContentsSend } from './index';
const POLLING_INTERVAL = 500;

export default class ResourcesManager {
  cpuUsage: number;
  ramUsage: number;
  storageUsage: number;

  constructor() {
    this.cpuUsage = 0;
    this.ramUsage = 0;
    this.storageUsage = 0;
  }

  public pollResources(mainWindow: BrowserWindow) {
    setInterval(async () => {
      this.cpuUsage = (await this.getCpuUsage()) as number;
      this.ramUsage = this.getRamUsage();
      this.storageUsage = this.getStorageData().usage;
      ipcWebContentsSend('statistics', mainWindow.webContents, {
        cpuUsage: this.cpuUsage,
        ramUsage: this.ramUsage,
        storageUsage: this.storageUsage,
      });
      console.log(
        `Storage Usage: ${this.storageUsage.toFixed(4)} (Total: ${this.getStorageData().total} GB)`,
      );
      console.log(`RAM Usage: ${(this.ramUsage * 100).toFixed(2)}%`);
      console.log(`CPU Usage: ${(this.cpuUsage * 100).toFixed(2)}%`);
    }, POLLING_INTERVAL);
  }

  private getCpuUsage(): Promise<number> {
    return new Promise((resolve) => {
      osUtils.cpuUsage(resolve);
    });
  }

  private getRamUsage() {
    return 1 - osUtils.freememPercentage();
  }

  public getStaticData(): StaticData {
    const totalStorage = this.getStorageData().total;
    const cpuModel = os.cpus()[0].model;
    const totalMemoryGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));

    return {
      totalStorage,
      cpuModel,
      totalMemoryGB,
    };
  }

  private getStorageData() {
    const stats = fs.statfsSync(process.platform === 'win32' ? 'C:\\' : '/');
    const total = stats.bsize * stats.blocks;
    const free = stats.bsize * stats.bfree;

    return {
      total: Math.floor(total / 1_000_000_000),
      usage: 1 - free / total,
    };
  }
}
