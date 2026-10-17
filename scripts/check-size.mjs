/**
 * 体积预算闸门
 *
 * 量的是"消费方打包时因为装了本包而多背的字节"：把 dist/index.js 再走一遍 esbuild
 * minify，并沿用 packages/core/vite.config.ts 那套 external 规则（从 package.json 的
 * dependencies + peerDependencies 派生，外加 '@tiptap/pm/*' 子路径）。external 必须
 * 两边一致，否则这里量到的是上游扩展的体积，而不是本包自己的。
 *
 * 发布产物本身保持 minify: false —— 那才让 index.js.map 与 verify-side-effects 的
 * bundle 判定有意义；闸的是派生出来的 minify + gzip 值。
 *
 * 用法：pnpm size [--why]
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 预算表内联在此：改数字就是 PR 里一次看得见的决定，而不是去翻第三份配置。
 * 基线取自本次实测，留出增量余量给本轮的基础格式能力。
 */
const BUDGETS = {
  core: {
    jsMinified: 128_000,
    jsGzip: 32 * 1024,
    cssGzip: 6 * 1024,
  },
};

function listPublishablePackages() {
  const packagesDir = path.join(repoRoot, 'packages');
  return fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((dir) => {
      const manifest = path.join(packagesDir, dir, 'package.json');
      if (!fs.existsSync(manifest)) return false;
      return JSON.parse(fs.readFileSync(manifest, 'utf-8')).private !== true;
    });
}

/** 与 vite.config.ts:7-29 同一条规则，改动必须两处同改 */
function externalsOf(pkgDir) {
  const { dependencies = {}, peerDependencies = {} } = JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')
  );
  return [...new Set([...Object.keys(dependencies), ...Object.keys(peerDependencies)])];
}

async function measureBundle(entryFile, external) {
  if (!fs.existsSync(entryFile)) {
    throw new Error(
      `${path.relative(repoRoot, entryFile)} is missing — run "pnpm build" before "pnpm size".`
    );
  }

  const result = await build({
    entryPoints: [entryFile],
    absWorkingDir: repoRoot,
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    minify: true,
    logLevel: 'silent',
    external,
  });

  const code = result.outputFiles.map((file) => file.text).join('');
  return {
    raw: Buffer.byteLength(code),
    gzip: zlib.gzipSync(Buffer.from(code), { level: 9 }).length,
    brotli: zlib.brotliCompressSync(Buffer.from(code), {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}

/**
 * 归因要另跑一趟：dist/index.js 已经是单文件 bundle，metafile 里只有它自己一个输入，
 * 说不出是谁涨的。从 src/index.ts 重新打包才能拿到按源文件归属的 bytesInOutput。
 */
async function attributeFromSource(pkgDir, external) {
  const result = await build({
    entryPoints: [path.join(pkgDir, 'src/index.ts')],
    absWorkingDir: repoRoot,
    bundle: true,
    write: false,
    format: 'esm',
    target: 'es2020',
    minify: true,
    logLevel: 'silent',
    metafile: true,
    external,
  });
  return result.metafile;
}

/** 超预算时把字节数从大到小列出来，让一次红 CI 自己能说清是谁涨的 */
async function printTopModules(pkgDir, external) {
  const metafile = await attributeFromSource(pkgDir, external);
  // bytesInOutput 挂在 outputs 那一侧：inputs 只有源文件大小，说不出谁被摇掉了
  const output = Object.values(metafile.outputs)[0];
  if (!output) return;

  const inputs = Object.entries(output.inputs)
    .filter(([key]) => !key.includes('node_modules'))
    .sort((a, b) => b[1].bytesInOutput - a[1].bytesInOutput);

  console.log('\n从 src/index.ts 重新打包后，minified 输出里占比最高的源模块：');
  for (const [key, value] of inputs.slice(0, 10)) {
    console.log(`  ${String(value.bytesInOutput).padStart(7)} B  ${key}`);
  }
}

function formatRow(label, actual, budget) {
  const over = budget !== undefined && actual > budget;
  const status = budget === undefined ? '' : over ? ' OVER' : ' ok';
  return `  ${label.padEnd(18)} ${String(actual).padStart(8)} B  ${status}`;
}

async function main() {
  const wantWhy = process.argv.includes('--why');
  const failures = [];

  for (const dir of listPublishablePackages()) {
    const pkgDir = path.join(repoRoot, 'packages', dir);
    const external = [...externalsOf(pkgDir), '@tiptap/pm/*'];
    const budget = BUDGETS[dir];

    const js = await measureBundle(path.join(pkgDir, 'dist/index.js'), external);
    console.log(`\npackages/${dir}  (${external.length} 个 external)`);
    console.log(formatRow('index.js minified', js.raw, budget?.jsMinified));
    console.log(formatRow('index.js gzip', js.gzip, budget?.jsGzip));
    console.log(formatRow('index.js brotli', js.brotli));

    const cssFile = path.join(pkgDir, 'dist/style.css');
    if (fs.existsSync(cssFile)) {
      const css = fs.readFileSync(cssFile);
      console.log(
        formatRow('style.css gzip', zlib.gzipSync(css, { level: 9 }).length, budget?.cssGzip)
      );
      console.log(formatRow('style.css raw', css.length));
    }

    if (!budget) {
      failures.push(
        `packages/${dir} 有产物但没有预算 —— 新发布包必须在此处补一条，体积纪律才对得上"重依赖出扩展包"的承诺。`
      );
      continue;
    }
    if (js.raw > budget.jsMinified) {
      failures.push(`packages/${dir} index.js minified ${js.raw} > ${budget.jsMinified}`);
    }
    if (js.gzip > budget.jsGzip) {
      failures.push(`packages/${dir} index.js gzip ${js.gzip} > ${budget.jsGzip}`);
    }
    if (wantWhy) await printTopModules(pkgDir, external);
  }

  if (failures.length) {
    console.error('\n体积预算未通过：');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log('\n体积预算通过');
}

try {
  await main();
} catch (error) {
  // 未构建等情况走这里：给一条人话，别抛堆栈。同 verify-side-effects.mjs 的约定
  console.error(String(error.message));
  process.exitCode = 1;
}
