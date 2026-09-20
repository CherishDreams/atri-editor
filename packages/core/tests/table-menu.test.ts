import { CellSelection } from '@tiptap/pm/tables';
import { describe, expect, it } from 'vitest';
import type { AtriEditor, AtriTableConfig } from '../src/index';
import { click, mount, pressEscape, stubGeometry } from './utils';

/** 菜单与插入浮层一样挂在 document.body 上，不在编辑器容器里 */
function menu(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.atri-table-menu');
}

function menuItems(): string[] {
  return Array.from(menu()?.querySelectorAll('[data-table-item]') ?? []).map(
    (el) => el.getAttribute('data-table-item') ?? ''
  );
}

function item(id: string): HTMLButtonElement {
  const button = menu()?.querySelector<HTMLButtonElement>(`[data-table-item="${id}"]`);
  if (!button) throw new Error(`table menu item "${id}" not rendered`);
  return button;
}

function separators(): number {
  return menu()?.querySelectorAll('.atri-table-menu-separator').length ?? 0;
}

/** 所有单元格节点在文档里的位置 */
function cellPositions(editor: AtriEditor): number[] {
  const positions: number[] = [];
  editor.editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') positions.push(pos);
  });
  return positions;
}

/** 把光标放进第 index 个单元格：+1 进单元格内容（段落），再 +1 到段落内的文字位 */
function cursorIntoCell(editor: AtriEditor, index = 0): void {
  const pos = cellPositions(editor)[index];
  if (pos === undefined) throw new Error(`document has no cell at index ${index}`);
  editor.editor.commands.setTextSelection(pos + 2);
}

function rowCount(editor: AtriEditor): number {
  return (editor.getHTML().match(/<tr>/g) ?? []).length;
}

