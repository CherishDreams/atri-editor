/**
 * AICommandMenu - AI 命令菜单（使用 Floating UI）
 */
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import { computePosition } from '@floating-ui/dom';
import { panelMiddleware, placePanel } from '../core/floating-panel';
import type { AtriAIFunction } from '../types';

export interface AICommandMenuOptions {
  /** AI 功能列表 */
  functions: AtriAIFunction[];
  /** 触发字符（默认 /） */
  triggerChar?: string;
  /** 选择回调 */
  onSelect?: (func: AtriAIFunction) => void;
}

/**
 * AI 命令菜单管理器
 * 提供 / 触发 AI 命令菜单功能
 */
export class AICommandMenuManager {
  private editor: Editor;
  private functions: AtriAIFunction[];
  private menuElement: HTMLDivElement | null = null;
  private isVisible = false;
  private selectedIndex = 0;
  private triggerChar: string;
  private onSelect?: (func: AtriAIFunction) => void;
  private detachKeyListener?: () => void;
  private detachTransactionListener?: () => void;
  private triggerRange: { from: number; to: number } | null = null;

  constructor(
    editor: Editor,
    functions: AtriAIFunction[],
    triggerChar: string = '/',
    onSelect?: (func: AtriAIFunction) => void
  ) {
    this.editor = editor;
    this.functions = functions;
    this.triggerChar = triggerChar;
    this.onSelect = onSelect;
    this.setupKeyboardListener();
    this.setupMenuKeyListener();
    this.editor.on('blur', this.onBlur);
    this.editor.on('update', this.onUpdate);
  }

  private onBlur = (): void => this.hide();
  private onScroll = (): void => {
    void this.positionMenu();
  };

  private onUpdate = (): void => {
    if (!this.editor.isEditable) this.hide();
  };

  /**
   * 让键盘导航可达
   * 监听挂在 document 捕获阶段：ProseMirror 在 view.dom 上已有 keymap，
   * 若等它先处理，Enter 会被用来拆段而不是选中菜单项
   */
  private setupMenuKeyListener(): void {
    const handler = (event: KeyboardEvent) => {
      if (!this.isVisible || !this.editor.isFocused) return;
      if (this.handleKeyDown(event)) {
        event.stopPropagation();
      }
    };
    document.addEventListener('keydown', handler, true);
    this.detachKeyListener = () => document.removeEventListener('keydown', handler, true);
  }

  private setupKeyboardListener(): void {
    const handler = ({ transaction }: { editor: Editor; transaction: Transaction }) => {
      if (this.isVisible && this.triggerRange) {
        const from = transaction.mapping.mapResult(this.triggerRange.from, 1);
        const to = transaction.mapping.mapResult(this.triggerRange.to, -1);
        const selection = this.editor.state.selection;
        if (
          from.deletedAcross ||
          to.deletedAcross ||
          from.pos >= to.pos ||
          !selection.empty ||
          selection.from !== to.pos ||
          this.editor.state.doc.textBetween(from.pos, to.pos) !== this.triggerChar
        ) {
          this.hide();
          return;
        }
        this.triggerRange = { from: from.pos, to: to.pos };
      }
      // 检测触发字符输入
      if (transaction.docChanged && this.editor.isEditable) {
        const lastChar = this.getLastTypedChar();
        if (lastChar === this.triggerChar && !this.isVisible) {
          this.show();
          const to = this.editor.state.selection.from;
          this.triggerRange = { from: to - 1, to };
        }
      }
    };
    this.editor.on('transaction', handler);
    // 这条订阅也要能解除：菜单是公开导出的类，宿主单独用它时，
    // destroy 之后编辑器还活着的话，输入触发字符就仍能浮出菜单
    this.detachTransactionListener = () => this.editor.off('transaction', handler);
  }

  private getLastTypedChar(): string {
    const { doc, selection } = this.editor.state;
    if (selection.from <= 0) return '';
    return doc.textBetween(selection.from - 1, selection.from);
  }

