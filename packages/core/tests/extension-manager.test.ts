import { describe, expect, it, vi } from 'vitest';
import { Extension } from '@tiptap/core';
import { ExtensionManager } from '../src/core/ExtensionManager';
import { customCardNodeView } from './fixtures';

describe('ExtensionManager', () => {
  it('register 后 get/has/getAll 可查，重名注册告警并覆盖', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new ExtensionManager();
    const first = Extension.create({ name: 'alpha' });
    const second = Extension.create({ name: 'alpha' });

    manager.register(first);
    expect(manager.has('alpha')).toBe(true);
    expect(manager.get('alpha')).toBe(first);

    manager.register(second);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('alpha'));
    expect(manager.get('alpha')).toBe(second);
    expect(manager.getAll()).toHaveLength(1);

    expect(manager.get('missing')).toBeUndefined();
    expect(manager.has('missing')).toBe(false);
  });

  it('registerNodeView 合成同名 Tiptap Node 扩展并登记 NodeView 配置', () => {
    const manager = new ExtensionManager();
    manager.registerNodeView(customCardNodeView);

    const node = manager.get('customCard');
    expect(node).toBeDefined();
    expect(node?.name).toBe('customCard');

    const registered = manager.getNodeViews().get('customCard');
    expect(registered).toBe(customCardNodeView);
  });

  it('registerNodeViews 批量注册，重复注册走告警分支', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const manager = new ExtensionManager();
    manager.registerNodeViews([customCardNodeView]);
    manager.registerNodeView(customCardNodeView);

    expect(manager.getNodeViews().size).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('customCard'));
  });
});
