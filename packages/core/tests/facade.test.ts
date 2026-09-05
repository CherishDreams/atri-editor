import { describe, expect, it, vi } from 'vitest';
import { mount } from './utils';
import { customCardNodeView } from './fixtures';
import type { AtriAIConfig } from '../src/types';

/**
 * 门面薄方法的直连用例：这些方法只是 CoreEditor/MarkdownService 的转发，
 * 没有独立逻辑，但作为公共 API 的第一道防线，至少要有「调用不抛、结果形状对」的断言
 */
describe('门面方法', () => {
  it('getSelectedText 返回当前选区文本，空选区返回空串', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });

    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    expect(editor.getSelectedText()).toBe('hello');

    editor.editor.commands.setTextSelection(1);
    expect(editor.getSelectedText()).toBe('');
  });

  it('isEmpty / clearContent / getJSON 反映文档状态', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    expect(editor.isEmpty()).toBe(false);
    expect(editor.getJSON()).toMatchObject({ type: 'doc' });

    editor.clearContent();
    expect(editor.isEmpty()).toBe(true);
  });

  it('setEditable / isEditable 同步可编辑状态', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    expect(editor.isEditable()).toBe(true);

    editor.setEditable(false);
    expect(editor.isEditable()).toBe(false);
  });

  it('markdownToJSON 经 Markdown 扩展解析出结构，扩展关闭时降级为纯段落', async () => {
    const editor = await mount({ content: '<p></p>' });
    const json = editor.markdownToJSON('# 标题');
    expect(json.type).toBe('doc');
    expect(json.content?.[0]?.type).toBe('heading');

    const fallback = await mount({ content: '', markdown: { enabled: false } });
    const degraded = fallback.markdownToJSON('# 标题');
    expect(degraded.content?.[0]?.type).toBe('paragraph');
  });

  it('markdown 扩展关闭时 getMarkdown / markdownToHTML 走简单转换降级', async () => {
    const editor = await mount({ content: '<h1>hi</h1>', markdown: { enabled: false } });
    expect(editor.getMarkdown()).toBe('# hi');
    expect(editor.markdownToHTML('# hi')).toContain('<h1>hi</h1>');
    expect(editor.htmlToMarkdown('<h1>hi</h1>')).toContain('# hi');
  });

  it('updateAIConfig 替换功能列表', async () => {
    const editor = await mount({
      content: '<p>hi</p>',
      ai: {
        functions: [{ id: 'a', name: 'A' }],
        requestEndpoint: async () => ({ content: '' }),
      },
    });
    expect(editor.ai?.getFunctions().map((f) => f.id)).toEqual(['a']);

    editor.updateAIConfig({ functions: [{ id: 'b', name: 'B' }] });
    expect(editor.ai?.getFunctions().map((f) => f.id)).toEqual(['b']);
  });

  it('getNodeViews 登记自定义 NodeView，registerNodeView 重建后仍可查', async () => {
    const editor = await mount({ content: '<p>hi</p>' });
    expect(editor.getNodeViews().size).toBe(0);

    editor.registerNodeView(customCardNodeView);
    expect(editor.getNodeViews().get('customCard')).toBe(customCardNodeView);
  });

  it('focus / blur 调用不抛错', async () => {
    const editor = await mount({ content: '<p>hi</p>' });
    editor.focus();
    editor.blur();
  });

  it('setPlaceholder 同步到 options，编辑器重建后占位符不丢', async () => {
    const editor = await mount({ content: '<p>hi</p>', placeholder: 'old' });
    editor.setPlaceholder('new');
    // 重建时占位符取自 options，setPlaceholder 必须同步它才不会退回旧值
    editor.registerNodeView(customCardNodeView);

    editor.setContent('');
    const viewDom = editor.editor.view.dom as HTMLElement;
    expect(viewDom.querySelector('[data-placeholder="new"]')).not.toBeNull();
  });
});

describe('AI 服务错误与输出模式', () => {
  function aiMount(config: Partial<AtriAIConfig> = {}) {
    return mount({
      content: '<p>hello world</p>',
      ai: {
        functions: [{ id: 'f', name: 'F' }],
        requestEndpoint: async () => ({ content: 'ok' }),
        ...config,
      },
    });
  }

  it('未知 functionId 只告警不发请求', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const endpoint = vi.fn(async () => ({ content: '' }));
    const editor = await aiMount({ requestEndpoint: endpoint });

    await editor.ai!.execute('nope');

    expect(endpoint).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('nope'));
  });

  it('端点抛错时转入 onError', async () => {
    const onError = vi.fn();
    const editor = await aiMount({
      onError,
      requestEndpoint: async () => {
        throw new Error('boom');
      },
    });

    await editor.ai!.execute('f');

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ functionId: 'f' })
    );
  });

  it('replace 模式用返回内容替换选区', async () => {
    const editor = await aiMount({
      requestEndpoint: async () => ({ content: 'hi' }),
      functions: [{ id: 'f', name: 'F', outputMode: 'replace' }],
    });
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    await editor.ai!.execute('f');

    expect(editor.editor.state.doc.textContent).toBe('hi world');
  });

  it('append 模式追加到文档末尾', async () => {
    const editor = await aiMount({
      requestEndpoint: async () => ({ content: 'done' }),
      functions: [{ id: 'f', name: 'F', outputMode: 'append' }],
    });

    await editor.ai!.execute('f');

    expect(editor.editor.state.doc.textContent).toBe('hello worlddone');
  });
});
