/**
 * AtriEditorElement - Web Component 封装
 */
import { AtriEditor } from './AtriEditor';
import type { AtriEditorOptions } from './types';

const ELEMENT_NAME = 'atri-editor';

/**
 * 注册 Web Component
 */
export function registerAtriElement(): void {
  if (typeof customElements === 'undefined') {
    console.warn('Custom Elements not supported');
    return;
  }

  if (!customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, AtriEditorElement);
  }
}

/**
 * AtriEditor Web Component
 */
export class AtriEditorElement extends HTMLElement {
  private editor: AtriEditor | null = null;
  private _options: Partial<AtriEditorOptions> = {};

  static get observedAttributes(): string[] {
    return ['theme', 'editable', 'lang', 'placeholder'];
  }

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.initEditor();
  }

  disconnectedCallback(): void {
    this.destroyEditor();
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'theme':
        if (this.editor && newValue) {
          this.editor.setTheme(newValue as 'light' | 'dark');
        }
        break;
      case 'editable':
        if (this.editor) {
          this.editor.setEditable(newValue !== 'false');
        }
        break;
      case 'lang':
        if (this.editor && newValue) {
          this.editor.setLanguage(newValue);
        }
        break;
      case 'placeholder':
        if (this.editor) {
          this.editor.setPlaceholder(newValue ?? '');
        }
        break;
    }
  }

  /**
   * 设置编辑器选项（在 connectedCallback 之前调用）
   */
  setOptions(options: Partial<AtriEditorOptions>): void {
    this._options = { ...this._options, ...options };
  }

  private initEditor(): void {
    if (this.editor) return;

    const options: AtriEditorOptions = {
      element: this,
      ...this._options,
    };

    // 从 HTML 属性读取配置
    const theme = this.getAttribute('theme');
    if (theme) options.theme = theme as 'light' | 'dark';

    const editable = this.getAttribute('editable');
    if (editable !== null) options.editable = editable !== 'false';

    const lang = this.getAttribute('lang');
    if (lang) options.lang = lang;

    const placeholder = this.getAttribute('placeholder');
    if (placeholder) options.placeholder = placeholder;

    // 从 data 属性读取初始内容
    const content = this.getAttribute('data-content');
    if (content) options.content = content;

    const contentFormat = this.getAttribute('data-content-format') as
      | 'html'
      | 'json'
      | 'markdown'
      | undefined;
    if (contentFormat) options.contentFormat = contentFormat;

    this.editor = new AtriEditor(options);

    // 派发创建事件
    this.dispatchEvent(
      new CustomEvent('editor-created', {
        detail: { editor: this.editor },
        bubbles: true,
      })
    );
  }

  private destroyEditor(): void {
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  }

  /**
   * 获取编辑器实例
   */
  getEditor(): AtriEditor | null {
    return this.editor;
  }

  /**
   * 获取 HTML 内容
   */
  getHTML(): string {
    return this.editor?.getHTML() || '';
  }

  /**
   * 获取 JSON 内容
   */
  getJSON(): object | null {
    return this.editor?.getJSON() || null;
  }

  /**
   * 获取 Markdown 内容
   */
  getMarkdown(): string {
    return this.editor?.getMarkdown() || '';
  }

  /**
   * 设置内容
   */
  setContent(content: string | object, format?: 'html' | 'json' | 'markdown'): void {
    this.editor?.setContent(content, { format });
  }

  /**
   * 清空内容
   */
  clearContent(): void {
    this.editor?.clearContent();
  }

  /**
   * 聚焦
   */
  focus(): void {
    this.editor?.focus();
  }
}

// 自动注册
registerAtriElement();
