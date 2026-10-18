/**
 * StyleOptionPanel - 颜色 / 字号 / 字体的选择面板
 *
 * 这些项不是按钮：它们要的是一组取值，所以是一个挂在 document.body 上的浮层，
 * 定位、外点/Escape 关闭、主题类复制三段全走 floating-panel 公共底盘（与
 * TableGridPanel、InsertPanel 同一套）。
 *
 * 面板只有一份实例，由 ToolbarManager 持有：同时最多开一个，四个入口共用一个实例
 * 也比四个各自留着 DOM 干净。代价是 toggle 要分清"点的是同一个触发器"还是"换了一个"
 * ——换了就重建，不能因为已经开着就直接关，否则点字号再点字体会得到"什么都没发生"。
 */
import type { Editor } from '@tiptap/core';
import {
  followThemeClasses,
  listenPanelDismiss,
  positionPanel,
  type FloatingPanel,
} from './floating-panel';
import { tOrFallback, type I18nManager } from './I18nManager';
import type { StyleOption } from './style-presets';

export interface StylePanelSpec {
  /**
   * 这个入口的标识（如 'textColor'）。面板是四个入口共用的一个实例，
   * 而每个触发按钮的按下态只能属于自己——没有这个 key 就会四个一起亮
   */
  key: string;
  /** 面板的无障碍名字，也是列表形状下的提示行 */
  label: string;
  /** grid 是色块方阵，list 是一行一个文字选项 */
  shape: 'grid' | 'list';
  options: StyleOption[];
  /** 选定一个取值。关闭面板由内部负责 */
  onPick: (value: string) => void;
  /** 「清除」行：把该属性 unset 掉而不是设成某个值 */
  clearLabel?: string;
  /** 「其他颜色」行，用原生取色器取任意值 */
  customColorLabel?: string;
}

export interface StyleOptionPanelOptions {
  editor: Editor;
  i18n?: I18nManager;
  /** 开合时把控制权交回工具栏：按钮的 active 与 aria-expanded 由它维护 */
  onOpenChange?: (open: boolean) => void;
}

export class StyleOptionPanel {
  private editor: Editor;
  private i18n?: I18nManager;
  private onOpenChange?: (open: boolean) => void;

  private element: HTMLDivElement | null = null;
  private floating: FloatingPanel | null = null;
  private detachDismiss: (() => void) | null = null;
  private detachTheme: (() => void) | null = null;
  /** 当前锚在哪个触发器上：同一个再点是关，换一个是改开那个 */
  private anchor: HTMLElement | null = null;
  /** 当前开着的是哪个入口的 spec.key，工具栏据此把按下态只给那一个按钮 */
  private currentKey: string | null = null;
  private rows: HTMLButtonElement[] = [];

