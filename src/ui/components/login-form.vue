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
    name: 'A20 - Wujinhao',
  };

  isLoading = false;

  async onSubmit() {
    if (!this.form.name.trim()) {
      console.error('选手端名称不能为空');
      return;
    }

    this.isLoading = true;

    try {
      console.log('🔐 开始登录, 选手端名称:', this.form.name);
      const result = await window.electron.login(this.form.name.trim());

      if (result.success) {
        console.log('✅ 登录成功');
      } else {
        console.error('❌ 登录失败:', result.error);
      }
    } catch (error) {
      console.error('❌ 登录过程中出现错误:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
</script>

<template>
  <el-form v-model="form" label-width="auto" style="max-width: 400px; width: 100%">
    <el-form-item label="选手端名称">
      <el-input v-model="form.name" placeholder="请输入选手端名称" :disabled="isLoading" />
    </el-form-item>
    <el-form-item>
      <el-button
        type="primary"
        @click="onSubmit"
        :loading="isLoading"
        :disabled="!form.name.trim()"
        style="width: 100%"
      >
        {{ isLoading ? '连接中...' : '登录' }}
      </el-button>
    </el-form-item>
  </el-form>
</template>
