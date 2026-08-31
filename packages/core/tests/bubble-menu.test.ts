import { describe, expect, it, vi } from 'vitest';
import type { AtriEditor } from '../src/index';
import { customCardNodeView } from './fixtures';
import {
  bubbleGroupItems,
  bubbleItems,
  bubbleMode,
  bubbleRoot,
  mount,
  rootOf,
  selectNode,
  stubGeometry,
  toolbarButtons,
} from './utils';

/** 选中一段文字并等插件把浮层挂进文档 */
async function selectRange(editor: AtriEditor, from: number, to: number): Promise<void> {
  editor.editor.commands.setTextSelection({ from, to });
  await vi.waitFor(() => {
    expect(bubbleRoot(editor)).not.toBeNull();
  });
}

/** 把选区收成一个光标，等插件把它摘出文档 */
async function collapse(editor: AtriEditor, at: number): Promise<void> {
  editor.editor.commands.setTextSelection({ from: at, to: at });
  await vi.waitFor(() => {
    expect(bubbleRoot(editor)).toBeNull();
  });
}

/** 点浮层里的一个按钮 */
function clickBubbleItem(editor: AtriEditor, itemId: string): void {
  const button = bubbleRoot(editor)!.querySelector<HTMLButtonElement>(
    `[data-toolbar-item="${itemId}"]`
  )!;
  button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function bubbleTitles(editor: AtriEditor): string[] {
  return bubbleGroupTitles(editor, 'text');
}

function bubbleGroupTitles(editor: AtriEditor, group: string): string[] {
  return Array.from(
    bubbleRoot(editor)?.querySelectorAll<HTMLButtonElement>(
      `[data-atri-bubble-group="${group}"] [data-toolbar-item]`
    ) ?? []
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
    expect(bubbleMode(editor)).toBe('text');
    // 节点组一次就渲染好了，藏它的是 CSS 而不是"没建"，所以此刻就能查到它的结构
    expect(bubbleGroupItems(editor, 'node')).toEqual(['attachmentDisplay', 'delete']);
    // 顶栏不受影响，浮层挂在正文自己的滚动盒里
    expect(toolbarButtons(editor)).toHaveLength(21);
    expect(bubbleRoot(editor)?.parentElement?.className).toBe('atri-editor-content-wrapper');
  });

  it('收回选区即隐藏，重新选中再浮出', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    await collapse(editor, 7);

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
    expect(bubbleGroupTitles(editor, 'node')).toEqual(['附件样式', '删除']);

    await editor.setLanguage('en');
    expect(bubbleTitles(editor)).toEqual([
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Inline Code',
    ]);
    expect(bubbleGroupTitles(editor, 'node')).toEqual(['Attachment style', 'Delete']);
  });

  it('销毁后文档里不再留下浮层', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    editor.destroy();

    expect(document.querySelector('.atri-editor-bubble-toolbar')).toBeNull();
  });
});

describe('选中图片 / 附件时浮出节点组', () => {
  /** 插入命令收尾就把节点选中了，等的是插件自己把浮层挂回来 */
  async function showForAttachment(editor: AtriEditor): Promise<void> {
    editor.insertAttachment({ src: 'https://cdn.test/a.pdf', name: 'a.pdf' });
    await vi.waitFor(() => {
      expect(bubbleMode(editor)).toBe('node');
    });
  }

  it('附件浮出切形态与删除，切完浮层还指着新形态', async () => {
    const editor = await mount({ content: '<p>hello</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await showForAttachment(editor);

    expect(bubbleItems(editor)).toEqual(['attachmentDisplay', 'delete']);
    expect(bubbleRoot(editor)?.dataset.atriBubbleNode).toBe('attachment');

    clickBubbleItem(editor, 'attachmentDisplay');

    await vi.waitFor(() => {
      expect(editor.editor.isActive('attachmentLink')).toBe(true);
    });
    // 切换顺手把选区落到新节点上：浮层不该退回文字组，也不该弹一下再消失
    await vi.waitFor(() => {
      expect(bubbleRoot(editor)?.dataset.atriBubbleNode).toBe('attachmentLink');
    });
    expect(bubbleMode(editor)).toBe('node');
  });

  it('图片只有删除能按', async () => {
    const editor = await mount({ content: '<p>hello</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    editor.insertImage({ src: 'https://cdn.test/a.png', alt: 'A' });
    // 浏览器里点一下图片就是选中，插入命令收尾留的却是光标
    selectNode(editor, 'image');
    await vi.waitFor(() => {
      expect(bubbleMode(editor)).toBe('node');
    });

    expect(bubbleRoot(editor)?.dataset.atriBubbleNode).toBe('image');
    // 藏掉那一项是 CSS 的事，jsdom 里查不到 display，这里只验它确实按不动
    expect(
      bubbleGroupItems(editor, 'node').map((itemId) => [
        itemId,
        bubbleRoot(editor)?.querySelector<HTMLButtonElement>(`[data-toolbar-item="${itemId}"]`)
          ?.disabled,
      ])
    ).toEqual([
      ['attachmentDisplay', true],
      ['delete', false],
    ]);
  });

  it('点删除把选中的附件从文档里摘掉', async () => {
    const editor = await mount({ content: '<p>hello</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await showForAttachment(editor);

    clickBubbleItem(editor, 'delete');

    await vi.waitFor(() => {
      expect(editor.getHTML()).not.toContain('a.pdf');
    });
    expect(editor.getHTML()).toContain('hello');
  });

  it('选区从附件挪回文字，浮层跟着换组', async () => {
    const editor = await mount({ content: '<p>hello world</p>', toolbar: { bubble: true } });
    stubGeometry(editor);
    await showForAttachment(editor);

    editor.editor.commands.setTextSelection({ from: 2, to: 6 });
    await vi.waitFor(() => {
      expect(bubbleMode(editor)).toBe('text');
    });
    expect(bubbleRoot(editor)?.dataset.atriBubbleNode).toBe('');
    expect(bubbleItems(editor)).toHaveLength(5);
  });

  it('关掉 media 后节点组退化到只剩删除', async () => {
    // media:false 时压根没有附件节点，切形态那项连定义都不存在
    const editor = await mount({
      content: '<p>hello world</p>',
      media: false,
      toolbar: { bubble: true },
    });
    stubGeometry(editor);
    await selectRange(editor, 2, 6);

    expect(bubbleGroupItems(editor, 'node')).toEqual(['delete']);
    expect(bubbleItems(editor)).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
  });
});
