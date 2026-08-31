/**
 * ToolbarManager - 工具栏管理器
 * 负责创建工具栏 DOM、绑定按钮事件、更新按钮状态
 */
import type { Editor } from '@tiptap/core';
import type { ToolbarConfig, ToolbarItem } from '../types';
import { InsertPanel, type InsertPanelMode } from '../media/InsertPanel';
import type { MediaRuntime } from '../media/MediaRuntime';
import type { I18nManager } from './I18nManager';
import { icons } from './icons';

/**
 * 工具栏项定义
 */
interface ToolbarItemDef {
  id: string;
  icon: string;
  tooltip: string;
  /** 打开浮层的项不能把焦点抢回编辑器，否则浮层里的输入框永远打不了字 */
  popup?: boolean;
  command: (editor: Editor, button: HTMLButtonElement) => void;
  isActive: (editor: Editor) => boolean;
  isDisabled: (editor: Editor) => boolean;
}

/**
 * 工具栏项与 i18n 词条的映射（缺词条时回退到 tooltip 文案）
 */
const TOOLTIP_KEYS: Record<string, string> = {
  undo: 'editor.undo',
  redo: 'editor.redo',
  heading1: 'editor.heading1',
  heading2: 'editor.heading2',
  heading3: 'editor.heading3',
  paragraph: 'editor.paragraph',
  bold: 'editor.bold',
  italic: 'editor.italic',
  underline: 'editor.underline',
  strike: 'editor.strikethrough',
  code: 'editor.code',
  bulletList: 'editor.bulletList',
  orderedList: 'editor.orderedList',
  blockquote: 'editor.blockquote',
  codeBlock: 'editor.codeBlock',
  alignLeft: 'editor.alignLeft',
  alignCenter: 'editor.alignCenter',
  alignRight: 'editor.alignRight',
  insertImage: 'editor.image',
  insertAttachment: 'editor.attachment',
  attachmentDisplay: 'editor.attachmentDisplay',
};

/**
 * 工具栏管理器
 */
export class ToolbarManager {
  private container: HTMLElement;
  private editor: Editor;
  private i18n?: I18nManager;
  private config?: ToolbarConfig;
  private mediaRuntime: MediaRuntime | null;
  private unsubscribeLanguage?: () => void;
  private buttons: Map<string, HTMLButtonElement> = new Map();
  private customTooltips: Map<string, string> = new Map();
  private itemDefs: Map<string, ToolbarItemDef>;
  private createdElements: HTMLElement[] = [];
  private panel: InsertPanel | null = null;

  constructor(
    editor: Editor,
    container: HTMLElement,
    config?: ToolbarConfig,
    i18n?: I18nManager,
    mediaRuntime?: MediaRuntime | null
  ) {
    this.editor = editor;
    this.container = container;
    this.config = config;
    this.i18n = i18n;
    this.mediaRuntime = mediaRuntime ?? null;
    this.itemDefs = this.getDefaultItems();
    this.createToolbarDOM();
    this.bindEditorEvents();

    this.unsubscribeLanguage = this.i18n?.onLanguageChanged(() => this.applyTooltips());
  }

  /**
   * 插入浮层按需创建：没点开过就不该有一个实例挂在编辑器上
   */
  private get insertPanel(): InsertPanel | null {
    if (!this.mediaRuntime) return null;
    this.panel ??= new InsertPanel({
      editor: this.editor,
      runtime: this.mediaRuntime,
      i18n: this.i18n,
      // 开合不改文档，等不到 transaction，得主动刷一次按钮状态
      onOpenChange: () => this.updateButtonStates(),
    });
    return this.panel;
  }

  private openInsert(mode: InsertPanelMode, button: HTMLButtonElement): void {
    this.insertPanel?.toggle(button, mode);
  }

