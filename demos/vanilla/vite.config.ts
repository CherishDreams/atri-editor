import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  resolve: {
    alias: {
      '@atri-editor/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
});
