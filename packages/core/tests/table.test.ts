import { describe, expect, it, vi } from 'vitest';
import type { AtriEditor } from '../src/index';
import { mount, rootOf, toolbarButtons } from './utils';

function buttonOf(editor: AtriEditor, id: string): HTMLButtonElement {
  const button = rootOf(editor).querySelector<HTMLButtonElement>(`[data-toolbar-item="${id}"]`);
  if (!button) throw new Error(`toolbar item "${id}" not rendered`);
  return button;
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pointerDownOn(node: Node): void {
  node.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/** 网格面板挂在 document.body 上，不在编辑器容器里 */
function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.atri-table-panel');
}

function cell(row: number, col: number): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    `.atri-table-panel [data-row="${row}"][data-col="${col}"]`
  );
  if (!el) throw new Error(`grid cell (${row}, ${col}) not found`);
  return el;
}

function hover(el: HTMLElement): void {
  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
}

function hint(): string {
  return document.querySelector('.atri-table-panel-hint')?.textContent ?? '';
}

function activeCellCount(): number {
  return document.querySelectorAll('.atri-table-panel-cell--active').length;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function mountWithToolbar(): Promise<AtriEditor> {
  return mount({ content: '<p>x</p>', toolbar: {} });
}

describe('TableGridPanel 插入表格', () => {
  it('默认工具栏渲染 insertTable 按钮，标记为弹出浮层', async () => {
    const editor = await mountWithToolbar();
    const button = buttonOf(editor, 'insertTable');

    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.querySelector('svg')).not.toBeNull();
  });

  it('点击打开 8×6 网格，再点同一按钮关闭，aria-expanded 跟着走', async () => {
    const editor = await mountWithToolbar();
    const button = buttonOf(editor, 'insertTable');

    click(button);
    expect(panel()).not.toBeNull();
    expect(document.querySelectorAll('.atri-table-panel-cell')).toHaveLength(48);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);

    click(button);
    expect(panel()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);
  });

  it('Escape 与点击外部都关闭面板', async () => {
    const editor = await mountWithToolbar();
    const button = buttonOf(editor, 'insertTable');

    click(button);
    pressEscape();
    expect(panel()).toBeNull();

    click(button);
    pointerDownOn(document.body);
    expect(panel()).toBeNull();
  });

  it('悬停高亮左上区域并提示尺寸', async () => {
    const editor = await mountWithToolbar();
    click(buttonOf(editor, 'insertTable'));

    hover(cell(1, 2));
    expect(hint()).toBe('2 × 3');
    expect(activeCellCount()).toBe(6);
  });

  it('点击单元格插入对应行列的表格并关闭面板', async () => {
    const editor = await mountWithToolbar();
    click(buttonOf(editor, 'insertTable'));

    click(cell(1, 2));
    await settled();
    expect(panel()).toBeNull();

    const html = editor.getHTML();
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
    expect((html.match(/<th[^>]*>/g) ?? []).length).toBe(3);
    expect((html.match(/<td[^>]*>/g) ?? []).length).toBe(3);
  });

  it('键盘方向键移动高亮、回车插入；未导航时回车不插', async () => {
    const editor = await mountWithToolbar();
    click(buttonOf(editor, 'insertTable'));
    const p = panel();
    if (!p) throw new Error('panel not open');

    // 没按过方向键：高亮为空，回车是误操作，忽略
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(editor.getHTML()).not.toContain('<table');

    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(hint()).toBe('2 × 2');

    p.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settled();
    const html = editor.getHTML();
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
    expect((html.match(/<th[^>]*>/g) ?? []).length).toBe(2);
  });

  it('方向键不会越出网格边界', async () => {
    const editor = await mountWithToolbar();
    click(buttonOf(editor, 'insertTable'));
    const p = panel();
    if (!p) throw new Error('panel not open');

    for (let i = 0; i < 20; i++) {
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    }
    expect(hint()).toBe('1 × 1');

    for (let i = 0; i < 20; i++) {
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      p.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    }
    expect(hint()).toBe('6 × 8');
  });

  it('table:false 时不注册按钮，也不拦别的项', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {}, table: false });

    expect(toolbarButtons(editor).map((b) => b.getAttribute('data-toolbar-item'))).not.toContain(
      'insertTable'
    );
  });

  it('destroy 时开着的面板一起清掉', async () => {
    const editor = await mountWithToolbar();
    click(buttonOf(editor, 'insertTable'));
    expect(panel()).not.toBeNull();

    editor.destroy();
    expect(panel()).toBeNull();
  });
});

describe('insertTable 门面 API', () => {
  it('默认插入 3×3 带表头', async () => {
    const editor = await mount({ content: '<p>x</p>' });

    editor.insertTable();
    const html = editor.getHTML();
    expect((html.match(/<tr>/g) ?? []).length).toBe(3);
    expect((html.match(/<th[^>]*>/g) ?? []).length).toBe(3);
    expect((html.match(/<td[^>]*>/g) ?? []).length).toBe(6);
  });

  it('可指定行列与关闭表头', async () => {
    const editor = await mount({ content: '<p>x</p>' });

    editor.insertTable({ rows: 2, cols: 4, withHeaderRow: false });
    const html = editor.getHTML();
    expect((html.match(/<tr>/g) ?? []).length).toBe(2);
    expect((html.match(/<th[^>]*>/g) ?? []).length).toBe(0);
    expect((html.match(/<td[^>]*>/g) ?? []).length).toBe(8);
  });
});

describe('表格的 Markdown 往返', () => {
  it('setMarkdown 解析 pipe table，getMarkdown 原样导出', async () => {
    const editor = await mount({ content: '<p>x</p>' });

    editor.setMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n');
    await settled();
    const html = editor.getHTML();
    expect(html).toContain('<table');
    expect((html.match(/<th[^>]*>/g) ?? []).length).toBe(2);
    expect((html.match(/<td[^>]*>/g) ?? []).length).toBe(2);

    const markdown = editor.getMarkdown();
    // renderTableToMarkdown 会把列宽补齐对齐（'| a   |'），所以只断言单元格内容与分隔行
    expect(markdown).toMatch(/\|\s*a\s*\|\s*b\s*\|/);
    expect(markdown).toMatch(/\|\s*-{3,}\s*\|\s*-{3,}\s*\|/);
    expect(markdown).toMatch(/\|\s*1\s*\|\s*2\s*\|/);
  });

  it('表格节点插入后导出不静默丢内容', async () => {
    const editor = await mount({ content: '<p>x</p>' });
    editor.insertTable({ rows: 2, cols: 2 });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const markdown = editor.getMarkdown();
    // 两个空单元格的 pipe table：至少要有分隔行
    expect(markdown).toMatch(/\|.*\|/);
    expect(markdown).toMatch(/-{3}/);
  });
});
