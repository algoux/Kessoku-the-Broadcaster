import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
import HomeView from '@/modules/home/home.view.vue';
import LoginView from '@/modules/login/login.view.vue';
import SettingsView from '@/modules/settings/settings.view.vue';
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: HomeView,
    meta: {
      title: '设备总揽',
    },
  },
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: {
      title: '用户登录',
    },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsView,
    meta: {
      title: '设置',
    },
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;
