<script lang="ts">
import { Vue, Options } from 'vue-class-component';

@Options({})
export default class WindowControls extends Vue {
  isWindows = navigator.userAgent.includes('Windows');

  minimize() {
    window.electron.minimizeWindow();
  }

  maximize() {
    window.electron.maximizeWindow();
  }

  close() {
    window.electron.closeWindow();
  }
}
</script>

<template>
  <div v-if="isWindows" class="window-controls">
    <button class="window-control-btn minimize" @click="minimize" title="最小化">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <rect width="10" height="1" x="1" y="6" fill="currentColor" />
      </svg>
    </button>
    <button class="window-control-btn maximize" @click="maximize" title="最大化">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <rect width="9" height="9" x="1.5" y="1.5" fill="none" stroke="currentColor" />
      </svg>
    </button>
    <button class="window-control-btn close" @click="close" title="关闭">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <line x1="1" y1="1" x2="11" y2="11" stroke="currentColor" stroke-width="1" />
        <line x1="11" y1="1" x2="1" y2="11" stroke="currentColor" stroke-width="1" />
      </svg>
    </button>
  </div>
</template>

<style scoped lang="less">
.window-controls {
  position: fixed;
  top: 0;
  right: 0;
  display: flex;
  height: 40px;
  z-index: 9999;
  -webkit-app-region: no-drag;
}

.window-control-btn {
  width: 46px;
  height: 40px;
  border: none;
  background: transparent;
  color: #333;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s;

  &:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }

  &.close:hover {
    background-color: #e81123;
    color: white;
  }

  svg {
    pointer-events: none;
  }
}

/* 暗色模式支持 */
@media (prefers-color-scheme: dark) {
  .window-control-btn {
    color: #fff;

    &:hover {
      background-color: rgba(255, 255, 255, 0.1);
    }

    &.close:hover {
      background-color: #e81123;
      color: white;
    }
  }
}
</style>
