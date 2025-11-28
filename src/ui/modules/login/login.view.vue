<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import LoginForm from '@/components/login-form.vue';
import { Provide } from 'vue-property-decorator';

@Options({
  components: {
    LoginForm,
  },
})
export default class LoginView extends Vue {
  @Provide({ reactive: true })
  isLoading = false;

  @Provide()
  handleLoadingState(state: boolean) {
    this.isLoading = state;
  }
}
</script>

<template>
  <div class="login-view">
    <h1>登陆</h1>
    <div class="login-form-container">
      <LoginForm />
    </div>
  </div>
</template>

<style scoped lang="less">
.login-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;

  & h1 {
    color: var(--font-primary-color);
  }

  & .login-form-container {
    margin-top: 20px;
  }
}
</style>
