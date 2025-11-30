<script lang="ts">
import { Vue, Options } from 'vue-class-component';

import LoginView from './modules/login/login.view.vue';
import HomeView from './modules/home/home.view.vue';
import Tools from './components/tools.vue';

@Options({
  components: {
    LoginView,
    HomeView,
    Tools,
  },
})
export default class App extends Vue {
  async mounted() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['=', '-', '0'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.metaKey && e.key == ',') {
        e.preventDefault();
        window.electron.openSettingsWindow()
      }
    });
  }
}
</script>

<template>
  <div class="window-drag"></div>
  <router-view />
</template>

<style scoped lang="less">
.window-drag {
  position: fixed;
  top: 0;
  width: 100vw;
  height: 40px;
  -webkit-app-region: drag;
}
</style>
