import {
  Device,
  DeviceType,
  CanAddState,
  DeviceCapabilities,
  ConfigForm,
  DeviceSettings,
} from 'common/modules/home/home.interface';

interface DeviceAddingRes {
  success: boolean;
  code: number;
  device?: Device;
}

interface ConfigSaveRes {
  updateIndex: number;
  updateDevice: Device;
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
  screenAvailableMaxFrameRate: number;
  public isStreaming: boolean = false;
  public streamStatus: string = '未连接';
  private hasLoadedFromConfig: boolean = false;

  set setScreenAvailableMaxFrameRate(fps: number) {
    this.screenAvailableMaxFrameRate = fps;
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

      // 检查是否已有配置
      const hasConfig = await window.electron.hasDevicesConfig();

      if (hasConfig && !this.hasLoadedFromConfig) {
        // 从配置文件加载设备
        const devicesConfig = await window.electron.getDevicesConfig();
        const loadedDevices = await this.loadDevicesFromConfig(devicesConfig);
        this.hasLoadedFromConfig = true;
        this.updateCanAddState();
        return loadedDevices;
      }

      // 如果用户设备列表为空，添加默认设备
      if (this.userDevices.length === 0) {
        const defautDevices = await this.addDefaultDevices();
        this.updateCanAddState();
        return defautDevices;
      }

      this.updateCanAddState();
    } catch (error) {
      console.error(error);
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
    const hanbleDevice = async (
      d: { id: string; name: string } | MediaDeviceInfo,
      type: DeviceType,
    ): Promise<void> => {
      const _id =
        type == 'screen' ? (d as { id: string; name: string }).id : (d as MediaDeviceInfo).deviceId;
      const _name =
        type === 'screen' ? (d as { id: string; name: string }).name : (d as MediaDeviceInfo).label;
      const device: Device = {
        id: _id,
        name: _name,
        classId: this.getOrCreateClassId(_id, type, true),
        type: type,
        enabled: true,
        isDefault: true,
      };
      let newDevice = await this.startDeviceStream(device);
      defautDevicesList.push(newDevice);
      this.userDevices.push(device);
    };
    if (this.availableScreens.length > 0) {
      const screen = this.availableScreens[0];
      await hanbleDevice(screen, 'screen');
    }

    if (this.availableCameras.length > 0) {
      const camera = this.availableCameras[0];
      await hanbleDevice(camera, 'camera');
    }

    if (this.availableMicrophones.length > 0) {
      const mic = this.availableMicrophones[0];
      const device: Device = {
        id: mic.deviceId,
        name: mic.label || '默认麦克风',
        type: 'microphone',
        enabled: true,
        isDefault: true,
        classId: this.getOrCreateClassId(mic.deviceId, 'microphone', true),
      };
      let newDevice = await this.startDeviceStream(device);
      defautDevicesList.push(mic);
      this.userDevices.push(newDevice);
    }
    return defautDevicesList;
  }

