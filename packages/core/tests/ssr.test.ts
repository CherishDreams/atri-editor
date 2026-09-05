// @vitest-environment node
//
// 整个文件跑在 node 池：README 声称「Node/SSR 下 import 安全」，
// 这里就是那条声明的防回归——模块加载时不得触碰 DOM
import { describe, expect, it, vi } from 'vitest';

describe('SSR / 无 DOM 环境导入安全', () => {
  it('Node 环境（无 HTMLElement / customElements）导入与显式注册不抛错', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const mod = await import('../src/AtriEditorElement');

    expect(typeof mod.AtriEditorElement).toBe('function');
    expect(() => mod.registerAtriElement()).not.toThrow();
    // 注册入口对无 customElements 的环境告警并返回，而不是抛
    expect(warn).toHaveBeenCalled();
  });
});
