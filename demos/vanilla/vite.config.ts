import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  // 相对路径：部署到 GitHub Pages 的 /<repo>/demo/ 子路径下时，绝对路径会 404
  base: './',
  resolve: {
    alias: [
      // 顺序重要：/styles 必须排在主入口别名之前，否则会被前缀匹配抢走
      {
        find: '@atri-editor/core/styles',
        replacement: resolve(__dirname, '../../packages/core/src/styles/index.scss'),
      },
      {
        find: '@atri-editor/core',
        replacement: resolve(__dirname, '../../packages/core/src/index.ts'),
      },
    ],
  },
  css: {
    // legacy JS API 在 Dart Sass 2.0 移除，显式走 modern compiler
    preprocessorOptions: {
      scss: { api: 'modern-compiler' },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
