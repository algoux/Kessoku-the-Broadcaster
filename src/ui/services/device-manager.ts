import {
  DeviceType,
  Device,
  CanAddState,
  DeviceCapabilities,
  ConfigForm,
  DeviceSettings,
  ClassIdPattern,
} from '@/typings/data';
import { SimulcastConfig } from 'common/config.interface';

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

  /**
   * 添加设备
   * @param type 设备类型
   * @param deviceId 可选，指定设备的原始 ID（device.id），不指定则自动选择第一个未使用的设备
   * @param classId 可选，自定义设备 classId（格式：`${type}_${string}`），不指定则自动生成
   */
  async addDevice<T extends DeviceType>(
    type: T,
    deviceId?: string,
    classId?: ClassIdPattern<T>,
  ): Promise<DeviceAddingRes> {
    try {
      let deviceInfo: any;
      let finalDeviceId: string;

      // 如果指定了 deviceId，使用指定的设备源
      if (deviceId) {
        if (type === 'screen') {
          deviceInfo = this.availableScreens.find((s) => s.id === deviceId);
          if (
            !deviceInfo ||
            this.userDevices.some((d) => d.id === deviceId && d.type === 'screen')
          ) {
            throw new Error('设备源不可用');
          }
          finalDeviceId = deviceId;
        } else if (type === 'camera') {
          deviceInfo = this.availableCameras.find((c) => c.deviceId === deviceId);
          if (
            !deviceInfo ||
            this.userDevices.some((d) => d.id === deviceId && d.type === 'camera')
          ) {
            throw new Error('设备源不可用');
          }
          finalDeviceId = deviceInfo.deviceId;
        } else if (type === 'microphone') {
          deviceInfo = this.availableMicrophones.find((m) => m.deviceId === deviceId);
          if (
            !deviceInfo ||
            this.userDevices.some((d) => d.id === deviceId && d.type === 'microphone')
          ) {
            throw new Error('设备源不可用');
          }
          finalDeviceId = deviceInfo.deviceId;
        }
      } else {
        // 自动选择第一个未使用的设备
        if (!this.canAddState[type]) {
          return {
            success: true,
            code: 0,
          };
        }

        if (type === 'screen') {
          deviceInfo = this.availableScreens.find(
            (screen) => !this.userDevices.some((d) => d.id === screen.id && d.type === 'screen'),
          );
        } else if (type === 'camera') {
          deviceInfo = this.availableCameras.find(
            (camera) =>
              !this.userDevices.some((d) => d.id === camera.deviceId && d.type === 'camera'),
          );
        } else if (type === 'microphone') {
          deviceInfo = this.availableMicrophones.find(
            (mic) =>
              !this.userDevices.some((d) => d.id === mic.deviceId && d.type === 'microphone'),
          );
        }

        if (!deviceInfo) {
          return {
            success: true,
            code: 0,
          };
        }

        finalDeviceId = type === 'screen' ? deviceInfo.id : deviceInfo.deviceId;
      }

      const device: Device<T> = {
        id: finalDeviceId,
        name: deviceInfo.label || deviceInfo.name,
        type: type,
        classId: (classId || this.getOrCreateClassId(finalDeviceId, type)) as ClassIdPattern<T>,
        enabled: true,
        isDefault: false,
      };

      // 如果使用了自定义 classId，保存映射
      if (classId) {
        this.deviceIdToClassIdMap.set(finalDeviceId, classId as any);
      }

      await this.startDeviceStream(device);
      this.userDevices.push(device);
      this.updateCanAddState();

      return {
        success: true,
        code: 1,
        device: device,
      };
    } catch (error) {
      throw new Error(`添加设备失败: ${(error as Error).message}`);
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
      const hasPresetSettings = !!device.settings;

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
        const videoConstraints: any = {
          deviceId: { exact: device.id },
        };

        // 如果有预设配置，应用它们
        if (hasPresetSettings) {
          if (device.settings.width) {
            videoConstraints.width = { ideal: device.settings.width };
          }
          if (device.settings.height) {
            videoConstraints.height = { ideal: device.settings.height };
          }
          if (device.settings.frameRate) {
            videoConstraints.frameRate = {
              ideal: device.settings.frameRate,
              max: device.settings.frameRate,
            };
          }
        } else {
          videoConstraints.frameRate = { ideal: 60, max: 60 };
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: videoConstraints,
        });
      } else if (device.type == 'microphone') {
        const audioConstraints: any = {
          deviceId: device.id,
        };

        // 如果有预设配置，应用它们
        if (hasPresetSettings) {
          if (device.settings.sampleRate) {
            audioConstraints.sampleRate = { ideal: device.settings.sampleRate };
          }
          if (device.settings.channelCount) {
            audioConstraints.channelCount = { ideal: device.settings.channelCount };
          }
        }

        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints,
        });
      }

      if (stream) {
        device.stream = stream;

        if (device.type === 'microphone') {
          const audioTrack = stream.getAudioTracks()[0];
          const capabilities = audioTrack.getCapabilities() as DeviceCapabilities;
          const rawSettings = audioTrack.getSettings();

          if (!device.capabilities) device.capabilities = capabilities;

          // 如果没有预设配置，使用实际获取的设置
          if (!hasPresetSettings) {
            device.settings = {
              sampleRate: rawSettings.sampleRate,
              channelCount: rawSettings.channelCount,
            };
          }
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

          // 如果没有预设配置，使用默认设置
          if (!hasPresetSettings) {
            device.settings = {
              width: capabilities.width.max,
              height: capabilities.height.max,
              frameRate:
                device.type == 'screen' ? this.idealScreenFrameRate : rawSettings.frameRate,
              aspectRatio: rawSettings.aspectRatio,
              facingMode: rawSettings.facingMode,
              maxFrameRate:
                device.type == 'screen'
                  ? this.screenAvailableMaxFrameRate
                  : capabilities.frameRate.max,
            };
          } else {
            // 补充预设配置中缺失的字段
            device.settings = {
              ...device.settings,
              aspectRatio: device.settings.aspectRatio || rawSettings.aspectRatio,
              facingMode: device.settings.facingMode || rawSettings.facingMode,
              maxFrameRate:
                device.settings.maxFrameRate ||
                (device.type == 'screen'
                  ? this.screenAvailableMaxFrameRate
                  : capabilities.frameRate.max),
            };
          }
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

  async resetDeviceStreaming() {
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

  async getEnableStreams(classIds: string[] = []) {
    try {
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

      const enabledStreams: Array<{ stream: MediaStream; simulcastConfigs?: SimulcastConfig[] }> =
        [];
      for (const device of devicesToStream) {
        if (device.stream) {
          enabledStreams.push({
            stream: device.stream,
            simulcastConfigs:
              device.type !== 'microphone' ? device.settings?.simulcastConfigs : undefined,
          });
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
    
    // 根据设备类型初始化配置表单
    if (device.type === 'microphone') {
      this.configForm = {
        channelCount: device.settings?.channelCount || 0,
        sampleRate: device.settings?.sampleRate || 0,
      } as ConfigForm;
    } else {
      // 视频设备（screen 或 camera）
      this.configForm = {
        width: Math.round(device.settings?.width || 0),
        height: Math.round(device.settings?.height || 0),
        frameRate: Math.round(device.settings?.frameRate || 0),
        simulcastConfig: {
          rid: 'original',
          scaleResolutionDownBy: 1,
          maxBitRate: 8000000,
          maxFramerate: 60,
        },
      } as ConfigForm;

      // 根据当前设备分辨率匹配预设
      const currentWidth = Math.round(device.settings?.width || 0);
      const currentHeight = Math.round(device.settings?.height || 0);
      const presets = this.getResolutionPresets();
      const matchedPreset = presets.find(
        (p) => p.width === currentWidth && p.height === currentHeight,
      );

      this.selectedPreset = matchedPreset
        ? JSON.stringify({ width: matchedPreset.width, height: matchedPreset.height })
        : '';
    }

    return {
      success: true,
      message: '配置对话框已打开',
    };
  }

  /**
   * 生成分辨率预设列表
   * 基于当前设备的最大分辨率和常用高度列表计算
   */
  getResolutionPresets(): Array<{ width: number; height: number; label: string }> {
    if (!this.currentConfigDevice?.capabilities?.width) {
      return [];
    }

    const maxWidth = Math.round(this.currentConfigDevice.capabilities.width.max);
    const maxHeight = Math.round(this.currentConfigDevice.capabilities.height.max);

    // 常用高度列表（从大到小排序，大多数显示器都是 16:9）
    const commonHeights = [2160, 1800, 1440, 1200, 1080, 900, 768, 720];

    const presets: Array<{ width: number; height: number; label: string }> = [];
    const presetSet = new Set<string>(); // 用于去重

    // 添加当前渲染分辨率（最大分辨率）
    const maxKey = `${maxWidth}x${maxHeight}`;
    presets.push({
      width: maxWidth,
      height: maxHeight,
      label: `${maxWidth} × ${maxHeight} (最高分辨率)`,
    });
    presetSet.add(maxKey);

    // 遍历常用高度列表，计算对应的宽度
    for (const targetHeight of commonHeights) {
      if (targetHeight >= maxHeight) continue; // 跳过大于等于最大高度的

      // 计算缩放比例
      const scale = maxHeight / targetHeight;

      // 计算对应的宽度
      const calculatedWidth = maxWidth / scale;

      // 如果宽度是整数，则添加到预设列表
      if (Number.isInteger(calculatedWidth)) {
        const width = Math.round(calculatedWidth);
        const key = `${width}x${targetHeight}`;

        if (!presetSet.has(key)) {
          let label = `${width} × ${targetHeight}`;

          // 添加常见分辨率的标签
          if (width === 1920 && targetHeight === 1080) {
            label += ' (Full HD)';
          } else if (width === 1280 && targetHeight === 720) {
            label += ' (HD)';
          } else if (width === 3840 && targetHeight === 2160) {
            label += ' (4K)';
          } else if (width === 2560 && targetHeight === 1440) {
            label += ' (2K)';
          }

          presets.push({ width, height: targetHeight, label });
          presetSet.add(key);
        }
      }
    }

    // 按高度从大到小排序
    presets.sort((a, b) => b.height - a.height);

    return presets;
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
          
          // 恢复 capabilities
          if (originalCapabilities) {
            this.currentConfigDevice.capabilities = originalCapabilities;
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
        const targetDevice = this.userDevices[idx];

        // 更新所有属性
        targetDevice.stream = this.currentConfigDevice.stream;
        targetDevice.settings = this.currentConfigDevice.settings;
        targetDevice.capabilities = this.currentConfigDevice.capabilities;
        targetDevice.formatSetting = this.getFormatSettings(this.currentConfigDevice);

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
            // 如果配置中有 classId，使用配置中的 classId，否则生成新的
            const classId = screenConfig.classId || this.getOrCreateClassId(screen.id, 'screen');
            // 建立 deviceId 到 classId 的映射
            if (screenConfig.classId) {
              this.deviceIdToClassIdMap.set(screen.id, screenConfig.classId);
            }

            const device: Device = {
              id: screen.id,
              name: screen.name,
              type: 'screen',
              classId: classId,
              enabled: true,
              isDefault: false,
              settings: {
                width: screenConfig.width,
                height: screenConfig.height,
                frameRate: screenConfig.frameRate,
              },
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
            // 如果配置中有 classId，使用配置中的 classId，否则生成新的
            const classId =
              cameraConfig.classId || this.getOrCreateClassId(camera.deviceId, 'camera');
            // 建立 deviceId 到 classId 的映射
            if (cameraConfig.classId) {
              this.deviceIdToClassIdMap.set(camera.deviceId, cameraConfig.classId);
            }

            const device: Device = {
              id: camera.deviceId,
              name: camera.label,
              type: 'camera',
              classId: classId,
              enabled: true,
              isDefault: false,
              settings: {
                width: cameraConfig.width,
                height: cameraConfig.height,
                frameRate: cameraConfig.frameRate,
              },
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
            // 如果配置中有 classId，使用配置中的 classId，否则生成新的
            const classId =
              micConfig.classId || this.getOrCreateClassId(mic.deviceId, 'microphone');
            // 建立 deviceId 到 classId 的映射
            if (micConfig.classId) {
              this.deviceIdToClassIdMap.set(mic.deviceId, micConfig.classId);
            }

            const device: Device = {
              id: mic.deviceId,
              name: mic.label,
              type: 'microphone',
              classId: classId,
              enabled: true,
              isDefault: false,
              settings: {
                sampleRate: micConfig.sampleRate,
                channelCount: micConfig.channelCount,
              },
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
            classId: d.classId,
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
            classId: d.classId,
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
            classId: d.classId,
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