  /**
   * 创建工具栏 DOM - 直接将按钮插入 container
   */
  private createToolbarDOM(): void {
    const items = this.config?.items;

    if (items) {
      items.forEach((item) => {
        const resolved = this.resolveItem(item);
        if (!resolved) return;
        const button = this.createButton(resolved.id, resolved.def, resolved.overrides);
        this.container.appendChild(button);
        this.createdElements.push(button);
      });
      this.applyTooltips();
      return;
    }

    // 默认工具栏布局（分组）
    const layout = [
      ['undo', 'redo'],
      ['heading1', 'heading2', 'heading3', 'paragraph'],
      ['bold', 'italic', 'underline', 'strike', 'code'],
      ['bulletList', 'orderedList', 'blockquote', 'codeBlock'],
      ['alignLeft', 'alignCenter', 'alignRight'],
      // 媒体节点没注册时这两项压根不存在，默认布局里也不摆空位
      ...(this.itemDefs.has('insertImage')
        ? [['insertImage', 'insertAttachment', 'attachmentDisplay']]
        : []),
    ];

    layout.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        const separator = document.createElement('div');
        separator.className = 'atri-editor-toolbar-separator';
        this.container.appendChild(separator);
        this.createdElements.push(separator);
      }

      group.forEach((itemId) => {
        const itemDef = this.itemDefs.get(itemId);
        if (!itemDef) return;

        const button = this.createButton(itemId, itemDef);
        this.container.appendChild(button);
        this.createdElements.push(button);
      });
    });

    this.applyTooltips();
  }

  /**
   * 解析配置项：字符串按 id 取内置定义，ToolbarItem 允许覆盖展示文案
   */
  private resolveItem(
    item: string | ToolbarItem
  ): { id: string; def: ToolbarItemDef; overrides?: ToolbarItem } | null {
    const id = typeof item === 'string' ? item : item.id;
    const def = this.itemDefs.get(id);

    if (!def) {
      console.warn(`[Atri Editor] Unknown toolbar item "${id}" was skipped.`);
      return null;
    }

    if (typeof item === 'string') {
      return { id, def };
    }

    if (item.children?.length) {
      console.warn(`[Atri Editor] Toolbar item "${id}" declares children, which is not supported.`);
    }

    return { id, def, overrides: item };
  }

  private createButton(
    itemId: string,
    itemDef: ToolbarItemDef,
    overrides?: ToolbarItem
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atri-editor-toolbar-btn';
    button.setAttribute('data-toolbar-item', itemId);

    if (overrides?.icon) {
      button.innerHTML = overrides.icon;
    } else if (overrides?.label) {
      button.textContent = overrides.label;
    } else {
      button.innerHTML = itemDef.icon;
    }

    // 确保 SVG 图标有正确的尺寸
    const svg = button.querySelector('svg');
    if (svg) {
      svg.setAttribute('width', '18');
      svg.setAttribute('height', '18');
    }

    if (overrides?.tooltip) {
      this.customTooltips.set(itemId, overrides.tooltip);
    }

    if (itemDef.popup) {
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
    }

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      itemDef.command(this.editor, button);
      // 浮层项自己管焦点：抢回编辑器会让浮层里的输入框根本打不了字
      if (!itemDef.popup) this.editor.commands.focus();
    });

    this.buttons.set(itemId, button);
    return button;
  }

  /**
   * 按当前语言刷新按钮 tooltip
   */
  private applyTooltips(): void {
    this.buttons.forEach((button, itemId) => {
      const itemDef = this.itemDefs.get(itemId);
      if (!itemDef) return;

      const custom = this.customTooltips.get(itemId);
      if (custom) {
        button.title = custom;
        return;
      }

      const key = TOOLTIP_KEYS[itemId];
      const translated = key ? this.i18n?.t(key) : undefined;
      // 未注入 i18n 或词条缺失时回退到定义里的文案
      button.title = translated && translated !== key ? translated : itemDef.tooltip;
    });
  }

  /**
   * 获取默认工具栏项定义
   */
  private getDefaultItems(): Map<string, ToolbarItemDef> {
    const items = new Map<string, ToolbarItemDef>();

    // 媒体节点没注册（media:false）时这两个命令压根不存在，按钮也不提供
    if (this.mediaRuntime) {
      items.set('insertImage', {
        id: 'insertImage',
        icon: icons.image,
        tooltip: '图片',
        popup: true,
        command: (_editor, button) => this.openInsert('image', button),
        isActive: () => this.panel?.openMode === 'image',
        isDisabled: (editor) => !editor.isEditable,
      });

      items.set('insertAttachment', {
        id: 'insertAttachment',
        icon: icons.paperclip,
        tooltip: '附件',
        popup: true,
        command: (_editor, button) => this.openInsert('attachment', button),
        isActive: () => this.panel?.openMode === 'attachment',
        isDisabled: (editor) => !editor.isEditable,
      });

      // 卡片↔行内链接是选中态上的操作：没选中附件就没有作用对象
      items.set('attachmentDisplay', {
        id: 'attachmentDisplay',
        icon: icons.link,
        tooltip: '附件样式',
        command: (editor) => editor.chain().focus().toggleAttachmentDisplay().run(),
        isActive: (editor) => editor.isActive('attachment') || editor.isActive('attachmentLink'),
        isDisabled: (editor) =>
          !editor.isActive('attachment') && !editor.isActive('attachmentLink'),
      });
    }

    // 撤销
    items.set('undo', {
      id: 'undo',
      icon: icons.undo,
      tooltip: '撤销',
      command: (editor) => editor.chain().undo().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.can().undo(),
    });

    // 重做
    items.set('redo', {
      id: 'redo',
      icon: icons.redo,
      tooltip: '重做',
      command: (editor) => editor.chain().redo().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.can().redo(),
    });

    // 标题1
    items.set('heading1', {
      id: 'heading1',
      icon: icons.heading1,
      tooltip: '标题 1',
      command: (editor) => editor.chain().toggleHeading({ level: 1 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 1 }),
      isDisabled: (editor) => !editor.can().toggleHeading({ level: 1 }),
    });

    // 标题2
    items.set('heading2', {
      id: 'heading2',
      icon: icons.heading2,
      tooltip: '标题 2',
      command: (editor) => editor.chain().toggleHeading({ level: 2 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 2 }),
      isDisabled: (editor) => !editor.can().toggleHeading({ level: 2 }),
    });

    // 标题3
    items.set('heading3', {
      id: 'heading3',
      icon: icons.heading3,
      tooltip: '标题 3',
      command: (editor) => editor.chain().toggleHeading({ level: 3 }).run(),
      isActive: (editor) => editor.isActive('heading', { level: 3 }),
      isDisabled: (editor) => !editor.can().toggleHeading({ level: 3 }),
    });

    // 正文
    items.set('paragraph', {
      id: 'paragraph',
      icon: icons.paragraph,
      tooltip: '正文',
      command: (editor) => editor.chain().setParagraph().run(),
      isActive: (editor) => editor.isActive('paragraph'),
      isDisabled: (editor) => !editor.can().setParagraph(),
    });

    // 加粗
    items.set('bold', {
      id: 'bold',
      icon: icons.bold,
      tooltip: '加粗',
      command: (editor) => editor.chain().toggleBold().run(),
      isActive: (editor) => editor.isActive('bold'),
      isDisabled: (editor) => !editor.can().toggleBold(),
    });

    // 斜体
    items.set('italic', {
      id: 'italic',
      icon: icons.italic,
      tooltip: '斜体',
      command: (editor) => editor.chain().toggleItalic().run(),
      isActive: (editor) => editor.isActive('italic'),
      isDisabled: (editor) => !editor.can().toggleItalic(),
    });

    // 下划线
    items.set('underline', {
      id: 'underline',
      icon: icons.underline,
      tooltip: '下划线',
      command: (editor) => editor.chain().toggleUnderline().run(),
      isActive: (editor) => editor.isActive('underline'),
      isDisabled: (editor) => !editor.can().toggleUnderline(),
    });

    // 删除线
    items.set('strike', {
      id: 'strike',
      icon: icons.strikethrough,
      tooltip: '删除线',
      command: (editor) => editor.chain().toggleStrike().run(),
      isActive: (editor) => editor.isActive('strike'),
      isDisabled: (editor) => !editor.can().toggleStrike(),
    });

    // 行内代码
    items.set('code', {
      id: 'code',
      icon: icons.code,
      tooltip: '行内代码',
      command: (editor) => editor.chain().toggleCode().run(),
      isActive: (editor) => editor.isActive('code'),
      isDisabled: (editor) => !editor.can().toggleCode(),
    });

    // 无序列表
    items.set('bulletList', {
      id: 'bulletList',
      icon: icons.list,
      tooltip: '无序列表',
      command: (editor) => editor.chain().toggleBulletList().run(),
      isActive: (editor) => editor.isActive('bulletList'),
      isDisabled: (editor) => !editor.can().toggleBulletList(),
    });

    // 有序列表
    items.set('orderedList', {
      id: 'orderedList',
      icon: icons.listOrdered,
      tooltip: '有序列表',
      command: (editor) => editor.chain().toggleOrderedList().run(),
      isActive: (editor) => editor.isActive('orderedList'),
      isDisabled: (editor) => !editor.can().toggleOrderedList(),
    });

    // 引用
    items.set('blockquote', {
      id: 'blockquote',
      icon: icons.quote,
      tooltip: '引用',
      command: (editor) => editor.chain().toggleBlockquote().run(),
      isActive: (editor) => editor.isActive('blockquote'),
      isDisabled: (editor) => !editor.can().toggleBlockquote(),
    });

    // 代码块
    items.set('codeBlock', {
      id: 'codeBlock',
      icon: icons.codeBlock,
      tooltip: '代码块',
      command: (editor) => editor.chain().toggleCodeBlock().run(),
      isActive: (editor) => editor.isActive('codeBlock'),
      isDisabled: (editor) => !editor.can().toggleCodeBlock(),
    });

    // 左对齐
    items.set('alignLeft', {
      id: 'alignLeft',
      icon: icons.alignLeft,
      tooltip: '左对齐',
      command: (editor) => editor.chain().setTextAlign('left').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'left' }),
      isDisabled: (editor) => !editor.can().setTextAlign('left'),
    });

    // 居中
    items.set('alignCenter', {
      id: 'alignCenter',
      icon: icons.alignCenter,
      tooltip: '居中',
      command: (editor) => editor.chain().setTextAlign('center').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'center' }),
      isDisabled: (editor) => !editor.can().setTextAlign('center'),
    });

    // 右对齐
    items.set('alignRight', {
      id: 'alignRight',
      icon: icons.alignRight,
      tooltip: '右对齐',
      command: (editor) => editor.chain().setTextAlign('right').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'right' }),
      isDisabled: (editor) => !editor.can().setTextAlign('right'),
    });

    return items;
  }

  /**
   * 绑定编辑器事件，更新按钮状态
   */
  private bindEditorEvents(): void {
    this.editor.on('transaction', () => {
      this.updateButtonStates();
    });

    this.editor.on('selectionUpdate', () => {
      this.updateButtonStates();
    });

    // 初始状态
    this.updateButtonStates();
  }

  /**
   * 更新所有按钮状态
   */
  private updateButtonStates(): void {
    this.buttons.forEach((button, itemId) => {
      const itemDef = this.itemDefs.get(itemId);
      if (!itemDef) return;

      // 更新 active 状态
      const active = itemDef.isActive(this.editor);
      button.classList.toggle('active', active);
      if (itemDef.popup) button.setAttribute('aria-expanded', String(active));

      // 更新 disabled 状态
      if (itemDef.isDisabled(this.editor)) {
        button.disabled = true;
      } else {
        button.disabled = false;
      }
    });
  }

  /**
   * 销毁工具栏
   */
  destroy(): void {
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = undefined;
    // 面板挂在 document.body 上，不跟着工具栏一起收就会留在页面上
    this.panel?.destroy();
    this.panel = null;
    this.buttons.clear();
    this.customTooltips.clear();
    this.createdElements.forEach((el) => el.remove());
    this.createdElements = [];
  }
}
