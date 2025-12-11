<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { DeviceManager } from '@/services/device-manager';
import { DeviceType } from '@/typings/data';
import {
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElButton,
  ElInputNumber,
} from 'element-plus';
import { Inject, Prop } from 'vue-property-decorator';

interface DeviceSource {
  id: string;
  name: string;
  deviceId?: string;
  label?: string;
}

@Options({
  components: {
    ElDialog,
    ElForm,
    ElFormItem,
    ElInput,
    ElSelect,
    ElOption,
    ElButton,
    ElInputNumber,
  },
})
export default class AddDeviceDialog extends Vue {
  @Prop({ required: true })
  deviceManager!: DeviceManager;

  @Prop({ required: true })
  deviceType!: DeviceType;

  @Inject()
  addDeviceDialogVisible: boolean;

  @Inject()
  closeAddDeviceDialog: Function;

  addDeviceForm = {
    classId: '',
    deviceId: '',
  };

  get availableSources(): DeviceSource[] {
    if (this.deviceType === 'screen') {
      return this.deviceManager.availableScreens
        .filter((screen) => !this.deviceManager.userDevices.some((d) => d.id === screen.id))
        .map((screen) => ({
          id: screen.id,
          name: screen.name,
        }));
    } else if (this.deviceType === 'camera') {
      return this.deviceManager.availableCameras
        .filter((camera) => !this.deviceManager.userDevices.some((d) => d.id === camera.deviceId))
        .map((camera) => ({
          id: camera.deviceId,
          name: camera.label,
          deviceId: camera.deviceId,
          label: camera.label,
        }));
    } else if (this.deviceType === 'microphone') {
      return this.deviceManager.availableMicrophones
        .filter((mic) => !this.deviceManager.userDevices.some((d) => d.id === mic.deviceId))
        .map((mic) => ({
          id: mic.deviceId,
          name: mic.label,
          deviceId: mic.deviceId,
          label: mic.label,
        }));
    }
    return [];
  }

  get dialogTitle(): string {
    const typeNames = {
      screen: '屏幕',
      camera: '摄像头',
      microphone: '麦克风',
    };
    return `添加${typeNames[this.deviceType]}`;
  }

  mounted() {
    // 默认选择第一个未使用的设备源
    if (this.availableSources.length > 0) {
      this.addDeviceForm.deviceId = this.availableSources[0].id;
    }

    // 生成默认 classId
    this.generateDefaultId();
  }

  generateDefaultId() {
    // 检查该类型是否已经有设备
    const hasDevices = this.deviceManager.userDevices.some((d) => d.type === this.deviceType);
    
    if (!hasDevices) {
      // 如果该类型还没有设备，使用 main
      this.addDeviceForm.classId = `${this.deviceType}_main`;
    } else {
      // 如果已经有设备，查找已使用的索引
      const existingIndices = new Set<number>();
      const prefix = `${this.deviceType}_`;
      let hasMain = false;

      this.deviceManager.userDevices
        .filter((d) => d.type === this.deviceType)
        .forEach((d) => {
          const suffix = d.classId.replace(prefix, '');
          if (suffix === 'main') {
            hasMain = true;
          } else {
            const index = parseInt(suffix);
            if (!isNaN(index)) {
              existingIndices.add(index);
            }
          }
        });

      // 如果没有 main 设备，使用 main
      if (!hasMain) {
        this.addDeviceForm.classId = `${this.deviceType}_main`;
      } else {
        // 找到最小的未使用索引
        let newIndex = 0;
        while (existingIndices.has(newIndex)) {
          newIndex++;
        }
        this.addDeviceForm.classId = `${this.deviceType}_${newIndex}`;
      }
    }
  }

  handleClose() {
    this.closeAddDeviceDialog();
  }

  handleConfirm() {
    this.$emit('confirm', {
      classId: this.addDeviceForm.classId,
      deviceId: this.addDeviceForm.deviceId,
    });
  }
}
</script>

<template>
  <el-dialog
    :model-value="addDeviceDialogVisible"
    @close="handleClose"
    :title="dialogTitle"
    width="500px"
    :close-on-click-modal="false"
    align-center
  >
    <el-form :model="addDeviceForm" label-width="100px">
      <el-form-item label="设备 ID">
        <el-input v-model="addDeviceForm.classId" placeholder="请输入设备 ID" />
      </el-form-item>

      <el-form-item label="设备源">
        <el-select v-model="addDeviceForm.deviceId" placeholder="选择设备源" style="width: 100%">
          <el-option
            v-for="source in availableSources"
            :key="source.id"
            :label="source.name"
            :value="source.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">取消</el-button>
        <el-button
          type="primary"
          @click="handleConfirm"
          :disabled="!addDeviceForm.deviceId || !addDeviceForm.classId"
        >
          确认添加
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped lang="less">
.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
