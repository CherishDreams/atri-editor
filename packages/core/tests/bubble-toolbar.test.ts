import { describe, expect, it } from 'vitest';
import {
  BUBBLE_NODE_ITEMS,
  BUBBLE_TEXT_ITEMS,
  bubbleGroupFor,
  bubbleNodeNameFor,
  shouldShowBubbleMenu,
  type BubbleGroup,
} from '../src/core/bubble-toolbar';
import type { AtriEditor } from '../src/index';
import { customCardNodeView } from './fixtures';
import { mount, selectNode } from './utils';

/** 造一个和 ToolbarManager 渲染出来同形的浮层容器：两组各一个盒子，组里放不认识的就跳过 */
function menuWith(...items: string[]): HTMLElement {
  const element = document.createElement('div');
  const groups: [BubbleGroup, readonly string[]][] = [
    ['text', BUBBLE_TEXT_ITEMS],
    ['node', BUBBLE_NODE_ITEMS],
  ];

  groups.forEach(([groupId, knownIds]) => {
    const group = document.createElement('div');
    group.setAttribute('data-atri-bubble-group', groupId);

    items.forEach((id) => {
      if (!(knownIds as readonly string[]).includes(id)) return;

      const button = document.createElement('button');
      button.setAttribute('data-toolbar-item', id);
      group.appendChild(button);
    });

    element.appendChild(group);
  });

  return element;
}

/** 拿当前选区跑一遍判定，顺带把元素返回给调用方看它被写了什么 */
function showFor(editor: AtriEditor, element: HTMLElement): boolean {
  const { state } = editor.editor;
  return shouldShowBubbleMenu({
    editor: editor.editor,
    element,
    state,
    from: state.selection.from,
    to: state.selection.to,
  });
}

describe('shouldShowBubbleMenu', () => {
  it('浮层两组分别放行内格式五项与附件那两项', () => {
    expect([...BUBBLE_TEXT_ITEMS]).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
    expect([...BUBBLE_NODE_ITEMS]).toEqual(['attachmentDisplay', 'delete']);
  });

  it('选中一段文字就浮出，不要求编辑器有焦点', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });
    editor.editor.commands.setTextSelection({ from: 2, to: 6 });

    expect(showFor(editor, menuWith('bold'))).toBe(true);
  });

  it('不可编辑时不浮出，模式也归到 none', async () => {
    const editor = await mount({ content: '<p>hello world</p>', editable: false });
    editor.editor.commands.setTextSelection({ from: 2, to: 6 });
    const element = menuWith('bold');

    expect(showFor(editor, element)).toBe(false);
    expect(element.dataset.atriBubbleMode).toBe('none');
  });

  it('空选区与只框到空白都不浮出', async () => {
    // 段首 a 占 1~2，与 b 之间那个空格占 2~3
    const editor = await mount({ content: '<p>a b</p>' });

    editor.editor.commands.setTextSelection({ from: 2, to: 2 });
    expect(showFor(editor, menuWith('bold'))).toBe(false);

    editor.editor.commands.setTextSelection({ from: 2, to: 3 });
    expect(showFor(editor, menuWith('bold'))).toBe(false);
  });

  it('选中附件浮出节点组，并记下节点名', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    // 插入命令收尾会把附件选中，正好是 NodeSelection
    editor.insertAttachment({ src: 'https://cdn.test/a.pdf', name: 'a.pdf' });
    const element = menuWith('attachmentDisplay', 'delete');

    expect(showFor(editor, element)).toBe(true);
    expect(element.dataset).toMatchObject({
      atriBubbleMode: 'node',
      atriBubbleNode: 'attachment',
    });
  });

  it('选中图片也算节点组', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    editor.insertImage({ src: 'https://cdn.test/a.png', alt: 'A' });
    // 插入命令收尾只是把光标停在图片旁，选中得自己来（浏览器里是一次点击）
    selectNode(editor, 'image');
    const element = menuWith('attachmentDisplay', 'delete');

    expect(showFor(editor, element)).toBe(true);
    expect(element.dataset.atriBubbleNode).toBe('image');
  });

  it('代码块里的文字五项标记一个都挂不上，不浮出', async () => {
    const editor = await mount({ content: '<pre><code>const a = 1</code></pre>' });
    editor.editor.commands.setTextSelection({ from: 3, to: 8 });
    const element = menuWith('bold');

    expect(showFor(editor, element)).toBe(false);
    expect(element.dataset.atriBubbleMode).toBe('none');
  });

  it('该组一个按钮都没渲染出来时不浮出空盒子', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });
    editor.editor.commands.setTextSelection({ from: 2, to: 6 });

    expect(showFor(editor, menuWith())).toBe(false);
    expect(showFor(editor, menuWith('bold'))).toBe(true);

    // 节点组也一样：只往里塞文字那五项就等于没塞（media:false 时它压根不存在）
    editor.insertAttachment({ src: 'https://cdn.test/a.pdf', name: 'a.pdf' });
    expect(showFor(editor, menuWith('bold'))).toBe(false);
  });
});

describe('bubbleGroupFor / bubbleNodeNameFor', () => {
  it('没有选中整节点时都算文字组', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });

    editor.editor.commands.setTextSelection({ from: 2, to: 6 });
    expect(bubbleGroupFor(editor.editor.state)).toBe('text');
    expect(bubbleNodeNameFor(editor.editor.state)).toBeNull();

    // 光标点着也算文字组，有没有字要等 shouldShow 里那句 textBetween 判
    editor.editor.commands.setTextSelection({ from: 2, to: 2 });
    expect(bubbleGroupFor(editor.editor.state)).toBe('text');
  });

  it('名单外的自定义节点什么都不浮', async () => {
    // 用户自己注册的 atom 也在 NodeSelection 的射程里，但一键就能删掉整块太危险，不在名单里就不浮
    const editor = await mount({ content: '<p>hello</p>', toolbar: { bubble: true } });
    editor.registerNodeView(customCardNodeView);
    await new Promise((resolve) => setTimeout(resolve, 0));

    editor.editor.commands.insertContentAt(editor.editor.state.doc.content.size, {
      type: 'customCard',
    });
    selectNode(editor, 'customCard');

    expect(bubbleGroupFor(editor.editor.state)).toBeNull();
    expect(bubbleNodeNameFor(editor.editor.state)).toBeNull();
    expect(showFor(editor, menuWith('attachmentDisplay', 'delete'))).toBe(false);
  });
});
