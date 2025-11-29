import 'element-plus/dist/index.css';
import './index.less';
import { createApp } from 'vue';
import App from './app.vue';
import router from './routes';

createApp(App)
.use(router)
.mount('#app');
