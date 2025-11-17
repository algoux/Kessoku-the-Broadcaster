<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import {
  DeviceSettings,
  DeviceCapabilities,
  Device,
  ConfigForm,
  CanAddState,
  DeviceType,
} from '@/common/modules/home/home.interface';
import { Provide } from 'vue-property-decorator';

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
import ScreenShare from '@/ui/components/svgs/screen-share.vue';
import WebCamera from '@/ui/components/svgs/web-camera.vue';
import HomeHeader from '@/ui/components/home-header.vue';
import Trash from '@/ui/components/svgs/trash.vue';
import Mic from '@/ui/components/svgs/mic.vue';
import SettingsIcon from '@/ui/components/svgs/settings.vue';
import VisibleIcon from '@/ui/components/svgs/visible.vue';
import InvisibleIcon from '@/ui/components/svgs/invisible.vue';

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
  @Provide({ reactive: true })
  public isReady: boolean = false;

  // 可用设备列表
  @Provide({ reactive: true })
  availableScreens: Array<{ id: string; name: string }> = [];
  @Provide({ reactive: true })
  availableCameras: Array<MediaDeviceInfo> = [];
  @Provide({ reactive: true })
  availableMicrophones: Array<MediaDeviceInfo> = [];

  private userDevices: Device[] = [];
  private selectedPreset: string = '';

  // 设备 ID 和 classId 的持久化映射关系
  private deviceIdToClassIdMap: Map<string, string> = new Map();

  private configDialogVisible = false;
  private currentConfigDevice: Device | null = null;
  private configForm: ConfigForm = {
    width: 1920,
    height: 1080,
    frameRate: 30,
  };

  @Provide({ reactive: true })
  canAddState: CanAddState = {
    screen: 0,
    camera: 0,
    microphone: 0,
  };

  @Provide()
  public changeReadyState() {
    this.isReady = !this.isReady;
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

      ElMessage.success('设备列表已刷新');
    } catch (error) {
      ElMessage.error('刷新设备失败');
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
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { deviceId: { exact: device.id } },
        });
      }

      if (stream) {
        device.stream = stream;

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities() as DeviceCapabilities;
          const settings = videoTrack.getSettings() as DeviceSettings;

          if (!device.capabilities) {
            device.capabilities = capabilities;
          }
          device.settings = settings;

          this.$forceUpdate();
        }

        await this.$nextTick();
        this.updateVideoElement(device);
      }
    } catch (error) {
      ElMessage.error(`启动 ${device.name} 失败: ${(error as Error).message}`);
    }
  }

  // 更新视频元素
  updateVideoElement(device: Device) {
    const videoEl = this.$refs[`video-${device.id}`] as HTMLVideoElement | HTMLVideoElement[];
    const video = Array.isArray(videoEl) ? videoEl[0] : videoEl;

    if (video && device.stream) {
      video.srcObject = device.stream;
      video.play().catch(() => {});
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
      ElMessage.warning(
        this.availableScreens.length === 0 ? '没有可用的屏幕源' : '所有屏幕源已添加',
      );
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
    ElMessage.success(`已添加屏幕: ${unusedScreen.name}`);
  }

  // 添加摄像头设备
  @Provide()
  async addCameraDevice() {
    const unusedCamera = this.availableCameras.find(
      (camera) => !this.userDevices.some((d) => d.id === camera.deviceId && d.type === 'camera'),
    );

    if (!unusedCamera) {
      ElMessage.warning(
        this.availableCameras.length === 0 ? '没有可用的摄像头' : '所有摄像头已添加',
      );
      return;
    }

    const device: Device = {
      id: unusedCamera.deviceId,
      name: unusedCamera.label || `摄像头 ${unusedCamera.deviceId.slice(0, 8)}`,
      type: 'camera',
      classId: this.getOrCreateClassId(unusedCamera.deviceId, 'camera'),
      enabled: true,
      isDefault: false,
    };

    this.userDevices.push(device);
    await this.startDeviceStream(device);
    this.updateCanAddState();
    ElMessage.success(`已添加摄像头`);
  }

  // 添加麦克风设备
  @Provide()
  addMicrophoneDevice() {
    const unusedMic = this.availableMicrophones.find(
      (mic) => !this.userDevices.some((d) => d.id === mic.deviceId && d.type === 'microphone'),
    );

    if (!unusedMic) {
      ElMessage.warning(
        this.availableMicrophones.length === 0 ? '没有可用的麦克风' : '所有麦克风已添加',
      );
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
    ElMessage.success(`已添加麦克风`);
  }

  // 移除设备
  removeDevice(device: Device) {
    this.stopDeviceStream(device);
    const index = this.userDevices.indexOf(device);
    if (index > -1) {
      this.userDevices.splice(index, 1);
      this.updateCanAddState();
      ElMessage.success(`已移除: ${device.name}`);
    }
  }

  // 打开配置对话框
  openConfigDialog(device: Device) {
    if (device.type === 'microphone') {
      ElMessage.warning('麦克风设备暂不支持配置');
      return;
    }

    this.currentConfigDevice = device;

    if (device.settings) {
      this.configForm = {
        width: Math.round(device.settings.width || 1920),
        height: Math.round(device.settings.height || 1080),
        frameRate: Math.round(device.settings.frameRate || 30),
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
      ElMessage.error('配置参数不完整，请检查分辨率和帧率');
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
      ElMessage.success('设备配置已更新');
    } catch (error) {
      ElMessage.error(`配置失败: ${(error as Error).message}`);
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
      ElMessage.error('应用预设失败');
    }
  }

  mounted() {
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
    console.log(`[ClassId] ${deviceId} -> ${classId}`);
    return classId as any;
  }

  beforeUnmount() {
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
      <el-form :model="configForm" label-width="100px">
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
      transition: all 0.3s ease;
      height: 390px;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
      }

      :deep(.el-card__header) {
        height: 20%;
        // border-bottom: 1px solid var(--el-border-color);
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
        border-top: none;
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
</style>
