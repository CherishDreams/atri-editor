import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AtriEditor } from '../src/index';
import { mount, rootOf, toolbarButtons } from './utils';

function toolbarOf(editor: AtriEditor) {
  return {
    buttons: toolbarButtons(editor),
    separators: rootOf(editor).querySelectorAll('.atri-editor-toolbar-separator').length,
  };
}

describe('ToolbarManager', () => {
  const warns: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warns.push(args.join(' '));
  });

  afterEach(() => {
    warns.length = 0;
  });

  it('toolbar 为 false 时不渲染按钮', async () => {
    const editor = await mount({ content: '<p>x</p>' });

    expect(toolbarOf(editor).buttons).toHaveLength(0);
  });

  it('省略 items 时渲染默认分组布局', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });
    const { buttons, separators } = toolbarOf(editor);

    expect(buttons.map((b) => b.getAttribute('data-toolbar-item'))).toEqual([
      'undo',
      'redo',
      'heading1',
      'heading2',
      'heading3',
      'paragraph',
      'bold',
      'italic',
      'underline',
      'strike',
      'code',
      'bulletList',
      'orderedList',
      'blockquote',
      'codeBlock',
      'alignLeft',
      'alignCenter',
      'alignRight',
      // 媒体扩展默认注册，末组是插入图片与附件
      'insertImage',
      'insertAttachment',
    ]);
    expect(separators).toBe(5);
  });

  it('items 决定按钮内容与顺序', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['italic', 'bold', { id: 'codeBlock', label: '代码块' }] },
    });
    const { buttons, separators } = toolbarOf(editor);

    expect(buttons.map((b) => b.getAttribute('data-toolbar-item'))).toEqual([
      'italic',
      'bold',
      'codeBlock',
    ]);
    expect(buttons[2].textContent).toBe('代码块');
    expect(buttons[2].querySelector('svg')).toBeNull();
    expect(buttons[0].querySelector('svg')).not.toBeNull();
    // 平铺的自定义布局不插入分组分隔线
    expect(separators).toBe(0);
  });

  it('未知 id 被跳过并告警，children 声明被忽略并告警', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['bold', 'nope', { id: 'italic', children: [{ id: 'bold' }] }] },
    });

    expect(toolbarOf(editor).buttons.map((b) => b.getAttribute('data-toolbar-item'))).toEqual([
      'bold',
      'italic',
    ]);
    expect(warns.filter((w) => w.includes('Unknown toolbar item'))).toHaveLength(1);
    expect(warns.some((w) => w.includes('children'))).toBe(true);
  });

  it('点击按钮执行对应命令并同步 active 状态', async () => {
    const editor = await mount({ content: '<p>hello</p>', toolbar: { items: ['bold'] } });
    const [button] = toolbarOf(editor).buttons;
    editor.editor.commands.focus();
    editor.editor.commands.setTextSelection({ from: 2, to: 5 });

    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => {
      expect(editor.editor.isActive('bold')).toBe(true);
    });
    expect(button.classList.contains('active')).toBe(true);
  });
});