  async addDevice(type: DeviceType): Promise<DeviceAddingRes> {
    try {
      if (!this.canAddState[type]) {
        return {
          success: true,
          code: 0,
        };
      }
      let unUsedDevice: any;
      if (type === 'screen') {
        unUsedDevice = this.availableScreens.find(
          (screen) => !this.userDevices.some((d) => d.id === screen.id && d.type === 'screen'),
        );
      } else if (type === 'camera') {
        unUsedDevice = this.availableCameras.find(
          (camera) =>
            !this.userDevices.some((d) => d.id === camera.deviceId && d.type === 'camera'),
        );
      } else if (type === 'microphone') {
        unUsedDevice = this.availableMicrophones.find(
          (mic) => !this.userDevices.some((d) => d.id === mic.deviceId && d.type === 'microphone'),
        );
      }

      if (!unUsedDevice) {
        return {
          success: true,
          code: 0,
        };
      }

      const deviceId = type === 'screen' ? unUsedDevice.id : unUsedDevice.deviceId;
      const device: Device = {
        id: deviceId,
        name: unUsedDevice.label,
        type: type,
        classId: this.getOrCreateClassId(deviceId, type),
        enabled: true,
        isDefault: false,
      };

      await this.startDeviceStream(device);
      this.userDevices.push(device);
      this.updateCanAddState();
      return {
        success: true,
        code: 1,
        device: device,
      };
    } catch (error) {
      throw new Error('添加设备失败');
    }
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

  get idealScreenFrameRate(): number {
    return this.screenAvailableMaxFrameRate >= 60 ? 60 : 30;
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
            frameRate: { ideal: 60, max: 60 },
          },
        });
      } else if (device.type == 'microphone') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: device.id,
          },
        });
      }

      if (stream) {
        device.stream = stream;

        if (device.type === 'microphone') {
          const audioTrack = stream.getAudioTracks()[0];
          const capabilities = audioTrack.getCapabilities() as DeviceCapabilities;
          const rawSettings = audioTrack.getSettings();

          if (!device.capabilities) device.capabilities = capabilities;

          device.settings = {
            sampleRate: rawSettings.sampleRate,
            channelCount: rawSettings.channelCount,
          };
          device.formatSetting = this.getFormatSettings(device);
        } else {
          const videoTrack = stream.getVideoTracks()[0];
          const capabilities = videoTrack.getCapabilities() as DeviceCapabilities;
          const rawSettings = videoTrack.getSettings();

          if (!device.capabilities) {
            device.capabilities = capabilities;
            if (device.type == 'screen') {
              device.capabilities.frameRate.max = this.screenAvailableMaxFrameRate;
            }
          }

          device.settings = {
            width: rawSettings.width,
            height: rawSettings.height,
            frameRate: device.type == 'screen' ? this.idealScreenFrameRate : rawSettings.frameRate,
            aspectRatio: rawSettings.aspectRatio,
            facingMode: rawSettings.facingMode,
            maxFrameRate:
              device.type == 'screen'
                ? this.screenAvailableMaxFrameRate
                : capabilities.frameRate.max,
          };
          console.log('Device settings:', device.name, device.settings);
          device.formatSetting = this.getFormatSettings(device);
        }
      }
      return device;
    } catch (error) {
      console.error(`启动设备 ${device.name} 失败:`, error);
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

      // 重新获取所选设备的流
      for (const device of devicesToStream) {
        let isStreamValid: boolean;
        if (device.type === 'microphone') {
          isStreamValid = device.stream.getAudioTracks()[0].readyState === 'live';
        } else {
          isStreamValid = device.stream.getVideoTracks()[0].readyState === 'live';
        }

        if (!isStreamValid) {
          await this.startDeviceStream(device);
        }
      }

      const enabledStreams: MediaStream[] = [];
      for (const device of devicesToStream) {
        if (device.stream) {
          enabledStreams.push(device.stream);
        }
      }

      this.isStreaming = true;
      return enabledStreams;
    } catch (error) {
      console.error('推流失败:', error);
      throw new Error('推流失败');
    }
  }

  removeDevice(device: Device) {
    const index = this.userDevices.indexOf(device);
    if (index > -1) {
      this.stopDeviceStream(device);
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
    this.currentConfigDevice = device;
    this.configForm = {
      width: Math.round(device.settings.width),
      height: Math.round(device.settings.height),
      frameRate: Math.round(device.settings.frameRate),
      channelCount: device.settings.channelCount,
      sampleRate: device.settings.sampleRate,
    };
    this.selectedPreset = '';
    return {
      success: true,
      message: '配置对话框已打开',
    };
  }

  applyPreset = (presetStr: string) => {
    if (!presetStr) return;

    try {
      const preset = JSON.parse(presetStr);
      if (preset && preset.width && preset.height) {
        this.configForm.width = preset.width;
        this.configForm.height = preset.height;
      }
    } catch (error) {
      console.error(error);
      throw new Error('应用预设失败');
    }
  };

  saveDeviceConfig = async (): Promise<ConfigSaveRes> => {
    if (this.currentConfigDevice.type === 'microphone') {
      if (!this.configForm.sampleRate || !this.configForm.channelCount) {
        throw new Error('请填写完整的配置参数');
      }
    } else {
      if (!this.configForm.width || !this.configForm.height || !this.configForm.frameRate) {
        throw new Error('请填写完整的配置参数');
      }
    }

    try {
      const originalCapabilities = this.currentConfigDevice.capabilities;
      const originalSettings = this.currentConfigDevice.settings;

      // 停止当前流（会清理 settings），但先保留原始 settings 以便出错时回退
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
      } else if (this.currentConfigDevice.type === 'microphone') {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: this.currentConfigDevice.id },
            sampleRate: this.configForm.sampleRate,
            channelCount: this.configForm.channelCount,
          },
        });
      }

      if (stream) {
        this.currentConfigDevice.stream = stream;

        if (this.currentConfigDevice.type === 'microphone') {
          const audioTrack = stream.getAudioTracks()[0];
          if (audioTrack) {
            this.currentConfigDevice.settings = audioTrack.getSettings() as DeviceSettings;
          } else {
            this.currentConfigDevice.settings = originalSettings;
          }
        } else {
          const videoTrack = stream.getVideoTracks()[0];
          if (videoTrack) {
            this.currentConfigDevice.settings = videoTrack.getSettings() as DeviceSettings;
          } else {
            this.currentConfigDevice.settings = originalSettings;
          }

          if (originalCapabilities) {
            this.currentConfigDevice.capabilities = originalCapabilities;
          }
        }
        this.currentConfigDevice.formatSetting = this.getFormatSettings(this.currentConfigDevice);
      } else {
        // 如果未获取到新流，回退 settings
        this.currentConfigDevice.settings = originalSettings;
        throw new Error('获取设备流失败，配置未保存');
      }

      // 更新 userDevices 数组中对应设备，使用 splice 确保 Vue 检测到变化
      const idx = this.userDevices.findIndex((d) => d.id === this.currentConfigDevice.id);
      if (idx !== -1) {
        // 获取当前设备的引用
        const targetDevice = this.userDevices[idx];

        // 更新所有属性
        targetDevice.stream = this.currentConfigDevice.stream;
        targetDevice.settings = this.currentConfigDevice.settings;
        targetDevice.capabilities = this.currentConfigDevice.capabilities;
        targetDevice.formatSetting = this.getFormatSettings(this.currentConfigDevice);

        // 使用 splice 触发数组的响应式更新
        this.userDevices.splice(idx, 1, targetDevice);

        return { updateIndex: idx, updateDevice: targetDevice };
      }
    } catch (error) {
      throw new Error(`更新设备配置失败: ${(error as Error).message}`);
    }
  };

  getFormatSettings = (device: Device): string => {
    if (!device.settings) return '未获取当前设备参数';

    const s = device.settings;
    if (device.type === 'microphone') {
      return `${s.sampleRate || 'N/A'} Hz @ ${s.channelCount || 'N/A'}`;
    }

    const fps = s.frameRate ? s.frameRate.toFixed(1) : 'N/A';
    return `${s.width || 'N/A'}x${s.height || 'N/A'} @ ${fps} fps`;
  };

  setScreenMaxFrameRate = (fps: number) => {};

  /**
   * 从配置文件加载设备
   */
  async loadDevicesFromConfig(devicesConfig: any): Promise<Device[]> {
    const loadedDevices: Device[] = [];

    try {
      // 加载屏幕设备
      if (devicesConfig.screens && devicesConfig.screens.length > 0) {
        for (const screenConfig of devicesConfig.screens) {
          const screen = this.availableScreens.find((s) => s.id === screenConfig.id);
          if (screen) {
            const device: Device = {
              id: screen.id,
              name: screen.name,
              type: 'screen',
              classId: this.getOrCreateClassId(screen.id, 'screen'),
              enabled: true,
              isDefault: false,
            };
            await this.startDeviceStream(device);
            this.userDevices.push(device);
            loadedDevices.push(device);
          }
        }
      }

      // 加载摄像头设备
      if (devicesConfig.cameras && devicesConfig.cameras.length > 0) {
        for (const cameraConfig of devicesConfig.cameras) {
          const camera = this.availableCameras.find((c) => c.deviceId === cameraConfig.id);
          if (camera) {
            const device: Device = {
              id: camera.deviceId,
              name: camera.label,
              type: 'camera',
              classId: this.getOrCreateClassId(camera.deviceId, 'camera'),
              enabled: true,
              isDefault: false,
            };
            await this.startDeviceStream(device);
            this.userDevices.push(device);
            loadedDevices.push(device);
          }
        }
      }

      // 加载麦克风设备
      if (devicesConfig.microphones && devicesConfig.microphones.length > 0) {
        for (const micConfig of devicesConfig.microphones) {
          const mic = this.availableMicrophones.find((m) => m.deviceId === micConfig.id);
          if (mic) {
            const device: Device = {
              id: mic.deviceId,
              name: mic.label,
              type: 'microphone',
              classId: this.getOrCreateClassId(mic.deviceId, 'microphone'),
              enabled: true,
              isDefault: false,
            };
            await this.startDeviceStream(device);
            this.userDevices.push(device);
            loadedDevices.push(device);
          }
        }
      }

      return loadedDevices;
    } catch (error) {
      console.error('从配置加载设备失败:', error);
      throw new Error('从配置加载设备失败');
    }
  }

  /**
   * 保存所有设备到配置文件
   */
  async saveAllDevicesToConfig(): Promise<void> {
    try {
      const screens = this.userDevices
        .filter((d) => d.type === 'screen' && d.settings)
        .map((d) => {
          if (!d.settings!.width) throw new Error(`屏幕设备 ${d.name} 缺少 width 属性`);
          if (!d.settings!.height) throw new Error(`屏幕设备 ${d.name} 缺少 height 属性`);
          if (!d.settings!.frameRate) throw new Error(`屏幕设备 ${d.name} 缺少 frameRate 属性`);

          console.log('Saving screen device:', d.name, d.settings.sampleRate);

          return {
            id: d.id,
            name: d.name,
            width: Math.round(d.settings!.width),
            height: Math.round(d.settings!.height),
            frameRate: Math.round(d.settings!.frameRate),
          };
        });

      const cameras = this.userDevices
        .filter((d) => d.type === 'camera' && d.settings)
        .map((d) => {
          if (!d.settings!.width) throw new Error(`摄像头设备 ${d.name} 缺少 width 属性`);
          if (!d.settings!.height) throw new Error(`摄像头设备 ${d.name} 缺少 height 属性`);
          if (!d.settings!.frameRate) throw new Error(`摄像头设备 ${d.name} 缺少 frameRate 属性`);

          return {
            id: d.id,
            name: d.name,
            width: Math.round(d.settings!.width),
            height: Math.round(d.settings!.height),
            frameRate: Math.round(d.settings!.frameRate),
          };
        });

      const microphones = this.userDevices
        .filter((d) => d.type === 'microphone' && d.settings)
        .map((d) => {
          if (!d.settings!.sampleRate) throw new Error(`麦克风设备 ${d.name} 缺少 sampleRate 属性`);
          if (!d.settings!.channelCount)
            throw new Error(`麦克风设备 ${d.name} 缺少 channelCount 属性`);

          return {
            id: d.id,
            name: d.name,
            sampleRate: d.settings!.sampleRate,
            channelCount: d.settings!.channelCount,
          };
        });

      if (screens.length > 0) {
        await window.electron.updateVideoConfig(screens, 'screen');
      } else {
        // 如果没有屏幕设备，更新为空数组以清空配置
        await window.electron.updateVideoConfig([], 'screen');
      }

      if (cameras.length > 0) {
        await window.electron.updateVideoConfig(cameras, 'camera');
      } else {
        // 如果没有摄像头设备，更新为空数组以清空配置
        await window.electron.updateVideoConfig([], 'camera');
      }

      if (microphones.length > 0) {
        await window.electron.updateAudioConfig(microphones);
      } else {
        // 如果没有麦克风设备，更新为空数组以清空配置
        await window.electron.updateAudioConfig([]);
      }
    } catch (error) {
      console.error('保存设备配置失败:', error);
      throw new Error('保存设备配置失败');
    }
  }
}
