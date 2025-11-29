import {
  Device,
  DeviceType,
  CanAddState,
  DeviceCapabilities,
  ConfigForm,
  DeviceSettings,
} from 'common/modules/home/home.interface';
import { RendererService } from './renderer-service';

interface DeviceAddingRes {
  success: boolean;
  code: number;
  device?: Device;
}

interface ConfigSaveRes {
  success: boolean;
  message: string;
}

export class DeviceManager {
  userDevices: Device[] = [];
  selectedPreset: string = '';
  deviceIdToClassIdMap: Map<string, string> = new Map();
  currentConfigDevice: Device;
  availableScreens: Array<{ id: string; name: string }> = [];
  availableCameras: Array<MediaDeviceInfo> = [];
  availableMicrophones: Array<MediaDeviceInfo> = [];

  canAddState: CanAddState = {
    screen: 0,
    camera: 0,
    microphone: 0,
  };

  configForm: ConfigForm;

  public isStreaming: boolean = false;

  public streamStatus: string = '未连接';

  constructor() {
  }

  /**
   * 获取所有可用设备
   * @async
   */
  async refreshAllDevices(): Promise<Device[] | void> {
    try {
      const sources = await window.electron.getSources();
      this.availableScreens = sources.map((s: any) => ({ id: s.id, name: s.name }));

      // 请求媒体权限以获取设备标签
      await navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {});

      // 获取摄像头和麦克风设备
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.availableCameras = devices.filter((d) => d.kind === 'videoinput');
      this.availableMicrophones = devices.filter((d) => d.kind === 'audioinput');

      // 如果用户设备列表为空，添加默认设 备
      if (this.userDevices.length === 0) {
        const defautDevices = await this.addDefaultDevices();
        this.updateCanAddState();
        return defautDevices;
      }

      this.updateCanAddState();
    } catch (error) {
      console.log(error);
      throw new Error('刷新设备失败');
    }
  }

  /**
   * 添加默认设备
   * @description 在应用初始化时，添加设备源数组的第一个为默认值
   * @async
   */
  async addDefaultDevices(): Promise<Device[]> {
    let defautDevicesList = [];
    if (this.availableScreens.length > 0) {
      const screen = this.availableScreens[0];
      const device: Device = {
        id: screen.id,
        name: screen.name,
        classId: this.getOrCreateClassId(screen.id, 'screen', true),
        type: 'screen',
        enabled: true,
        isDefault: true,
      };
      console.log('Adding default screen device:', device);
      let newDevice = await this.startDeviceStream(device);
      defautDevicesList.push(newDevice);
      this.userDevices.push(device);
    }

    if (this.availableCameras.length > 0) {
      const camera = this.availableCameras[0];
      const device: Device = {
        id: camera.deviceId,
        name: camera.label || '默认摄像头',
        classId: this.getOrCreateClassId(camera.deviceId, 'camera', true),
        type: 'camera',
        enabled: true,
        isDefault: true,
      };
      let newDevice = await this.startDeviceStream(device);
      defautDevicesList.push(newDevice);
      this.userDevices.push(device);
    }

    if (this.availableMicrophones.length > 0) {
      const mic = this.availableMicrophones[0];
      this.userDevices.push({
        id: mic.deviceId,
        name: mic.label || '默认麦克风',
        type: 'microphone',
        enabled: true,
        isDefault: true,
        classId: this.getOrCreateClassId(mic.deviceId, 'microphone', true),
      });
      defautDevicesList.push(mic);
    }
    return defautDevicesList;
  }

  private updateCanAddState() {
    const countByType = (type: DeviceType) =>
      this.userDevices.filter((d) => d.type === type).length;

    this.canAddState = {
      screen: this.availableScreens.length - countByType('screen'),
      camera: this.availableCameras.length - countByType('camera'),
      microphone: this.availableMicrophones.length - countByType('microphone'),
    };
  }

  /**
   * 获取设备的分类 id
   * @param deviceId 设备默认序列号
   * @param deviceType 设备类型枚举
   * @param isDefault 是否是默认设备
   * @returns 分类 id
   * @description 分类 id 格式为 `${type}_${index}`，默认设备为 `${type}_main`，用于导播端区分具体设备画面切换
   */
  getOrCreateClassId<T extends DeviceType>(
    deviceId: string,
    deviceType: T,
    isDefault: boolean = false,
  ): T extends 'screen'
    ? `screen_${string}`
    : T extends 'camera'
      ? `camera_${string}`
      : `microphone_${string}` {
    // 如果已存在映射关系，直接返回
    if (this.deviceIdToClassIdMap.has(deviceId)) {
      return this.deviceIdToClassIdMap.get(deviceId)! as any;
    }

    let classId: string;
    if (isDefault) {
      classId = `${deviceType}_main`;
    } else {
      // 查找当前该类型已使用的索引
      const usedIndices = new Set<number>();
      const prefix = `${deviceType}_`;

      this.deviceIdToClassIdMap.forEach((existingClassId) => {
        if (existingClassId.startsWith(prefix)) {
          const suffix = existingClassId.replace(prefix, '');
          if (suffix === 'main') {
            usedIndices.add(-1);
          } else {
            const index = parseInt(suffix);
            if (!isNaN(index)) usedIndices.add(index);
          }
        }
      });

      // 找到最小的未使用索引
      let index = 0;
      while (usedIndices.has(index)) index++;

      classId = `${deviceType}_${index}`;
    }

    // 保存映射关系
    this.deviceIdToClassIdMap.set(deviceId, classId);
    return classId as any;
  }

  async startDeviceStream(device: Device): Promise<Device> {
    try {
      let stream: MediaStream;

      if (device.type === 'screen') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            // @ts-ignore
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: device.id,
            },
          },
        });
      } else if (device.type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: device.id },
          },
        });
      }

      if (stream) {
        device.stream = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities() as DeviceCapabilities;
          const rawSettings = videoTrack.getSettings();

          if (!device.capabilities) {
            device.capabilities = capabilities;
          }

          // 只提取可序列化的基本属性
          device.settings = {
            width: rawSettings.width,
            height: rawSettings.height,
            frameRate: rawSettings.frameRate,
            aspectRatio: rawSettings.aspectRatio,
            facingMode: rawSettings.facingMode,
            maxFrameRate: capabilities?.frameRate?.max,
          };
          device.formatSetting = this.getFormatSettings(device);
          console.log(`${device.id} formatSettings:`, device.formatSetting);
        }
      }
      return device;
    } catch (error) {
      console.error(`❌ 启动设备 ${device.name} 失败:`, error);
      throw new Error(`启动设备 ${device.name} 失败`);
    }
  }

  async stopStreaming() {
    try {
      // Device 和 Transport 保持连接，以便下次快速推流
      this.isStreaming = false;

      // 检查并重新启动受影响的设备流
      for (const device of this.userDevices) {
        if (device.stream && device.stream.getVideoTracks().length > 0) {
          const track = device.stream.getVideoTracks()[0];

          // 如果流被意外关闭，重新启动
          if (track.readyState === 'ended') {
            try {
              await this.startDeviceStream(device);
            } catch (error) {
              throw new Error(`重新启动设备 ${device.name} 流失败`);
            }
          }
        }
      }
    } catch (error) {
      throw new Error('停止推流失败');
    }
  }

  async startStreaming(classIds: string[] = []) {
    try {
      // 根据 classIds 筛选要推流的设备
      let devicesToStream = this.userDevices.filter((device) => device.enabled);

      if (classIds && classIds.length > 0) {
        devicesToStream = devicesToStream.filter((device) => classIds.includes(device.classId));
      }

      // 重新获取所选设备的流（确保 track 未 ended）
      for (const device of devicesToStream) {
        if (device.type === 'screen' || device.type === 'camera') {
          // 检查流是否有效
          const isStreamValid = device.stream?.getVideoTracks()[0]?.readyState === 'live';
          if (!isStreamValid) {
            await this.startDeviceStream(device);
          }
        }
      }

      // 收集要推流的设备流
      const enabledStreams: MediaStream[] = [];
      for (const device of devicesToStream) {
        if (device.stream) {
          // 只推送视频设备（屏幕和摄像头）
          if (device.type === 'screen' || device.type === 'camera') {
            enabledStreams.push(device.stream);
          }
        }
      }

      // 通过RendererService开始推流
      this.isStreaming = true;
      return enabledStreams;
      // await this.rendererService.startStreaming(enabledStreams);
    } catch (error) {
      console.error('推流失败:', error);
      throw new Error('推流失败');
    }
  }

  async addScreenDevice(): Promise<DeviceAddingRes> {
    const unusedScreen = this.availableScreens.find(
      (screen) => !this.userDevices.some((d) => d.id === screen.id && d.type === 'screen'),
    );

    if (!unusedScreen) {
      return {
        success: false,
        code: 0,
      };
    }

    const device: Device = {
      id: unusedScreen.id,
      name: unusedScreen.name,
      type: 'screen',
      classId: this.getOrCreateClassId(unusedScreen.id, 'screen'),
      enabled: true,
      isDefault: false,
    };

    this.userDevices.push(device);
    await this.startDeviceStream(device);
    this.updateCanAddState();
    return {
      success: true,
      code: 1,
      device: device,
    };
  }

  async addCameraDevice(): Promise<DeviceAddingRes> {
    const unusedCamera = this.availableCameras.find(
      (camera) => !this.userDevices.some((d) => d.id === camera.deviceId && d.type === 'camera'),
    );

    if (!unusedCamera) {
      return {
        success: false,
        code: 0,
      };
    }

    const device: Device = {
      id: unusedCamera.deviceId,
      name: unusedCamera.label || `摄像头 ${unusedCamera.deviceId}`,
      type: 'camera',
      classId: this.getOrCreateClassId(unusedCamera.deviceId, 'camera'),
      enabled: true,
      isDefault: false,
    };

    this.userDevices.push(device);
    await this.startDeviceStream(device);
    this.updateCanAddState();
    return {
      success: true,
      code: 1,
      device: device,
    };
  }

  async addMicrophoneDevice(): Promise<DeviceAddingRes> {
    const unusedMic = this.availableMicrophones.find(
      (mic) => !this.userDevices.some((d) => d.id === mic.deviceId && d.type === 'microphone'),
    );

    if (!unusedMic) {
      return {
        success: false,
        code: 0,
      };
    }

    const device: Device = {
      id: unusedMic.deviceId,
      name: unusedMic.label || `麦克风 ${unusedMic.deviceId.slice(0, 8)}`,
      type: 'microphone',
      classId: this.getOrCreateClassId(unusedMic.deviceId, 'microphone'),
      enabled: true,
      isDefault: false,
    };

    this.userDevices.push(device);

    this.updateCanAddState();
    return {
      success: true,
      code: 1,
      device: device,
    };
  }

  removeDevice(device: Device) {
    const index = this.userDevices.indexOf(device);
    if (index > -1) {
      this.userDevices.splice(index, 1);
      this.updateCanAddState();
    }
  }

  stopDeviceStream(device: Device, videoEl?: HTMLVideoElement) {
    if (device.stream) {
      device.stream.getTracks().forEach((track) => track.stop());
      device.stream = undefined;
      device.settings = undefined;
      device.capabilities = undefined;

      if (videoEl) {
        videoEl.srcObject = null;
      }
    }
  }

  openConfigDialog(device: Device) {
    if (device.type === 'microphone') {
      return {
        success: false,
        message: '麦克风设备无需配置参数',
      };
    }

    console.log('Opening config dialog for device:', device);

    this.currentConfigDevice = device;

    if (device.settings) {
      this.configForm = {
        width: Math.round(device.settings.width),
        height: Math.round(device.settings.height),
        frameRate: Math.round(device.settings.frameRate),
      };
    } else {
      this.configForm = {
        width: 1920,
        height: 1080,
        frameRate: 30,
      };
    }

    console.log('Config form initialized:', this.configForm);

    this.selectedPreset = '';
    return {
      success: true,
      message: '配置对话框已打开',
    };
  }

  applyPreset = (presetStr: string) => {
    console.log('Applying preset:', presetStr);
    if (!presetStr) return;

    try {
      const preset = JSON.parse(presetStr);
      if (preset && preset.width && preset.height) {
        this.configForm.width = preset.width;
        this.configForm.height = preset.height;
      }
    } catch (error) {
      console.log(error);
      throw new Error('应用预设失败');
    }
  }

  async saveDeviceConfig(): Promise<Device> {
    if (!this.currentConfigDevice) throw new Error('当前无配置设备');

    if (!this.configForm.width || !this.configForm.height || !this.configForm.frameRate) {
      throw new Error('请填写完整的配置参数');
    }

    try {
      const originalCapabilities = this.currentConfigDevice.capabilities;
      this.stopDeviceStream(this.currentConfigDevice);

      let stream: MediaStream;

      if (this.currentConfigDevice.type === 'screen') {
        stream = await (navigator.mediaDevices.getUserMedia as any)({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: this.currentConfigDevice.id,
              minWidth: this.configForm.width,
              maxWidth: this.configForm.width,
              minHeight: this.configForm.height,
              maxHeight: this.configForm.height,
              minFrameRate: this.configForm.frameRate,
              maxFrameRate: this.configForm.frameRate,
            },
          },
        });
      } else if (this.currentConfigDevice.type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            deviceId: { exact: this.currentConfigDevice.id },
            width: { ideal: this.configForm.width },
            height: { ideal: this.configForm.height },
            frameRate: { ideal: this.configForm.frameRate },
          },
        });
      }

      if (stream) {
        this.currentConfigDevice.stream = stream;
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          this.currentConfigDevice.settings = videoTrack.getSettings() as DeviceSettings;

          if (originalCapabilities) {
            this.currentConfigDevice.capabilities = originalCapabilities;
          }
        }
      }

      return this.currentConfigDevice;
    } catch (error) {
      throw new Error(`更新设备配置失败: ${(error as Error).message}`);
    }
  }

  getFormatSettings = (device: Device): string => {
    if (!device.settings) return '未获取';

    const s = device.settings;
    if (device.type === 'microphone') {
      return `采样率: ${s.sampleRate || 'N/A'} Hz, 声道: ${s.channelCount || 'N/A'}`;
    }

    const fps = s.frameRate ? s.frameRate.toFixed(1) : 'N/A';
    return `${s.width || 'N/A'}x${s.height || 'N/A'} @ ${fps} fps`;
  }
}
