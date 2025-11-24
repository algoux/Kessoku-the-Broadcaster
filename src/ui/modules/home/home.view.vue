<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import {
  DeviceSettings,
  DeviceCapabilities,
  Device,
  ConfigForm,
  CanAddState,
  DeviceType,
} from 'common/modules/home/home.interface';
import { Provide } from 'vue-property-decorator';
import { RendererService } from '@/services/renderer-service';
import RecordRTC from 'recordrtc';

import {
  ElCard,
  ElButton,
  ElTag,
  ElIcon,
  ElMessage,
  ElDialog,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElInputNumber,
  ElLoading,
} from 'element-plus';

import {
  Plus,
  Refresh,
  Delete,
  VideoCamera,
  Microphone,
  Monitor,
  Setting,
} from '@element-plus/icons-vue';
import ScreenShare from '@/components/svgs/screen-share.vue';
import WebCamera from '@/components/svgs/web-camera.vue';
import HomeHeader from '@/components/home-header.vue';
import Trash from '@/components/svgs/trash.vue';
import Mic from '@/components/svgs/mic.vue';
import SettingsIcon from '@/components/svgs/settings.vue';
import VisibleIcon from '@/components/svgs/visible.vue';
import InvisibleIcon from '@/components/svgs/invisible.vue';

@Options({
  components: {
    ElCard,
    ElButton,
    ElTag,
    ElIcon,
    ElDialog,
    ElForm,
    ElFormItem,
    ElSelect,
    ElOption,
    ElInputNumber,
    ScreenShare,
    WebCamera,
    Plus,
    Refresh,
    Delete,
    VideoCamera,
    Microphone,
    Monitor,
    Setting,
    HomeHeader,
    Trash,
    Mic,
    SettingsIcon,
    VisibleIcon,
    InvisibleIcon,
  },
})
export default class HomeView extends Vue {
  // 设备源相关状态
  private userDevices: Device[] = [];
  private selectedPreset: string = '';
  private deviceIdToClassIdMap: Map<string, string> = new Map();
  private configDialogVisible = false;
  private currentConfigDevice: Device | null = null;
  private configForm: ConfigForm;
  @Provide({ reactive: true })
  public isReady: boolean = false;
  @Provide({ reactive: true })
  canAddState: CanAddState = {
    screen: 0,
    camera: 0,
    microphone: 0,
  };
  @Provide({ reactive: true })
  availableScreens: Array<{ id: string; name: string }> = [];
  @Provide({ reactive: true })
  availableCameras: Array<MediaDeviceInfo> = [];
  @Provide({ reactive: true })
  availableMicrophones: Array<MediaDeviceInfo> = [];

  rollingRecordsMap: Map<string, any> = new Map();

  // 渲染进程服务
  private rendererService: RendererService | null = null;

  // 推流相关
  @Provide({ reactive: true })
  public isStreaming: boolean = false;
  @Provide({ reactive: true })
  public streamStatus: string = '未连接';

  @Provide()
  public async changeReadyState() {
    this.isReady = !this.isReady;

    if (this.isReady) {
      // 上报设备信息到服务器
      await this.reportDeviceState();
      window.electron.hasReady();
    } else {
      // 取消准备状态
      await this.reportDeviceState();
    }
  }

  // 上报设备状态到服务器
  private async reportDeviceState() {
    if (!this.rendererService) return;

    const deviceInfos = this.userDevices
      .filter((device) => device.enabled)
      .map((device) => ({
        classId: device.classId,
        type: device.type,
        name: device.name,
        enabled: device.enabled,
        settings: device.settings
          ? {
              width: device.settings.width,
              height: device.settings.height,
              frameRate: device.settings.frameRate,
              aspectRatio: device.settings.aspectRatio,
              facingMode: device.settings.facingMode,
              sampleRate: device.settings.sampleRate,
              channelCount: device.settings.channelCount,
            }
          : undefined,
      }));

    try {
      await this.rendererService.reportDeviceState(deviceInfos, this.isReady);
    } catch (error) {
      console.error('上报设备状态失败:', error);
    }
  }

  // 初始化渲染进程服务
  private async initializeService() {
    try {
      // 创建渲染进程服务
      this.rendererService = new RendererService();

      // 设置推流请求回调（支持按 classId 选择设备）
      this.rendererService.onStreamingRequest = async (classIds: string[]) => {
        await this.startStreaming(classIds);
      };

      // 设置停止推流请求回调
      this.rendererService.onStopStreamingRequest = async () => {
        await this.stopStreaming();
      };

      // 初始化服务
      await this.rendererService.initialize();

      // 检查连接状态
      const loginStatus = await this.rendererService.getConnectionStatus();
      this.streamStatus = loginStatus.connected ? '已连接，等待推流请求' : '未连接';
    } catch (error) {
      console.error('连接失败:', error);
    }
  }

