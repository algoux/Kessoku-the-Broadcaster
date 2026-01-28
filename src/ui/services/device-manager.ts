import {
  DeviceType,
  Device,
  CanAddState,
  DeviceCapabilities,
  DeviceSettings,
  DeviceSourceInfo,
  ClassIdPattern,
  DeviceAddingRes,
  ConfigSaveRes,
  DEVICE_TYPE_CONFIG,
  DeviceInfo,
} from '@/typings/data';
import { SimulcastConfig } from 'common/config.interface';
import { toRaw } from 'vue';

export class DeviceManager {
  userDevices: Device[] = [];
  selectedPreset: string = '';
  deviceIdToClassIdMap: Map<string, string> = new Map();
  microphoneGroupMap: Map<string, MediaDeviceInfo[]> = new Map();
  currentConfigDevice: Device;
  availableScreens: Array<{ id: string; name: string }> = [];
  availableCameras: Array<MediaDeviceInfo> = [];
  availableMicrophones: Array<MediaDeviceInfo> = [];
  canAddState: CanAddState = {
    screen: 0,
    camera: 0,
    microphone: 0,
  };
  configForm: DeviceSettings;
  screenAvailableMaxFrameRate: number;

  set setScreenAvailableMaxFrameRate(fps: number) {
    this.screenAvailableMaxFrameRate = fps;
  }

  isVideoDevice(device: Device): boolean {
    return device.type === 'screen' || device.type === 'camera';
  }

  getVideoDevices(): Device[] {
    return this.userDevices.filter((d) => this.isVideoDevice(d));
  }

  /**
   * 获取设备信息
   * @description 返回设备信息用于上报，对于 settings 将 Proxy 序列化
   * @returns {DeviceInfo[]} 设备信息列表
   */
  getDevicesInfo(): DeviceInfo[] {
    return this.userDevices.map((device) => ({
      classId: device.classId,
      type: device.type,
      name: device.name,
      settings: device.settings ? toRaw(device.settings) : undefined,
    }));
  }

  /**
   * 合并同一物理麦克风的多个通道
   * @description 通过 groupId 识别同一个物理设备
   * @returns {MediaDeviceInfo[]} 合并后的麦克风设备列表
   */
  private mergeMicrophoneChannels(audioDevices: MediaDeviceInfo[]): MediaDeviceInfo[] {
    const deviceMap = new Map<string, MediaDeviceInfo>();
    this.microphoneGroupMap.clear();

    audioDevices.forEach((device) => {
      const groupId = device.groupId;

      // 保存所有设备到 groupMap（包括同一 groupId 的多个设备）
      if (!this.microphoneGroupMap.has(groupId)) {
        this.microphoneGroupMap.set(groupId, []);
      }
      this.microphoneGroupMap.get(groupId)!.push(device);

      // 如果已经有同一 groupId 的设备，跳过（保留第一个用于显示）
      if (!deviceMap.has(groupId)) {
        deviceMap.set(groupId, device);
      }
    });

    return Array.from(deviceMap.values());
  }

  /**
   * 刷新设备列表
   * @async
   * @description 获取最新的可用设备列表，并加载已有配置
   * @returns {Promise<Device[] | void>} 刷新后的设备列表
   */
  async refreshAllDevices(): Promise<Device[] | void> {
    try {
      const sources = await window.electron.getSources();
      this.availableScreens = sources.map((s: any) => ({ id: s.id, name: s.name }));

      await navigator.mediaDevices
        .getUserMedia({ video: true, audio: true })
        .then((s) => s.getTracks().forEach((t) => t.stop()))
        .catch(() => {});

      const devices = await navigator.mediaDevices.enumerateDevices();

      this.availableCameras = devices.filter((d) => d.kind === 'videoinput');
      const audioInputDevices = devices.filter((d) => d.kind === 'audioinput');
      this.availableMicrophones = this.mergeMicrophoneChannels(audioInputDevices);
      console.log('可用麦克风设备列表:', this.availableMicrophones);

      // 检查是否已有配置
      const hasConfig = await window.electron.hasDevicesConfig();

      if (hasConfig) {
        const devicesConfig = await window.electron.getDevicesConfig();
        const loadedDevices = await this.loadDevicesFromConfig(devicesConfig);
        this.updateCanAddState();
        return loadedDevices;
      }

      if (this.userDevices.length === 0) {
        const defaultDevices = await this.addDefaultDevices();
        this.updateCanAddState();
        return defaultDevices;
      }

      this.updateCanAddState();
    } catch (error) {
      console.error(error);
      throw new Error('刷新设备失败');
    }
  }

