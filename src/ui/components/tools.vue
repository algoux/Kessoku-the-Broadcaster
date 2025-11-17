<script lang="ts">
import { Vue, Options } from 'vue-class-component';

import SettingsIcon from './svgs/settings.vue';
import ScreenShare from './svgs/screen-share.vue';
import WebCamera from './svgs/web-camera.vue';
import HomeIcon from './svgs/home.vue';
import CircleUser from './svgs/circle-user.vue';
import { ElTooltip } from 'element-plus';

@Options({
  components: {
    SettingsIcon,
    ScreenShare,
    WebCamera,
    HomeIcon,
    ElTooltip,
    CircleUser,
  },
})
export default class Tools extends Vue {}
</script>

<template>
  <div class="tools">
    <div class="tools-section tools-buttons">
      <div class="icon-container">
        <ElTooltip content="用户信息" placement="right" effect="light">
          <circle-user />
        </ElTooltip>
      </div>
      <div class="icon-container">
        <ElTooltip content="屏幕共享画面" placement="right">
          <ScreenShare />
        </ElTooltip>
      </div>
      <div class="icon-container">
        <ElTooltip content="摄像头画面" placement="right">
          <WebCamera />
        </ElTooltip>
      </div>
      <span class="line"></span>
    </div>
    <div class="tools-section settings">
      <div class="icon-container">
        <SettingsIcon />
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.tools {
  width: 50px;
  height: 100vh;
  position: fixed;
  left: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: center;
  padding: 20px 0;
  background-color: var(--bg-secondary-color);

  & .tools-buttons {
    position: relative;
    & .line {
      position: absolute;
      bottom: -10px;
      left: 50%;
      transform: translateX(-50%);
      width: 30px;
      height: 2px;
      background-color: rgba(196, 196, 196, 0.7);
    }
  }

  & .tools-section {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }
}

.icon-container {
  width: 60%;
  aspect-ratio: 1;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff;
  box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s ease;

  // 移除点击后的焦点边框
  &:focus,
  &:focus-visible,
  &:active {
    outline: none;
    border: none;
  }

  // 移除 ElTooltip 触发器的焦点边框
  :deep(.el-tooltip__trigger) {
    outline: none !important;
    border: none !important;

    &:focus,
    &:focus-visible,
    &:active {
      outline: none !important;
      border: none !important;
    }
  }

  // 悬停效果
  &:hover {
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  & svg {
    width: 80%;
    height: 80%;
  }
}
</style>
