<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import SettingsNav from '@/components/settings-nav.vue';
import SettingsContent from '@/components/settings-content.vue';

@Options({
  components: {
    SettingsNav,
    SettingsContent,
  },
})
export default class SettingsView extends Vue {}
</script>

<template>
  <div class="settings-view">
    <settings-nav />
    <settings-content />
  </div>
</template>

<style scoped lang="less">
.settings-view {
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}
</style>
