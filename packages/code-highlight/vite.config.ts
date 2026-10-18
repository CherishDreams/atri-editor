import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync } from 'node:fs';

// 与 packages/core/vite.config.ts 同一条规则：external 从 package.json 的依赖清单派生，
// 不手抄第二份。手抄漏一项就会把上游整包内联进来（extension-table 那次多背 30 kB）。
// 对本包而言这条规则尤其要紧：lowlight / highlight.js 一旦被打进产物，
// "语法库由宿主按语言子集自选"这个设计就当场失效了。
const { dependencies = {}, peerDependencies = {} } = JSON.parse(
  readFileSync(resolve(__dirname, 'package.json'), 'utf-8')
);
const externalIds = new Set<string>([
  ...Object.keys(dependencies),
  ...Object.keys(peerDependencies),
]);

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'AtriCodeHighlight',
      formats: ['es'],
      fileName: () => 'index.js',
    },
    rollupOptions: {
      // '@tiptap/pm' 精确匹配拦不住 '@tiptap/pm/state' 这类子路径；漏掉就会内联出
      // 第二份 ProseMirror，而 keyed plugin 会撞出 "Adding different instances of a keyed plugin"
      external: (id) => externalIds.has(id) || id.startsWith('@tiptap/pm/'),
    },
    sourcemap: true,
    minify: false,
  },
});
