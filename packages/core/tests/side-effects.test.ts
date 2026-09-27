/**
 * sideEffects 声明的契约测试
 *
 * 这里只钉"声明与事实相符"这一层，秒级、不依赖构建产物。
 * 端到端的证据（裸导入经打包器后 customElements.define 是否还在）在
 * scripts/verify-side-effects.mjs 里，由 pnpm check 跑，需要 dist 已构建。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
const elementSource = readFileSync(path.join(packageRoot, 'src/AtriEditorElement.ts'), 'utf8');
const entrySource = readFileSync(path.join(packageRoot, 'src/index.ts'), 'utf8');

describe('Web Component 注册的打包契约', () => {
  it('JS 入口被声明为有副作用', () => {
    // 入口在模块顶层注册自定义元素，把它声明成无副作用等于授权打包器整模块丢弃。
    // esbuild 对这条是真的执行：裸导入打包出 0 字节
    expect(manifest.sideEffects).toContain('dist/index.js');
  });

  it('入口确实注册元素，而且是在模块顶层做的', () => {
    // 上一条形同虚设的话，这条要能发现：声明有副作用是因为真有副作用
    expect(elementSource).toMatch(/^\n?registerAtriElement\(\);$/m);
    expect(entrySource).toMatch(/export\s*\{[^}]*AtriEditorElement/s);
  });

  it('样式表也在声明里，两边都不靠打包器猜', () => {
    expect(manifest.sideEffects).toContain('dist/style.css');
    expect(manifest.exports['./styles'].default).toBe('./dist/style.css');
  });
});
