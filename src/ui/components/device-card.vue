<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { Inject, Prop, Ref, Watch } from 'vue-property-decorator';
import { DeviceType, Device } from '@/typings/data';

import SettingsIcon from './svgs/settings.vue';
import Trash from './svgs/trash.vue';
import Mic from './svgs/mic.vue';

import { ElCard, ElButton, ElIcon } from 'element-plus';
import { Component } from 'vue';

@Options({
  components: {
    ElCard,
    ElButton,
    ElIcon,
    SettingsIcon,
    Trash,
    Mic,
  },
})
export default class DeviceCard extends Vue {
  @Ref(`videoEl`) videoEl!: HTMLVideoElement;

  @Prop({ required: true })
  device!: Device;

  @Inject()
  isReady!: boolean;

  @Inject()
  getDeviceIcon!: (type: DeviceType) => any;

  @Inject()
  openConfigDialog!: (device: Device) => Component;

  @Inject()
  removeDevice!: (device: Device) => void;

  private localFormatSetting: string = '';

  mounted() {
    this.updateFormatSetting();
  }

  public updateFormatSetting() {
    this.localFormatSetting = this.device?.formatSetting || '未获取当前设备参数';
  }

  getVideoEl() {
    return this.videoEl;
  }

  // 响应 device.formatSetting 变化
  @Watch('device.formatSetting', { immediate: true })
  onFormatSettingChange() {
    this.updateFormatSetting();
  }
}
</script>

<template>
  <el-card
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
          <el-icon :size="26" class="device-icon">
            <component :is="getDeviceIcon(device.type)" style="color: var(--font-primary-color)" />
          </el-icon>
          <div class="device-title">
            <h3>{{ device.classId }}</h3>
            <span class="device-type">{{ device.name }}</span>
          </div>
        </div>
      </div>
    </template>

    <div class="device-body">
      <video
        v-if="device.type === 'screen' || device.type === 'camera'"
        ref="videoEl"
        class="device-video"
        :class="device.classId"
        autoplay
        muted
        playsinline
      ></video>

      <div v-else class="device-preview-icon">
        <el-icon :size="80">
          <Mic />
        </el-icon>
      </div>
    </div>

    <template #footer>
      <div class="device-actions">
        <div class="device-settings-info">
          <div class="settings-value">{{ localFormatSetting }}</div>
        </div>

        <div class="device-handler-buttons">
          <el-button
            size="small"
            :disabled="isReady"
            circle
            @click="openConfigDialog(device)"
            class="ghost-button"
          >
            <SettingsIcon style="width: 16px" />
            <!-- <span>修改设备参数</span> -->
          </el-button>
          <el-button
            size="small"
            :disabled="isReady"
            circle
            @click="removeDevice(device)"
            class="ghost-button danger-ghost-button"
          >
            <Trash style="color: var(--bg-pure-color); width: 14px" />
          </el-button>
        </div>
      </div>
    </template>
  </el-card>
</template>

<style scoped lang="less">
.device-card {
  background: var(--bg-secondary-color);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
  height: 390px;
  position: relative;
  display: flex;
  align-items: center;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.3);
    border-color: var(--border-hover-color);
  }

  :deep(.el-card__header) {
    width: 100%;
    height: 20%;
    z-index: 40;
  }

  .device-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    user-select: none;

    .device-info {
      display: flex;
      align-items: center;
      gap: 12px;
      flex: 1;
      min-width: 0;

      .device-icon {
        flex-shrink: 0;
      }

      .device-title {
        flex: 1;
        min-width: 0;

        h3 {
          margin: 0;
          font-size: 18px;
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
  }

  :deep(.el-card__body) {
    padding: 0;
    width: 100%;
    height: 60%;
  }

  .device-body {
    width: 100%;
    height: 100%;
    background: var(--bg-pure-color);
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
      color: var(--font-primary-color);
    }
  }

  :deep(.el-card__footer) {
    width: 100%;
    height: 20%;
    z-index: 40;
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
      height: 40%;
      display: flex;
      align-items: center;
      justify-content: flex-start;
      user-select: none;

      .settings-label {
        font-size: 12px;
        color: var(--font-secondary-color);
        margin-bottom: 4px;
      }

      .settings-value {
        font-size: 13px;
        font-weight: 600;
      }
    }

    & .device-handler-buttons {
      width: 100%;
      height: 60%;
      display: flex;
      // background-color: red;
      gap: 10px;
      flex: 1;
      justify-content: space-between;
      align-items: center;
    }
  }
}

.ghost-button {
  background-color: transparent;
  background: transparent;
  color: var(--font-secondary-color);
  border: 1px solid var(--font-secondary-color);
  transition: all 0.3s ease;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 6px;
  font-size: 14px;

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
