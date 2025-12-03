<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { Inject } from 'vue-property-decorator';
import { CanAddState, DeviceType } from 'common/modules/home/home.interface';

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

  get hasDeviceToAdd(): boolean {
    return (
      this.deviceManager.canAddState.screen > 0 ||
      this.deviceManager.canAddState.camera > 0 ||
      this.deviceManager.canAddState.microphone > 0
    );
  }
}
</script>

<template>
  <div class="home-header">
    <section class="user-sec">
      <div class="main-sec">A20 - Wujinhao</div>
      <div class="org-sec">山东理工大学</div>
      <div class="contest-sec">山东理工大学第十七届网络编程擂台赛</div>
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
      font-size: 30px;
      font-weight: bold;
      color: var(--font-primary-color);
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
