import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtriEditor',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [
        '@tiptap/core',
        '@tiptap/pm',
        '@tiptap/extensions',
        '@tiptap/starter-kit',
        '@tiptap/markdown',
        '@tiptap/extension-text-align',
        '@floating-ui/dom',
        'i18next',
      ],
    },
    sourcemap: true,
    minify: false,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