  // 开始推流（支持按 classId 筛选设备）
  private async startStreaming(classIds: string[] = []) {
    try {
      if (!this.rendererService) {
        throw new Error('渲染服务未初始化');
      }

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

      if (enabledStreams.length === 0) {
        ElMessage.warning('没有可用的视频流，请检查设备选择');
        return;
      }

      ElMessage.info({
        message: `开始推流 ${enabledStreams.length} 个设备`,
        plain: true,
      });

      // 通过RendererService开始推流
      await this.rendererService.startStreaming(enabledStreams);
      this.isStreaming = true;
    } catch (error) {
      console.error('推流失败:', error);
      ElMessage.error(`推流失败: ${error.message}`);
    }
  }

  // 停止推流
  private async stopStreaming() {
    try {
      if (this.rendererService) {
        await this.rendererService.stopStreaming();
      }

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
              console.error(`重新启动设备 ${device.name} 流失败:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('停止推流失败:', error);
    }
  }

  // 更新可添加设备数量
  private updateCanAddState() {
    const countByType = (type: DeviceType) =>
      this.userDevices.filter((d) => d.type === type).length;

    this.canAddState = {
      screen: this.availableScreens.length - countByType('screen'),
      camera: this.availableCameras.length - countByType('camera'),
      microphone: this.availableMicrophones.length - countByType('microphone'),
    };
  }

  // 获取所有可用设备
  @Provide()
  async refreshAllDevices() {
    const loading = ElLoading.service({
      lock: true,
      text: '加载设备中...',
      background: 'rgba(0, 0, 0, 0.7)',
    });

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

      // 如果用户设备列表为空，添加默认设备
      if (this.userDevices.length === 0) {
        await this.addDefaultDevices();
      }

      this.updateCanAddState();

      ElMessage.primary({
        message: '设备刷新完成',
        plain: true,
      });
    } catch (error) {
      ElMessage.error({ message: '刷新设备失败', plain: true });
    } finally {
      loading.close();
    }
  }

  async addDefaultDevices() {
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
      this.userDevices.push(device);
      await this.startDeviceStream(device);
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
      this.userDevices.push(device);
      await this.startDeviceStream(device);
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
    }
  }

  async startDeviceStream(device: Device) {
    try {
      let stream: MediaStream | null = null;

      if (device.type === 'screen') {
        stream = await (navigator.mediaDevices.getUserMedia as any)({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: device.id,
            },
          },
        });
      } else if (device.type === 'camera') {
        // 请求摄像头，尝试获取最高帧率
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

          this.$forceUpdate();
        }

        await this.$nextTick();
        this.updateVideoElement(device);

        // 如果是视频设备，启动滚动录制
        if (device.type === 'screen' || device.type === 'camera') {
          this.startRollingRecord(device);
        }
      }
    } catch (error) {
      console.error(`❌ 启动设备 ${device.name} 失败:`, error);
      ElMessage.error({
        message: `启动 ${device.name} 失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 开始滚动录制 - 使用 RecordRTC 定期重启策略
  startRollingRecord(device: Device) {
    if (!device.stream || !device.classId) {
      console.warn(`设备 ${device.name} 缺少必要的 stream 或 classId`);
      return;
    }

    // 如果该 classId 已经有录制实例，先停止
    if (this.rollingRecordsMap.has(device.classId)) {
      const existingRecord = this.rollingRecordsMap.get(device.classId);
      if (existingRecord.recorder) {
        existingRecord.recorder.stopRecording();
        existingRecord.recorder.destroy();
      }
      if (existingRecord.restartInterval) {
        clearInterval(existingRecord.restartInterval);
      }
    }

    try {
      const recordedBlobs: Blob[] = [];
      const segmentDuration = 3000; // 每3秒一个完整片段
      const maxSegments = 20; // 保留最近20个片段（60秒）
      let currentRecorder: any = null;

      const startNewRecording = () => {
        // 创建新的录制器
        currentRecorder = new RecordRTC(device.stream, {
          type: 'video',
          mimeType: 'video/webm;codecs=vp9',
          videoBitsPerSecond: 2500000,
        });

        currentRecorder.startRecording();

        console.log(`开始新的录制片段: ${device.classId}`);
      };

      const stopAndSaveRecording = () => {
        if (!currentRecorder) return;

        currentRecorder.stopRecording(() => {
          // 获取完整的视频 Blob
          const blob = currentRecorder.getBlob();

          if (blob && blob.size > 0) {
            recordedBlobs.push(blob);

            // 保留最近的片段
            if (recordedBlobs.length > maxSegments) {
              recordedBlobs.shift();
            }

            console.log(`保存录制片段: ${device.classId}, 当前共 ${recordedBlobs.length} 个片段`);
          }

          // 销毁旧的录制器
          currentRecorder.destroy();

          // 立即开始新的录制
          startNewRecording();
        });
      };

      // 启动首次录制
      startNewRecording();

      // 定期停止并重启录制
      const restartInterval = setInterval(() => {
        stopAndSaveRecording();
      }, segmentDuration);

      // 保存录制实例
      this.rollingRecordsMap.set(device.classId, {
        recorder: currentRecorder,
        blobs: recordedBlobs,
        mimeType: 'video/webm;codecs=vp9',
        deviceId: device.id,
        deviceName: device.name,
        startTime: Date.now(),
        restartInterval,
        getRecorder: () => currentRecorder, // 获取当前录制器的引用
      });

      console.log(
        `✅ 已为设备 ${device.name} (${device.classId}) 启动 RecordRTC 滚动录制 (每 ${segmentDuration / 1000} 秒一个片段)`,
      );
    } catch (error) {
      console.error(`启动设备 ${device.name} (${device.classId}) 滚动录制失败:`, error);
    }
  }

  // 更新视频元素
  updateVideoElement(device: Device) {
    const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement | HTMLVideoElement[];
    const video = Array.isArray(videoEl) ? videoEl[0] : videoEl;

    if (video && device.stream) {
      video.srcObject = device.stream;
      video.play();
    }
  }

  // 停止设备流
  stopDeviceStream(device: Device) {
    if (device.stream) {
      device.stream.getTracks().forEach((track) => track.stop());
      device.stream = undefined;
      device.settings = undefined;
      device.capabilities = undefined;

      const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement | HTMLVideoElement[];
      const video = Array.isArray(videoEl) ? videoEl[0] : videoEl;
      if (video) {
        video.srcObject = null;
      }
    }
  }

  // 添加屏幕共享设备
  @Provide()
  async addScreenDevice() {
    const unusedScreen = this.availableScreens.find(
      (screen) => !this.userDevices.some((d) => d.id === screen.id && d.type === 'screen'),
    );

    if (!unusedScreen) {
      ElMessage.info({
        message: this.availableScreens.length === 0 ? '没有可用的屏幕共享' : '所有屏幕共享已添加',
        plain: true,
      });
      return;
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
    ElMessage.primary({
      message: '已添加屏幕共享',
      plain: true,
    });
  }

  // 添加摄像头设备
  @Provide()
  async addCameraDevice() {
    const unusedCamera = this.availableCameras.find(
      (camera) => !this.userDevices.some((d) => d.id === camera.deviceId && d.type === 'camera'),
    );

    if (!unusedCamera) {
      ElMessage.info({
        message: this.availableCameras.length === 0 ? '没有可用的摄像头' : '所有摄像头已添加',
        plain: true,
      });
      return;
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
    ElMessage.primary({
      message: '已添加摄像头',
      plain: true,
    });
  }

  // 添加麦克风设备
  @Provide()
  addMicrophoneDevice() {
    const unusedMic = this.availableMicrophones.find(
      (mic) => !this.userDevices.some((d) => d.id === mic.deviceId && d.type === 'microphone'),
    );

    if (!unusedMic) {
      ElMessage.info({
        message: this.availableMicrophones.length === 0 ? '没有可用的麦克风' : '所有麦克风已添加',
        plain: true,
      });
      return;
    }

    this.userDevices.push({
      id: unusedMic.deviceId,
      name: unusedMic.label || `麦克风 ${unusedMic.deviceId.slice(0, 8)}`,
      type: 'microphone',
      classId: this.getOrCreateClassId(unusedMic.deviceId, 'microphone'),
      enabled: true,
      isDefault: false,
    });

    this.updateCanAddState();
    ElMessage.primary({
      message: '已添加麦克风',
      plain: true,
    });
  }

  // 移除设备
  removeDevice(device: Device) {
    this.stopDeviceStream(device);
    const index = this.userDevices.indexOf(device);
    if (index > -1) {
      this.userDevices.splice(index, 1);
      this.updateCanAddState();
      ElMessage.primary({
        message: `已移除设备 ${device.name}`,
        plain: true,
      });
    }
  }

  // 打开配置对话框
  openConfigDialog(device: Device) {
    if (device.type === 'microphone') {
      ElMessage.info({
        message: '麦克风设备不支持配置参数',
        plain: true,
      });
      return;
    }

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

    this.selectedPreset = '';
    this.configDialogVisible = true;
  }

  // 保存设备配置
  async saveDeviceConfig() {
    if (!this.currentConfigDevice) return;

    if (!this.configForm.width || !this.configForm.height || !this.configForm.frameRate) {
      ElMessage.error({ message: '请填写完整的配置参数', plain: true });
      return;
    }

    try {
      const originalCapabilities = this.currentConfigDevice.capabilities;
      this.stopDeviceStream(this.currentConfigDevice);

      let stream: MediaStream | null = null;

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

        await this.$nextTick();
        this.updateVideoElement(this.currentConfigDevice);
      }

      this.configDialogVisible = false;
      ElMessage.primary({
        message: `设备 ${this.currentConfigDevice.name} 配置已更新`,
        plain: true,
      });
    } catch (error) {
      ElMessage.error({
        message: `更新设备配置失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 获取设备类型图标
  getDeviceIcon(type: string) {
    switch (type) {
      case 'screen':
        return ScreenShare;
      case 'camera':
        return WebCamera;
      case 'microphone':
        return Mic;
      default:
        return Monitor;
    }
  }

  // 获取设备类型名称
  getDeviceTypeName(type: string) {
    switch (type) {
      case 'screen':
        return '屏幕共享';
      case 'camera':
        return '摄像头';
      case 'microphone':
        return '麦克风';
      default:
        return '未知设备';
    }
  }

  // 格式化设备设置信息
  formatSettings(device: Device): string {
    if (!device.settings) return '未获取';

    const s = device.settings;
    if (device.type === 'microphone') {
      return `采样率: ${s.sampleRate || 'N/A'} Hz, 声道: ${s.channelCount || 'N/A'}`;
    }

    const fps = s.frameRate ? s.frameRate.toFixed(1) : 'N/A';
    return `${s.width || 'N/A'}x${s.height || 'N/A'} @ ${fps} fps`;
  }

  // 应用预设分辨率
  applyPreset(presetStr: string) {
    if (!presetStr) return;

    try {
      const preset = JSON.parse(presetStr);
      if (preset && preset.width && preset.height) {
        this.configForm.width = preset.width;
        this.configForm.height = preset.height;
      }
    } catch (error) {
      ElMessage.error({ message: '应用预设失败', plain: true });
    }
  }

  mounted() {
    // 自动初始化渲染服务
    this.initializeService();

    this.refreshAllDevices();
  }

  getAvailableScreensNumber() {
    return this.availableScreens.length;
  }

  getAvailableCamerasNumber() {
    return this.availableCameras.length;
  }

  getAvailableMicrophonesNumber() {
    return this.availableMicrophones.length;
  }

  getNowUsedDeviceNumver(type: DeviceType) {
    return this.userDevices.filter((d) => d.type === type).length;
  }

  // 获取或生成设备的 classId，确保同一设备 ID 始终对应同一 classId
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

  // 预览视频
  previewVideo(device: Device) {
    if (!device.classId) {
      ElMessage.warning('设备缺少 classId');
      return;
    }

    const recordData = this.rollingRecordsMap.get(device.classId);
    if (!recordData || !recordData.blobs || recordData.blobs.length === 0) {
      ElMessage.warning('暂无可预览的视频数据');
      return;
    }

    // 创建输入对话框容器
    const dialogContainer = document.createElement('div');
    dialogContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;

    // 创建对话框
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: #2c2c2c;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
      min-width: 400px;
    `;

    // 标题
    const title = document.createElement('h3');
    title.textContent = '选择回看时长';
    title.style.cssText = `
      color: white;
      margin: 0 0 20px 0;
      font-size: 18px;
    `;

    // 说明文字
    const totalSeconds = recordData.blobs.length * 3; // 每个片段3秒
    const description = document.createElement('p');
    description.textContent = `当前缓存: ${recordData.blobs.length} 个片段 (约 ${totalSeconds} 秒)`;
    description.style.cssText = `
      color: #aaa;
      margin: 0 0 15px 0;
      font-size: 14px;
    `;

    // 输入框容器
    const inputContainer = document.createElement('div');
    inputContainer.style.cssText = `
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    `;

    // 输入框
    const input = document.createElement('input');
    input.type = 'number';
    input.value = Math.min(10, totalSeconds).toString();
    input.min = '1';
    input.max = totalSeconds.toString();
    input.step = '1';
    input.placeholder = '输入秒数';
    input.style.cssText = `
      flex: 1;
      padding: 10px;
      border: 1px solid #555;
      border-radius: 4px;
      background: #1a1a1a;
      color: white;
      font-size: 16px;
    `;

    const label = document.createElement('span');
    label.textContent = '秒';
    label.style.cssText = `
      color: white;
      font-size: 16px;
    `;

    inputContainer.appendChild(input);
    inputContainer.appendChild(label);

    // 按钮容器
    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = `
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    `;

    // 取消按钮
    const cancelButton = document.createElement('button');
    cancelButton.textContent = '取消';
    cancelButton.style.cssText = `
      padding: 10px 20px;
      background: #555;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.3s;
    `;
    cancelButton.onmouseover = () => (cancelButton.style.background = '#666');
    cancelButton.onmouseout = () => (cancelButton.style.background = '#555');
    cancelButton.onclick = () => document.body.removeChild(dialogContainer);

    // 确认按钮
    const confirmButton = document.createElement('button');
    confirmButton.textContent = '预览';
    confirmButton.style.cssText = `
      padding: 10px 20px;
      background: #409eff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.3s;
    `;
    confirmButton.onmouseover = () => (confirmButton.style.background = '#66b1ff');
    confirmButton.onmouseout = () => (confirmButton.style.background = '#409eff');
    confirmButton.onclick = () => {
      const seconds = parseInt(input.value);
      if (isNaN(seconds) || seconds < 1 || seconds > totalSeconds) {
        ElMessage.warning(`请输入 1 到 ${totalSeconds} 之间的数字`);
        return;
      }
      document.body.removeChild(dialogContainer);
      this.showVideoPreview(device, recordData, seconds);
    };

    // 按回车也确认
    input.onkeypress = (e) => {
      if (e.key === 'Enter') {
        confirmButton.click();
      }
    };

    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);

    dialog.appendChild(title);
    dialog.appendChild(description);
    dialog.appendChild(inputContainer);
    dialog.appendChild(buttonContainer);
    dialogContainer.appendChild(dialog);
    document.body.appendChild(dialogContainer);

    // 自动聚焦输入框
    setTimeout(() => input.focus(), 0);
  }

  // 显示视频预览
  showVideoPreview(device: Device, recordData: any, seconds: number) {
    try {
      // 计算需要多少个片段（每个片段3秒）
      const segmentsNeeded = Math.ceil(seconds / 3);
      const blobsToUse = recordData.blobs.slice(-segmentsNeeded);

      console.log('准备预览:', {
        请求秒数: seconds,
        总片段数: recordData.blobs.length,
        使用片段数: blobsToUse.length,
        每片段约: '3秒',
        预计总时长: blobsToUse.length * 3 + '秒',
        mimeType: recordData.mimeType,
      });

      // 合并完整的视频片段
      const blob = new Blob(blobsToUse, { type: recordData.mimeType });
      const url = URL.createObjectURL(blob);

      console.log('Blob创建成功:', {
        大小: blob.size,
        类型: blob.type,
        URL: url,
      });

      // 创建预览容器
      const previewContainer = document.createElement('div');
      previewContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;

      // 创建视频元素
      const video = document.createElement('video');
      video.src = url;
      video.controls = true;
      video.autoplay = true;
      video.muted = false;
      video.playsInline = true;
      video.style.cssText = `
        max-width: 90%;
        max-height: 80vh;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        background: black;
      `;

      // 添加视频加载事件监听
      video.onloadstart = () => console.log('视频开始加载');
      video.onloadedmetadata = () => {
        console.log('视频元数据已加载:', {
          时长: video.duration,
          宽度: video.videoWidth,
          高度: video.videoHeight,
        });
      };
      video.onloadeddata = () => console.log('视频数据已加载');
      video.oncanplay = () => console.log('视频可以播放');
      video.onplaying = () => console.log('视频正在播放');
      video.onerror = (e) => {
        console.error('视频播放错误:', e, video.error);
        ElMessage.error({
          message: `视频加载失败: ${video.error?.message || '未知错误'}`,
          plain: true,
        });
      };

      // 创建关闭按钮
      const closeButton = document.createElement('button');
      closeButton.textContent = '✕ 关闭预览';
      closeButton.style.cssText = `
        margin-top: 20px;
        padding: 10px 20px;
        background: #409eff;
        color: white;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        transition: background 0.3s;
      `;

      closeButton.onmouseover = () => (closeButton.style.background = '#66b1ff');
      closeButton.onmouseout = () => (closeButton.style.background = '#409eff');

      // 关闭预览
      const closePreview = () => {
        video.pause();
        video.src = '';
        URL.revokeObjectURL(url);
        document.body.removeChild(previewContainer);
      };

      closeButton.onclick = closePreview;
      previewContainer.onclick = (e) => {
        if (e.target === previewContainer) closePreview();
      };

      // 创建信息文本
      const infoText = document.createElement('div');
      infoText.textContent = `${device.name} - 约 ${blobsToUse.length * 3} 秒 (${blobsToUse.length} 个片段，${(blob.size / 1024 / 1024).toFixed(2)} MB)`;
      infoText.style.cssText = `
        color: white;
        margin-bottom: 10px;
        font-size: 14px;
      `;

      previewContainer.appendChild(infoText);
      previewContainer.appendChild(video);
      previewContainer.appendChild(closeButton);
      document.body.appendChild(previewContainer);

      ElMessage.success({
        message: '视频预览已打开',
        plain: true,
      });
    } catch (error) {
      console.error('预览视频失败:', error);
      ElMessage.error({
        message: `预览视频失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  beforeUnmount() {
    // 停止推流和清理服务
    if (this.rendererService) {
      this.rendererService.cleanup();
      this.rendererService = null;
    }

    // 停止所有设备流
    this.userDevices.forEach((device) => {
      this.stopDeviceStream(device);
    });
  }
}
</script>

<template>
  <div class="home-view">
    <home-header />
    <main class="home-main">
      <el-card
        v-for="device in userDevices"
        :key="device.id"
        class="device-card"
        :class="{
          'device-screen': device.type === 'screen',
          'device-camera': device.type === 'camera',
          'device-microphone': device.type === 'microphone',
        }"
      >
        <template #header>
          <div class="device-header">
            <div class="device-info">
              <el-icon :size="24" class="device-icon">
                <component :is="getDeviceIcon(device.type)" />
              </el-icon>
              <div class="device-title">
                <h3>{{ device.classId }}</h3>
                <span class="device-type">{{ device.name }}</span>
              </div>
            </div>
            <div class="device-badges">
              <!-- <el-tag v-if="device.isDefault" type="success" size="small">默认</el-tag>
              <el-tag :type="device.enabled ? 'success' : 'info'" size="small">
                {{ device.enabled ? '已启用' : '已禁用' }}
              </el-tag> -->
              <visible-icon v-if="device.enabled" style="width: 20px" />
              <invisible-icon v-else style="width: 20px" />
            </div>
          </div>
        </template>

        <div class="device-body">
          <video
            v-if="device.type === 'screen' || device.type === 'camera'"
            :ref="`video-${device.id}`"
            class="device-video"
            :class="device.classId"
            autoplay
            muted
            playsinline
          ></video>

          <div v-else class="device-preview-icon">
            <el-icon :size="80">
              <Microphone />
            </el-icon>
          </div>
        </div>

        <template #footer>
          <div class="device-actions">
            <div class="device-settings-info">
              <div class="settings-value">{{ formatSettings(device) }}</div>
            </div>
            <div class="device-handler-buttons">
              <el-button
                v-if="device.type === 'screen' || device.type === 'camera'"
                size="small"
                @click="previewVideo(device)"
                class="ghost-button"
                type="success"
              >
                <span>🎬 预览视频</span>
              </el-button>
              <el-button
                size="small"
                :disabled="isReady"
                @click="openConfigDialog(device)"
                class="ghost-button"
              >
                <el-icon><SettingsIcon /></el-icon>
                <span>修改设备参数</span>
              </el-button>
              <el-button
                size="small"
                :disabled="isReady"
                circle
                @click="removeDevice(device)"
                class="ghost-button danger-ghost-button"
              >
                <el-icon><Trash style="color: var(--bg-pure-color)" /></el-icon>
              </el-button>
            </div>
          </div>
        </template>
      </el-card>
      <div v-if="userDevices.length === 0" class="empty-state">
        <el-icon :size="80" color="#909399">
          <Monitor />
        </el-icon>
        <h3>暂无设备</h3>
        <p>点击上方按钮添加设备</p>
      </div>
    </main>

    <el-dialog
      v-model="configDialogVisible"
      :title="`配置 - ${currentConfigDevice?.name}`"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="configForm" label-width="100px" style="margin-top: 15px">
        <el-form-item label="分辨率">
          <div class="resolution-inputs">
            <el-input-number
              v-model="configForm.width"
              :min="currentConfigDevice?.capabilities?.width?.min || 320"
              :max="currentConfigDevice?.capabilities?.width?.max || 3840"
              :step="1"
              controls-position="right"
            />
            <span class="resolution-separator">×</span>
            <el-input-number
              v-model="configForm.height"
              :min="currentConfigDevice?.capabilities?.height?.min || 240"
              :max="currentConfigDevice?.capabilities?.height?.max || 2160"
              :step="1"
              controls-position="right"
            />
          </div>
        </el-form-item>

        <el-form-item label="预设分辨率">
          <el-select v-model="selectedPreset" placeholder="选择预设" @change="applyPreset">
            <el-option label="自定义" value="" />
            <el-option
              v-if="
                currentConfigDevice?.capabilities?.width?.max &&
                currentConfigDevice?.capabilities?.height?.max
              "
              label="设备最大分辨率"
              :value="
                JSON.stringify({
                  width: Math.round(currentConfigDevice.capabilities.width.max),
                  height: Math.round(currentConfigDevice.capabilities.height.max),
                })
              "
            />
            <el-option
              label="1920 × 1080 (Full HD)"
              :value="JSON.stringify({ width: 1920, height: 1080 })"
            />
            <el-option
              label="1280 × 720 (HD)"
              :value="JSON.stringify({ width: 1280, height: 720 })"
            />
            <el-option
              label="854 × 480 (SD)"
              :value="JSON.stringify({ width: 854, height: 480 })"
            />
            <el-option label="640 × 360" :value="JSON.stringify({ width: 640, height: 360 })" />
          </el-select>
        </el-form-item>

        <el-form-item label="帧率">
          <el-input-number
            v-model="configForm.frameRate"
            :min="currentConfigDevice?.capabilities?.frameRate?.min || 1"
            :max="currentConfigDevice?.capabilities?.frameRate?.max || 60"
            :step="1"
            controls-position="right"
          />
          <span style="margin-left: 10px">fps</span>
        </el-form-item>

        <el-form-item label="支持范围">
          <div class="capabilities-info">
            <p v-if="currentConfigDevice?.capabilities">
              宽度: {{ Math.round(currentConfigDevice.capabilities.width?.min || 0) }} -
              {{ Math.round(currentConfigDevice.capabilities.width?.max || 0) }}<br />
              高度: {{ Math.round(currentConfigDevice.capabilities.height?.min || 0) }} -
              {{ Math.round(currentConfigDevice.capabilities.height?.max || 0) }}<br />
              帧率: {{ Math.round(currentConfigDevice.capabilities.frameRate?.min || 0) }} -
              {{ Math.round(currentConfigDevice.capabilities.frameRate?.max || 0) }} fps
            </p>
            <p v-else>设备能力信息未获取</p>
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="dialog-footer">
          <el-button @click="configDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveDeviceConfig">保存</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="less">
.home-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary-color);

  .home-main {
    flex: 1;
    margin-top: calc(720px * 0.25);
    padding: 30px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    gap: 20px;
    align-content: start;

    .device-card {
      background: var(--bg-secondary-color);
      border-radius: 12px;
      border: 1px solid var(--border-color);
      transition: all 0.3s ease;
      height: 390px;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
        border-color: var(--border-hover-color);
      }

      :deep(.el-card__header) {
        height: 20%;
        border-bottom: 1px solid var(--border-color);
      }

      .device-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;

        .device-info {
          display: flex;
          align-items: center;
          gap: 12px;
          flex: 1;
          min-width: 0;

          .device-icon {
            flex-shrink: 0;
            color: var(--el-color-primary);
          }

          .device-title {
            flex: 1;
            min-width: 0;

            h3 {
              margin: 0;
              font-size: 16px;
              font-weight: 600;
              color: var(--font-primary-color);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .device-type {
              font-size: 12px;
              color: var(--font-secondary-color);
            }
          }
        }

        .device-badges {
          display: flex;
          gap: 6px;
          flex-shrink: 0;
        }
      }

      :deep(.el-card__body) {
        padding: 0;
        height: 60%;
      }

      .device-body {
        width: 100%;
        height: 100%;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        position: relative;

        .device-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .device-preview-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          color: #909399;
        }
      }

      :deep(.el-card__footer) {
        height: 20%;
        border-top: 1px solid var(--border-color);
      }

      .device-actions {
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        gap: 10px;

        .device-settings-info {
          width: 100%;
          height: 50%;
          display: flex;
          align-items: center;
          justify-content: flex-start;

          .settings-label {
            font-size: 12px;
            color: var(--font-secondary-color);
            margin-bottom: 4px;
          }

          .settings-value {
            font-size: 13px;
            font-weight: 600;
            color: var(--el-color-primary);
          }
        }

        & .device-handler-buttons {
          width: 100%;
          height: 50%;
          display: flex;
          gap: 10px;
          flex: 1;
          justify-content: space-between;
          align-items: center;
        }
      }
    }

    // 空状态样式
    .empty-state {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: var(--font-secondary-color);

      h3 {
        margin: 20px 0 10px;
        font-size: 20px;
        font-weight: 500;
      }

      p {
        margin: 0;
        font-size: 14px;
        opacity: 0.8;
      }
    }
  }
}

.resolution-inputs {
  display: flex;
  align-items: center;
  gap: 10px;

  .resolution-separator {
    font-size: 18px;
    font-weight: bold;
    color: var(--font-primary-color);
  }

  :deep(.el-input-number) {
    width: 140px;
  }
}

.capabilities-info {
  padding: 10px;
  background: rgba(0, 0, 0, 0.03);
  border-radius: 4px;
  font-size: 12px;
  color: var(--font-secondary-color);

  p {
    margin: 0;
    line-height: 1.8;
  }
}

.ghost-button {
  background-color: transparent;
  background: transparent;
  color: var(--font-secondary-color);
  border: 1px solid var(--font-secondary-color);
  transition: all 0.3s ease;

  &:hover:not(:disabled) {
    opacity: 0.8;
  }

  &:disabled {
    background-color: transparent !important;
    background: transparent !important;
    color: var(--font-secondary-color) !important;
    border-color: var(--font-secondary-color) !important;
    opacity: 0.4;
    cursor: not-allowed;

    &:hover {
      background-color: transparent !important;
      background: transparent !important;
      color: var(--font-secondary-color) !important;
      border-color: var(--font-secondary-color) !important;
    }
  }
}

.danger-ghost-button {
  &:hover:not(:disabled) {
    color: red;
    border: 1px solid red;
  }

  &:disabled {
    &:hover {
      color: var(--font-secondary-color) !important;
      border-color: var(--font-secondary-color) !important;
    }
  }
}

/* Element Plus 暗色主题适配 */
:deep(.el-dialog) {
  background-color: var(--bg-secondary-color);
  border: 1px solid rgba(255, 255, 255, 0.1);

  .el-dialog__header {
    background-color: var(--bg-secondary-color);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);

    .el-dialog__title {
      color: var(--font-primary-color);
    }

    .el-dialog__close {
      color: var(--font-secondary-color);

      &:hover {
        color: var(--font-primary-color);
      }
    }
  }

  .el-dialog__body {
    background-color: var(--bg-secondary-color);
    color: var(--font-primary-color);
  }

  .el-dialog__footer {
    background-color: var(--bg-secondary-color);
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  :deep(.el-form) {
    .el-form-item__label {
      color: var(--font-primary-color);
    }

    .el-input-number {
      background-color: var(--bg-primary-color);

      .el-input__inner {
        background-color: var(--bg-primary-color);
        color: var(--font-primary-color);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .el-input-number__decrease,
      .el-input-number__increase {
        background-color: var(--bg-primary-color);
        color: var(--font-secondary-color);
        border-color: rgba(255, 255, 255, 0.03);

        &:hover {
          color: var(--el-color-primary);
        }
      }
    }

    .el-select {
      .el-input__inner {
        background-color: var(--bg-primary-color);
        color: var(--font-primary-color);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .el-input__suffix {
        color: var(--font-secondary-color);
      }
    }
  }
}

:deep(.el-button) {
  &:focus,
  &:focus-visible {
    outline: none !important;
  }

  &.is-disabled {
    opacity: 0.5;
  }
}

.capabilities-info {
  background: var(--bg-primary-color);
  border: 1px solid var(--border-color);
}
</style>
