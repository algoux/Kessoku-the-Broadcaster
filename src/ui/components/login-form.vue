<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { ElFormItem, ElForm, ElButton, ElInput } from 'element-plus';

@Options({
  components: {
    ElForm,
    ElFormItem,
    ElButton,
    ElInput,
  },
})
export default class LoginForm extends Vue {
  form = {
    name: 'wjh',
  };

  onSubmit() {
    console.log('Form submitted:', this.form);
    window.electron.loginSuccess();
  }
}
</script>

<template>
  <el-form v-model="form" label-width="auto" style="max-width: 600px; width: 100%">
    <el-form-item label="Activity name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item label="Activity name">
      <el-input v-model="form.name" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" @click="onSubmit">Create</el-button>
      <el-button>Cancel</el-button>
    </el-form-item>
  </el-form>
</template>
