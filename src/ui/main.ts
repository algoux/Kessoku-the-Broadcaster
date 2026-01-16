import 'element-plus/dist/index.css';
import './index.less';
import 'element-plus/theme-chalk/dark/css-vars.css'

import { createApp } from 'vue';
import App from './app.vue';
import router from './routes';

createApp(App)
.use(router)
.mount('#app');
