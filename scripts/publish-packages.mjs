/**
 * publish-packages.mjs — 本仓库所有可发布包的幂等发布守卫
 *
 * 背景：changesets/action@v1 在「无 changeset」分支会无条件执行 publish 命令
 * （日志里那句 "Attempting to publish any unpublished packages" 只是文案，
 * 它不查任何 registry 或 tag），而本仓库的 0.1.0 是 2026-09-04 在 changesets
 * 引入之前手动发布的。裸 `npm publish` 每次 push main 都会撞上
 * "You cannot publish over the previously published versions" 的 403。
 *
 * 所以发布判重自己做：先查 npm registry（install-v1 摘要文档，含 versions 表），
 * 当前版本已存在则跳过；不存在才真正发布，成功后按 changesets 惯例
 * 打 `<name>@<version>` 的 git tag 并推回 origin。
 *
 * 为什么必须按包循环而不是只处理 core：changesets 的 publish 命令预期把**所有**
 * 未发布的包都发出去。守卫只认一个包的话，第二个包会永远被静默跳过——
 * 不报错、不留痕，只是 npm 上一直缺一个版本。
 *
 * 顺序执行，中途失败就停：此时 registry 上留下的是一个确定前缀
 * （排在前面的包已发完），重跑时那些包会走"已发布"分支跳过，补齐剩下的即可。
 *
 * 运行环境：GitHub Actions runner（Node 22，fetch 内置；netrc 已由 action 写好，
 * git push tag 可直接工作）。OIDC provenance 或 NPM_TOKEN 两条认证路径由
 * npm publish 子进程继承环境自行处理。注意 Trusted Publishing 是按包名授权的，
 * 全新的包名第一次发必须先在 npm org 里登记，否则只会拿到 401/403。
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryUrl = 'https://registry.npmjs.org/';

/**
 * packages/ 下所有非 private 的包，按依赖拓扑排序：被依赖的一方先发布。
 *
 * 不能按目录名排。两个理由叠在一起，第二个是致命的：
 * 1. code-highlight 的 peer 指向 core，core 的新版本还不在 registry 上就先发它，
 *    装出来那一刻就是一个引用着不存在版本的包；
 * 2. 更要紧的是下面主循环是"一失败就停"（为了不留下半发布状态）。字母序下
 *    code-highlight 排在 core 前面，而新包名的 npm Trusted Publishing 要先在 org 里登记
 *    才能发——没登记就是第一个失败，于是主包永远发不出去。
 *    一个可选扩展包的配置缺失，不该有能力挡住核心包的发布。
 */
function listPublishable() {
  const packagesDir = join(repoRoot, 'packages');
  const found = readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((dir) => {
      const manifest = join(packagesDir, dir, 'package.json');
      if (!existsSync(manifest)) return null;
      const pkg = JSON.parse(readFileSync(manifest, 'utf8'));
      if (pkg.private === true) return null;
      return {
        // relDir 从我们真正读过的那个 manifest 路径倒推，不拿 dir 再拼一次。
        // 上一版就是这么错的：dir 只是 packages/ 下的目录名，别处都拼绝对路径所以没事，
        // 唯独 npm publish ./<dir> 少了 packages/ 前缀，CI 里报
        // ENOENT .../atri-editor/core/package.json。这个分支本地从来走不到，
        // 所以只有真发布才会暴露
        relDir: relative(repoRoot, dirname(manifest)),
        name: pkg.name,
        version: pkg.version,
        // peer 也要算边：code-highlight 对 core 的依赖就写在 peerDependencies 里，
        // 只读 dependencies 的话这条边不存在，上面的拓扑排序会静默退化成字母序
        deps: { ...pkg.dependencies, ...pkg.peerDependencies },
      };
    })
    .filter((entry) => entry !== null);

  const publishableNames = new Set(found.map((entry) => entry.name));
  const placed = new Set();
  const ordered = [];

  // 只在"本仓库内部的依赖"这条边上排序，外部依赖不参与；有环就退到字母序，
  // 不让一个意外循环把发布卡死
  function visit(entry) {
    if (placed.has(entry.name)) return;
    placed.add(entry.name);
    for (const depName of Object.keys(entry.deps)) {
      if (depName === entry.name || !publishableNames.has(depName)) continue;
      const dep = found.find((candidate) => candidate.name === depName);
      if (dep) visit(dep);
    }
    ordered.push(entry);
  }

  found.forEach(visit);
  return ordered;
}

