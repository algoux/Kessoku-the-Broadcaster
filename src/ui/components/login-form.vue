<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { ElFormItem, ElForm, ElButton, ElInput, ElMessage } from 'element-plus';

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
    alias: '',
    userId: '',
    token: '',
  };

  isLoading: boolean = false;

  async onSubmit() {
    if (!this.form.alias.trim()) {
      ElMessage.error({
        message: '比赛 Alias 不能为空',
        plain: true,
      });
      return;
    }

    if (!this.form.userId.trim()) {
      ElMessage.error({
        message: '用户 ID 不能为空',
        plain: true,
      });
      return;
    }

    if (!this.form.token.trim()) {
      ElMessage.error({
        message: 'Token 不能为空',
        plain: true,
      });
      return;
    }

    this.isLoading = true;

    try {
      console.log('开始登录, UserId:', this.form.userId, 'Alias:', this.form.alias);

      // 传递 alias, userId, token 三个参数
      const result = await window.electron.login(
        this.form.alias.trim(),
        this.form.userId.trim(),
        this.form.token.trim(),
      );

      if (result.success) {
        console.log('登录成功');
      } else {
        ElMessage.error({
          message: `${result.error}`,
          plain: true,
        });
      }
    } catch (error) {
      console.error('登录过程中出现错误:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
</script>

<template>
  <el-form v-model="form" label-width="auto" style="max-width: 400px; width: 100%">
    <el-form-item label="Alias">
      <el-input v-model="form.alias" placeholder="请输入比赛 alias" :disabled="isLoading" />
    </el-form-item>
    <el-form-item label="UserID">
      <el-input v-model="form.userId" placeholder="请输入用户 ID" :disabled="isLoading" />
    </el-form-item>
    <el-form-item label="Token">
      <el-input v-model="form.token" placeholder="请输入 Token" :disabled="isLoading" />
    </el-form-item>
    <el-form-item>
      <el-button
        type="primary"
        @click="onSubmit"
        :loading="isLoading"
        :disabled="!form.alias.trim() || !form.userId.trim() || !form.token.trim()"
        style="width: 100%"
      >
        登录
      </el-button>
    </el-form-item>
  </el-form>
</template>
