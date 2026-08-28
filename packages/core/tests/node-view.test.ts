import { describe, expect, it, vi } from 'vitest';
import { customCardNodeView } from './fixtures';
import { mount } from './utils';

describe('动态注册 NodeView（编辑器重建）', () => {
  it('注册后 schema 含新节点，内容与选区被保留', async () => {
    const onChange = vi.fn();
    const editor = await mount({ content: '<p>first</p><p>second</p>', onChange });
    editor.editor.commands.setTextSelection({ from: 8, to: 10 });
    onChange.mockClear();

    editor.registerNodeView(customCardNodeView);

    expect(editor.getHTML()).toBe('<p>first</p><p>second</p>');
    expect(editor.editor.state.schema.nodes.customCard).toBeDefined();
    // 选区在新视图就绪（create 事件）时恢复
    await vi.waitFor(() => {
      expect({
        from: editor.editor.state.selection.from,
        to: editor.editor.state.selection.to,
      }).toEqual({ from: 8, to: 10 });
    });
    // 重建只是恢复状态，不应被当成内容变更
    expect(onChange).not.toHaveBeenCalled();

    editor.editor.commands.insertContent({
      type: 'customCard',
      attrs: { title: 'T', content: 'C' },
    });
    expect(editor.getHTML()).toContain('custom-card');
  });

  it('重建过程不产生日志噪音', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const editor = await mount({ content: '<p>x</p>' });
    log.mockClear();

    editor.registerNodeView(customCardNodeView);

    expect(log).not.toHaveBeenCalled();
  });

  it('批量注册只重建一次', async () => {
    const editor = await mount({ content: '<p>x</p>' });
    const before = editor.editor;

    editor.registerNodeViews([customCardNodeView, { ...customCardNodeView, name: 'otherCard' }]);

    expect(editor.editor).not.toBe(before);
    expect(editor.editor.state.schema.nodes.customCard).toBeDefined();
    expect(editor.editor.state.schema.nodes.otherCard).toBeDefined();
  });

  it('自定义节点的属性值不会被当作标记解析', async () => {
    const editor = await mount({ content: '<p>x</p>', nodeViews: [customCardNodeView] });
    const payload = '<img src=x onerror=alert(1)>';

    editor.editor.commands.setContent({
      type: 'doc',
      content: [{ type: 'customCard', attrs: { title: payload, content: 'plain' } }],
    });

    // 属性值里的 < 在 HTML 中无需转义，判定标准是重新解析后不多出元素、值原样保留
    const parsed = new DOMParser().parseFromString(editor.getHTML(), 'text/html');
    expect(parsed.querySelector('img')).toBeNull();
    expect(parsed.querySelector('custom-card')?.getAttribute('title')).toBe(payload);
    expect(editor.editor.state.doc.firstChild?.attrs.title).toBe(payload);
  });
});
