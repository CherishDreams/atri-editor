/**
 * ToolbarMenuPanel - 工具栏项的下拉菜单（ToolbarItem.children 的落地）
 *
 * 与 StyleOptionPanel 是同一类东西的两个特例，所以结构上有八成相似
 * （锚定、外点与 Escape 关闭、主题跟随、方向键走完列表、共用实例时按 key 归属按下态）。
 * 没有在这里合并成一个带 mode 开关的类，是跟本仓库自己的先例走：
 * 浮层公共底盘是在第三份出现时才抽出去的（见提交 2764ef6），两份先并存。
 * 第三份浮层出现时一起抽，比现在为了少 60 行而给两边都加条件分支更划算。
 */
import type { Editor } from '@tiptap/core';
import {
  followThemeClasses,
  listenPanelDismiss,
  positionPanel,
  type FloatingPanel,
} from './floating-panel';

/** 菜单里的一行。active / disabled 在打开那一刻算好——开着菜单时选区不会变，
 *  因为点进正文的那一下 pointerdown 就已经把菜单关掉了 */
export interface ToolbarMenuItemRow {
  id: string;
  label: string;
  active: boolean;
  disabled: boolean;
  run: () => void;
}

export interface ToolbarMenuSpec {
  /** 触发这一菜单的工具栏项 id，按下态只归它 */
  key: string;
  /** 面板的无障碍名字 */
  label: string;
  rows: ToolbarMenuItemRow[];
}

export interface ToolbarMenuPanelOptions {
  editor: Editor;
  /** 开合时把控制权交回工具栏：按钮的 active 与 aria-expanded 由它维护 */
  onOpenChange?: (open: boolean) => void;
}

export class ToolbarMenuPanel {
  private editor: Editor;
  private onOpenChange?: (open: boolean) => void;

  private element: HTMLDivElement | null = null;
  private floating: FloatingPanel | null = null;
  private detachDismiss: (() => void) | null = null;
  private detachTheme: (() => void) | null = null;
  private anchor: HTMLElement | null = null;
  private currentKey: string | null = null;
  private rows: HTMLButtonElement[] = [];

  constructor(options: ToolbarMenuPanelOptions) {
    this.editor = options.editor;
    this.onOpenChange = options.onOpenChange;
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  get openKey(): string | null {
    return this.currentKey;
  }

  toggle(anchor: HTMLElement, spec: ToolbarMenuSpec): void {
    if (this.isOpen) {
      const switching = this.anchor !== anchor;
      this.close();
      if (switching) this.open(anchor, spec);
      return;
    }
    this.open(anchor, spec);
  }

  close(): void {
    if (!this.element) return;
    this.detachDismiss?.();
    this.detachDismiss = null;
    this.detachTheme?.();
    this.detachTheme = null;
    this.floating?.stop();
    this.floating = null;
    this.element.remove();
    this.element = null;
    this.anchor = null;
    this.currentKey = null;
    this.rows = [];
    this.onOpenChange?.(false);
  }

  destroy(): void {
    this.close();
  }

  private open(anchor: HTMLElement, spec: ToolbarMenuSpec): void {
    const panel = this.build(spec);
    document.body.appendChild(panel);
    this.detachTheme = followThemeClasses(this.editorViewDom(anchor), panel);
    this.element = panel;
    this.anchor = anchor;
    this.currentKey = spec.key;
    this.floating = positionPanel(anchor, panel, () => this.element === panel);
    this.detachDismiss = listenPanelDismiss(anchor, panel, () => this.close());
    this.onOpenChange?.(true);
    panel.focus();
  }

  /**
   * 主题类要从编辑器根上取，而这里只拿得到一个锚在工具栏上的按钮：
   * 沿 DOM 往上找 .atri-editor 比让调用方再多传一个参数省事，且工具栏就在那个根里面
   */
  private editorViewDom(anchor: HTMLElement): Element | null {
    return anchor.closest('.atri-editor');
  }

  private build(spec: ToolbarMenuSpec): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = 'atri-toolbar-menu';
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', spec.label);
    panel.tabIndex = -1;
    panel.addEventListener('keydown', (event) => this.onKeyDown(event));

    this.rows = [];
    spec.rows.forEach((row) => panel.appendChild(this.makeRow(row)));
    return panel;
  }

  private makeRow(row: ToolbarMenuItemRow): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atri-toolbar-menu-item';
    // 标题级别与对齐方式都是"多选一"，所以是 menuitemradio + aria-checked，
    // 而不是 menuitem——读屏因此能报出当前选中的是哪一项
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', String(row.active));
    button.dataset.menuItem = row.id;
    button.textContent = row.label;
    button.disabled = row.disabled;
    if (row.active) button.classList.add('active');

    button.addEventListener('click', () => {
      row.run();
      this.close();
      // 焦点要还给编辑器：顶栏普通按钮的路径是在 createButton 里补这一手的，
      // 走菜单不经过那里，而此刻持有焦点的那个行元素刚被 remove 掉——
      // 不还的话用户选完"标题 2"接着打字，字就丢了
      this.editor.commands.focus();
    });

    this.rows.push(button);
    return button;
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') return;

    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    if (this.rows.length === 0) return;

    const current = this.rows.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      current < 0
        ? step > 0
          ? 0
          : this.rows.length - 1
        : (current + step + this.rows.length) % this.rows.length;
    this.rows[next].focus();
  }
}
