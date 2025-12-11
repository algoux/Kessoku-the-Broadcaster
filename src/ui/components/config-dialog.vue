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
import { Inject, Prop } from 'vue-property-decorator';
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

  get frameRateOptions() {
    const maxFrameRate = this.deviceManager.currentConfigDevice?.capabilities?.frameRate?.max;

    if (maxFrameRate >= 60) {
      return [60, 30];
    } else {
      return [30];
    }
  }

  get simulcastOptions() {
    const width = this.deviceManager.configForm?.width;
    const height = this.deviceManager.configForm?.height;
    const frameRate = this.deviceManager.configForm?.frameRate;

    // 原画码率：width * height * frameRate * 0.000078125
    const originalBitrate = Math.round(width * height * frameRate * 0.000078125);

    // 低清码率：(width/4) * (height/4) * frameRate * 0.000078125
    const lowBitrate = Math.round((width / 4) * (height / 4) * frameRate * 0.000078125);

    return [
      { rid: 'original', scaleResolutionDownBy: 1.0, maxBitrate: originalBitrate },
      { rid: 'low', scaleResolutionDownBy: 4.0, maxBitrate: lowBitrate },
    ];
  }

  private convertRidName(rid: string) {
    switch (rid) {
      case 'original':
        return '原画';
      case 'low':
        return '低清';
      default:
        return rid;
    }
  }

  private formatSimulcastConfig(rid: string, maxBitrate: number) {
    return `${this.convertRidName(rid)} @ ${Math.round(maxBitrate)} Kbps`;
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
      <el-form-item label="采样率">
        <el-input-number
          v-model="deviceManager.configForm.sampleRate"
          :min="deviceManager.currentConfigDevice.capabilities.sampleRate.min"
          :max="deviceManager.currentConfigDevice.capabilities.sampleRate.max"
          :step="1"
          controls-position="right"
        />
      </el-form-item>

      <el-form-item label="声道数">
        <el-input-number
          v-model="deviceManager.configForm.channelCount"
          :min="deviceManager.currentConfigDevice.capabilities.channelCount.min"
          :max="deviceManager.currentConfigDevice.capabilities.channelCount.max"
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
            Hz<br />
            声道数:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.channelCount.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.channelCount.max) }}<br />
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
          @change="deviceManager.applyPreset"
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
        <el-select v-model="deviceManager.configForm.frameRate" placeholder="选择帧率">
          <el-option
            v-for="fps in frameRateOptions"
            :key="fps"
            :label="`${fps} fps`"
            :value="fps"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="码率">
        <el-select :placeholder="'选择码率'" v-model="deviceManager.configForm.simulcastConfig.rid">
          <el-option
            v-for="option in simulcastOptions"
            :key="option.rid"
            :label="formatSimulcastConfig(option.rid, option.maxBitrate)"
            :value="option.rid"
          />
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
  // background: rgba(0, 0, 0, 0.03);
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
