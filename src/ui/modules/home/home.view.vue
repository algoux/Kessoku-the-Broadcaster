<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { reactive } from 'vue';
import { Device, DeviceType, ConnectState } from '@/typings/data';
import { Provide, Ref } from 'vue-property-decorator';
import { RendererService } from '@/services/renderer-service';
import { DeviceManager } from '@/services/device-manager';
import { RecorderService } from '@/services/media-recorder';
import { getScreenActualRefreshRate } from '@/utils/get-framerate';

import { ElIcon, ElMessage, ElLoading } from 'element-plus';
import type { LoadingInstance } from 'element-plus/es/components/loading/src/loading';

import { Monitor } from '@element-plus/icons-vue';
import ScreenShare from '@/components/svgs/screen-share.vue';
import WebCamera from '@/components/svgs/web-camera.vue';
import Mic from '@/components/svgs/mic.vue';
import HomeHeader from '@/components/home-header.vue';
import SettingsIcon from '@/components/svgs/settings.vue';
import DeviceCard from '@/components/device-card.vue';
import ConfigDialog from '@/components/config-dialog.vue';
import AddDeviceDialog from '@/components/add-device-dialog.vue';
import SettingsButton from '@/components/settings-button.vue';

/**
 * 设备类型配置映射
 */
const DEVICE_TYPE_MAP = {
  screen: {
    name: '屏幕共享',
    icon: ScreenShare,
  },
  camera: {
    name: '摄像头',
    icon: WebCamera,
  },
  microphone: {
    name: '麦克风',
    icon: Mic,
  },
} as const;

/**
 * 连接状态映射
 */
const CONNECTION_STATE_MAP: Record<string, ConnectState> = {
  connected: ConnectState.CONNECTED,
  connecting: ConnectState.CONNECTING,
  disconnected: ConnectState.DISCONNECTED,
};

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
    AddDeviceDialog,
    SettingsButton,
  },
})
export default class HomeView extends Vue {
  @Ref('deviceCard') deviceCards!: DeviceCard[];

  @Provide({ reactive: true })
  configDialogVisible = false;

  @Provide({ reactive: true })
  addDeviceDialogVisible = false;

  @Provide({ reactive: true })
  currentAddDeviceType: DeviceType | null = null;

  @Provide({ reactive: true })
  deviceManager: DeviceManager = reactive(new DeviceManager()) as DeviceManager;

  @Provide({ reactive: true })
  recorderService: RecorderService = new RecorderService();

  @Provide({ reactive: true })
  public isReady: boolean = false;

  @Provide({ reactive: true })
  public connectionState: ConnectState = ConnectState.DISCONNECTED;

  private rendererService: RendererService | null = null;

  private createLoading(text: string): LoadingInstance {
    return ElLoading.service({
      lock: true,
      text,
      background: 'rgba(0, 0, 0, 0.7)',
    });
  }

  private showMessage(message: string, type: 'primary' | 'info' | 'error') {
    ElMessage({
      message,
      type,
    });
  }

  private deviceTypeName(type: DeviceType): string {
    return DEVICE_TYPE_MAP[type]?.name || '未知设备';
  }

  private updateConnectionState(state: string) {
    this.connectionState = CONNECTION_STATE_MAP[state] || ConnectState.DISCONNECTED;
  }

  private findDeviceCardIndex(device: Device): number {
    return this.deviceManager.userDevices.findIndex((d) => d.id === device.id);
  }

