/**
 * TableGridPanel - 工具栏「插入表格」的网格悬停选择器
 *
 * Notion 式交互：悬停高亮左上 (row × col) 区域、点击即插入。
 * 与 InsertPanel 同为挂在 document.body 上的浮层，定位/关闭/主题三段走 floating-panel 公共底盘。
 */
import type { Editor } from '@tiptap/core';
import {
  copyThemeClasses,
  listenPanelDismiss,
  positionPanel,
  type FloatingPanel,
} from './floating-panel';
import { tOrFallback, type I18nManager } from './I18nManager';

export interface TableGridPanelOptions {
  editor: Editor;
  i18n?: I18nManager;
  /** 开合时把控制权交回工具栏：按钮的 active 与 aria-expanded 由它维护 */
  onOpenChange?: (open: boolean) => void;
}

/** 网格上限：再大就该用数字输入面板了，Notion 也是 8×6 左右 */
const MAX_COLS = 8;
const MAX_ROWS = 6;

export class TableGridPanel {
  private editor: Editor;
  private i18n?: I18nManager;
  private onOpenChange?: (open: boolean) => void;

  private element: HTMLDivElement | null = null;
  private floating: FloatingPanel | null = null;
  private detachDismiss: (() => void) | null = null;
  /** 键盘高亮的当前格，-1 表示还没进入键盘导航 */
  private cursorRow = -1;
  private cursorCol = -1;
  /** 单元格按 row * MAX_COLS + col 存放，方便方向键直接换算 */
  private cells: HTMLElement[] = [];

  constructor(options: TableGridPanelOptions) {
    this.editor = options.editor;
    this.i18n = options.i18n;
    this.onOpenChange = options.onOpenChange;
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) {
      this.close();
      return;
    }

    this.build();
    const panel = this.element;
    if (!panel) return;
    this.floating = positionPanel(anchor, panel, () => this.element === panel);
    this.detachDismiss = listenPanelDismiss(anchor, panel, () => this.close());
    this.onOpenChange?.(true);
  }

  close(): void {
    if (!this.element) return;
    this.detachDismiss?.();
    this.detachDismiss = null;
    this.floating?.stop();
    this.floating = null;
    this.element.remove();
    this.element = null;
    this.cells = [];
    this.cursorRow = -1;
    this.cursorCol = -1;
    this.onOpenChange?.(false);
  }

  destroy(): void {
    this.close();
  }

  private t(key: string, fallback: string): string {
    return tOrFallback(this.i18n, key, fallback);
  }

  private build(): void {
    const panel = document.createElement('div');
    panel.className = 'atri-table-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', this.t('editor.table', '表格'));
    // 面板本身可聚焦：方向键与 Escape 才有事件落点，jsdom/真实浏览器都靠这个键盘入口
    panel.tabIndex = -1;

    const grid = document.createElement('div');
    grid.className = 'atri-table-panel-grid';
    this.cells = [];

    for (let row = 0; row < MAX_ROWS; row++) {
      for (let col = 0; col < MAX_COLS; col++) {
        const cell = document.createElement('div');
        cell.className = 'atri-table-panel-cell';
        // 网格用 table 语义 + role=gridcell，读屏能报出行列坐标
        cell.setAttribute('role', 'gridcell');
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        cell.addEventListener('mouseenter', () => this.highlight(row + 1, col + 1));
        cell.addEventListener('click', () => this.insert(row + 1, col + 1));
        grid.appendChild(cell);
        this.cells.push(cell);
      }
    }

    const hint = document.createElement('div');
    hint.className = 'atri-table-panel-hint';
    hint.textContent = this.t('editor.table', '表格');

    panel.addEventListener('keydown', (event) => this.onKeyDown(event));
    panel.appendChild(grid);
    panel.appendChild(hint);

    document.body.appendChild(panel);
    this.element = panel;
    copyThemeClasses(this.editor.view.dom, panel);
    panel.focus();
  }

  /**
   * 高亮左上角 (rows × cols) 区域并在提示行显示尺寸；-1 清空
   */
  private highlight(rows: number, cols: number): void {
    this.cursorRow = rows < 0 ? -1 : rows - 1;
    this.cursorCol = cols < 0 ? -1 : cols - 1;

    this.cells.forEach((cell) => {
      const r = Number(cell.dataset.row);
      const c = Number(cell.dataset.col);
      const active = rows > 0 && cols > 0 && r < rows && c < cols;
      cell.classList.toggle('atri-table-panel-cell--active', active);
      if (active) {
        cell.setAttribute('aria-selected', 'true');
      } else {
        cell.removeAttribute('aria-selected');
      }
    });

    const hint = this.element?.querySelector('.atri-table-panel-hint');
    if (hint) {
      hint.textContent = rows > 0 ? `${rows} × ${cols}` : this.t('editor.table', '表格');
    }
  }

  private insert(rows: number, cols: number): void {
    this.editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
    this.close();
  }

  private onKeyDown(event: KeyboardEvent): void {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };

    if (event.key === 'Enter') {
      event.preventDefault();
      // 还没导航过就没有高亮格，回车不插任何表格
      if (this.cursorRow < 0 || this.cursorCol < 0) return;
      this.insert(this.cursorRow + 1, this.cursorCol + 1);
      return;
    }

    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();

    const baseRow = this.cursorRow < 0 ? 0 : this.cursorRow;
    const baseCol = this.cursorCol < 0 ? 0 : this.cursorCol;
    const row = Math.min(MAX_ROWS - 1, Math.max(0, baseRow + delta[0]));
    const col = Math.min(MAX_COLS - 1, Math.max(0, baseCol + delta[1]));
    this.highlight(row + 1, col + 1);
  }
}
