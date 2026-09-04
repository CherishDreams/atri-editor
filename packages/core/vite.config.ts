import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtriEditor',
      // 只出 ESM：上游 tiptap v3 是纯 ESM，浏览器库在 Node 里也没有 DOM 可运行，
      // 保留 cjs 形态只会让 require() 得到半坏的 interop
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // '@tiptap/pm' 精确匹配拦不住 '@tiptap/pm/state' 这类子路径，
      // 漏掉就会把一份 ProseMirror 内联进产物：消费端和 @tiptap/core 自带的那份
      // 各自有 createKey 计数器，无 key 插件会撞出 "Adding different instances of a keyed plugin"
      external: (id) =>
        [
          '@tiptap/core',
          '@tiptap/extensions',
          '@tiptap/starter-kit',
          '@tiptap/markdown',
          '@tiptap/extension-bubble-menu',
          '@tiptap/extension-image',
          '@tiptap/extension-text-align',
          '@floating-ui/dom',
          'i18next',
        ].includes(id) || id.startsWith('@tiptap/pm/'),
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