  /**
   * 显示菜单
   */
  show(): void {
    // 没有可选项就没什么可浮出的：空菜单是个看不懂的空盒子，
    // 还会把 Enter/方向键吃掉（selectedIndex 对 0 取模得 NaN）
    if (this.isVisible || !this.functions.length || !this.editor.isEditable) return;
    this.isVisible = true;
    this.selectedIndex = 0;
    this.createMenuElement();
    this.positionMenu();
    document.addEventListener('scroll', this.onScroll, true);
    window.addEventListener('resize', this.onScroll);
  }

  /**
   * 隐藏菜单
   */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    document.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onScroll);
    this.triggerRange = null;
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
  }

  private createMenuElement(): void {
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'atri-ai-command-menu';
    this.menuElement.setAttribute('role', 'listbox');
    this.menuElement.addEventListener('mousedown', (event) => event.preventDefault());

    this.functions.forEach((func, index) => {
      const item = document.createElement('div');
      item.className = 'atri-ai-command-menu-item';
      item.setAttribute('role', 'option');
      item.setAttribute('data-index', String(index));

      if (index === this.selectedIndex) {
        item.classList.add('active');
      }

      if (func.icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'atri-ai-command-menu-icon';
        iconSpan.innerHTML = func.icon;
        item.appendChild(iconSpan);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'atri-ai-command-menu-name';
      nameSpan.textContent = func.name;
      item.appendChild(nameSpan);

      if (func.description) {
        item.title = func.description;
      }

      item.addEventListener('click', () => this.selectItem(index));
      item.addEventListener('mouseenter', () => this.highlightItem(index));

      this.menuElement!.appendChild(item);
    });

    document.body.appendChild(this.menuElement);
  }

  private async positionMenu(): Promise<void> {
    const menuElement = this.menuElement;
    if (!menuElement) return;

    const { view } = this.editor;
    const { from } = view.state.selection;

    let x: number;
    let y: number;
    try {
      const coords = view.coordsAtPos(from);
      // 用光标坐标合成一个虚拟锚点：VirtualElement 只需要 getBoundingClientRect
      const virtualReference = {
        getBoundingClientRect(): DOMRect {
          return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
        },
      };

      ({ x, y } = await computePosition(virtualReference, menuElement, {
        strategy: 'fixed',
        placement: 'bottom-start',
        middleware: panelMiddleware(),
      }));
    } catch {
      // 测量或定位失败时保持菜单可见，仅跳过定位
      return;
    }

    // 异步定位期间菜单可能已关闭或被重建
    if (this.menuElement !== menuElement) return;

    placePanel(menuElement, x, y);
  }

  private selectItem(index: number): void {
    const func = this.functions[index];
    if (func && this.onSelect && this.editor.isEditable) {
      // 删除触发字符
      this.deleteTriggerChar();
      this.onSelect(func);
    }
    this.hide();
  }

  private highlightItem(index: number): void {
    this.selectedIndex = index;
    this.updateHighlight();
  }

  private updateHighlight(): void {
    if (!this.menuElement) return;
    const items = this.menuElement.querySelectorAll('.atri-ai-command-menu-item');
    items.forEach((item, i) => {
      if (i === this.selectedIndex) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  private deleteTriggerChar(): void {
    const { state, view } = this.editor;
    const range = this.triggerRange;
    if (!range || state.doc.textBetween(range.from, range.to) !== this.triggerChar) return;
    this.hide();
    const tr = state.tr.delete(range.from, range.to);
    view.dispatch(tr);
  }

  /**
   * 处理键盘事件
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isVisible || !this.editor.isEditable) return false;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % this.functions.length;
        this.updateHighlight();
        return true;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex =
          (this.selectedIndex - 1 + this.functions.length) % this.functions.length;
        this.updateHighlight();
        return true;

      case 'Enter':
        event.preventDefault();
        this.selectItem(this.selectedIndex);
        return true;

      case 'Escape':
        event.preventDefault();
        this.hide();
        return true;
    }

    return false;
  }

  /**
   * 销毁
   */
  destroy(): void {
    this.editor.off('blur', this.onBlur);
    this.editor.off('update', this.onUpdate);
    this.detachKeyListener?.();
    this.detachKeyListener = undefined;
    this.detachTransactionListener?.();
    this.detachTransactionListener = undefined;
    this.hide();
  }
}
