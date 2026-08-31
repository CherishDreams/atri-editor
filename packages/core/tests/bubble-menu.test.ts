import { describe, expect, it, vi } from 'vitest';
import type { AtriEditor } from '../src/index';
import { customCardNodeView } from './fixtures';
import { bubbleItems, bubbleRoot, mount, rootOf, stubGeometry, toolbarButtons } from './utils';

/** 选中一段文字并等插件把浮层挂进文档 */
async function selectRange(editor: AtriEditor, from: number, to: number): Promise<void> {
  editor.editor.commands.setTextSelection({ from, to });
  await vi.waitFor(() => {
    expect(bubbleRoot(editor)).not.toBeNull();
  });
}

function bubbleTitles(editor: AtriEditor): string[] {
  return Array.from(
    bubbleRoot(editor)?.querySelectorAll<HTMLButtonElement>('[data-toolbar-item]') ?? []
  ).map((button) => button.title);
}

describe('选区浮动工具栏', () => {
  it('未开启 bubble 时不注册浮层', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: {} });
    stubGeometry(editor);
    editor.editor.commands.setTextSelection({ from: 2, to: 6 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // 顶栏照常，但没有第二个工具栏
    expect(toolbarButtons(editor)).toHaveLength(21);
    expect(rootOf(editor).querySelector('.atri-editor-bubble-toolbar')).toBeNull();
  });

  it('bubble 打开时浮出，只放行内格式五项', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);

    await selectRange(editor, 2, 6);

    expect(bubbleItems(editor)).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
    // 顶栏不受影响，浮层挂在正文自己的滚动盒里
    expect(toolbarButtons(editor)).toHaveLength(21);
    expect(bubbleRoot(editor)?.parentElement?.className).toBe('atri-editor-content-wrapper');
  });

  it('收回选区即隐藏，重新选中再浮出', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    editor.editor.commands.setTextSelection({ from: 7, to: 7 });
    expect(bubbleRoot(editor)).toBeNull();

    await selectRange(editor, 7, 11);
    expect(bubbleItems(editor)).toHaveLength(5);
  });

  it('只框到空白时不浮出', async () => {
    // 段里只有 a 与 b 之间那一个空格，位置 2~3
    const editor = await mount({ content: '<p>a b</p>', toolbar: { bubble: true } });
    stubGeometry(editor);

    editor.editor.commands.setTextSelection({ from: 2, to: 3 });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(bubbleRoot(editor)).toBeNull();
  });

  it('点浮层里的加粗：命令生效且选区还在', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    const bold = bubbleRoot(editor)!.querySelector<HTMLButtonElement>(
      '[data-toolbar-item="bold"]'
    )!;
    bold.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    await vi.waitFor(() => {
      expect(editor.editor.isActive('bold')).toBe(true);
    });
    // 加粗要作用在原选区上：命令链里那句 focus() 不能把选区压成一个点
    expect({
      from: editor.editor.state.selection.from,
      to: editor.editor.state.selection.to,
    }).toEqual({ from: 2, to: 6 });
  });

  it('重建编辑器后浮层是同一个元素并重新填好按钮', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);
    const element = bubbleRoot(editor)!;

    editor.registerNodeView(customCardNodeView);

    // 旧编辑区整块被换掉，浮层跟着离开文档；再选中时挂回来的是同一个实例
    expect(bubbleRoot(editor)).toBeNull();
    // 重建换的是新的 EditorView，桩要重新打在这个视图上
    stubGeometry(editor);
    await selectRange(editor, 2, 6);
    expect(bubbleRoot(editor)).toBe(element);
    expect(bubbleItems(editor)).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
  });

  it('切换语言时浮层按钮的提示文字跟着变', async () => {
    const editor = await mount({
      lang: 'zh',
      content: '<p>hello world</p>',
      toolbar: { bubble: true },
    });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    expect(bubbleTitles(editor)).toEqual(['加粗', '斜体', '下划线', '删除线', '行内代码']);

    await editor.setLanguage('en');
    expect(bubbleTitles(editor)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline Code',
    ]);
  });

  it('销毁后文档里不再留下浮层', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    editor.destroy();

    expect(document.querySelector('.atri-editor-bubble-toolbar')).toBeNull();
  });
});