  /**
   * 添加默认设备
   * @async
   * @description 添加第一个屏幕、摄像头和麦克风作为默认设备
   * @returns {Promise<Device[]>} 添加的默认设备列表
   */
  async addDefaultDevices(): Promise<Device[]> {
    const defaultDevicesList: Device[] = [];
    const deviceTypesToAdd: Array<{ type: DeviceType; info: DeviceSourceInfo }> = [];

    // 收集所有要添加的默认设备
    if (this.availableScreens.length > 0) {
      deviceTypesToAdd.push({ type: 'screen', info: this.availableScreens[0] });
    }
    if (this.availableCameras.length > 0) {
      deviceTypesToAdd.push({ type: 'camera', info: this.availableCameras[0] });
    }
    if (this.availableMicrophones.length > 0) {
      deviceTypesToAdd.push({ type: 'microphone', info: this.availableMicrophones[0] });
    }

    // 批量添加设备
    for (const { type, info } of deviceTypesToAdd) {
      const device = await this.createAndStartDevice(type, info, true);
      defaultDevicesList.push(device);
      this.userDevices.push(device);

      // 保存到配置文件
      try {
        await this.saveSingleDeviceToConfig(device);
      } catch (saveError) {
        console.error('保存默认设备配置失败:', saveError);
      }
    }

    return defaultDevicesList;
  }

  /**
   * 创建并启动设备流
   * @private
   * @async
   * @param type 设备类型
   * @param deviceInfo 设备信息
   * @param isDefault 是否为默认设备
   * @param classId 自定义分类 ID
   * @description 如果该设备有 classId，那么使用该 classId，否则根据设备 deviceId 生成唯一的 classId
   * @returns {Promise<Device>} 创建并启动的设备对象
   */
  private async createAndStartDevice(
    type: DeviceType,
    deviceInfo: DeviceSourceInfo,
    isDefault: boolean = false,
    classId?: string,
  ): Promise<Device> {
    const config = DEVICE_TYPE_CONFIG[type];
    const deviceId = config.getDeviceId(deviceInfo);
    const deviceName = config.getDeviceName(deviceInfo);

    const device: Device = {
      id: deviceId,
      name: deviceName,
      type: type,
      classId: (classId || this.getOrCreateClassId(deviceId, type, isDefault)) as any,
      isDefault,
    };

    // 如果使用了自定义 classId，保存映射
    if (classId) {
      this.deviceIdToClassIdMap.set(deviceId, classId);
    }

    await this.startDeviceStream(device);
    return device;
  }

  /**
   * 添加设备
   * @async
   * @param type 设备类型
   * @param deviceId 设备 ID（可选）
   * @param classId 自定义分类 ID（可选）
   * @returns {Promise<DeviceAddingRes>} 添加设备的结果，用于界面显示 Message
   */
  async addDevice<T extends DeviceType>(
    type: T,
    deviceId?: string,
    classId?: ClassIdPattern<T>,
  ): Promise<DeviceAddingRes> {
    try {
      const config = DEVICE_TYPE_CONFIG[type];
      let deviceInfo: DeviceSourceInfo | undefined;

      // 如果指定了 deviceId，使用指定的设备源
      if (deviceId) {
        deviceInfo = config.findDeviceInfo(this, deviceId);
        if (!deviceInfo || this.isDeviceInUse(deviceId, type)) {
          throw new Error('设备源不可用');
        }
      } else {
        // 自动选择第一个未使用的设备
        if (!this.canAddState[type]) {
          return { success: true, code: 0 };
        }

        const availableDevices = this[config.availableDevicesKey];
        deviceInfo = availableDevices.find((info) => {
          const id = config.getDeviceId(info);
          return !this.isDeviceInUse(id, type);
        });

        if (!deviceInfo) {
          return { success: true, code: 0 };
        }
      }

      const device = await this.createAndStartDevice(type, deviceInfo, false, classId);
      this.userDevices.push(device);
      this.updateCanAddState();

      try {
        await this.saveSingleDeviceToConfig(device);
      } catch (saveError) {
        console.error('保存新设备配置失败:', saveError);
      }

      return {
        success: true,
        code: 1,
        device: device,
      };
    } catch (error) {
      throw new Error(`添加设备失败: ${(error as Error).message}`);
    }
  }

  /**
   * 检查设备是否已在使用
   * @description 根据 deviceId 和 type 检查设备是否已被添加，已经添加的设备则不可被重复添加
   * @param deviceId 设备 ID
   * @param type 设备类型
   * @returns {boolean} 设备是否已在使用
   */
  private isDeviceInUse(deviceId: string, type: DeviceType): boolean {
    return this.userDevices.some((d) => d.id === deviceId && d.type === type);
  }

  /**
   * 更新可添加设备状态
   * @description 根据当前已添加的设备数量和可用设备列表，更新 canAddState 对象
   */
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
   * @param deviceId 设备 ID
   * @param deviceType 设备类型
   * @param isDefault 是否为默认设备
   * @returns {string} 设备的分类 id
   * @description 如果设备已存在映射关系，则返回已有的 classId，否则根据规则生成新的 classId 并保存映射关系
   * 规则：
   * - 默认设备使用 `${deviceType}_main`
   * - 非默认设备使用 `${deviceType}_0`, `${deviceType}_1`, ... 依次递增的索引
   * - 如果该类型还没有 main 设备，非默认设备也使用 `${deviceType}_main`
   * - 保证同一类型的 classId 不重复
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
      let hasMainDevice = false;

