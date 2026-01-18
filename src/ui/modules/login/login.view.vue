<script lang="ts">
import { Vue, Options } from 'vue-class-component';
import LoginForm from '@/components/login-form.vue';
import { Provide } from 'vue-property-decorator';
import SettingsButton from '@/components/settings-button.vue';

@Options({
  components: {
    LoginForm,
    SettingsButton,
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
    <img src="../../assets/icon.png" alt="" style="width: 100px; height: 100px;" />
    <h1>登录 Kessoku the Broadcaster</h1>
    <div class="login-form-container">
      <LoginForm />
    </div>
    <settings-button />
    <p class="copyright">© 2019-present algoUX. All Rights Reserved.</p>
  </div>
</template>

<style scoped lang="less">
.copyright {
  position: absolute;
  bottom: 10px;
  font-size: 12px;
  color: var(--font-secondary-color);
}

.login-view {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  background-color: var(--bg-secondary-color);
  position: relative;
  user-select: none;

  & h1 {
    color: var(--font-primary-color);
    font-weight: bold;
  }

  & .login-form-container {
    margin-top: 20px;
  }
}
</style>
