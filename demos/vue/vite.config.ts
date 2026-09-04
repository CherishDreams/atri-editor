import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // atri-editor 是原生自定义元素，别让 Vue 当组件解析
          isCustomElement: (tag) => tag.startsWith('atri-'),
        },
      },
    }),
  ],
  server: {
    port: 3001,
    open: false,
  },
});
