import { describe, expect, it } from 'vitest';
import { mount } from './utils';

/**
 * setMarkdown/setContent 是整篇替换：替换前无论选着什么（全选最常见），
 * 替换后都必须收拢选区——否则 ProseMirror 把 AllSelection 映射成覆盖新文档的
 * 全选，下一次输入或插入会整篇替换，内容凭空消失
 */
describe('整体替换后的选区安全', () => {
  it('全选后 setMarkdown：选区收拢，后续插入不再吞文档', async () => {
    const editor = await mount({ content: '<p>旧内容</p>' });
    editor.editor.commands.selectAll();
    expect(editor.editor.state.selection.empty).toBe(false);

    editor.setMarkdown('# 新标题\n\n正文');

    expect(editor.editor.state.selection.empty).toBe(true);
    editor.insertContent('Z');
    expect(editor.getHTML()).toContain('新标题');
    expect(editor.getHTML()).toContain('Z');
  });

  it('全选后 setContent(HTML)：同样收拢', async () => {
    const editor = await mount({ content: '<p>旧内容</p>' });
    editor.editor.commands.selectAll();

    editor.setContent('<p>替换后</p>');

    const { selection } = editor.editor.state;
    expect(selection.empty).toBe(true);
    editor.insertContent('Q');
    expect(editor.getHTML()).toContain('替换后');
  });

  it('选区收拢在文档末尾：紧接输入是追加而不是插队', async () => {
    const editor = await mount({ content: '<p>甲</p><p>乙</p>' });
    editor.editor.commands.selectAll();

    editor.setContent('<p>丙</p>');

    expect(editor.editor.state.selection.to).toBe(editor.editor.state.doc.content.size - 1);
  });
});
