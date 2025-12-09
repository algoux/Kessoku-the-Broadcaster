<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { ElCheckbox, ElInput, ElButton } from 'element-plus';

@Options({
  components: {
    ElCheckbox,
    ElInput,
    ElButton,
  },
})
export default class SettingsContent extends Vue {
  appConfig = {
    autoOpenOnLogin: false,
    autoReady: false,
    videoCachePath: '',
  };

  async mounted() {
    await this.loadAppConfig();
  }

  async loadAppConfig() {
    const config = await window.electron.getAppConfig();
    this.appConfig = {
      autoOpenOnLogin: config.appConfig?.autoOpenOnLogin ?? false,
      autoReady: config.appConfig?.autoReady ?? false,
      videoCachePath: config.appConfig?.videoCachePath ?? '',
    };
  }

  async onAutoOpenOnLoginChange(value: boolean) {
    this.appConfig.autoOpenOnLogin = value;
    await window.electron.updateAppConfig({
      autoOpenOnLogin: value,
      autoReady: this.appConfig.autoReady,
      videoCachePath: this.appConfig.videoCachePath,
    });
    console.log('开机自启动设置已保存:', value);
  }

  async onAutoReadyChange(value: boolean) {
    this.appConfig.autoReady = value;
    await window.electron.updateAppConfig({
      autoOpenOnLogin: this.appConfig.autoOpenOnLogin,
      autoReady: value,
      videoCachePath: this.appConfig.videoCachePath,
    });
    console.log('启动时自动准备设置已保存:', value);
  }

  async onVideoCachePathChange() {
    await window.electron.updateAppConfig({
      autoOpenOnLogin: this.appConfig.autoOpenOnLogin,
      autoReady: this.appConfig.autoReady,
      videoCachePath: this.appConfig.videoCachePath,
    });
    console.log('视频缓存路径已保存:', this.appConfig.videoCachePath);
  }

  async clearCache() {
    const result = await window.electron.clearVideoCache();
    if (result.success) {
      alert(`清理成功！删除了 ${result.deletedCount || 0} 个缓存文件`);
    } else {
      alert(`清理失败: ${result.error || '未知错误'}`);
    }
  }
}
</script>

<template>
  <div class="settings-content">
    <div class="settings-content-box">
      <div class="settings-content-section">
        <p class="settings-content-section-title">系统设置</p>
        <el-checkbox v-model="appConfig.autoOpenOnLogin" @change="onAutoOpenOnLoginChange">
          开机自启动
        </el-checkbox>
        <el-checkbox v-model="appConfig.autoReady" @change="onAutoReadyChange">
          启动时自动准备
        </el-checkbox>
      </div>
      <div class="settings-content-section">
        <p class="settings-content-section-title">视频缓存路径</p>
        <div class="path-input-wrapper">
          <el-input
            v-model="appConfig.videoCachePath"
            placeholder="请输入视频缓存路径"
            @blur="onVideoCachePathChange"
          />
        </div>
        <el-button type="danger" @click="clearCache" style="width: 200px; margin-top: 10px">
          清理本地视频缓存
        </el-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
.settings-content {
  width: 70%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 5px;
  &-box {
    width: 100%;
    height: 100%;
    margin: auto;
    background-color: var(--bg-primary-color);
    border-radius: 10px;
    padding-top: 40px;
    padding-left: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &-section {
    width: 80%;
    height: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    color: var(--font-primary-color);
  }

  .path-input-wrapper {
    width: 100%;
    max-width: 500px;
  }
}
</style>
