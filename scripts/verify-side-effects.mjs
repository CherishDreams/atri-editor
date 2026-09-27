/**
 * 校验 sideEffects 声明没有把 Web Component 的注册摇掉
 *
 * AtriEditorElement.ts 在模块顶层调 registerAtriElement()，README 推荐的元素用法
 * 又正是 `import '@atri-editor/core'` 这一条裸导入 —— 只要 package.json 把
 * dist/index.js 声明成无副作用，打包器就有理由整模块丢弃。
 *
 * 各打包器对这条声明的执行严格程度不同：rollup 保守到照样保留，esbuild 直接产出空包。
 * 所以这里用 esbuild 复现，它是最激进的那一个，也是 vite 预依赖（optimizeDeps）用的那一个。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = path.join(repoRoot, 'packages/core');
const entryFile = path.join(coreDir, 'dist/index.js');

/** 只 import、不取任何具名导出：这正是自定义元素用法的写法 */
const BARE_IMPORT_ENTRY = "import '@atri-editor/core';\n";

/**
 * @returns {Promise<{ bytes: number, defines: number }>} 产物字节数与 customElements.define 命中次数
 */
export async function bundleBareImport() {
  // 不先判这一步的话，没构建时的报错会是"注册被摇掉了"，把人往完全相反的方向带
  if (!fs.existsSync(entryFile)) {
    throw new Error(
      `packages/core/dist/index.js is missing — run "pnpm build" before "pnpm check".`
    );
  }

  const result = await build({
    stdin: {
      contents: BARE_IMPORT_ENTRY,
      resolveDir: coreDir,
      loader: 'js',
      sourcefile: 'bare-import.js',
    },
    absWorkingDir: repoRoot,
    bundle: true,
    write: false,
    format: 'esm',
    minify: false,
    logLevel: 'silent',
    // 上游依赖不参与本次判定，也避免把 node_modules 的解析面扯进来
    external: ['@tiptap/*', '@floating-ui/dom', 'i18next'],
    alias: { '@atri-editor/core': entryFile },
  });

  const code = result.outputFiles.map((file) => file.text).join('');

  return { bytes: code.length, defines: (code.match(/customElements\.define/g) ?? []).length };
}

export async function verifySideEffects() {
  const { bytes, defines } = await bundleBareImport();

  if (defines === 0) {
    throw new Error(
      `Bare-importing "@atri-editor/core" produced ${bytes} bytes with no customElements.define ` +
        'in it — the <atri-editor> element would never be registered. ' +
        'packages/core/package.json must list the JS entry in "sideEffects".'
    );
  }

  return { bytes, defines };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { bytes, defines } = await verifySideEffects();
    console.log(`sideEffects OK: bare import bundles ${bytes} bytes with ${defines} registration`);
  } catch (error) {
    console.error(String(error.message));
    process.exitCode = 1;
  }
}
