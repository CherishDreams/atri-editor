/**
 * publish-core.mjs — @atri-editor/core 的幂等发布守卫
 *
 * 背景：changesets/action@v1 在「无 changeset」分支会无条件执行 publish 命令
 * （日志里那句 "Attempting to publish any unpublished packages" 只是文案，
 * 它不查任何 registry 或 tag），而本仓库的 0.1.0 是 2026-09-04 在 changesets
 * 引入之前手动发布的。裸 `npm publish` 每次 push main 都会撞上
 * "You cannot publish over the previously published versions" 的 403。
 *
 * 所以发布判重自己做：先查 npm registry（install-v1 摘要文档，含 versions 表），
 * 当前版本已存在则跳过；不存在才真正发布，成功后按 changesets 惯例
 * 打 `@atri-editor/core@<version>` 的 git tag 并推回 origin。
 *
 * 运行环境：GitHub Actions runner（Node 22，fetch 内置；netrc 已由 action 写好，
 * git push tag 可直接工作）。OIDC provenance 或 NPM_TOKEN 两条认证路径由
 * npm publish 子进程继承环境自行处理。
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = 'packages/core';
const { name: pkgName, version: pkgVersion } = JSON.parse(
  readFileSync(join(repoRoot, pkgDir, 'package.json'), 'utf8')
);

const registryUrl = 'https://registry.npmjs.org/';
const encodedName = pkgName.replace('/', '%2F');

/** 查 registry 当前版本是否已发布；网络与解析上的不确定一律按「未发布」处理，
 *  宁可让 npm publish 报 403 也不要误判未发布版本为已发布 */
async function isPublished() {
  try {
    const res = await fetch(`${registryUrl}${encodedName}`, {
      headers: { Accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`registry responded ${res.status}`);
    const doc = await res.json();
    return Object.prototype.hasOwnProperty.call(doc.versions ?? {}, pkgVersion);
  } catch (err) {
    console.log(`[publish] registry lookup failed (${err.message}); falling through to publish`);
    return false;
  }
}

function run(cmd, args) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (await isPublished()) {
  console.log(`[publish] ${pkgName}@${pkgVersion} is already on the registry — nothing to do.`);
  process.exit(0);
}

console.log(`[publish] ${pkgName}@${pkgVersion} not published yet — running npm publish…`);
const code = run('npm', [
  'publish',
  `./${pkgDir}`,
  '--provenance',
  '--access',
  'public',
  `--registry=${registryUrl}`,
]);
if (code !== 0) process.exit(code);

// 与 changesets 的发布 tag 同名同格式，未来 `changeset version` 用它做 base 比较
const tagName = `${pkgName}@${pkgVersion}`;
const tagCode = run('git', ['tag', tagName]);
if (tagCode === 0) {
  run('git', ['push', 'origin', tagName]);
  console.log(`[publish] tagged ${tagName} and pushed to origin`);
} else {
  console.log(`[publish] git tag "${tagName}" skipped (non-zero exit)`);
}
console.log(`[publish] ${pkgName}@${pkgVersion} published.`);
