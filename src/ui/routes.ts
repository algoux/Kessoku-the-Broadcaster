import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/modules/home/home.view.vue'),
    meta: {
      title: '设备总揽',
    },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/modules/login/login.view.vue'),
    meta: {
      title: '用户登录',
    },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/modules/settings/settings.view.vue'),
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
