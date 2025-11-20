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
  mounted() {
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && ['=', '-', '0'].includes(e.key)) {
        e.preventDefault();
      }
    });
  }
}
</script>

<template>
  <router-view />
</template>
