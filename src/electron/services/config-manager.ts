import {
  AppConfigInterface,
  UpdateAppConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
} from 'common/config.interface';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';

export class ConfigManager {
  protected configPath: string = os.homedir() + '/.Kessoku-the-Broadcaster/config.json';
  private configData: AppConfigInterface;

  constructor() {
    this.loadingConfig();
  }

  private loadingConfig() {
    if (fs.existsSync(this.configPath)) {
      const rawData = fs.readFileSync(this.configPath, 'utf-8');
      this.configData = JSON.parse(rawData) as AppConfigInterface;
    } else {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            version: app.getVersion(),
            appConfig: {},
            userConfig: {},
            devicesConfig: {},
          } as AppConfigInterface,
          null,
          2,
        ),
      );
      this.configData = JSON.parse(fs.readFileSync(this.configPath, 'utf-8')) as AppConfigInterface;
    }
  }

  get getConfigPath() {
    return this.configPath;
  }

  get getConfigData() {
    return this.configData;
  }

  get getDevicesConfig() {
    return this.configData.devicesConfig || {};
  }

  hasDevicesConfig(): boolean {
    const dc = this.configData.devicesConfig;
    return !!(
      (dc.screens && dc.screens.length > 0) ||
      (dc.cameras && dc.cameras.length > 0) ||
      (dc.microphones && dc.microphones.length > 0)
    );
  }

  private saveConfig() {
    fs.writeFileSync(this.configPath, JSON.stringify(this.configData, null, 2));
  }

  updateAppConfig(data: UpdateAppConfigDTO) {
    this.configData.appConfig = {
      ...this.configData.appConfig,
      ...data,
    };
    this.saveConfig();
  }

  updateVideoConfig(data: UpdateVideoConfigDTO[], type: 'camera' | 'screen') {
    if (type === 'camera') {
      this.configData.devicesConfig.cameras = data;
    } else if (type === 'screen') {
      this.configData.devicesConfig.screens = data;
    }
    this.saveConfig();
  }

  updateAudioConfig(data: UpdateAudioConfigDTO[]) {
    this.configData.devicesConfig.microphones = data;
    this.saveConfig();
  }
}
