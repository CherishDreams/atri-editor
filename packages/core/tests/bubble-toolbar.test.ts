import { describe, expect, it } from 'vitest';
import { BUBBLE_TEXT_ITEMS, shouldShowBubbleMenu } from '../src/core/bubble-toolbar';
import { mount } from './utils';

/** 造一个浮层容器：项名末尾带 ! 的算禁用按钮，判的就是"还有没有能按的按钮" */
function menuWith(...items: string[]): HTMLElement {
  const element = document.createElement('div');
  items.forEach((item) => {
    const button = document.createElement('button');
    button.setAttribute('data-toolbar-item', item.replace(/!$/, ''));
    button.disabled = item.endsWith('!');
    element.appendChild(button);
  });
  return element;
}

describe('shouldShowBubbleMenu', () => {
  it('浮层只放行内格式五项', () => {
    expect([...BUBBLE_TEXT_ITEMS]).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
  });

  it('选中一段文字就浮出，不要求编辑器有焦点', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });

    expect(
      shouldShowBubbleMenu({
        editor: editor.editor,
        element: menuWith('bold'),
        state: editor.editor.state,
        from: 2,
        to: 6,
      })
    ).toBe(true);
  });

  it('不可编辑时不浮出', async () => {
    const editor = await mount({ content: '<p>hello world</p>', editable: false });

    expect(
      shouldShowBubbleMenu({
        editor: editor.editor,
        element: menuWith('bold'),
        state: editor.editor.state,
        from: 2,
        to: 6,
      })
    ).toBe(false);
  });

  it('空选区与只框到空白都不浮出', async () => {
    // 段首 a 占 1~2，与 b 之间那个空格占 2~3
    const editor = await mount({ content: '<p>a b</p>' });
    const props = {
      editor: editor.editor,
      state: editor.editor.state,
      element: menuWith('bold'),
    };

    expect(shouldShowBubbleMenu({ ...props, from: 2, to: 2 })).toBe(false);
    expect(shouldShowBubbleMenu({ ...props, from: 2, to: 3 })).toBe(false);
  });

  it('选中整节点（图片 / 附件）时不浮出', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    // 插入命令收尾会把附件选中，正好是 NodeSelection
    editor.insertAttachment({ src: 'https://cdn.test/a.pdf', name: 'a.pdf' });
    const { state } = editor.editor;

    expect(
      shouldShowBubbleMenu({
        editor: editor.editor,
        element: menuWith('bold'),
        state,
        from: state.selection.from,
        to: state.selection.to,
      })
    ).toBe(false);
  });

  it('一个能按的按钮都没有时不浮出空盒子', async () => {
    const editor = await mount({ content: '<p>hello world</p>' });
    const props = {
      editor: editor.editor,
      state: editor.editor.state,
      from: 2,
      to: 6,
    };

    expect(shouldShowBubbleMenu({ ...props, element: menuWith() })).toBe(false);
    expect(shouldShowBubbleMenu({ ...props, element: menuWith('bold!', 'italic!') })).toBe(false);
    expect(shouldShowBubbleMenu({ ...props, element: menuWith('bold!', 'italic') })).toBe(true);
  });
});
