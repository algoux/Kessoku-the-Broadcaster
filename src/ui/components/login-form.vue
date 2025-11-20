<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import { ElFormItem, ElForm, ElButton, ElInput, ElMessage } from 'element-plus';
import { Inject } from 'vue-property-decorator';

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
    name: 'A20 - wjh',
  };

  isLoading: boolean = false;

  async onSubmit() {
    if (!this.form.name.trim()) {
      ElMessage.error({
        message: '选手端名称不能为空',
        plain: true,
      });
      return;
    }

    this.isLoading = true;

    try {
      console.log('🔐 开始登录, 选手端名称:', this.form.name);
      const result = await window.electron.login(this.form.name.trim());

      if (result.success) {
        console.log('✅ 登录成功');
      } else {
        ElMessage.error({
          message: `${result.error}`,
          plain: true,
        });
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
        登陆
      </el-button>
    </el-form-item>
  </el-form>
</template>