  /**
   * 执行异步操作并处理 loading 和错误
   */
  private async executeWithLoading<T>(
    text: string,
    task: () => Promise<T>,
    onSuccess?: (result: T) => void | Promise<void>,
    onError?: (error: Error) => void,
  ): Promise<T | null> {
    const loading = this.createLoading(text);
    try {
      const result = await task();
      if (onSuccess) await onSuccess(result);
      return result;
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        this.showMessage(`${text}失败: ${(error as Error).message}`, 'error');
      }
      console.error(`${text}失败:`, error);
      return null;
    } finally {
      loading.close();
    }
  }

  @Provide()
  public async changeReadyState() {
    this.isReady = !this.isReady;
    await this.reportDeviceState();
    if (this.isReady) {
      window.electron.hasReady();
    }
  }

  // 上报设备状态到服务器
  private async reportDeviceState() {
    if (!this.rendererService) return;

    try {
      const deviceInfos = this.deviceManager.getEnabledDevicesInfo();
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

      // 设置推流请求回调
      this.rendererService.onStreamingRequest = async (data) => {
        console.log('onStreamingRequest:', data);
        const mediastreamings = await this.deviceManager.getEnableStreams(data.classIds);
        console.log('mediastreamings:', mediastreamings);
        await this.rendererService!.startStreaming(mediastreamings, {
          transport: data.transport,
          routerRtpCapabilities: data.routerRtpCapabilities,
        });
      };

      // 设置停止推流请求回调
      this.rendererService.onStopStreamingRequest = async () => {
        await this.rendererService!.stopStreaming();
        await this.deviceManager.resetDeviceStreaming();
        await this.updateAllVideoElements();
      };

      await this.rendererService.initialize();

      // 更新连接状态
      const loginStatus = await this.rendererService.getConnectionStatus();
      this.deviceManager.streamStatus =
        loginStatus === 'connected' ? '已连接，等待推流请求' : '未连接';
    } catch (error) {
      console.error('连接失败:', error);
    }
  }

  /**
   * 更新所有视频设备的视频元素
   */
  private async updateAllVideoElements() {
    const videoDevices = this.deviceManager.getVideoDevices();
    for (const device of videoDevices) {
      await this.updateVideoElement(device);
    }
  }

  // 获取所有可用设备
  async refreshAllDevices() {
    await this.executeWithLoading(
      '加载设备中',
      async () => {
        const deviceRes = await this.deviceManager.refreshAllDevices();
        if (deviceRes) {
          console.log('已加载设备:', deviceRes);
          // 更新视频元素并启动录制（仅视频设备）
          const videoDevices = deviceRes.filter((d) => this.deviceManager.isVideoDevice(d));
          for (const device of videoDevices) {
            await this.updateVideoElement(device);
            await this.recorderService.startRollingRecord(device);
          }
        }
        return deviceRes;
      },
      () => this.showMessage('设备列表已更新', 'primary'),
      () => this.showMessage('刷新设备失败', 'error'),
    );
  }

  @Provide()
  async updateVideoElement(device: Device) {
    try {
      if (!device.stream) return;

      const idx = this.findDeviceCardIndex(device);
      if (idx === -1) {
        console.warn(`未找到设备 ${device.name} 的卡片`);
        return;
      }

      const card = this.deviceCards[idx];
      if (!card) {
        console.warn(`设备卡片 ${idx} 未就绪`);
        return;
      }

      const videoEl = card.getVideoEl();
      if (videoEl && device.stream) {
        videoEl.srcObject = device.stream;
        await videoEl.play();
      }
    } catch (err) {
      console.error(`更新设备 ${device.name} 视频元素失败:`, err);
    }
  }

  private stopDeviceStream(device: Device) {
    const idx = this.findDeviceCardIndex(device);
    if (idx === -1) return;

    const card = this.deviceCards[idx];
    if (!card) return;

    const videoEl = card.getVideoEl();
    this.deviceManager.stopDeviceStream(device, videoEl);
  }

  @Provide()
  async addDevice(type: DeviceType) {
    this.currentAddDeviceType = type;
    this.addDeviceDialogVisible = true;
  }

  @Provide()
  closeAddDeviceDialog() {
    this.addDeviceDialogVisible = false;
    this.currentAddDeviceType = null;
  }

  async handleConfirmAddDevice(data: { classId: string; deviceId: string }) {
    if (!this.currentAddDeviceType) return;

    const deviceType = this.currentAddDeviceType;

    await this.executeWithLoading(
      `正在添加${this.deviceTypeName(deviceType)}`,
      async () => {
        const result = await this.deviceManager.addDevice(
          deviceType,
          data.deviceId,
          data.classId as any,
        );

        this.closeAddDeviceDialog();

        if (result.code && result.device) {
          this.showMessage(`已添加${this.deviceTypeName(deviceType)}`, 'primary');

          // 视频设备需要更新视频元素和启动录制
          if (this.deviceManager.isVideoDevice(result.device)) {
            await this.updateVideoElement(result.device);
            await this.recorderService.startRollingRecord(result.device);
          }
        } else {
          this.showMessage('添加设备失败', 'error');
        }

        return result;
      },
      undefined,
      (error) => {
        this.showMessage(`添加${this.deviceTypeName(deviceType)}失败: ${error.message}`, 'error');
        this.closeAddDeviceDialog();
      },
    );
  }

  // 移除设备
  @Provide()
  removeDevice(device: Device) {
    try {
      // 如果正在配置这个设备，关闭配置对话框
      if (this.configDialogVisible && this.deviceManager.currentConfigDevice === device) {
        this.configDialogVisible = false;
      }

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
    const device = this.deviceManager.currentConfigDevice;
    const isRecording = this.recorderService.rollingRecordsMap.has(device.classId);

    await this.executeWithLoading(
      '保存设备配置中',
      async () => {
        const { updateDevice, updateIndex } = await this.deviceManager.saveDeviceConfig();

        this.configDialogVisible = false;
        this.deviceCards[updateIndex].updateFormatSetting();
        await this.updateVideoElement(updateDevice);

        // 如果设备之前正在录制，重新启动录制
        if (isRecording) {
          console.log(`设备 ${updateDevice.name} 配置已更新，重新启动录制`);
          await this.recorderService.startRollingRecord(updateDevice);
        }

        return updateDevice;
      },
      () => this.showMessage('设备配置已更新', 'primary'),
      (error) => this.showMessage(`保存设备配置失败: ${error.message}`, 'error'),
    );
  }

  // 获取设备类型图标
  @Provide()
  getDeviceIcon(type: DeviceType) {
    return DEVICE_TYPE_MAP[type]?.icon || ScreenShare;
  }

  async startDeviceStream(device: Device) {
    try {
      await this.deviceManager.startDeviceStream(device);
      await this.updateVideoElement(device);
    } catch (error) {
      this.showMessage(`启动 ${device.name} 失败: ${(error as Error).message}`, 'error');
    }
  }

  async mounted() {
    await this.initializeService();

    const initialState = await window.electron.getConnectionStatus();
    this.updateConnectionState(initialState);

    window.electron.onConnectionStateChanged((state) => {
      this.updateConnectionState(state);
    });

    // 设置屏幕最大帧率
    const fps = await getScreenActualRefreshRate(60);
    this.deviceManager.setScreenAvailableMaxFrameRate = fps;

    await this.refreshAllDevices();
  }

  beforeUnmount() {
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
      <settings-button />
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
    <add-device-dialog
      v-if="currentAddDeviceType"
      :device-manager="deviceManager"
      :device-type="currentAddDeviceType"
      @confirm="handleConfirmAddDevice"
    />
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
