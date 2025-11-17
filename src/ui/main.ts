import './index.less';
import 'element-plus/dist/index.css';
import { createApp } from 'vue';
import App from './app.vue';
import router from './router';

createApp(App).use(router).mount('#app');
