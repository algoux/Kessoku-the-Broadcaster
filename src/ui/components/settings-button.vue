<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import SettingsIcon from './svgs/settings.vue';
import SysSettingsIcon from './svgs/sys-settings.vue';

@Options({
  components: {
    SettingsIcon,
    SysSettingsIcon
  },
})
export default class SettingsButton extends Vue {
  openSettingsWindow() {
    window.electron.openSettingsWindow();
  }
}
</script>

<template>
  <div class="open-settings-button" @click="openSettingsWindow">
    <sys-settings-icon style="width: 70%; height: 70%; color: var(--font-secondary-color)" />
  </div>
</template>

<style scoped lang="less">
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
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.3s ease;
  transform: scale(1);
  &:hover {
    box-shadow: 0 2px 7px rgba(0, 0, 0, 0.1);
    transform: scale(1.05);
  }
}
</style>
