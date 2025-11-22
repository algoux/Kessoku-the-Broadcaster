import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/ui'),
    },
  },
  build: {
    outDir: 'dist/ui',
  },
  server: {
    port: 5123,
    strictPort: false,
  },
  define: {
    __dirname: 'import.meta.url',
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['electron'],
  },
});
