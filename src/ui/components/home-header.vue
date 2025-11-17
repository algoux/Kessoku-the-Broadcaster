<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { Inject } from 'vue-property-decorator';
import { CanAddState } from '@/common/modules/home/home.interface';

import CircleUser from '@/ui/components/svgs/circle-user.vue';
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
import PlayIcon from './svgs/play.vue';
import CirclePlus from './svgs/circle-plus.vue';
import Refresh from './svgs/refresh.vue';
import WebCamera from './svgs/web-camera.vue';
import ScreenShare from './svgs/screen-share.vue';
import Mic from './svgs/mic.vue';
import WebState from './svgs/web-state.vue';

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
  },
})
export default class HomeHeader extends Vue {
  @Inject()
  isReady!: boolean;

  @Inject()
  availableScreens!: Array<{ id: string; name: string }>;
  @Inject()
  availableCameras!: Array<MediaDeviceInfo>;
  @Inject()
  availableMicrophones!: Array<MediaDeviceInfo>;

  @Inject()
  canAddState!: CanAddState;

  @Inject()
  changeReadyState!: () => void;

  @Inject()
  addScreenDevice!: () => Promise<void>;

  @Inject()
  addCameraDevice!: () => Promise<void>;

  @Inject()
  addMicrophoneDevice!: () => Promise<void>;

  @Inject()
  refreshAllDevices!: () => Promise<void>;

  get hasDeviceToAdd(): boolean {
    return (
      this.canAddState.screen > 0 || this.canAddState.camera > 0 || this.canAddState.microphone > 0
    );
  }
}
</script>

<template>
  <header class="home-header">
    <section class="user-sec">
      <div class="main-sec">
        A20 - Wujinhao
      </div>
      <div class="org-sec">
        山东理工大学
      </div>
    </section>

    <section class="tools-sec">
      <!-- <el-tooltip effect="dark" content="重新检测可用设备源" placement="bottom">
        <el-button circle @click="refreshAllDevices" :disabled="isReady">
          <refresh style="width: 20px" />
        </el-button>
      </el-tooltip> -->
      <el-badge v-if="hasDeviceToAdd" is-dot>
        <el-dropdown :disabled="isReady">
          <el-button circle :disabled="isReady" :size="'large'" >
            <circle-plus style="width: 20px" />
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="addScreenDevice">
                添加屏幕共享设备
                <span v-if="canAddState.screen > 0" class="count-badge"
                  >({{ canAddState.screen }})</span
                >
              </el-dropdown-item>
              <el-dropdown-item @click="addCameraDevice">
                添加摄像头设备
                <span v-if="canAddState.camera > 0" class="count-badge"
                  >({{ canAddState.camera }})</span
                >
              </el-dropdown-item>
              <el-dropdown-item @click="addMicrophoneDevice">
                添加麦克风设备
                <span v-if="canAddState.microphone > 0" class="count-badge"
                  >({{ canAddState.microphone }})</span
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
            <el-dropdown-item @click="addScreenDevice">
              添加屏幕共享设备
              <span v-if="canAddState.screen > 0" class="count-badge"
                >({{ canAddState.screen }})</span
              >
            </el-dropdown-item>
            <el-dropdown-item @click="addCameraDevice">
              添加摄像头设备
              <span v-if="canAddState.camera > 0" class="count-badge"
                >({{ canAddState.camera }})</span
              >
            </el-dropdown-item>
            <el-dropdown-item @click="addMicrophoneDevice">
              添加麦克风设备
              <span v-if="canAddState.microphone > 0" class="count-badge"
                >({{ canAddState.microphone }})</span
              >
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button :type="isReady ? 'danger' : 'primary'" @click="changeReadyState" class="primary-button">
        <play-icon style="width: 25px; margin-right: 5px" />
        {{ isReady ? '解除就绪状态' : '准备就绪' }}
      </el-button>
    </section>
  </header>
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
  background-color: var(--bg-glass-color);
  backdrop-filter: blur(15px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  z-index: 999;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 30px;

  & .user-sec {
    display: flex;
    flex-direction: column;
    gap: 30px;

    & .main-sec {
      font-size: 35px;
      font-weight: bold;
      color: var(--font-primary-color);
    }

    & .org-sec {
      font-size: 24px;
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
  width: 180px;
  height: 60px;
  border-radius: 10px;
  font-size: 20px;
} 
</style>
