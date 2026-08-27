/**
 * AICommandMenu - AI 命令菜单（使用 Floating UI）
 */
import type { Editor } from '@tiptap/core';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
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
  }

  private setupKeyboardListener(): void {
    this.editor.on('transaction', ({ transaction }) => {
      // 检测触发字符输入
      if (transaction.docChanged) {
        const lastChar = this.getLastTypedChar();
        if (lastChar === this.triggerChar && !this.isVisible) {
          this.show();
        }
      }
    });
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
    if (this.isVisible) return;
    this.isVisible = true;
    this.selectedIndex = 0;
    this.createMenuElement();
    this.positionMenu();
  }

  /**
   * 隐藏菜单
   */
  hide(): void {
    if (!this.isVisible) return;
    this.isVisible = false;
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
  }

  private createMenuElement(): void {
    this.menuElement = document.createElement('div');
    this.menuElement.className = 'atri-ai-command-menu';
    this.menuElement.setAttribute('role', 'listbox');

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
    if (!this.menuElement) return;

    const { view } = this.editor;
    const { from } = view.state.selection;
    const coords = view.coordsAtPos(from);

    const virtualReference = {
      getBoundingClientRect(): DOMRect {
        return new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top);
      },
    };

    const { x, y } = await computePosition(virtualReference as any, this.menuElement, {
      placement: 'bottom-start',
      middleware: [offset(8), flip(), shift()],
    });

    this.menuElement.style.position = 'fixed';
    this.menuElement.style.left = `${x}px`;
    this.menuElement.style.top = `${y}px`;
  }

  private selectItem(index: number): void {
    const func = this.functions[index];
    if (func && this.onSelect) {
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
    const { from } = state.selection;
    const tr = state.tr.delete(from - 1, from);
    view.dispatch(tr);
  }

  /**
   * 处理键盘事件
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (!this.isVisible) return false;

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
    this.hide();
  }
}
