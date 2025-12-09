<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { Inject } from 'vue-property-decorator';
import { DeviceType, ConnectState } from '@/typings/data';
import type { ContestInfo, Text } from '../../common/types/broadcaster.types';

import {
  ElDescriptions,
  ElDescriptionsItem,
  ElTag,
  ElButton,
  ElDropdown,
  ElDropdownMenu,
  ElDropdownItem,
  ElTooltip,
  ElBadge,
} from 'element-plus';
import MapPin from './svgs/map-pin.vue';
import CircleUser from '@/components/svgs/circle-user.vue';
import PlayIcon from './svgs/play.vue';
import PauseIcon from './svgs/pause.vue';
import CirclePlus from './svgs/circle-plus.vue';
import Refresh from './svgs/refresh.vue';
import WebCamera from './svgs/web-camera.vue';
import ScreenShare from './svgs/screen-share.vue';
import Mic from './svgs/mic.vue';
import WebState from './svgs/web-state.vue';
import { DeviceManager } from '@/services/device-manager';

@Options({
  components: {
    CircleUser,
    ElDescriptions,
    ElDescriptionsItem,
    ElTag,
    ElButton,
    MapPin,
    PlayIcon,
    ElDropdown,
    ElDropdownMenu,
    ElDropdownItem,
    CirclePlus,
    Refresh,
    ElTooltip,
    ElBadge,
    WebCamera,
    ScreenShare,
    Mic,
    WebState,
    PauseIcon,
  },
})
export default class HomeHeader extends Vue {
  @Inject()
  deviceManager!: DeviceManager;
  @Inject()
  isReady!: boolean;

  @Inject()
  connectionState!: ConnectState;

  @Inject()
  availableScreens!: Array<{ id: string; name: string }>;
  @Inject()
  availableCameras!: Array<MediaDeviceInfo>;
  @Inject()
  availableMicrophones!: Array<MediaDeviceInfo>;

  @Inject()
  changeReadyState!: () => void;

  @Inject()
  addDevice!: (type: DeviceType) => Promise<void>;

  @Inject()
  refreshAllDevices!: () => Promise<void>;

  // 比赛信息
  private contestInfo: ContestInfo | null = null;

  async mounted() {
    await this.loadContestInfo();
  }

  async loadContestInfo() {
    try {
      const resp = await window.electron.getContestInfo();
      if (resp.success && resp.data) {
        this.contestInfo = resp.data;
      }
    } catch (error) {
      console.error('获取比赛信息失败:', error);
    }
  }

  // 辅助方法：将 Text 类型转换为字符串
  private resolveText(text: Text | undefined): string {
    if (!text) return '';
    if (typeof text === 'string') return text;
    // 如果是国际化对象，优先返回中文，否则返回 fallback
    return text['zh-CN'] || text['zh'] || text.fallback || Object.values(text)[0] || '';
  }

  get userLocation(): string {
    return this.resolveText(this.contestInfo?.user?.location);
  }

  get userName(): string {
    return this.resolveText(this.contestInfo?.user?.name) || 'Unknown';
  }

  get userOrganization(): string {
    return this.resolveText(this.contestInfo?.user?.organization) || '';
  }

  get contestTitle(): string {
    return this.resolveText(this.contestInfo?.contest?.title) || '';
  }

  get hasDeviceToAdd(): boolean {
    return (
      this.deviceManager.canAddState.screen > 0 ||
      this.deviceManager.canAddState.camera > 0 ||
      this.deviceManager.canAddState.microphone > 0
    );
  }

  get connectionStateClass(): string {
    switch (this.connectionState) {
      case ConnectState.CONNECTED:
        return 'connect-dot-connected';
      case ConnectState.CONNECTING:
        return 'connect-dot-connecting';
      case ConnectState.DISCONNECTED:
        return 'connect-dot-disconnected';
      default:
        return 'connect-dot-disconnected';
    }
  }

  get connectionStateText(): string {
    switch (this.connectionState) {
      case ConnectState.CONNECTED:
        return '已连接';
      case ConnectState.CONNECTING:
        return '连接中';
      case ConnectState.DISCONNECTED:
        return '未连接';
      default:
        return '未连接';
    }
  }
}
</script>

