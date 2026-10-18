/**
 * 校验每个可发布包的 sideEffects 声明没有把该保留的东西摇掉
 *
 * core 的 AtriEditorElement.ts 在模块顶层调 registerAtriElement()，而 README 推荐的元素
 * 用法又正是 `import '@atri-editor/core'` 这条裸导入 —— 只要 package.json 把 JS 入口
 * 声明成无副作用，打包器就有理由整模块丢弃。各打包器对这条声明的执行严格程度不同：
 * rollup 保守到照样保留，esbuild 直接产出空包。所以这里用 esbuild 复现，
 * 它是最激进的那一个，也是 vite 预依赖（optimizeDeps）用的那一个。
 *
 * 判据来自源码而不是写死的数字：包里有多少处 customElements.define，裸导入打包后就
 * 应该还剩多少处。这样第二个包（没有任何顶层副作用）不会被误判——对它来说"0 处注册"
 * 才是正确答案，而"产物非空"两边都要求。
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRATION = /customElements\.define/g;

/** packages/ 下所有非 private 的包 */
function listPublishablePackages() {
  const packagesDir = path.join(repoRoot, 'packages');
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .filter((dir) => {
      const manifest = path.join(packagesDir, dir, 'package.json');
      if (!existsSync(manifest)) return false;
      return JSON.parse(readFileSync(manifest, 'utf-8')).private !== true;
    });
}

function listSourceFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

/** 包里源码写了几处自定义元素注册 */
function registrationsInSource(pkgDir) {
  return listSourceFiles(path.join(repoRoot, 'packages', pkgDir, 'src')).reduce(
    (total, file) => total + (readFileSync(file, 'utf-8').match(REGISTRATION) ?? []).length,
    0
  );
}

/** 只 import、不取任何具名导出：这正是自定义元素用法的写法 */
async function bundleBareImport(pkgDir) {
  const absPkgDir = path.join(repoRoot, 'packages', pkgDir);
  const entryFile = path.join(absPkgDir, 'dist/index.js');
  const { name: pkgName } = JSON.parse(readFileSync(path.join(absPkgDir, 'package.json'), 'utf-8'));

  // 不先判这一步的话，没构建时的报错会是"注册被摇掉了"，把人往完全相反的方向带
  if (!existsSync(entryFile)) {
    throw new Error(
      `packages/${pkgDir}/dist/index.js is missing — run "pnpm build" before "pnpm check".`
    );
  }

  const { dependencies = {}, peerDependencies = {} } = JSON.parse(
    readFileSync(path.join(absPkgDir, 'package.json'), 'utf-8')
  );
  const external = [
    ...new Set([...Object.keys(dependencies), ...Object.keys(peerDependencies)]),
    '@tiptap/pm/*',
  ];

  const result = await build({
    stdin: {
      contents: `import '${pkgName}';\n`,
      resolveDir: absPkgDir,
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
    external,
    alias: { [pkgName]: entryFile },
  });

  const code = result.outputFiles.map((file) => file.text).join('');
  return { bytes: code.length, defines: (code.match(REGISTRATION) ?? []).length };
}

async function verifyPackage(pkgDir) {
  const expected = registrationsInSource(pkgDir);
  const { bytes, defines } = await bundleBareImport(pkgDir);

  if (bytes === 0) {
    throw new Error(
      `Bare-importing the "${pkgDir}" entry produced an empty bundle. Its package.json ` +
        'most likely declares the JS entry as side-effect-free while the entry itself ' +
        'is all the package exports.'
    );
  }

  if (defines !== expected) {
    throw new Error(
      `Bare import of packages/${pkgDir} kept ${defines} of ${expected} customElements.define ` +
        `call(s) (${bytes} bytes in the bundle). packages/${pkgDir}/package.json must list the ` +
        'JS entry in "sideEffects" — esbuild drops the whole module otherwise, so a custom ' +
        'element would never be registered.'
    );
  }

  return { bytes, defines, expected };
}

async function main() {
  const lines = [];
  for (const pkgDir of listPublishablePackages()) {
    const { bytes, defines, expected } = await verifyPackage(pkgDir);
    lines.push(
      `packages/${pkgDir}: bare import bundles ${bytes} bytes with ${defines}/${expected} registration(s)`
    );
  }
  console.log(`sideEffects OK:\n  ${lines.join('\n  ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    // 未构建之类的情况给一条人话，别抛堆栈
    console.error(String(error.message));
    process.exitCode = 1;
  }
}

export { main, verifyPackage };
