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
import { Provide, Ref } from 'vue-property-decorator';
import { RendererService } from '@/services/renderer-service';
import RecordRTC from 'recordrtc';
import { DeviceManager } from '@/services/device-manager';
import { RecorderService } from '@/services/media-recorder';

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
import DeviceCard from '@/components/device-card.vue';

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
    DeviceCard,
  },
})
export default class HomeView extends Vue {
  @Ref('deviceCard') deviceCards!: DeviceCard[];

  private configDialogVisible = false;
  @Provide({ reactive: true })
  deviceManager: DeviceManager = new DeviceManager();
  @Provide({ reactive: true })
  recorderService: RecorderService = new RecorderService();

  @Provide({ reactive: true })
  public isReady: boolean = false;

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
      await this.reportDeviceState();
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
        for (const device of this.deviceManager.userDevices) {
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

  // 获取所有可用设备
  async refreshAllDevices() {
    const loading = ElLoading.service({
      lock: true,
      text: '加载设备中...',
      background: 'rgba(0, 0, 0, 0.7)',
    });

    try {
      const deviceRes = await this.deviceManager.refreshAllDevices();
      console.log('刷新设备结果:', deviceRes);
      if (deviceRes) {
        console.log(deviceRes);
        for (const device of deviceRes) {
          if (device.type === 'microphone') {
            continue;
          }
          this.updateVideoElement(device);
          this.recorderService.startRollingRecord(device);
        }
      }
      ElMessage.primary({
        message: '设备刷新完成',
        plain: true,
      });
    } catch (error) {
      ElMessage.error({ message: '刷新设备失败', plain: true });
      console.error('刷新设备失败:', error);
    } finally {
      loading.close();
    }
  }

  // 更新视频元素
  @Provide()
  updateVideoElement(device: Device) {
    try {
      const idx = this.deviceManager.userDevices.findIndex((d) => d.id === device.id);
      const card = this.deviceCards[idx];
      const videoEl = card.getVideoEl();

      if (videoEl && device.stream) {
        videoEl.srcObject = device.stream;
        videoEl.play();
      }
    } catch (err) {
      console.warn(device.type)
      console.error('更新视频元素失败:', err);
    }
  }

  @Provide()
  getFormatSettings(device: Device) {
    return this.deviceManager.getFormatSettings(device);
  }

  // 停止设备流
  stopDeviceStream(device: Device) {
    const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement;
    this.deviceManager.stopDeviceStream(device, videoEl);
  }

  // 添加屏幕共享设备
  @Provide()
  async addScreenDevice() {
    try {
      const loading = ElLoading.service({
        lock: true,
        text: '正在添加屏幕共享...',
        background: 'rgba(0, 0, 0, 0.7)',
      });
      const data = await this.deviceManager.addScreenDevice();
      loading.close();
      this.recorderService.startRollingRecord(data.device);
      if (data.success) {
        ElMessage.primary({
          message: '已添加屏幕共享',
          plain: true,
        });
        this.updateVideoElement(data.device);
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
      const loading = ElLoading.service({
        lock: true,
        text: '正在添加摄像头...',
        background: 'rgba(0, 0, 0, 0.7)',
      });
      const data = await this.deviceManager.addCameraDevice();
      loading.close();
      this.recorderService.startRollingRecord(data.device);
      if (data.code) {
        ElMessage.primary({
          message: '已添加摄像头',
          plain: true,
        });
        this.updateVideoElement(data.device);
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
  async addMicrophoneDevice() {
    try {
      const data = await this.deviceManager.addMicrophoneDevice();
      if (data.code) {
        ElMessage.primary({
          message: '已添加麦克风',
          plain: true,
        });
        this.updateVideoElement(data.device);
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
  @Provide()
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
  @Provide()
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
      const loading = ElLoading.service({
        lock: true,
        text: '保存设备配置中...',
        background: 'rgba(0, 0, 0, 0.7)',
      });
      const device = await this.deviceManager.saveDeviceConfig();
      this.configDialogVisible = false;
      this.updateVideoElement(device);
      loading.close();
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
  @Provide()
  getDeviceIcon(type: DeviceType) {
    switch (type) {
      case 'screen':
        return ScreenShare;
      case 'camera':
        return WebCamera;
      case 'microphone':
        return Mic;
      default:
        return ScreenShare;
    }
  }

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

  // 回看推流 - 从裁剪的视频文件创建流并推送
  private async startReplayStreaming(classId: string, filePath: string, seconds: number) {
    try {
      if (!this.rendererService) {
        throw new Error('渲染服务未初始化');
      }
      console.log(`开始回看推流: classId=${classId}, seconds=${seconds}`);
      const stream = await this.recorderService.startReplayStreaming(classId, filePath, seconds);
      await this.rendererService.startStreaming([stream]);
      console.log('回看推流已开始');
    } catch (error) {
      console.error('回看推流失败:', error);
    }
  }

  // 停止回看推流
  private async stopReplayStreaming(classId: string) {
    try {
      this.recorderService.stopReplayStreaming(classId);
      if (this.rendererService) {
        await this.rendererService.stopStreaming();
      }
    } catch (error) {
      console.error('停止回看推流失败:', error);
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

  beforeUnmount() {
    // 清理所有回看视频
    for (const [classId, video] of this.recorderService.replayVideos.entries()) {
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
    this.recorderService.replayVideos.clear();

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
        <settings-icon style="width: 70%; height: 70%" />
      </div>
      <device-card
        v-for="device in deviceManager.userDevices"
        :device="device"
        ref="deviceCard"
        :key="device.id"
      />
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
              :min="deviceManager.currentConfigDevice?.capabilities?.width?.min"
              :max="deviceManager.currentConfigDevice?.capabilities?.width?.max"
              :step="1"
              controls-position="right"
            />
            <span class="resolution-separator">×</span>
            <el-input-number
              v-model="deviceManager.configForm.height"
              :min="deviceManager.currentConfigDevice?.capabilities?.height?.min"
              :max="deviceManager.currentConfigDevice?.capabilities?.height?.max"
              :step="1"
              controls-position="right"
            />
          </div>
        </el-form-item>

        <el-form-item label="预设分辨率">
          <el-select
            v-model="deviceManager.selectedPreset"
            placeholder="选择预设"
            @change="deviceManager.applyPreset"
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
            :min="deviceManager.currentConfigDevice?.capabilities?.frameRate?.min"
            :max="60"
            :step="1"
            controls-position="right"
          />
          <span style="margin-left: 10px">fps</span>
        </el-form-item>

        <el-form-item label="支持范围">
          <div class="capabilities-info">
            <p v-if="deviceManager.currentConfigDevice?.capabilities">
              宽度:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.min) }} -
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.max) }}<br />
              高度:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.min) }} -
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.max) }}<br />
              帧率:
              {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate?.min) }} -
              {{ 60 }}
              fps
            </p>
            <p v-else>待获取设备参数信息</p>
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
  // background: rgba(0, 0, 0, 0.03);
  background: var(--bg-primary-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--font-secondary-color);

  p {
    margin: 0;
    line-height: 1.8;
  }
}

.open-settings-button {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  width: 30px;
  aspect-ratio: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  border-radius: 50%;
  background-color: var(--bg-secondary-color);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);
  &:hover {
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
    transform: scale(1.05);
  }
}
</style>
