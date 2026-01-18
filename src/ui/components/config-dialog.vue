<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { DeviceManager } from '@/services/device-manager';

import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElButton,
} from 'element-plus';
import { Inject, Prop, Watch } from 'vue-property-decorator';

@Options({
  components: {
    ElDialog,
    ElForm,
    ElFormItem,
    ElInputNumber,
    ElSelect,
    ElOption,
    ElButton,
  },
})
export default class ConfigDialog extends Vue {
  @Prop({ required: true })
  deviceManager!: DeviceManager;

  @Inject()
  configDialogVisible: boolean;

  @Inject()
  closeConfigDialog: Function;

  // 强制更新的 key
  private componentKey = 0;

  // 监听对话框打开
  @Watch('configDialogVisible')
  onDialogChange(newVal: boolean) {
    if (newVal) {
      this.deviceManager.updateSimulcastBitrates();
      this.forceUpdate();
    }
  }

  /**
   * 获取 simulcast 配置列表（用于显示）
   */
  get simulcastConfigs() {
    const configForm = this.deviceManager.configForm as any;
    const configs = configForm?.simulcastConfigs || [];
    return configs;
  }

  /**
   * 获取当前选中的通道 rid
   */
  get selectedChannelRid(): string {
    const selected = this.deviceManager.getSelectedSimulcastChannel();
    return selected?.rid || 'original';
  }

  /**
   * 设置当前选中的通道 rid
   */
  set selectedChannelRid(rid: string) {
    this.deviceManager.selectSimulcastChannel(rid);
    this.forceUpdate();
  }

  /**
   * 获取帧率选项
   */
  get frameRateOptions() {
    const maxFrameRate = this.deviceManager.currentConfigDevice?.capabilities?.frameRate?.max;
    if (maxFrameRate >= 60) {
      return [60, 30];
    } else {
      return [30];
    }
  }

  /**
   * 转换 rid 名称
   */
  private convertRidName(rid: string): string {
    const nameMap: Record<string, string> = {
      original: '原画',
      low: '低清',
      medium: '中清',
      high: '高清',
    };
    return nameMap[rid] || rid;
  }

  /**
   * 格式化 simulcast 配置显示
   */
  private formatSimulcastConfig(config: any): string {
    const name = this.convertRidName(config.rid);
    const bitrate = Math.round(config.maxBitRate);
    const scale = config.scaleResolutionDownBy;
    return `${name} (${scale}x) @ ${bitrate} Kbps`;
  }

  /**
   * 处理码率选择变化
   */
  private onSimulcastChange(rid: string) {
    this.deviceManager.selectSimulcastChannel(rid);
    this.forceUpdate();
  }

  /**
   * 处理预设分辨率变化
   */
  private onPresetChange(presetStr: string) {
    this.deviceManager.applyPreset(presetStr);
    this.deviceManager.updateSimulcastBitrates();
    this.forceUpdate();
  }

  /**
   * 处理帧率变化
   */
  private onFrameRateChange() {
    this.deviceManager.updateSimulcastBitrates();
    this.forceUpdate();
  }

  /**
   * 处理通道模式变化
   */
  private onChannelModeChange(mode: 'mono' | 'stereo') {
    // 根据通道模式自动设置声道数
    this.deviceManager.configForm.channelCount = mode === 'stereo' ? 2 : 1;
    this.forceUpdate();
  }

  /**
   * 强制组件更新
   */
  private forceUpdate() {
    this.componentKey++;
  }
}
</script>

<template>
  <el-dialog
    :model-value="configDialogVisible"
    @close="closeConfigDialog"
    :title="`配置 - ${deviceManager.currentConfigDevice?.name}`"
    width="500px"
    :close-on-click-modal="false"
    align-center
  >
    <el-form
      v-if="deviceManager.currentConfigDevice.type === 'microphone'"
      :model="deviceManager.configForm"
      label-width="100px"
      style="margin-top: 15px"
    >
      <el-form-item label="通道模式">
        <el-select
          v-model="deviceManager.configForm.channelMode"
          placeholder="选择通道模式"
          @change="onChannelModeChange"
        >
          <el-option label="单声道 (Mono)" value="mono" />
          <el-option label="立体声 (Stereo)" value="stereo" />
        </el-select>
      </el-form-item>

      <el-form-item label="采样率">
        <el-input-number
          v-model="deviceManager.configForm.sampleRate"
          :min="deviceManager.currentConfigDevice.capabilities?.sampleRate?.min || 8000"
          :max="deviceManager.currentConfigDevice.capabilities?.sampleRate?.max || 48000"
          :step="1"
          controls-position="right"
        />
      </el-form-item>

      <el-form-item label="支持范围">
        <div class="capabilities-info">
          <p v-if="deviceManager.currentConfigDevice?.capabilities">
            采样率:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.sampleRate.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.sampleRate.max) }}
            Hz
          </p>
          <p v-else>待获取设备参数信息</p>
        </div>
      </el-form-item>
    </el-form>
    <el-form v-else :model="deviceManager.configForm" label-width="100px" style="margin-top: 15px">
      <el-form-item label="预设分辨率">
        <el-select
          v-model="deviceManager.selectedPreset"
          placeholder="选择预设"
          @change="onPresetChange"
        >
          <el-option
            v-for="preset in deviceManager.getResolutionPresets()"
            :key="`${preset.width}x${preset.height}`"
            :label="preset.label"
            :value="JSON.stringify({ width: preset.width, height: preset.height })"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="帧率">
        <el-select
          v-model="deviceManager.configForm.frameRate"
          placeholder="选择帧率"
          @change="onFrameRateChange"
        >
          <el-option
            v-for="fps in frameRateOptions"
            :key="fps"
            :label="`${fps} fps`"
            :value="fps"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="码率">
        <el-select
          :key="componentKey"
          v-model="selectedChannelRid"
          placeholder="选择码率"
          @change="onSimulcastChange"
        >
          <el-option
            v-for="config in simulcastConfigs"
            :key="config.rid"
            :value="config.rid"
            :label="formatSimulcastConfig(config)"
          >
            <span>{{ formatSimulcastConfig(config) }}</span>
          </el-option>
        </el-select>
      </el-form-item>

      <el-form-item label="支持范围">
        <div class="capabilities-info">
          <p v-if="deviceManager.currentConfigDevice.capabilities">
            宽度:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.width.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.width.max) }}<br />
            高度:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.height.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.height.max) }}<br />
            帧率:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate.max) }}
            fps
          </p>
          <p v-else>待获取设备参数信息</p>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="closeConfigDialog">取消</el-button>
        <el-button type="primary" @click="$emit('save')">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="less">
.resolution-inputs {
  display: flex;
  align-items: center;
  gap: 10px;

  .resolution-separator {
    font-size: 18px;
    font-weight: bold;
    color: var(--font-primary-color);
  }

  :deep(.el-input-number) {
    width: 140px;
  }
}

.capabilities-info {
  padding: 10px;
  background: var(--bg-secondary-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 12px;
  color: var(--font-secondary-color);

  p {
    margin: 0;
    line-height: 1.8;
  }
}
</style>
