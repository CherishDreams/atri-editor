import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
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
  server: {
    port: 3000,
    open: true,
  },
});
