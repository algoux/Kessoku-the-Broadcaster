import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';
import HomeView from '@/modules/home/home.view.vue';
import LoginView from '@/modules/login/login.view.vue';

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
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

// router.afterEach((to) => {
//   const title = (to.meta.title as string) || '录屏助手';

//   document.title = title;

//   if (window.electron?.setWindowTitle) {
//     window.electron.setWindowTitle(title);
//   }
// });

export default router;
