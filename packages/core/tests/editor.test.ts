import { describe, expect, it } from 'vitest';
import type { AtriEditor } from '../src/index';
import { mount } from './utils';

/**
 * 走 Tiptap 为模拟输入预留的 applyInputRules 事务元数据，
 * 与真实键入触发的是同一套 input rules；规则在宏任务里执行，故让出一拍
 */
async function typeAtEnd(editor: AtriEditor, text: string) {
  const { state, view } = editor.editor;
  editor.editor.commands.setTextSelection(state.doc.content.size - 1);
  const from = editor.editor.state.selection.from;
  view.dispatch(view.state.tr.setMeta('applyInputRules', { from, text }));
  await new Promise((resolve) => setTimeout(resolve, 10));
}

describe('markdown.shortcuts', () => {
  it('默认开启输入实时转换', async () => {
    const editor = await mount({ content: '<p>#</p>' });

    await typeAtEnd(editor, ' ');

    expect(editor.editor.options.enableInputRules).toBe(true);
    expect(editor.getHTML()).toContain('<h1');
  });

  it('shortcuts 为 false 时保留字面文本', async () => {
    const editor = await mount({ content: '<p>#</p>', markdown: { shortcuts: false } });

    await typeAtEnd(editor, ' ');

    expect(editor.editor.options.enableInputRules).toBe(false);
    expect(editor.getHTML()).toBe('<p>#</p>');
  });

  it('与 markdown.enabled 正交：关闭 Markdown 扩展不影响输入规则', async () => {
    const editor = await mount({ content: '<p>#</p>', markdown: { enabled: false } });

    await typeAtEnd(editor, ' ');

    expect(editor.editor.options.enableInputRules).toBe(true);
    expect(editor.getHTML()).toContain('<h1');
  });

  it('关闭输入规则不影响 Markdown 解析与序列化', async () => {
    const editor = await mount({ content: '<p>x</p>', markdown: { shortcuts: false } });

    editor.setMarkdown('- a\n- b');

    expect(editor.getHTML()).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul><p></p>');
    expect(editor.getMarkdown()).toContain('- a');
  });
});
