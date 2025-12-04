<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { reactive } from 'vue';
import { Device, DeviceType, ConnectState } from '@/typings/data';
import { Provide, Ref } from 'vue-property-decorator';
import { RendererService } from '@/services/renderer-service';
import { DeviceManager } from '@/services/device-manager';
import { RecorderService } from '@/services/media-recorder';
import { getScreenActualRefreshRate } from '@/utils/getFrameRate';

import { ElIcon, ElMessage, ElLoading } from 'element-plus';

import { Monitor } from '@element-plus/icons-vue';
import ScreenShare from '@/components/svgs/screen-share.vue';
import WebCamera from '@/components/svgs/web-camera.vue';
import Mic from '@/components/svgs/mic.vue';
import HomeHeader from '@/components/home-header.vue';
import SettingsIcon from '@/components/svgs/settings.vue';
import DeviceCard from '@/components/device-card.vue';
import ConfigDialog from '@/components/config-dialog.vue';

@Options({
  components: {
    ScreenShare,
    WebCamera,
    Mic,
    ElIcon,
    Monitor,
    HomeHeader,
    SettingsIcon,
    DeviceCard,
    ConfigDialog,
  },
})
export default class HomeView extends Vue {
  @Ref('deviceCard') deviceCards!: DeviceCard[];

  @Provide({ reactive: true })
  configDialogVisible = false;

  @Provide({ reactive: true })
  deviceManager: DeviceManager = reactive(new DeviceManager()) as DeviceManager;

  @Provide({ reactive: true })
  recorderService: RecorderService = new RecorderService();

  @Provide({ reactive: true })
  public isReady: boolean = false;

  @Provide({ reactive: true })
  public connectionState: ConnectState = ConnectState.DISCONNECTED;

  // 渲染进程服务
  private rendererService: RendererService | null = null;

  @Provide({ reactive: true })
  connectState: ConnectState = ConnectState.CONNECTING;

  @Provide()
  public async changeReadyState() {
    this.isReady = !this.isReady;

    if (this.isReady) {
      // 每次准备就绪时保存设备配置（即使设备数量为0也要更新）
      try {
        await this.deviceManager.saveAllDevicesToConfig();
        console.log('已保存设备配置到文件');
      } catch (error) {
        console.error('保存设备配置失败:', error);
      }

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
      this.deviceManager.streamStatus =
        loginStatus === 'connected' ? '已连接，等待推流请求' : '未连接';
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
      if (deviceRes) {
        console.log(deviceRes);
        for (const device of deviceRes) {
          if (device.type === 'microphone') {
            continue;
          }
          await this.updateVideoElement(device);
          await this.recorderService.startRollingRecord(device);
        }
      }
      this.showMessage('设备列表已更新', 'primary');
    } catch (error) {
      this.showMessage('刷新设备失败', 'error');
      console.error('刷新设备失败:', error);
    } finally {
      loading.close();
    }
  }

  // 更新视频元素
  @Provide()
  async updateVideoElement(device: Device) {
    try {
      if (!device.stream) return;
      const idx = this.deviceManager.userDevices.findIndex((d) => d.id === device.id);
      const card = this.deviceCards[idx];
      const videoEl = card.getVideoEl();

      if (videoEl && device.stream) {
        videoEl.srcObject = device.stream;
        await videoEl.play();
      }
    } catch (err) {
      console.warn(device.type);
      console.error('更新视频元素失败:', err);
    }
  }

  // 停止设备流
  stopDeviceStream(device: Device) {
    const idx = this.deviceManager.userDevices.findIndex((d) => d.id === device.id);
    const card = this.deviceCards[idx];
    const videoEl = card.getVideoEl();
    this.deviceManager.stopDeviceStream(device, videoEl);
  }

