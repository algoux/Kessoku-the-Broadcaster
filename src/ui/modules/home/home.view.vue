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
import { DeviceManager } from '@/services/device-manager';

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
  deviceManager: DeviceManager = new DeviceManager(this.startRollingRecord);
  // 设备源相关状态
  // private userDevices: Device[] = [];
  // private selectedPreset: string = '';
  // private deviceIdToClassIdMap: Map<string, string> = new Map();
  private configDialogVisible = false;
  // private currentConfigDevice: Device | null = null;
  @Provide({ reactive: true })
  public isReady: boolean = false;
  @Provide({ reactive: true })
  canAddState: CanAddState = this.deviceManager.canAddState;
  // @Provide({ reactive: true })
  // availableScreens: Array<{ id: string; name: string }> = [];
  // @Provide({ reactive: true })
  // availableCameras: Array<MediaDeviceInfo> = [];
  // @Provide({ reactive: true })
  // availableMicrophones: Array<MediaDeviceInfo> = [];

  homeState!: {
    userDevices: Device[];
    selectedPreset: string;
  };

  rollingRecordsMap: Map<string, any> = new Map();

  // 回看推流相关
  private replayVideos: Map<string, HTMLVideoElement> = new Map();

  // 渲染进程服务
  private rendererService: RendererService | null = null;

  @Provide()
  public async changeReadyState() {
    this.isReady = !this.isReady;

    if (this.isReady) {
      // 上报设备信息到服务器
      await this.reportDeviceState();
      window.electron.hasReady();
    } else {
      // 取消准备状态
      // await this.reportDeviceState();
    }
  }

  // 上报设备状态到服务器
  private async reportDeviceState() {
    if (!this.rendererService) return;

    const deviceInfos = this.deviceManager.userDevices
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
        const mediastreamings = await this.deviceManager.startStreaming(classIds);
        this.rendererService.startStreaming(mediastreamings);
      };

      // 设置停止推流请求回调
      this.rendererService.onStopStreamingRequest = async () => {
        await this.rendererService.stopStreaming();
        await this.deviceManager.stopStreaming();
        for(const device of this.deviceManager.userDevices) {
          this.updateVideoElement(device);
        }
      };

      // 初始化服务
      await this.rendererService.initialize();

      // 检查连接状态
      const loginStatus = await this.rendererService.getConnectionStatus();
      this.deviceManager.streamStatus = loginStatus.connected ? '已连接，等待推流请求' : '未连接';
    } catch (error) {
      console.error('连接失败:', error);
    }
  }

  // 开始推流（支持按 classId 筛选设备）
  // private async startStreaming(classIds: string[] = []) {
  //   try {
  //     if (!this.rendererService) {
  //       throw new Error('渲染服务未初始化');
  //     }

  //     // 根据 classIds 筛选要推流的设备
  //     let devicesToStream = this.userDevices.filter((device) => device.enabled);

  //     if (classIds && classIds.length > 0) {
  //       devicesToStream = devicesToStream.filter((device) => classIds.includes(device.classId));
  //     }

  //     // 重新获取所选设备的流（确保 track 未 ended）
  //     for (const device of devicesToStream) {
  //       if (device.type === 'screen' || device.type === 'camera') {
  //         // 检查流是否有效
  //         const isStreamValid = device.stream?.getVideoTracks()[0]?.readyState === 'live';
  //         if (!isStreamValid) {
  //           await this.startDeviceStream(device);
  //         }
  //       }
  //     }

  //     // 收集要推流的设备流
  //     const enabledStreams: MediaStream[] = [];
  //     for (const device of devicesToStream) {
  //       if (device.stream) {
  //         // 只推送视频设备（屏幕和摄像头）
  //         if (device.type === 'screen' || device.type === 'camera') {
  //           enabledStreams.push(device.stream);
  //         }
  //       }
  //     }

  //     if (enabledStreams.length === 0) {
  //       ElMessage.warning('没有可用的视频流，请检查设备选择');
  //       return;
  //     }

  //     ElMessage.info({
  //       message: `开始推流 ${enabledStreams.length} 个设备`,
  //       plain: true,
  //     });

  //     // 通过RendererService开始推流
  //     await this.rendererService.startStreaming(enabledStreams);
  //     this.isStreaming = true;
  //   } catch (error) {
  //     console.error('推流失败:', error);
  //     ElMessage.error(`推流失败: ${error.message}`);
  //   }
  // }

  // 停止推流
  // private async stopStreaming() {
  //   try {
  //     if (this.rendererService) {
  //       await this.rendererService.stopStreaming();
  //     }

  //     // Device 和 Transport 保持连接，以便下次快速推流
  //     this.isStreaming = false;

  //     // 检查并重新启动受影响的设备流
  //     for (const device of this.userDevices) {
  //       if (device.stream && device.stream.getVideoTracks().length > 0) {
  //         const track = device.stream.getVideoTracks()[0];

  //         // 如果流被意外关闭，重新启动
  //         if (track.readyState === 'ended') {
  //           try {
  //             await this.startDeviceStream(device);
  //           } catch (error) {
  //             console.error(`重新启动设备 ${device.name} 流失败:`, error);
  //           }
  //         }
  //       }
  //     }
  //   } catch (error) {
  //     console.error('停止推流失败:', error);
  //   }
  // }

  // 回看推流 - 从裁剪的视频文件创建流并推送
  private async startReplayStreaming(classId: string, filePath: string, seconds: number) {
    try {
      if (!this.rendererService) {
        throw new Error('渲染服务未初始化');
      }

      console.log(`开始回看推流: classId=${classId}, seconds=${seconds}`);

      // 读取视频文件
      const arrayBuffer = await window.electron.readVideoFile(filePath);
      const blob = new Blob([arrayBuffer], { type: 'video/webm' });
      const videoUrl = URL.createObjectURL(blob);

      // 创建仅用于推流的隐藏 video 元素（绝对不可见，无任何 UI/CSS，仅挂载到 body）
      const video = document.createElement('video');
      video.style.position = 'fixed';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-9999';
      video.muted = true; // 必须静音才能自动播放
      video.autoplay = true;
      video.playsInline = true; // iOS 需要
      video.setAttribute('playsinline', 'true'); // 兼容性
      video.src = videoUrl;
      document.body.appendChild(video);

      // 等待视频加载元数据
      await new Promise((resolve, reject) => {
        video.onloadedmetadata = resolve;
        video.onerror = () => reject(new Error('视频加载失败'));
      });

      // 先捕获流再播放(避免播放被中断)
      const stream = (video as any).captureStream() as MediaStream;

      // 播放视频
      try {
        await video.play();
      } catch (playError) {
        console.warn('直接播放失败,尝试用户交互后播放:', playError);
        // 如果自动播放失败,仍然继续推流(某些浏览器可能仍然能捕获流)
      }

      // 通过 RendererService 推流
      await this.rendererService.startStreaming([stream]);

      // 保存 video 元素以便后续清理
      this.replayVideos.set(classId, video);

      // 不再自动 onended 销毁，由导播端控制
      ElMessage.success({ message: '回看推流已开始', plain: true });
    } catch (error) {
      console.error('回看推流失败:', error);
      ElMessage.error({ message: `回看推流失败: ${error.message}`, plain: true });
    }
  }

  // 停止回看推流
  private async stopReplayStreaming(classId: string) {
    try {
      const video = this.replayVideos.get(classId);
      if (video) {
        // 停止视频播放
        video.pause();
        // 释放 blob URL（先保存再清空 src）
        const url = video.src;
        video.src = '';
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        if (url) {
          URL.revokeObjectURL(url);
        }
        this.replayVideos.delete(classId);
        console.log(`回看推流已清理: classId=${classId}`);
      }
      // 停止推流
      if (this.rendererService) {
        await this.rendererService.stopStreaming();
      }
    } catch (error) {
      console.error('停止回看推流失败:', error);
    }
  }

  // 更新可添加设备数量
  // private updateCanAddState() {
  //   const countByType = (type: DeviceType) =>
  //     this.userDevices.filter((d) => d.type === type).length;

  //   this.canAddState = {
  //     screen: this.availableScreens.length - countByType('screen'),
  //     camera: this.availableCameras.length - countByType('camera'),
  //     microphone: this.availableMicrophones.length - countByType('microphone'),
  //   };
  // }

  // 获取所有可用设备
  async refreshAllDevices() {
    const loading = ElLoading.service({
      lock: true,
      text: '加载设备中...',
      background: 'rgba(0, 0, 0, 0.7)',
    });

    try {
      const deviceRes = await this.deviceManager.refreshAllDevices();
      if (deviceRes) {
        console.log(deviceRes);
        for (const device of deviceRes) {
          this.updateVideoElement(device);
        }
      }
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

  // async addDefaultDevices() {
  //   if (this.availableScreens.length > 0) {
  //     const screen = this.availableScreens[0];
  //     const device: Device = {
  //       id: screen.id,
  //       name: screen.name,
  //       classId: this.getOrCreateClassId(screen.id, 'screen', true),
  //       type: 'screen',
  //       enabled: true,
  //       isDefault: true,
  //     };
  //     this.userDevices.push(device);
  //     await this.startDeviceStream(device);
  //   }

  //   if (this.availableCameras.length > 0) {
  //     const camera = this.availableCameras[0];
  //     const device: Device = {
  //       id: camera.deviceId,
  //       name: camera.label || '默认摄像头',
  //       classId: this.getOrCreateClassId(camera.deviceId, 'camera', true),
  //       type: 'camera',
  //       enabled: true,
  //       isDefault: true,
  //     };
  //     this.userDevices.push(device);
  //     await this.startDeviceStream(device);
  //   }

  //   if (this.availableMicrophones.length > 0) {
  //     const mic = this.availableMicrophones[0];
  //     this.userDevices.push({
  //       id: mic.deviceId,
  //       name: mic.label || '默认麦克风',
  //       type: 'microphone',
  //       enabled: true,
  //       isDefault: true,
  //       classId: this.getOrCreateClassId(mic.deviceId, 'microphone', true),
  //     });
  //   }
  // }

  async startDeviceStream(device: Device) {
    try {
      this.deviceManager.startDeviceStream(device);
      this.updateVideoElement(device);
    } catch (error) {
      console.error(`❌ 启动设备 ${device.name} 失败:`, error);
      ElMessage.error({
        message: `启动 ${device.name} 失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 开始滚动录制 - 单个连续录制,定期保存到文件
  async startRollingRecord(device: Device) {
    if (!device.stream || !device.classId) {
      console.warn(`设备 ${device.name} 缺少必要的 stream 或 classId`);
      return;
    }

    // 如果该 classId 已经有录制实例，先停止
    if (this.rollingRecordsMap.has(device.classId)) {
      const existingRecord = this.rollingRecordsMap.get(device.classId);
      if (existingRecord.recorder) {
        existingRecord.recorder.stopRecording(() => {
          existingRecord.recorder.destroy();
        });
      }
    }

    try {
      // 通知主进程开始录制
      await window.electron.startContinuousRecording(device.classId);

      // 创建单个连续录制器,使用 timeSlice 实时发送数据
      const recorder = new RecordRTC(device.stream, {
        type: 'video',
        mimeType: 'video/webm;codecs=vp9',
        videoBitsPerSecond: 2500000,
        timeSlice: 1000, // 每 1 秒发送一次数据
        ondataavailable: async (blob: Blob) => {
          // 实时发送到主进程
          try {
            await window.electron.sendRecordingBlob(device.classId, blob);
          } catch (error) {
            console.error('发送录制数据失败:', error);
          }
        },
      });

      recorder.startRecording();

      // 保存录制实例
      this.rollingRecordsMap.set(device.classId, {
        recorder,
        mimeType: 'video/webm;codecs=vp9',
        deviceId: device.id,
        deviceName: device.name,
        startTime: Date.now(),
      });
    } catch (error) {
      console.error(`启动设备 ${device.name} (${device.classId}) 录制失败:`, error);
    }
  }

  // 更新视频元素
  updateVideoElement(device: Device) {
    console.log(`更新视频元素: ${device.id}`);

    const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement | HTMLVideoElement[];
    console.log('videoEl', videoEl);
    const video = Array.isArray(videoEl) ? videoEl[0] : videoEl;
    console.log('video', device.settings);

    if (video && device.stream) {
      video.srcObject = device.stream;
      video.play();
    }
  }

  // 停止设备流
  stopDeviceStream(device: Device) {
    const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement | HTMLVideoElement[];
    this.deviceManager.stopDeviceStream(device, videoEl);
  }

  // 添加屏幕共享设备
  @Provide()
  async addScreenDevice() {
    try {
      const data = await this.deviceManager.addScreenDevice();
      if (data.success) {
        ElMessage.primary({
          message: '已添加屏幕共享',
          plain: true,
        });
      } else {
        ElMessage.warning({
          message: '没有可用的屏幕共享',
          plain: true,
        });
      }
    } catch (error) {
      ElMessage.error({
        message: `添加屏幕共享失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 添加摄像头设备
  @Provide()
  async addCameraDevice() {
    try {
      const data = await this.deviceManager.addCameraDevice();
      if (data.code) {
        ElMessage.primary({
          message: '已添加摄像头',
          plain: true,
        });
      } else {
        ElMessage.warning({
          message: '所有摄像头已添加',
          plain: true,
        });
      }
    } catch (err) {
      ElMessage.error({
        message: `添加摄像头失败: ${(err as Error).message}`,
        plain: true,
      });
    }
  }

  // 添加麦克风设备
  @Provide()
  addMicrophoneDevice() {
    try {
      const data = this.deviceManager.addMicrophoneDevice();
      if (data.code) {
        ElMessage.primary({
          message: '已添加麦克风',
          plain: true,
        });
      } else {
        ElMessage.info({
          message: '所有麦克风已添加',
          plain: true,
        });
      }
    } catch (error) {
      ElMessage.error({
        message: `添加麦克风失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 移除设备
  removeDevice(device: Device) {
    try {
      this.stopDeviceStream(device);
      this.deviceManager.removeDevice(device);
      ElMessage.primary({
        message: `已移除设备 ${device.name}`,
        plain: true,
      });
    } catch (error) {
      ElMessage.error({
        message: `移除设备失败: ${(error as Error).message}`,
        plain: true,
      });
    }
  }

  // 打开配置对话框
  openConfigDialog(device: Device) {
    const data = this.deviceManager.openConfigDialog(device);
    if (data.success) {
      ElMessage.primary({
        message: data.message,
        plain: true,
      });
      this.configDialogVisible = true;
    } else {
      ElMessage.info({
        message: data.message,
        plain: true,
      });
    }
  }

  // 保存设备配置
  async saveDeviceConfig() {
    try {
      const device = await this.deviceManager.saveDeviceConfig();
      this.configDialogVisible = false;
      this.updateVideoElement(device);
      ElMessage.primary({
        message: '设备配置已更新',
        plain: true,
      });
    } catch (error) {
      ElMessage.error({
        message: error.message,
        plain: true,
      });
    }
  }

  // 获取设备类型图标
  getDeviceIcon(type: DeviceType) {
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
  getDeviceTypeName(type: DeviceType): string {
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
    console.log(device);
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
        this.deviceManager.configForm.width = preset.width;
        this.deviceManager.configForm.height = preset.height;
      }
    } catch (error) {
      ElMessage.error({ message: '应用预设失败', plain: true });
    }
  }

  async mounted() {
    // 自动初始化渲染服务
    await this.initializeService();

    await this.refreshAllDevices();

    // 监听回看请求
    window.electron.onReplayRequest(async ({ requestedBy, classId, seconds }) => {
      console.log(`收到回看请求: classId=${classId}, seconds=${seconds}`);
      try {
        // 调用主进程处理回看
        const result = await window.electron.handleReplayRequest(classId, seconds);
        if (!result.success) {
          ElMessage.error({ message: `回看失败: ${result.error}`, plain: true });
        }
      } catch (error) {
        console.error('处理回看请求失败:', error);
        ElMessage.error({ message: `回看失败: ${error.message}`, plain: true });
      }
    });

    // 监听回看视频准备就绪
    window.electron.onReplayVideoReady(async ({ classId, filePath, seconds }) => {
      console.log(`回看视频已准备好: classId=${classId}, filePath=${filePath}`);
      await this.startReplayStreaming(classId, filePath, seconds);
    });

    // 监听停止回看请求
    window.electron.onStopReplayRequest?.(({ classId }) => {
      console.log('收到 stopReplayRequest，销毁回看流', classId);
      this.stopReplayStreaming(classId);
    });
  }

  getAvailableScreensNumber() {
    return this.deviceManager.availableScreens.length;
  }

  getAvailableCamerasNumber() {
    return this.deviceManager.availableCameras.length;
  }

  getAvailableMicrophonesNumber() {
    return this.deviceManager.availableMicrophones.length;
  }

  getNowUsedDeviceNumver(type: DeviceType) {
    return this.deviceManager.userDevices.filter((d) => d.type === type).length;
  }

  beforeUnmount() {
    // 清理所有回看视频
    for (const [classId, video] of this.replayVideos.entries()) {
      if (video) {
        video.pause();
        const url = video.src;
        video.src = '';
        if (video.parentNode) {
          video.parentNode.removeChild(video);
        }
        if (url) {
          URL.revokeObjectURL(url);
        }
      }
    }
    this.replayVideos.clear();

    // 移除回看相关的监听器
    window.electron.removeAllListeners('replay-request');
    window.electron.removeAllListeners('replay-video-ready');

    // 停止推流和清理服务
    if (this.rendererService) {
      this.rendererService.cleanup();
      this.rendererService = null;
    }

    // 停止所有设备流
    this.deviceManager.userDevices.forEach((device) => {
      this.stopDeviceStream(device);
    });
  }

  openSettingsWindow() {
    window.electron.openSettingsWindow();
  }
}
</script>

<template>
  <div class="home-view">
    <home-header />
    <main class="home-main">
      <div class="open-settings-button" @click="openSettingsWindow">
        <settings-icon style="width: 70%; height: 70%;" />
      </div>
      <el-card
        v-for="device in deviceManager.userDevices"
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
              <div class="settings-value">{{ deviceManager.getFormatSettings(device) }}</div>
            </div>

            <div class="device-handler-buttons">
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
      <div v-if="deviceManager.userDevices.length === 0" class="empty-state">
        <el-icon :size="80" color="#909399">
          <Monitor />
        </el-icon>
        <h3>暂无设备</h3>
        <p>点击上方按钮添加设备</p>
      </div>
    </main>

    <el-dialog
      v-model="configDialogVisible"
      :title="`配置 - ${deviceManager.currentConfigDevice?.name}`"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="deviceManager.configForm" label-width="100px" style="margin-top: 15px">
        <el-form-item label="分辨率">
          <div class="resolution-inputs">
            <el-input-number
              v-model="deviceManager.configForm.width"
              :min="deviceManager.currentConfigDevice?.capabilities?.width?.min || 320"
              :max="deviceManager.currentConfigDevice?.capabilities?.width?.max || 3840"
              :step="1"
              controls-position="right"
            />
            <span class="resolution-separator">×</span>
            <el-input-number
              v-model="deviceManager.configForm.height"
              :min="deviceManager.currentConfigDevice?.capabilities?.height?.min || 240"
              :max="deviceManager.currentConfigDevice?.capabilities?.height?.max || 2160"
              :step="1"
              controls-position="right"
            />
          </div>
        </el-form-item>

        <el-form-item label="预设分辨率">
          <el-select
            v-model="deviceManager.selectedPreset"
            placeholder="选择预设"
            @change="applyPreset"
          >
            <el-option label="自定义" value="" />
            <el-option
              v-if="
                deviceManager.currentConfigDevice?.capabilities?.width?.max &&
                deviceManager.currentConfigDevice?.capabilities?.height?.max
              "
              label="设备最大分辨率"
              :value="
                JSON.stringify({
                  width: Math.round(deviceManager.currentConfigDevice.capabilities.width.max),
                  height: Math.round(deviceManager.currentConfigDevice.capabilities.height.max),
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
            v-model="deviceManager.configForm.frameRate"
            :min="deviceManager.currentConfigDevice?.capabilities?.frameRate?.min || 1"
            :max="deviceManager.currentConfigDevice?.capabilities?.frameRate?.max || 60"
            :step="1"
            controls-position="right"
          />
          <span style="margin-left: 10px">fps</span>
        </el-form-item>

        <el-form-item label="支持范围">
          <div class="capabilities-info">
            <p v-if="deviceManager.currentConfigDevice?.capabilities">
              宽度:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.min || 0) }} -
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.max || 0) }}<br />
              高度:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.min || 0) }} -
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.max || 0)
              }}<br />
              帧率:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate?.min || 0) }} -
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate?.max || 0) }}
              fps
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

.open-settings-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  width: 35px;
  aspect-ratio: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background-color: var(--bg-pure-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  border: 3px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);
  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    transform: scale(1.1);
  }
}
</style>
