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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

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
        dir,
        name: pkg.name,
        version: pkg.version,
        // peer 也要算边：code-highlight 对 core 的依赖就写在 peerDependencies 里，
        // 只读 dependencies 的话这条边不存在，上面的拓扑排序会静默退化成字母序
        deps: { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) },
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

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  return result.status ?? 1;
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

  for (const { dir, name, version } of publishable) {
    if (await isPublished(name, version)) {
      console.log(`[publish] ${name}@${version} is already on the registry — skipping.`);
      continue;
    }

    console.log(`[publish] ${name}@${version} not published yet — running npm publish…`);
    const code = run('npm', [
      'publish',
      `./${dir}`,
      '--provenance',
      '--access',
      'public',
      `--registry=${registryUrl}`,
    ]);
    if (code !== 0) {
      // 不继续往后发：宁可让人来看，也不要留下"一半包发出去了"这种没人预期的中间态
      console.error(
        `[publish] ${name}@${version} failed (exit ${code}); stopping before later packages.`
      );
      process.exit(code);
    }

    tagRelease(name, version);
    console.log(`[publish] ${name}@${version} published.`);
  }
}
