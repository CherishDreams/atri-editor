import { describe, expect, it } from 'vitest';
import type { AtriEditor } from '../src/index';
import { buttonOf, click, mount, toolbarButtons } from './utils';

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function taskItems(editor: AtriEditor): number {
  return (editor.getHTML().match(/data-type="taskItem"/g) ?? []).length;
}

/** 勾选框由 TaskItem 的 NodeView 渲染，点它走 change 事件写回 checked 属性 */
function firstCheckbox(editor: AtriEditor): HTMLInputElement {
  const checkbox = editor.editor.view.dom.querySelector<HTMLInputElement>(
    'ul[data-type="taskList"] input[type="checkbox"]'
  );
  if (!checkbox) throw new Error('task item checkbox not rendered');
  return checkbox;
}

describe('任务列表', () => {
  it('默认工具栏在有序列表之后渲染任务列表按钮', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });
    const items = toolbarButtons(editor).map((b) => b.getAttribute('data-toolbar-item') ?? '');

    expect(items).toContain('taskList');
    expect(items.indexOf('taskList')).toBe(items.indexOf('orderedList') + 1);
    expect(buttonOf(editor, 'taskList').querySelector('svg')).not.toBeNull();
    expect(buttonOf(editor, 'taskList').title).toBe('任务列表');
  });

  it('点击把段落转成任务列表，再点退出', async () => {
    const editor = await mount({ content: '<p>待办</p>', toolbar: {} });
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'taskList'));
    const html = editor.getHTML();
    expect(html).toContain('<ul data-type="taskList"');
    expect(html).toContain('data-type="taskItem"');
    expect(html).toContain('data-checked="false"');
    expect(buttonOf(editor, 'taskList').classList.contains('active')).toBe(true);

    click(buttonOf(editor, 'taskList'));
    expect(editor.getHTML()).not.toContain('taskList');
    expect(buttonOf(editor, 'taskList').classList.contains('active')).toBe(false);
  });

  it('点击勾选框写回 checked，Markdown 导出为 [x]', async () => {
    const editor = await mount({ content: '<p>待办</p>', toolbar: {} });
    editor.editor.commands.setTextSelection(2);
    click(buttonOf(editor, 'taskList'));

    firstCheckbox(editor).click();
    expect(editor.getHTML()).toContain('data-checked="true"');

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('- [x] 待办');
  });

  it('Markdown 双向：- [ ] 与 - [x] 进来是任务列表，出去原样', async () => {
    const editor = await mount({ content: '<p>x</p>' });
    editor.setMarkdown('- [ ] 未完成\n- [x] 已完成\n');
    await settled();

    expect(taskItems(editor)).toBe(2);
    const html = editor.getHTML();
    expect(html).toContain('data-checked="false"');
    expect(html).toContain('data-checked="true"');

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('- [ ] 未完成');
    expect(markdown).toContain('- [x] 已完成');
  });

  it('嵌套任务列表随 Markdown 往返不丢', async () => {
    const editor = await mount({ content: '<p>x</p>' });
    editor.setMarkdown('- [ ] 外层\n  - [ ] 内层\n- [x] 又一项\n');
    await settled();

    expect(taskItems(editor)).toBe(3);
    const markdown = editor.getMarkdown();
    expect(markdown).toContain('- [ ] 外层');
    expect(markdown).toContain('  - [ ] 内层');
    expect(markdown).toContain('- [x] 又一项');
  });
});

describe('分割线与两端对齐按钮', () => {
  it('分割线按钮插入 hr，Markdown 导出为 ---', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'horizontalRule'));
    expect(editor.getHTML()).toContain('<hr');
    expect(editor.getMarkdown()).toMatch(/^---/m);
    // 插入型操作没有激活态
    expect(buttonOf(editor, 'horizontalRule').classList.contains('active')).toBe(false);
  });

  it('两端对齐按钮写 textAlign: justify 并点亮自己', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'alignJustify'));
    expect(editor.getHTML()).toMatch(/text-align:\s*justify/);
    expect(buttonOf(editor, 'alignJustify').classList.contains('active')).toBe(true);
  });
});