/**
 * 查 registry 当前版本是否已发布。网络与解析上的不确定一律按「未发布」处理，
 * 宁可让 npm publish 报 403 也不要误判未发布版本为已发布——
 * 前者是一次红 CI，后者是一个版本永远发不上去
 */
async function isPublished(name, version) {
  const encoded = name.replace('/', '%2F');
  try {
    const res = await fetch(`${registryUrl}${encoded}`, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    const doc = await res.json();
    return Object.prototype.hasOwnProperty.call(doc.versions ?? {}, version);
  } catch (err) {
    console.log(
      `[publish] registry lookup for ${name} failed (${err.message}); falling through to publish`
    );
    return false;
  }
}

function run(cmd, args, cwd = repoRoot) {
  const result = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * 产出发布用的目录：交给 `pnpm pack`，解包后取 package/。
 *
 * 为什么 npm 不直接 publish 仓库里那个目录：仓库写的是 pnpm 的 `workspace:` 协议
 * （code-highlight 的 peer 就是 `"@atri-editor/core": "workspace:^"`），而 npm 既不认
 * 这个协议也不改写它。0.1.0 就是这么原样上了 registry，结果任何外部
 * `npm install @atri-editor/code-highlight` 在解析 peer range 时就
 * `EUNSUPPORTEDPROTOCOL` 失败——包发出去了，谁也没装得上。
 *
 * 为什么不在仓库里直接写 `^0.4.0`：changesets 的 apply-release-plan 不动
 * peerDependencies（实测 8.1.0 全文无一处），写死的范围不会跟着 core 一起升，
 * core 到 0.5.0 之后 `^0.4.0` 正好把它排除在外，变成一条看起来完全合法的 ERESOLVE 冲突。
 *
 * 打包仍由 npm publish 对目录做，而不是 publish pnpm 产出的 tarball：provenance 是 npm
 * 在自己打包那一刻算的，沿用 core@0.4.0 已经跑通的那条路径，不改供应链证明的来源。
 */
function preparePublishDir(relDir) {
  const workDir = mkdtempSync(join(tmpdir(), 'atri-publish-'));
  try {
    if (run('pnpm', ['pack', '--pack-destination', workDir], join(repoRoot, relDir)) !== 0) {
      throw new Error('pnpm pack failed');
    }
    const tarball = readdirSync(workDir).find((file) => file.endsWith('.tgz'));
    if (!tarball) throw new Error('pnpm pack produced no tarball');
    if (run('tar', ['-xzf', join(workDir, tarball), '-C', workDir]) !== 0) {
      throw new Error('unpacking the pnpm tarball failed');
    }
    const pkgDir = join(workDir, 'package');
    if (!existsSync(join(pkgDir, 'package.json'))) throw new Error('no package.json in tarball');
    return { workDir, pkgDir };
  } catch (error) {
    rmSync(workDir, { recursive: true, force: true });
    throw error;
  }
}

/**
 * 发布前的最后一道闸：产物 manifest 里不该再有 workspace: 协议，也不该没有 license。
 *
 * 这两条都不是假设——前者是 0.1.0 已经踩过的坑，后者让 npm 页面把协议显示成 none。
 * 拦在这里是因为两种失败都要到 registry 上才发现，而 registry 上的版本改不了也删不回来。
 */
function assertPublishable(manifest, name) {
  const specs = {
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  };
  const leaked = Object.entries(specs).filter(([, spec]) => String(spec).startsWith('workspace:'));
  if (leaked.length > 0) {
    console.error(
      `[publish] ${name}: unresolved workspace: protocol in the publish manifest — ` +
        `npm cannot read these ranges. ${JSON.stringify(Object.fromEntries(leaked))}`
    );
    return false;
  }
  if (!manifest.license) {
    console.error(
      `[publish] ${name}: no "license" field — the registry would list this package as unlicensed.`
    );
    return false;
  }
  return true;
}

function tagRelease(name, version) {
  // 与 changesets 的发布 tag 同名同格式，未来 `changeset version` 用它做 base 比较
  const tagName = `${name}@${version}`;
  if (run('git', ['tag', tagName]) !== 0) {
    console.log(`[publish] git tag "${tagName}" skipped (non-zero exit)`);
    return;
  }
  run('git', ['push', 'origin', tagName]);
  console.log(`[publish] tagged ${tagName} and pushed to origin`);
}

const publishable = listPublishable();

/**
 * `--dry-run` 对每个包跑 pack + manifest 校验，不查 registry 判重、不发任何东西。
 * 这是这条管线唯一的本地验证手段：0.1.0 那个 workspace: 泄漏只有到 registry 上才看得见，
 * 而 registry 上的版本既改不了也删不回同名。
 *
 * （不用 npm publish --dry-run 来做这件事：它照样查 registry 并要求版本不冲突，
 * 对已发布的版本直接 "You cannot publish over the previously published versions" 退出，
 * 于是本地一个包都验不了。）
 */
const dryRun = process.argv.includes('--dry-run');

/**
 * 只有被直接执行时才真的发布。
 *
 * 这个脚本顶层是 await 循环，没有守卫的话任何 import（想复用 listPublishable() 的检查、
 * 将来加的 CI 干跑）一加载就会对真 registry 发起 npm publish ——
 * 那是不可逆的对外动作，不该由"读一下有哪些包"触发
 */
const isDirectRun =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export { listPublishable, isDirectRun };

if (isDirectRun) {
  if (publishable.length === 0) {
    console.log('[publish] no publishable packages found — nothing to do.');
    process.exit(0);
  }

  for (const { relDir, name, version } of publishable) {
    // 发布前再确认一次这个路径上真有 manifest：这一行的意义不是防重复，
    // 而是让"路径拼错"在最开始就报成一句人话，而不是 npm 的 ENOENT 堆栈
    if (!existsSync(join(repoRoot, relDir, 'package.json'))) {
      console.error(`[publish] ${name}: no package.json at ./${relDir} — refusing to publish.`);
      process.exit(1);
    }

    if (!dryRun && (await isPublished(name, version))) {
      console.log(`[publish] ${name}@${version} is already on the registry — skipping.`);
      continue;
    }

    // pnpm pack 换协议 → 校验产物 → npm publish 打包目录。
    // 校验的是 pack 出来的那份 manifest，不是仓库里那份：出问题的是转换之后的结果。
    // 这条检查与 pack 本身在 --dry-run 里照跑，因为要验的恰恰是它
    const { workDir, pkgDir } = preparePublishDir(relDir);
    let failure = 0;
    try {
      const packed = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
      if (!assertPublishable(packed, name)) {
        failure = 1;
      } else if (dryRun) {
        console.log(
          `[publish] ${name}@${version} manifest 可用：license=${packed.license} ` +
            `peer=${JSON.stringify(packed.peerDependencies)}`
        );
      } else {
        console.log(`[publish] ${name}@${version} — npm publish…`);
        failure = run('npm', [
          'publish',
          pkgDir,
          '--provenance',
          '--access',
          'public',
          // prepublishOnly 会在一个只有产物的临时目录里再跑一次 build，而那里没有 src
          '--ignore-scripts',
          `--registry=${registryUrl}`,
        ]);
      }
    } finally {
      rmSync(workDir, { recursive: true, force: true });
    }

    if (failure !== 0) {
      // 不继续往后发：宁可让人来看，也不要留下"一半包发出去了"这种没人预期的中间态
      console.error(
        `[publish] ${name}@${version} failed (exit ${failure}); stopping before later packages.`
      );
      process.exit(failure);
    }

    if (dryRun) continue;

    tagRelease(name, version);
    console.log(`[publish] ${name}@${version} published.`);
  }
}
