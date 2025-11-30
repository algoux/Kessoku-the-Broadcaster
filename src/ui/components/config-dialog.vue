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
      <el-form-item label="分辨率">
        <div class="resolution-inputs">
          <el-input-number
            v-model="deviceManager.configForm.width"
            :min="deviceManager.currentConfigDevice?.capabilities?.width?.min"
            :max="deviceManager.currentConfigDevice?.capabilities?.width?.max"
            :step="1"
            controls-position="right"
          />
          <span class="resolution-separator">×</span>
          <el-input-number
            v-model="deviceManager.configForm.height"
            :min="deviceManager.currentConfigDevice?.capabilities?.height?.min"
            :max="deviceManager.currentConfigDevice?.capabilities?.height?.max"
            :step="1"
            controls-position="right"
          />
        </div>
      </el-form-item>

      <el-form-item label="预设分辨率">
        <el-select
          v-model="deviceManager.selectedPreset"
          placeholder="选择预设"
          @change="deviceManager.applyPreset"
        >
          <el-option label="自定义" value="" />
          <el-option
            v-if="
              deviceManager.currentConfigDevice?.capabilities?.width?.max &&
              deviceManager.currentConfigDevice?.capabilities?.height?.max
            "
            label="设备最大分辨率"
            :value="
              JSON.stringify({
                width: Math.round(deviceManager.currentConfigDevice.capabilities.width.max),
                height: Math.round(deviceManager.currentConfigDevice.capabilities.height.max),
              })
            "
          />
          <el-option
            label="1920 × 1080 (Full HD)"
            :value="JSON.stringify({ width: 1920, height: 1080 })"
          />
          <el-option
            label="1280 × 720 (HD)"
            :value="JSON.stringify({ width: 1280, height: 720 })"
          />
          <el-option label="854 × 480 (SD)" :value="JSON.stringify({ width: 854, height: 480 })" />
          <el-option label="640 × 360" :value="JSON.stringify({ width: 640, height: 360 })" />
        </el-select>
      </el-form-item>

      <el-form-item label="帧率">
        <el-input-number
          v-model="deviceManager.configForm.frameRate"
          :min="deviceManager.currentConfigDevice?.capabilities?.frameRate?.min"
          :max="60"
          :step="1"
          controls-position="right"
        />
        <span style="margin-left: 10px">fps</span>
      </el-form-item>

      <el-form-item label="支持范围">
        <div class="capabilities-info">
          <p v-if="deviceManager.currentConfigDevice?.capabilities">
            宽度:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.width?.max) }}<br />
            高度:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.min) }} -
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.height?.max) }}<br />
            帧率:
            {{ Math.round(deviceManager.currentConfigDevice.capabilities.frameRate?.min) }} -
            {{ 60 }}
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
  background: var(--bg-primary-color);
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
