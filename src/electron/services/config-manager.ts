import {
  AppConfigInterface,
  UpdateConfigDTO,
  UpdateAudioConfigDTO,
  UpdateVideoConfigDTO,
  VideoConfig,
  AudioConfig,
} from 'common/config.interface';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { app } from 'electron';
import { v4 as uuidv4 } from 'uuid';

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

      // 确保 appConfig 有默认值
      if (!this.configData.appConfig) {
        this.configData.appConfig = {};
      }
      if (this.configData.appConfig.autoOpenOnLogin === undefined) {
        this.configData.appConfig.autoOpenOnLogin = false;
      }
      if (this.configData.appConfig.autoReady === undefined) {
        this.configData.appConfig.autoReady = false;
      }
      if (!this.configData.appConfig.videoCachePath) {
        this.configData.appConfig.videoCachePath = os.homedir() + '/.Kessoku-the-Broadcaster/cache';
      }

      // 确保缓存目录存在
      if (
        this.configData.appConfig.videoCachePath &&
        !fs.existsSync(this.configData.appConfig.videoCachePath)
      ) {
        fs.mkdirSync(this.configData.appConfig.videoCachePath, { recursive: true });
      }

      // 同步开机自启动设置（仅生产环境）
      if (app.isPackaged && this.configData.appConfig.autoOpenOnLogin !== undefined) {
        app.setLoginItemSettings({
          openAtLogin: this.configData.appConfig.autoOpenOnLogin,
          openAsHidden: false,
        });
      }

      // 保存更新后的配置
      this.saveConfig();
    } else {
      // 确保配置目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const defaultCachePath = os.homedir() + '/.Kessoku-the-Broadcaster/cache';

      // 确保缓存目录存在
      if (!fs.existsSync(defaultCachePath)) {
        fs.mkdirSync(defaultCachePath, { recursive: true });
      }

      fs.writeFileSync(
        this.configPath,
        JSON.stringify(
          {
            version: app.getVersion(),
            serviceURL: 'https://rl-broadcast-hub.algoux.cn',
            servicePath: undefined,
            clientId: uuidv4().substring(0, 18),
            appConfig: {
              autoOpenOnLogin: false,
              autoReady: false,
              videoCachePath: defaultCachePath,
            },
            userConfig: {},
            competitionConfig: {},
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

  get getDevicesConfig(): {
    screens?: VideoConfig[];
    cameras?: VideoConfig[];
    microphones?: AudioConfig[];
  } {
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

  updateConfig(data: UpdateConfigDTO) {
    // 更新顶层配置
    if ('version' in data) {
      this.configData.version = data.version;
    }
    if ('serviceURL' in data) {
      this.configData.serviceURL = data.serviceURL;
    }
    if ('servicePath' in data) {
      this.configData.servicePath = data.servicePath;
    }

    // 更新 appConfig 配置
    const appConfigKeys: (keyof UpdateConfigDTO)[] = [
      'autoOpenOnLogin',
      'autoReady',
      'videoCachePath',
    ];
    const appConfigUpdates = Object.fromEntries(
      appConfigKeys.filter((key) => key in data).map((key) => [key, data[key]]),
    );

    if (Object.keys(appConfigUpdates).length > 0) {
      this.configData.appConfig = {
        ...this.configData.appConfig,
        ...appConfigUpdates,
      };

      // 如果更新了 videoCachePath，确保目录存在
      if (data.videoCachePath && !fs.existsSync(data.videoCachePath)) {
        fs.mkdirSync(data.videoCachePath, { recursive: true });
      }

      // 如果更新了 autoOpenOnLogin，在生产环境设置开机自启动
      if ('autoOpenOnLogin' in data && !app.isPackaged) {
        // 开发环境不设置开机自启动
        console.log('开发环境，跳过开机自启动设置');
      } else if ('autoOpenOnLogin' in data) {
        // 生产环境设置开机自启动
        app.setLoginItemSettings({
          openAtLogin: data.autoOpenOnLogin ?? false,
          openAsHidden: false,
        });
        console.log('开机自启动已设置为:', data.autoOpenOnLogin);
      }
    }

    this.saveConfig();
  }

  updateUserConfig(data: Partial<AppConfigInterface['userConfig']>) {
    this.configData.userConfig = {
      ...this.configData.userConfig,
      ...data,
    };
    this.saveConfig();
  }

  clearUserConfig() {
    this.configData.userConfig = {};
    this.saveConfig();
  }

  updateCompetitionConfig(data: Partial<AppConfigInterface['competitionConfig']>) {
    this.configData.competitionConfig = {
      ...this.configData.competitionConfig,
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
