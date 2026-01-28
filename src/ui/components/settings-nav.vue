<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import SettingsIcon from './svgs/settings.vue';

@Options({
  components: {
    SettingsIcon,
  },
})
export default class SettingsNav extends Vue {}
</script>

<template>
  <div class="settings-nav">
    <div class="settings-button">
      <settings-icon style="height: 18px" />
      <span>通用</span>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-nav {
  width: 30%;
  height: 100%;
  padding-top: 40px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: center;
  background-color: transparent;
  & .settings-button {
    width: 85%;
    height: 40px;
    display: flex;
    justify-content: flex-start;
    align-items: center;
    gap: 6px;
    font-size: 16px;
    border-radius: 5px;
    padding-left: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    &:hover {
      background-color: rgba(194, 194, 194, 0.5);
    }
    color: var(--font-primary-color);
  }
}
</style>