      this.deviceIdToClassIdMap.forEach((existingClassId) => {
        if (existingClassId.startsWith(prefix)) {
          const suffix = existingClassId.replace(prefix, '');
          if (suffix === 'main') {
            hasMainDevice = true;
            usedIndices.add(-1);
          } else {
            const index = parseInt(suffix);
            if (!isNaN(index)) usedIndices.add(index);
          }
        }
      });

      // 如果该类型还没有 main 设备，使用 main
      if (!hasMainDevice) {
        classId = `${deviceType}_main`;
      } else {
        // 找到最小的未使用索引
        let index = 0;
        while (usedIndices.has(index)) index++;
        classId = `${deviceType}_${index}`;
      }
    }

    // 保存映射关系
    this.deviceIdToClassIdMap.set(deviceId, classId);
    return classId as any;
  }

  /**
   * 理想的屏幕帧率
   * @description 根据屏幕支持的最大帧率，决定理想的帧率为 60 或 30
   */
  get idealScreenFrameRate(): number {
    return this.screenAvailableMaxFrameRate >= 60 ? 60 : 30;
  }

  /**
   * 查找同一物理设备的所有通道
   * @description 根据 deviceId 查找同一 groupId 下的所有设备
   * @param deviceId 设备 ID
   * @returns {MediaDeviceInfo[]} 同一物理设备的所有通道设备列表
   */
  private findDevicesInSameGroup(deviceId: string): MediaDeviceInfo[] {
    // 从所有麦克风设备中找到匹配的 groupId
    for (const [groupId, devices] of this.microphoneGroupMap.entries()) {
      if (devices.some((d) => d.deviceId === deviceId)) {
        return devices;
      }
    }
    return [];
  }

  /**
   * 创建立体声流
   * @description 从两个单声道设备合并为一个立体声流
   * @param devices 设备列表（至少两个设备）
   * @returns {Promise<MediaStream>} 创建的立体声流
   */
  private async createStereoStream(devices: MediaDeviceInfo[]): Promise<MediaStream> {
    if (devices.length < 2) {
      throw new Error('需要至少两个通道才能创建立体声流');
    }

    // 获取两个单声道流
    const stream1 = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: devices[0].deviceId, channelCount: 1 },
    });
    const stream2 = await navigator.mediaDevices.getUserMedia({
      audio: { deviceId: devices[1].deviceId, channelCount: 1 },
    });

    // 使用 AudioContext 合并两个单声道为立体声
    const audioContext = new AudioContext();
    const source1 = audioContext.createMediaStreamSource(stream1);
    const source2 = audioContext.createMediaStreamSource(stream2);

    // 创建通道合并节点
    const merger = audioContext.createChannelMerger(2);
    source1.connect(merger, 0, 0); // 左声道
    source2.connect(merger, 0, 1); // 右声道

    // 创建目标节点
    const destination = audioContext.createMediaStreamDestination();
    merger.connect(destination);

    const mergedStream = destination.stream;

    // AudioContext.sampleRate 就是输出流的真实采样率
    // 保存到流对象上供后续使用
    (mergedStream as any)._audioContextSampleRate = audioContext.sampleRate;

    return mergedStream;
  }

  /**
   * 应用视频约束到 constraints 对象
   * @param constraints 约束对象
   * @param settings 设备设置
   * @param isScreen 是否为屏幕设备
   * @description 根据 settings 中的宽度、高度、帧率设置相应的约束
   */
  private applyVideoConstraints(
    constraints: MediaTrackConstraints,
    settings: MediaTrackSettings,
    isScreen: boolean = false,
  ) {
    const fields = ['width', 'height', 'frameRate'];
    fields.forEach((field) => {
      if (settings?.[field]) {
        if (isScreen) {
          constraints[`min${field.charAt(0).toUpperCase() + field.slice(1)}`] = settings[field];
          constraints[`max${field.charAt(0).toUpperCase() + field.slice(1)}`] = settings[field];
        } else {
          constraints[field] =
            field === 'frameRate'
              ? { ideal: settings[field], max: settings[field] }
              : { ideal: settings[field] };
        }
      }
    });
  }

  /**
   * 应用音频约束到 constraints 对象
   * @param constraints 约束对象
   * @param settings 设备设置
   * @param device 设备对象
   * @description 根据 settings 中的采样率和通道模式设置相应的约束
   */
  private applyAudioConstraints(constraints: any, settings: any, device: Device) {
    if (settings?.sampleRate) {
      constraints.sampleRate = { ideal: settings.sampleRate };
    }

    // 根据 channelMode 设置 channelCount
    if (device.settings?.channelMode) {
      const channelCount = device.settings.channelMode === 'stereo' ? 2 : 1;
      constraints.channelCount = { ideal: channelCount };
    } else if (settings?.channelCount) {
      constraints.channelCount = { ideal: settings.channelCount };
    }
  }

  /**
   * 启动设备流
   * @async
   * @param device 设备对象
   * @returns {Promise<Device>} 启动后的设备对象
   */
  async startDeviceStream(device: Device): Promise<Device> {
    try {
      // 对于麦克风设备，检查是否支持立体声（有多个通道可合并）
      if (device.type === 'microphone' && !device.settings?.channelMode) {
        const tempStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: device.id },
        });

        const track = tempStream.getAudioTracks()[0];
        const caps = track.getCapabilities();

        track.stop();

        if (caps.channelCount?.max >= 2) {
          device.settings.channelMode = 'stereo';
          device.settings.channelCount = 2;
        } else {
          const devicesInGroup = this.findDevicesInSameGroup(device.id);
          if (devicesInGroup.length >= 2) {
            device.settings.channelMode = 'stereo';
          }
        }
      }

      const stream = await this.getDeviceStream(device);
      device.stream = stream;

      if (device.type === 'microphone') {
        this.processAudioTrack(device);
      } else {
        this.processVideoTrack(device);
      }

      return device;
    } catch (error) {
      console.error(`启动设备 ${device.name} 失败:`, error);
      throw new Error(`启动设备 ${device.name} 失败`);
    }
  }

  /**
   * 获取设备流
   * @param device 设备对象
   * @param constraints 可选的约束对象，如果不提供则使用 device.settings
   */
  private async getDeviceStream(
    device: Device,
    constraints?: MediaTrackSettings,
  ): Promise<MediaStream> {
    const settings = constraints || device.settings;
    const hasSettings = !!settings;

    if (device.type === 'screen') {
      const mandatory: any = {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: device.id,
      };
      if (hasSettings) {
        this.applyVideoConstraints(mandatory, settings, true);
      }
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory } as any,
      });
    } else if (device.type === 'camera') {
      const videoConstraints: any = { deviceId: { exact: device.id } };
      if (hasSettings) {
        this.applyVideoConstraints(videoConstraints, settings);
      } else {
        videoConstraints.frameRate = { ideal: 60, max: 60 };
      }
      return navigator.mediaDevices.getUserMedia({
        audio: false,
        video: videoConstraints,
      });
    } else {
      // microphone
      // 检查是否需要 stereo 模式并且设备支持多通道
      if (device.settings?.channelMode === 'stereo') {
        if (settings.channelCount === 2) {
          // 原生 stereo
          return navigator.mediaDevices.getUserMedia({
            audio: {
              deviceId: device.id,
              channelCount: { ideal: 2 },
            },
          });
        }
        const devicesInGroup = this.findDevicesInSameGroup(device.id);
        if (devicesInGroup.length >= 2) {
          return this.createStereoStream(devicesInGroup);
        }
      }

      // 单声道模式或设备不支持多通道
      const audioConstraints: any = { deviceId: device.id };
      if (hasSettings) {
        this.applyAudioConstraints(audioConstraints, settings, device);
      }
      return navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
    }
  }

  private processAudioTrack(device: Device) {
    const audioTrack = device.stream!.getAudioTracks()[0];
    const capabilities = audioTrack.getCapabilities() as DeviceCapabilities;
    const rawSettings = audioTrack.getSettings();

    // 检查是否是通过 AudioContext 合并的流
    const audioContextSampleRate = (device.stream as any)._audioContextSampleRate;

    // 设置 capabilities
    if (!device.capabilities) {
      if (audioContextSampleRate) {
        // 立体声合并流：AudioContext 的采样率是固定的，不可调整
        device.capabilities = {
          ...capabilities,
          sampleRate: {
            min: audioContextSampleRate,
            max: audioContextSampleRate,
          },
          channelCount: { min: 2, max: 2 },
        } as DeviceCapabilities;
      } else {
        // 单声道原始流：使用设备真实的 capabilities，支持动态调整
        device.capabilities = capabilities;
        // 如果设备没有提供 sampleRate 范围，使用当前值作为固定值
        if (!device.capabilities.sampleRate) {
          const actualSampleRate = rawSettings.sampleRate || 48000;
          device.capabilities.sampleRate = {
            min: actualSampleRate,
            max: actualSampleRate,
          };
        }
      }
    }

    if (!device.settings) {
      // 根据实际通道数设置默认 channelMode
      const channelMode = rawSettings.channelCount === 2 ? 'stereo' : 'mono';
      // 使用真实的采样率：AudioContext 的或流本身的
      const sampleRate = audioContextSampleRate || rawSettings.sampleRate;
      device.settings = {
        sampleRate: sampleRate,
        channelCount: rawSettings.channelCount,
        channelMode: channelMode,
      };
    } else {
      // 根据 channelMode 设置 channelCount
      if (device.settings.channelMode === 'stereo') {
        device.settings.channelCount = 2;
      } else if (device.settings.channelMode === 'mono') {
        device.settings.channelCount = 1;
      }
      // 确保 sampleRate 存在
      if (!device.settings.sampleRate) {
        device.settings.sampleRate = rawSettings.sampleRate;
      }
    }
    device.formatSetting = this.getFormatSettings(device);
  }

  private processVideoTrack(device: Device) {
    const videoTrack = device.stream!.getVideoTracks()[0];
    const capabilities = videoTrack.getCapabilities() as DeviceCapabilities;
    const rawSettings = videoTrack.getSettings();

    if (!device.capabilities) {
      device.capabilities = capabilities;
      if (device.type === 'screen') {
        device.capabilities.frameRate.max = this.screenAvailableMaxFrameRate;
      }
    }

    const maxFrameRate =
      device.type === 'screen' ? this.screenAvailableMaxFrameRate : capabilities.frameRate.max;

    if (!device.settings) {
      const width = capabilities.width.max;
      const height = capabilities.height.max;
      const frameRate =
        device.type === 'screen' ? this.idealScreenFrameRate : rawSettings.frameRate;

      // 创建默认的 simulcastConfigs（原画在前，低清在后）
      const simulcastConfigs: SimulcastConfig[] = [
        {
          rid: 'original',
          scaleResolutionDownBy: 1,
          maxBitRate: Math.round(width * height * frameRate * 0.000078125) * 1000,
        },
        {
          rid: 'low',
          scaleResolutionDownBy: 4,
          maxBitRate: Math.round((width / 4) * (height / 4) * frameRate * 0.000078125) * 1000,
        },
      ];

      device.settings = {
        width,
        height,
        frameRate,
        aspectRatio: rawSettings.aspectRatio,
        facingMode: rawSettings.facingMode,
        simulcastConfigs: simulcastConfigs,
      };
    } else {
      // 补充预设配置中缺失的字段
      device.settings = {
        ...device.settings,
        aspectRatio: device.settings.aspectRatio || rawSettings.aspectRatio,
        facingMode: device.settings.facingMode || rawSettings.facingMode,
      };

      // 如果 simulcastConfigs 不存在或为空，创建默认配置
      if (!device.settings.simulcastConfigs || device.settings.simulcastConfigs.length === 0) {
        const width = device.settings.width;
        const height = device.settings.height;
        const frameRate = device.settings.frameRate;

        device.settings.simulcastConfigs = [
          {
            rid: 'original',
            scaleResolutionDownBy: 1,
            maxBitRate: Math.round(width * height * frameRate * 0.000078125) * 1000,
          },
          {
            rid: 'low',
            scaleResolutionDownBy: 4,
            maxBitRate: Math.round((width / 4) * (height / 4) * frameRate * 0.000078125) * 1000,
          },
        ];
      }
    }
    device.formatSetting = this.getFormatSettings(device);
  }

  /**
   * 获取设备流
   */
  async getEnableStreams(classIds: string[] = []) {
    try {
      let devicesToStream = this.userDevices;

      if (classIds && classIds.length > 0) {
        devicesToStream = devicesToStream.filter((device) => classIds.includes(device.classId));
      }

      const enabledStreams: Array<{
        stream: MediaStream;
        classId: string;
        simulcastConfigs?: SimulcastConfig[];
      }> = devicesToStream
        .filter((device) => device.stream)
        .map((device) => {
          let simulcastConfigs: SimulcastConfig[] | undefined;

          // 对于视频设备，添加 simulcastConfigs 并动态注入 maxFramerate
          if (device.type !== 'microphone' && device.settings?.simulcastConfigs) {
            const frameRate = device.settings.frameRate || 30;
            simulcastConfigs = device.settings.simulcastConfigs.map((cfg) => ({
              rid: cfg.rid,
              scaleResolutionDownBy: cfg.scaleResolutionDownBy,
              maxBitRate: cfg.maxBitRate,
              maxFramerate: frameRate,
            }));
          }

          return {
            stream: device.stream!,
            classId: device.classId,
            simulcastConfigs,
          };
        });

      // this.isStreaming = true;
      return enabledStreams;
    } catch (error) {
      console.error('推流失败:', error);
      throw new Error('推流失败');
    }
  }

  async removeDevice(device: Device) {
    const index = this.userDevices.indexOf(device);
    if (index > -1) {
      this.stopDeviceStream(device);
      this.userDevices.splice(index, 1);
      this.updateCanAddState();
      await this.saveAllDevicesToConfig();
    } else {
      throw new Error('设备未找到，无法移除');
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

  /**
   * 打开配置对话框
   */
  openConfigDialog(device: Device) {
    this.currentConfigDevice = device;

    if (device.type === 'microphone') {
      this.configForm = {
        channelCount: device.settings?.channelCount || 1,
        channelMode: device.settings?.channelMode || 'mono',
        sampleRate: device.settings?.sampleRate || 0,
      };
    } else {
      const width = Math.round(device.settings?.width || 0);
      const height = Math.round(device.settings?.height || 0);
      const frameRate = Math.round(device.settings?.frameRate || 0);

      // 如果设备已有 simulcastConfigs，使用它；否则创建默认配置
      let simulcastConfigs: SimulcastConfig[];
      if (device.settings?.simulcastConfigs && device.settings.simulcastConfigs.length > 0) {
        simulcastConfigs = [...device.settings.simulcastConfigs];
      } else {
        simulcastConfigs = this.calculateSimulcastConfigs(width, height, frameRate);
      }

      this.configForm = {
        width,
        height,
        frameRate,
        simulcastConfigs,
      };

      // 计算并更新所有通道的码率
      this.updateSimulcastBitrates();

      // 匹配当前分辨率的预设
      const presets = this.getResolutionPresets();
      const matchedPreset = presets.find((p) => p.width === width && p.height === height);

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
   * 更新 simulcast 配置的码率
   * 根据当前分辨率和帧率动态计算每个通道的码率
   */
  updateSimulcastBitrates() {
    if (!this.configForm || this.currentConfigDevice?.type === 'microphone') return;

    const configForm = this.configForm as any;
    const { width, height, frameRate } = configForm;
    const simulcastConfigs = configForm.simulcastConfigs || [];

    simulcastConfigs.forEach((config: SimulcastConfig) => {
      const scale = config.scaleResolutionDownBy || 1;
      const scaledWidth = width / scale;
      const scaledHeight = height / scale;
      // width * height * frameRate * 0.000078125 (Kbps)
      config.maxBitRate = Math.round(scaledWidth * scaledHeight * frameRate * 0.000078125) * 1000;
    });
  }

  /**
   * 选择 simulcast 通道（将选中的移到第一位）
   */
  selectSimulcastChannel(rid: string) {
    if (!this.configForm || this.currentConfigDevice?.type === 'microphone') return;

    const configForm = this.configForm as any;
    const simulcastConfigs = configForm.simulcastConfigs || [];

    const selectedIndex = simulcastConfigs.findIndex((cfg: SimulcastConfig) => cfg.rid === rid);
    if (selectedIndex === -1 || selectedIndex === 0) return;

    const selectedConfig = simulcastConfigs.splice(selectedIndex, 1)[0];
    simulcastConfigs.unshift(selectedConfig);
  }

  /**
   * 获取当前选中的 simulcast 通道
   */
  getSelectedSimulcastChannel(): SimulcastConfig | null {
    if (!this.configForm || this.currentConfigDevice?.type === 'microphone') return null;

    const configForm = this.configForm as any;
    const simulcastConfigs = configForm.simulcastConfigs || [];
    return simulcastConfigs[0] || null;
  }

  /**
   * 生成分辨率预设列表
   */
  getResolutionPresets(): Array<{ width: number; height: number; label: string }> {
    if (!this.currentConfigDevice?.capabilities?.width) {
      return [];
    }

    const maxWidth = Math.round(this.currentConfigDevice.capabilities.width.max);
    const maxHeight = Math.round(this.currentConfigDevice.capabilities.height.max);
    const commonHeights = [2160, 1800, 1440, 1200, 1080, 900, 768, 720];

    const presets: Array<{ width: number; height: number; label: string }> = [];
    const presetSet = new Set<string>();

    // 添加最大分辨率
    const maxKey = `${maxWidth}x${maxHeight}`;
    presets.push({
      width: maxWidth,
      height: maxHeight,
      label: `${maxWidth} × ${maxHeight} (最高分辨率)`,
    });
    presetSet.add(maxKey);

    // 计算常用分辨率
    for (const targetHeight of commonHeights) {
      if (targetHeight >= maxHeight) continue;

      const scale = maxHeight / targetHeight;
      const calculatedWidth = maxWidth / scale;
      const width = Math.round(calculatedWidth);
      const adjustedWidth = width % 2 === 0 ? width : width - 1;
      const key = `${adjustedWidth}x${targetHeight}`;

      if (!presetSet.has(key) && adjustedWidth > 0) {
        let label = `${adjustedWidth} × ${targetHeight}`;

        // 添加标签
        const labelMap: Record<string, string> = {
          '1920x1080': ' (Full HD)',
          '1280x720': ' (HD)',
          '3840x2160': ' (4K)',
          '2560x1440': ' (2K)',
        };
        label += labelMap[key] || '';

        presets.push({ width: adjustedWidth, height: targetHeight, label });
        presetSet.add(key);
      }
    }

    return presets.sort((a, b) => b.height - a.height);
  }

  /**
   * 应用预设
   */
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

  /**
   * 保存设备配置
   */
  saveDeviceConfig = async (): Promise<ConfigSaveRes> => {
    const deviceName = this.currentConfigDevice.name;

    // 验证配置参数
    if (this.currentConfigDevice.type === 'microphone') {
      if (!this.configForm.sampleRate || !this.configForm.channelMode) {
        throw new Error('请填写完整的配置参数');
      }
    } else {
      if (!this.configForm.width || !this.configForm.height || !this.configForm.frameRate) {
        throw new Error('请填写完整的配置参数');
      }
    }

    try {
      // 对于麦克风，在获取新流之前先更新 channelMode，这样 getDeviceStream 才能正确判断使用哪种模式
      if (this.currentConfigDevice.type === 'microphone' && this.configForm.channelMode) {
        if (!this.currentConfigDevice.settings) {
          this.currentConfigDevice.settings = {} as any;
        }
        console.log(this.configForm.channelMode);
        this.currentConfigDevice.settings.channelMode = this.configForm.channelMode;
      }

      console.log('Applying constraints:', this.configForm);

      await this.currentConfigDevice.stream.getTracks()[0].applyConstraints(this.configForm);

      // applyConstraints 后，主动刷新 settings/capabilities/formatSetting
      let track;
      if (this.currentConfigDevice.type === 'microphone') {
        track = this.currentConfigDevice.stream.getAudioTracks()[0];
      } else {
        track = this.currentConfigDevice.stream.getVideoTracks()[0];
      }
      if (track) {
        // 更新 settings
        this.currentConfigDevice.settings = {
          ...this.currentConfigDevice.settings,
          ...track.getSettings(),
        };
        // 更新 capabilities
        this.currentConfigDevice.capabilities = track.getCapabilities() as DeviceCapabilities;
        // 对于视频设备，保存 simulcastConfigs
        if (this.currentConfigDevice.type !== 'microphone' && this.configForm.simulcastConfigs) {
          this.currentConfigDevice.settings.simulcastConfigs = this.configForm.simulcastConfigs;
        }
        // 重新生成 formatSetting
        this.currentConfigDevice.formatSetting = this.getFormatSettings(this.currentConfigDevice);
      }

      // 直接修改原对象，保持响应式
      const idx = this.userDevices.findIndex((d) => d.id === this.currentConfigDevice.id);
      if (idx !== -1) {
        const target = this.userDevices[idx];
        Object.assign(target, this.currentConfigDevice);
        // 保存到配置文件，确保写入最新 settings
        try {
          await this.saveSingleDeviceToConfig(target);
        } catch (saveError) {
          console.error('保存设备配置到文件失败:', saveError);
        }
        return { updateIndex: idx, updateDevice: target };
      }
    } catch (error) {
      // 清理 currentConfigDevice，避免影响其他操作
      const errorMessage = `更新设备 ${deviceName} 配置失败: ${(error as Error).message}`;
      console.error(errorMessage, error);
      // 注意：不清理 currentConfigDevice，让用户可以重试或关闭对话框
      throw new Error(errorMessage);
    }
  };

  /**
   * 获取格式化的设置信息
   */
  getFormatSettings = (device: Device): string => {
    if (!device.settings) return '未获取当前设备参数';

    const s = device.settings;
    console.log('Generating format settings for', device.name, s);
    if (device.type === 'microphone') {
      return `${s.sampleRate || 'N/A'} Hz @ ${s.channelMode || 'N/A'}`;
    }

    const fps = s.frameRate ? s.frameRate.toFixed(1) : 'N/A';
    return `${s.width || 'N/A'}x${s.height || 'N/A'} @ ${fps} fps`;
  };

  /**
   * 从配置文件加载设备
   */
  async loadDevicesFromConfig(devicesConfig: any): Promise<Device[]> {
    const loadedDevices: Device[] = [];

    const deviceConfigs: Array<{
      type: DeviceType;
      configs: any[];
    }> = [
      { type: 'screen', configs: devicesConfig.screens || [] },
      { type: 'camera', configs: devicesConfig.cameras || [] },
      { type: 'microphone', configs: devicesConfig.microphones || [] },
    ];

    for (const { type, configs } of deviceConfigs) {
      for (const config of configs) {
        const device = await this.loadSingleDevice(type, config);
        if (device) {
          this.userDevices.push(device);
          loadedDevices.push(device);
        }
      }
    }

    return loadedDevices;
  }

  /**
   * 加载单个设备
   */
  private async loadSingleDevice(type: DeviceType, config: any): Promise<Device | null> {
    try {
      const typeConfig = DEVICE_TYPE_CONFIG[type];
      const deviceInfo = typeConfig.findDeviceInfo(this, config.id);

      if (!deviceInfo) return null;

      // 建立 deviceId 到 classId 的映射
      if (config.classId) {
        this.deviceIdToClassIdMap.set(config.id, config.classId);
      }

      const classId = config.classId || this.getOrCreateClassId(config.id, type);
      const device: Device = {
        id: config.id,
        name: typeConfig.getDeviceName(deviceInfo),
        type,
        classId,
        isDefault: false,
        settings: this.extractSettingsFromConfig(type, config),
      };

      await this.startDeviceStream(device);
      return device;
    } catch (error) {
      console.error(`加载 ${type} 设备失败:`, error);
      return null;
    }
  }

  /**
   * 从配置中提取设置
   */
  private extractSettingsFromConfig(type: DeviceType, config: any): DeviceSettings {
    const audioFields = ['sampleRate', 'channelCount', 'channelMode'];
    const videoFields = ['width', 'height', 'frameRate', 'simulcastConfigs'];
    const fields = type === 'microphone' ? audioFields : videoFields;

    const settings: any = {};
    fields.forEach((field) => {
      if (config[field] !== undefined) {
        settings[field] = config[field];
      }
    });

    // 为麦克风设置默认 channelMode
    if (type === 'microphone' && !settings.channelMode) {
      settings.channelMode = 'mono';
    }

    return settings;
  }

  /**
   * 保存单个设备到配置文件
   */
  async saveSingleDeviceToConfig(device: Device): Promise<void> {
    if (!device.settings) {
      throw new Error(`设备 ${device.name} 缺少 settings 属性`);
    }

    try {
      const deviceConfig = this.buildDeviceConfig(device);
      const existingConfigs = this.getExistingDeviceConfigs(device.type, device.id) as any[];

      if (device.type === 'microphone') {
        await window.electron.updateAudioConfig([...existingConfigs, deviceConfig] as any);
      } else {
        await window.electron.updateVideoConfig([...existingConfigs, deviceConfig], device.type);
      }
    } catch (error) {
      console.error(`保存设备 ${device.name} 配置失败:`, error);
      throw error;
    }
  }

  /**
   * 构建设备配置对象
   */
  private buildDeviceConfig(device: Device): any {
    const baseConfig = {
      id: device.id,
      classId: device.classId,
      name: device.name,
    };

    const settings = device.settings!;

    if (device.type === 'microphone') {
      // 验证必需字段
      if (!settings.sampleRate || !settings.channelCount) {
        throw new Error(`麦克风设备 ${device.name} 缺少必要的配置参数`);
      }
      return {
        ...baseConfig,
        sampleRate: settings.sampleRate,
        channelCount: settings.channelCount,
        channelMode: settings.channelMode || 'mono',
      };
    } else {
      // 验证必需字段
      if (!settings.width || !settings.height || !settings.frameRate) {
        throw new Error(`视频设备 ${device.name} 缺少必要的配置参数`);
      }

      // 清理 simulcastConfigs，只保留必要的字段
      const simulcastConfigs = (settings.simulcastConfigs || []).map((cfg) => ({
        rid: cfg.rid,
        scaleResolutionDownBy: cfg.scaleResolutionDownBy,
        maxBitRate: cfg.maxBitRate,
      }));

      return {
        ...baseConfig,
        width: Math.round(settings.width),
        height: Math.round(settings.height),
        frameRate: Math.round(settings.frameRate),
        simulcastConfigs,
      };
    }
  }

  /**
   * 获取现有设备配置
   */
  private getExistingDeviceConfigs(type: DeviceType, excludeId: string) {
    return this.userDevices
      .filter((d) => d.type === type && d.id !== excludeId && d.settings)
      .map((d) => this.buildDeviceConfig(d));
  }

  /**
   * 保存所有设备到配置文件
   */
  async saveAllDevicesToConfig(): Promise<void> {
    try {
      const configs = {
        screens: this.userDevices
          .filter((d) => d.type === 'screen' && d.settings)
          .map((d) => this.buildDeviceConfig(d)),
        cameras: this.userDevices
          .filter((d) => d.type === 'camera' && d.settings)
          .map((d) => this.buildDeviceConfig(d)),
        microphones: this.userDevices
          .filter((d) => d.type === 'microphone' && d.settings)
          .map((d) => this.buildDeviceConfig(d)),
      };

      await Promise.all([
        window.electron.updateVideoConfig(configs.screens, 'screen'),
        window.electron.updateVideoConfig(configs.cameras, 'camera'),
        window.electron.updateAudioConfig(configs.microphones),
      ]);
    } catch (error) {
      console.error('保存设备配置失败:', error);
      throw new Error('保存设备配置失败');
    }
  }

  private calculateSimulcastConfigs(
    width: number,
    height: number,
    frameRate: number,
  ): SimulcastConfig[] {
    return [
      {
        rid: 'original',
        scaleResolutionDownBy: 1,
        maxBitRate: Math.round(width * height * frameRate * 0.000078125) * 1000,
      },
      {
        rid: 'low',
        scaleResolutionDownBy: 4,
        maxBitRate: Math.round((width / 4) * (height / 4) * frameRate * 0.000078125) * 1000,
      },
    ];
  }
}