<template>
  <div class="home-header">
    <section class="user-sec">
      <div class="main-sec">
        <template v-if="userLocation">{{ userLocation }} - </template>{{ userName }}
        <div class="connect-state">
          <div class="connect-dot" :class="connectionStateClass"></div>
          <div class="connect-info">{{ connectionStateText }}</div>
        </div>
      </div>
      <div class="org-sec">{{ userOrganization }}</div>
      <div class="contest-sec">{{ contestTitle }}</div>
    </section>

    <section class="tools-sec">
      <el-badge v-if="hasDeviceToAdd" is-dot>
        <el-dropdown :disabled="isReady">
          <el-button circle :disabled="isReady" :size="'large'">
            <circle-plus style="width: 20px" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="addDevice('screen')">
                添加屏幕共享设备
                <span v-if="deviceManager.canAddState.screen > 0" class="count-badge"
                  >({{ deviceManager.canAddState.screen }})</span
                >
              </el-dropdown-item>
              <el-dropdown-item @click="addDevice('camera')">
                添加摄像头设备
                <span v-if="deviceManager.canAddState.camera > 0" class="count-badge"
                  >({{ deviceManager.canAddState.camera }})</span
                >
              </el-dropdown-item>
              <el-dropdown-item @click="addDevice('microphone')">
                添加麦克风设备
                <span v-if="deviceManager.canAddState.microphone > 0" class="count-badge"
                  >({{ deviceManager.canAddState.microphone }})</span
                >
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-badge>
      <el-dropdown v-else :disabled="isReady">
        <el-button circle :disabled="isReady" :size="'large'">
          <circle-plus style="width: 20px" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="addDevice('screen')">
              添加屏幕共享设备
              <span v-if="deviceManager.canAddState.screen > 0" class="count-badge"
                >({{ deviceManager.canAddState.screen }})</span
              >
            </el-dropdown-item>
            <el-dropdown-item @click="addDevice('camera')">
              添加摄像头设备
              <span v-if="deviceManager.canAddState.camera > 0" class="count-badge"
                >({{ deviceManager.canAddState.camera }})</span
              >
            </el-dropdown-item>
            <el-dropdown-item @click="addDevice('microphone')">
              添加麦克风设备
              <span v-if="deviceManager.canAddState.microphone > 0" class="count-badge"
                >({{ deviceManager.canAddState.microphone }})</span
              >
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button
        :type="isReady ? 'danger' : 'primary'"
        @click="changeReadyState"
        class="primary-button"
      >
        <pause-icon v-if="isReady" style="width: 25px; margin-right: 5px" />
        <play-icon v-else style="width: 25px; margin-right: 5px" />
        {{ isReady ? '解除就绪状态' : '准备' }}
      </el-button>
    </section>
  </div>
</template>

<style lang="less" scoped>
.cell-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

& .home-header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: calc(720px * 0.25);
  background-color: var(--bg-secondary-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  z-index: 999;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;
  padding-top: 40px;

  & .user-sec {
    display: flex;
    flex-direction: column;
    gap: 10px;

    & .main-sec {
      width: fit-content;
      font-size: 30px;
      font-weight: bold;
      color: var(--font-primary-color);
      position: relative;

      & .connect-state {
        padding: 5px 10px;
        border: 1px solid var(--border-color);
        position: absolute;
        top: 50%;
        right: 0;
        border-radius: 5px;
        transform: translate(120%, -50%);
        display: flex;
        justify-content: space-around;
        align-items: center;
        gap: 5px;

        & .connect-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;

          &-connecting {
            background-color: orange;
            box-shadow: 0 0 5px orange;
            animation: blink 1.5s infinite;
          }

          &-connected {
            background-color: #4caf50;
            box-shadow: 0 0 5px #4caf50;
          }

          &-disconnected {
            background-color: red;
            box-shadow: 0 0 5px red;
          }
        }

        & .connect-info {
          font-size: 12px;
          color: #ffffff;
        }
      }
    }

    & .org-sec {
      font-size: 20px;
      font-weight: bold;
      color: var(--font-primary-color);
    }

    & .contest-sec {
      font-size: 16px;
      margin-top: 16px;
      color: var(--font-secondary-color);
    }
  }

  & .tools-sec {
    display: flex;
    gap: 25px;
    align-items: center;
  }
}

.count-badge {
  margin-left: 8px;
  color: #909399;
  font-size: 12px;
}

.primary-button {
  padding: 25px 30px;
  border-radius: 10px;
  font-size: 20px;

  transition: all 0.3s ease;
  transform: scale(1);

  &:hover {
    transform: scale(1.05);
  }
}

:deep(.el-badge) {
  outline: none;

  & .el-button {
    outline: none;

    &:focus,
    &:focus-visible,
    &:hover {
      outline: none !important;
    }
  }
}

:deep(.el-button) {
  &:focus,
  &:focus-visible {
    outline: none !important;
  }
}

:deep(.el-dropdown) {
  .el-button {
    background-color: var(--bg-secondary-color);
    border: 1px solid var(--border-color);
    color: var(--font-primary-color);

    &:hover:not(.is-disabled) {
      background-color: var(--bg-primary-color);
    }

    &.is-disabled {
      background-color: var(--bg-secondary-color);
      border-color: var(--border-color);
      opacity: 0.5;
    }
  }
}

:deep(.el-badge) {
  .el-button {
    background-color: var(--bg-secondary-color);
    border: 1px solid var(--border-color);

    &:hover:not(.is-disabled) {
      background-color: var(--bg-primary-color);
    }
  }
}
</style>
