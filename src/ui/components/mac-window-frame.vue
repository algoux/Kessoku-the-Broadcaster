<script lang="ts">
import { Vue, Options } from 'vue-class-component';

@Options({})
export default class MacWindowFrame extends Vue {
  private isHovered = false;

  private closeWindow() {
    window.electron.sendFrameAction('CLOSE');
  }

  private minimizeWindow() {
    window.electron.sendFrameAction('MINIMIZE');
  }

  private maximizeWindow() {
    window.electron.sendFrameAction('MAXIMIZE');
  }
}
</script>

<template>
  <div class="mac-window-frame" @mouseenter="isHovered = true" @mouseleave="isHovered = false">
    <div class="traffic-lights">
      <div
        class="traffic-light close"
        :class="{ 'show-icon': isHovered }"
        title="关闭"
        @click="closeWindow"
      >
        <svg class="icon" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
          <line
            x1="2.5"
            y1="2.5"
            x2="7.5"
            y2="7.5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
          <line
            x1="7.5"
            y1="2.5"
            x2="2.5"
            y2="7.5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <div
        class="traffic-light minimize"
        :class="{ 'show-icon': isHovered }"
        title="最小化"
        @click="minimizeWindow"
      >
        <svg class="icon" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg">
          <line
            x1="2.5"
            y1="5"
            x2="7.5"
            y2="5"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
        </svg>
      </div>
      <div
        class="traffic-light maximize"
        :class="{ 'show-icon': isHovered }"
        title="最大化"
        @click="maximizeWindow"
      >
        <svg class="icon" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg">
          <!-- 左上角箭头 -->
          <path
            d="M 3 5.5 L 3 3 L 5.5 3"
            fill="none"
            stroke="currentColor"
            stroke-width="1.1"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M 3 3 L 5.5 5.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.1"
            stroke-linecap="round"
          />
          <!-- 右下角箭头 -->
          <path
            d="M 9 6.5 L 9 9 L 6.5 9"
            fill="none"
            stroke="currentColor"
            stroke-width="1.1"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <path
            d="M 9 9 L 6.5 6.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.1"
            stroke-linecap="round"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.mac-window-frame {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 40px;
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  padding-left: 20px;
  z-index: 10000;
  pointer-events: none;
  border-bottom: 1px solid var(--border-color);
}

.traffic-lights {
  display: flex;
  gap: 8px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
}

.traffic-light {
  position: relative;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  .icon {
    position: absolute;
    width: 10px;
    height: 10px;
    opacity: 0;
    transition: opacity 0.15s ease;
    color: rgba(0, 0, 0, 0.75);
  }

  &.show-icon .icon {
    opacity: 1;
  }

  &:active {
    transform: scale(0.9);
  }
}

.traffic-light.close {
  background: linear-gradient(180deg, #ff6159 0%, #ff5f57 100%);
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.1) inset,
    0 1px 2px rgba(0, 0, 0, 0.2);

  &:hover {
    background: linear-gradient(180deg, #ff8078 0%, #ff7976 100%);
  }

  &:active {
    background: linear-gradient(180deg, #bf4943 0%, #c04942 100%);
  }
}

.traffic-light.minimize {
  background: linear-gradient(180deg, #ffbd2e 0%, #ffbb2b 100%);
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.1) inset,
    0 1px 2px rgba(0, 0, 0, 0.2);

  &:hover {
    background: linear-gradient(180deg, #ffcb4d 0%, #ffc94a 100%);
  }

  &:active {
    background: linear-gradient(180deg, #bf8e23 0%, #c08f22 100%);
  }
}

.traffic-light.maximize {
  background: linear-gradient(180deg, #28c940 0%, #26c83e 100%);
  border: 0.5px solid rgba(0, 0, 0, 0.1);
  box-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.1) inset,
    0 1px 2px rgba(0, 0, 0, 0.2);

  &:hover {
    background: linear-gradient(180deg, #4dd45f 0%, #4bd35d 100%);
  }

  &:active {
    background: linear-gradient(180deg, #1e9630 0%, #1d972f 100%);
  }
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  .traffic-light {
    .icon {
      color: rgba(0, 0, 0, 0.85);
    }
  }

  .traffic-light.close {
    background: linear-gradient(180deg, #ec6a5e 0%, #eb685c 100%);

    &:hover {
      background: linear-gradient(180deg, #ff8078 0%, #ff7976 100%);
    }
  }

  .traffic-light.minimize {
    background: linear-gradient(180deg, #f4bf4f 0%, #f3bd4d 100%);

    &:hover {
      background: linear-gradient(180deg, #ffcb4d 0%, #ffc94a 100%);
    }
  }

  .traffic-light.maximize {
    background: linear-gradient(180deg, #61c554 0%, #5fc452 100%);

    &:hover {
      background: linear-gradient(180deg, #4dd45f 0%, #4bd35d 100%);
    }
  }
}
</style>