function headerCount(editor: AtriEditor): number {
  return (editor.getHTML().match(/<th[^>]*>/g) ?? []).length;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * 插一张 2×2 带表头的表，光标落在第一个单元格（表头格）里
 *
 * 第二段是留给"表格外"的落脚点：insertTable 替换的是当前选中的文本块，
 * 从第二段插进去，第一段就留在表格前面
 */
async function mountWithTable(table?: AtriTableConfig | false): Promise<AtriEditor> {
  const editor = await mount({ content: '<p>a</p><p>b</p>', table });
  // 菜单命令都带 focus()，而 jsdom 量不了排版，不桩会在 view 更新时抛
  stubGeometry(editor);
  editor.editor.commands.setTextSelection(4);
  editor.insertTable({ rows: 2, cols: 2 });
  await settled();
  return editor;
}

/** 表格外的那一段（文档里第一段） */
function cursorOutsideTable(editor: AtriEditor): void {
  editor.editor.commands.setTextSelection(1);
}

describe('TableMenu 表格操作菜单', () => {
  it('光标进入表格浮出菜单，离开表格收起', async () => {
    const editor = await mountWithTable();
    // 插完表格光标就在第一个单元格里，菜单不该等下一次敲键才出现
    expect(menu()).not.toBeNull();

    cursorOutsideTable(editor);
    expect(menu()).toBeNull();

    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();
  });

  it('一次浮出全部操作项，按组用竖线分隔', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);

    expect(menuItems()).toEqual([
      'addRowBefore',
      'addRowAfter',
      'deleteRow',
      'addColumnBefore',
      'addColumnAfter',
      'deleteColumn',
      'mergeCells',
      'splitCell',
      'toggleHeaderRow',
      'cellAlignLeft',
      'cellAlignCenter',
      'cellAlignRight',
      'deleteTable',
    ]);
    expect(separators()).toBe(4);
    expect(item('addRowAfter').querySelector('svg')).not.toBeNull();
    expect(item('addRowAfter').title).toBe('下方插入行');
  });

  it('插入与删除行列作用于光标所在的单元格', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);
    expect(rowCount(editor)).toBe(2);
    expect(headerCount(editor)).toBe(2);

    click(item('addRowAfter'));
    expect(rowCount(editor)).toBe(3);

    click(item('addColumnAfter'));
    expect(headerCount(editor)).toBe(3);

    click(item('addColumnBefore'));
    expect(headerCount(editor)).toBe(4);

    click(item('deleteColumn'));
    expect(headerCount(editor)).toBe(3);

    // 光标在表头行里，删行删掉的就是这一行
    click(item('deleteRow'));
    expect(rowCount(editor)).toBe(2);
    expect(headerCount(editor)).toBe(0);
    // 光标随后落到下一行，菜单不该跟着消失
    expect(menu()).not.toBeNull();
  });

  it('合并要有多个单元格被框住，拆分要有合并过的单元格', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);

    // 单选一个单元格时两项都按不动
    expect(item('mergeCells').disabled).toBe(true);
    expect(item('splitCell').disabled).toBe(true);

    const [first, second] = cellPositions(editor);
    if (first === undefined || second === undefined) throw new Error('need two cells');
    editor.editor.view.dispatch(
      editor.editor.state.tr.setSelection(
        CellSelection.create(editor.editor.state.doc, first, second)
      )
    );
    expect(item('mergeCells').disabled).toBe(false);

    click(item('mergeCells'));
    expect(editor.getHTML()).toContain('colspan="2"');

    // 合并之后反过来：拆得开，合并不了
    cursorIntoCell(editor);
    expect(item('splitCell').disabled).toBe(false);
    expect(item('mergeCells').disabled).toBe(true);

    click(item('splitCell'));
    expect(editor.getHTML()).not.toContain('colspan="2"');
  });

  it('切换表头行与删除表格', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);
    expect(item('toggleHeaderRow').classList.contains('active')).toBe(true);

    click(item('toggleHeaderRow'));
    expect(headerCount(editor)).toBe(0);
    expect(item('toggleHeaderRow').classList.contains('active')).toBe(false);

    click(item('deleteTable'));
    expect(editor.getHTML()).not.toContain('<table');
    // 表格没了，光标已经不在表格里，菜单跟着收
    expect(menu()).toBeNull();
  });

  it('单元格对齐写进 align 属性，并随 Markdown 一起导出', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);

    click(item('cellAlignCenter'));
    expect(editor.getHTML()).toMatch(/text-align:\s*center/);
    expect(item('cellAlignCenter').classList.contains('active')).toBe(true);

    // 对齐落在单元格自带的 align 属性上，pipe table 的分隔行读的就是它
    expect(editor.getMarkdown()).toMatch(/\|\s*:-+:\s*\|/);
  });

  it('Escape 收起后不再自动浮出，离开表格再进来重新浮出', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();

    pressEscape();
    expect(menu()).toBeNull();

    // 还在表格里：敲字产生的 update 不该把菜单又拉出来
    editor.editor.commands.insertContent('a');
    await settled();
    expect(menu()).toBeNull();

    cursorOutsideTable(editor);
    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();
  });

  it('切成只读即收起，改回可编辑再浮出', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();

    editor.setEditable(false);
    expect(menu()).toBeNull();

    editor.setEditable(true);
    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();
  });

  it('table:false 不注册表格节点，menu:false 只是不浮菜单', async () => {
    const disabled = await mount({
      content: '<table><tbody><tr><td>a</td></tr></tbody></table>',
      table: false,
    });
    expect(disabled.editor.schema.nodes.table).toBeUndefined();
    expect(menu()).toBeNull();

    const withoutMenu = await mountWithTable({ menu: false });
    cursorIntoCell(withoutMenu);
    expect(menu()).toBeNull();
  });

  it('destroy 时菜单与监听一起清掉', async () => {
    const editor = await mountWithTable();
    cursorIntoCell(editor);
    expect(menu()).not.toBeNull();

    editor.destroy();
    expect(menu()).toBeNull();
    // 销毁后再滚动不该碰已经离场的面板
    expect(() => document.dispatchEvent(new Event('scroll'))).not.toThrow();
  });
});