  @Provide()
  async addDevice(type: DeviceType) {
    try {
      const loading = ElLoading.service({
        lock: true,
        text: `正在添加${this.deviceTypeName(type)}..`,
        background: 'rgba(0, 0, 0, 0.7)',
      });
      let data = await this.deviceManager.addDevice(type);
      loading.close();

      if (data.code) {
        this.showMessage(`已添加${this.deviceTypeName(type)}`, 'primary');
        if (data.device.type == 'camera' || data.device.type == 'screen') {
          await this.updateVideoElement(data.device);
          await this.recorderService.startRollingRecord(data.device);
        }
      } else {
        this.showMessage(`所有${this.deviceTypeName(type)}已添加`, 'info');
      }
    } catch (error) {
      this.showMessage(
        `添加${this.deviceTypeName(type)}失败: ${(error as Error).message}`,
        'error',
      );
    }
  }

  // 移除设备
  @Provide()
  removeDevice(device: Device) {
    try {
      this.stopDeviceStream(device);
      this.deviceManager.removeDevice(device);
      this.showMessage(`已移除设备 ${device.name}`, 'primary');
    } catch (error) {
      this.showMessage(`移除设备失败: ${(error as Error).message}`, 'error');
    }
  }

  // 打开配置对话框
  @Provide()
  openConfigDialog(device: Device) {
    const data = this.deviceManager.openConfigDialog(device);
    if (data.success) {
      this.configDialogVisible = true;
    } else {
      this.showMessage(data.message, 'info');
    }
  }

  @Provide()
  closeConfigDialog() {
    this.configDialogVisible = false;
  }

  // 保存设备配置
  @Provide()
  async saveDeviceConfig() {
    try {
      const loading = ElLoading.service({
        lock: true,
        text: '保存设备配置中...',
        background: 'rgba(0, 0, 0, 0.7)',
      });
      const { updateDevice, updateIndex } = await this.deviceManager.saveDeviceConfig();
      this.configDialogVisible = false;
      this.deviceCards[updateIndex].updateFormatSetting();
      this.updateVideoElement(updateDevice);
      loading.close();

      this.showMessage('设备配置已更新', 'primary');
    } catch (error) {
      this.showMessage(`保存设备配置失败: ${(error as Error).message}`, 'error');
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

  deviceTypeName(type: DeviceType): string {
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

  async startDeviceStream(device: Device) {
    try {
      this.deviceManager.startDeviceStream(device);
      this.updateVideoElement(device);
    } catch (error) {
      this.showMessage(`启动 ${device.name} 失败: ${(error as Error).message}`, 'error');
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

  openSettingsWindow() {
    window.electron.openSettingsWindow();
  }

  showMessage(message: string, type: 'primary' | 'info' | 'error') {
    ElMessage({
      message,
      type,
      customClass: 'my-message',
    });
  }

  async mounted() {
    await this.initializeService();

    // 立即获取初始连接状态
    const initialState = await window.electron.getConnectionStatus();
    switch (initialState) {
      case 'connected':
        this.connectionState = ConnectState.CONNECTED;
        break;
      case 'connecting':
        this.connectionState = ConnectState.CONNECTING;
        break;
      case 'disconnected':
        this.connectionState = ConnectState.DISCONNECTED;
        break;
    }

    // 监听连接状态变化
    window.electron.onConnectionStateChanged((state) => {
      switch (state) {
        case 'connected':
          this.connectionState = ConnectState.CONNECTED;
          break;
        case 'connecting':
          this.connectionState = ConnectState.CONNECTING;
          break;
        case 'disconnected':
          this.connectionState = ConnectState.DISCONNECTED;
          break;
      }
    });

    const fps = await getScreenActualRefreshRate(60);

    this.deviceManager.setScreenAvailableMaxFrameRate = fps;

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
        v-for="(device, index) in deviceManager.userDevices"
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
    <config-dialog :device-manager="deviceManager" @save="saveDeviceConfig" />
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
  box-shadow: 0 0 6px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);
  &:hover {
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    transform: scale(1.05);
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
</style>