  constructor(options: StyleOptionPanelOptions) {
    this.editor = options.editor;
    this.i18n = options.i18n;
    this.onOpenChange = options.onOpenChange;
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  get openKey(): string | null {
    return this.currentKey;
  }

  /** 面板是否正开在某个指定触发器上——工具栏据此决定按钮的按下态给谁 */
  isOpenFor(anchor: HTMLElement): boolean {
    return this.isOpen && this.anchor === anchor;
  }

  toggle(anchor: HTMLElement, spec: StylePanelSpec): void {
    if (this.isOpen) {
      const switching = this.anchor !== anchor;
      this.close();
      // 换一个入口点进来时不要"先关再不动"，用户要的是新面板
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

  private open(anchor: HTMLElement, spec: StylePanelSpec): void {
    const panel = this.build(spec);
    document.body.appendChild(panel);
    this.detachTheme = followThemeClasses(this.editor.view.dom, panel);
    this.element = panel;
    this.anchor = anchor;
    this.currentKey = spec.key;
    this.floating = positionPanel(anchor, panel, () => this.element === panel);
    this.detachDismiss = listenPanelDismiss(anchor, panel, () => this.close());
    this.onOpenChange?.(true);
    panel.focus();
  }

  private labelOf(option: StyleOption): string {
    if (!option.i18nKey) return option.label;
    return tOrFallback(this.i18n, option.i18nKey, option.label);
  }

  private build(spec: StylePanelSpec): HTMLDivElement {
    const panel = document.createElement('div');
    panel.className = `atri-style-panel atri-style-panel--${spec.shape}`;
    panel.setAttribute('role', 'menu');
    panel.setAttribute('aria-label', spec.label);
    // 面板本身可聚焦：方向键与 Escape 才有落点，键盘导航从这一行起步
    panel.tabIndex = -1;
    panel.addEventListener('keydown', (event) => this.onKeyDown(event));

    const body = document.createElement('div');
    body.className = 'atri-style-panel-body';
    this.rows = [];

    spec.options.forEach((option) => {
      body.appendChild(this.makeRow(option, spec));
    });

    if (spec.customColorLabel) {
      body.appendChild(this.makeCustomColorRow(spec));
    }

    if (spec.clearLabel) {
      const clear: StyleOption = {
        value: '',
        label: spec.clearLabel,
        isClear: true,
      };
      body.appendChild(this.makeRow(clear, spec));
    }

    panel.appendChild(body);
    return panel;
  }

  private makeRow(option: StyleOption, spec: StylePanelSpec): HTMLButtonElement {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'atri-style-panel-row';
    row.setAttribute('role', 'menuitem');
    row.dataset.styleValue = option.value;
    if (option.isClear) row.classList.add('atri-style-panel-row--clear');

    const label = this.labelOf(option);
    row.title = label;
    row.setAttribute('aria-label', label);

    if (option.swatch) {
      // 色块是装饰，语义已经挂在 aria-label 上，所以这块本身对读屏隐藏
      const swatch = document.createElement('span');
      swatch.className = 'atri-style-panel-swatch';
      swatch.style.backgroundColor = option.swatch;
      swatch.setAttribute('aria-hidden', 'true');
      row.appendChild(swatch);
      // 色块方阵里不排文字，CSS 值只作为 title 与无障碍名存在
      if (spec.shape === 'grid') row.classList.add('atri-style-panel-row--swatch-only');
    }

    if (spec.shape === 'list' || !option.swatch) {
      const text = document.createElement('span');
      text.className = 'atri-style-panel-text';
      text.textContent = label;
      if (option.preview) text.style.fontFamily = option.preview;
      row.appendChild(text);
    }

    row.addEventListener('click', () => {
      if (option.isClear) {
        spec.onPick('');
      } else {
        spec.onPick(option.value);
      }
      this.close();
    });

    this.rows.push(row);
    return row;
  }

  /**
   * 原生取色器：不在预设色板里时用它。
   *
   * 监听 change 而不是 input——input 在拖动取色器的过程中每移一像素就触发一次，
   * 每一次都是一条进撤销历史的事务，用户按一次撤销只能退一格，得按上百次才回到起点。
   */
  private makeCustomColorRow(spec: StylePanelSpec): HTMLElement {
    const row = document.createElement('label');
    row.className = 'atri-style-panel-custom';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'atri-style-panel-custom-input';
    input.value = '#1890ff';
    input.addEventListener('change', () => {
      spec.onPick(input.value);
      this.close();
    });

    const text = document.createElement('span');
    text.textContent = spec.customColorLabel ?? '';

    row.appendChild(input);
    row.appendChild(text);
    return row;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];

    if (event.key === 'Enter' || event.key === ' ') return;

    if (step === undefined) return;
    event.preventDefault();
    if (this.rows.length === 0) return;

    const focused = document.activeElement;
    const current = this.rows.indexOf(focused as HTMLButtonElement);
    // 还没进过列表就从头（或从尾）开始，而不是把焦点丢回面板
    const next =
      current < 0
        ? step > 0
          ? 0
          : this.rows.length - 1
        : (current + step + this.rows.length) % this.rows.length;
    this.rows[next].focus();
  }
}
