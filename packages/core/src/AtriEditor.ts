/**
 * AtriEditor - 编辑器主类
 */
import type { Editor } from '@tiptap/core';
import { getTextBetween } from '@tiptap/core';
import type { AtriEditorOptions, IAtriEditor, SetContentOptions, AtriAIConfig } from './types';
import { CoreEditor } from './core/CoreEditor';
import { MarkdownService } from './core/MarkdownService';
import { ThemeManager } from './core/ThemeManager';
import { I18nManager } from './core/I18nManager';
import { ExtensionManager } from './core/ExtensionManager';
import { ToolbarManager } from './core/ToolbarManager';
import { AIService } from './ai/AIService';
import { AICommandMenuManager } from './ai/AICommandMenu';
import { resolveElement, createContainer } from './utils/dom';

export class AtriEditor implements IAtriEditor {
  private coreEditor: CoreEditor;
  private markdownService: MarkdownService;
  private themeManager: ThemeManager;
  private i18nManager: I18nManager;
  private extensionManager: ExtensionManager;
  private toolbarManager: ToolbarManager | null = null;
  private aiService: AIService | null = null;
  private aiMenuManager: AICommandMenuManager | null = null;
  private container: HTMLDivElement;
  private options: AtriEditorOptions;

  constructor(options: AtriEditorOptions) {
    this.options = options;

    // 解析挂载元素
    const rootElement = resolveElement(options.element);

    // 创建容器
    this.container = createContainer('atri-editor');
    rootElement.appendChild(this.container);

    // 初始化主题
    this.themeManager = new ThemeManager(this.container, options.theme || 'light');

    // 初始化国际化
    this.i18nManager = new I18nManager(options.lang || 'zh');

    // 初始化扩展管理器
    this.extensionManager = new ExtensionManager();

    // 创建工具栏容器（如果 toolbar 不为 false）
    let toolbarContainer: HTMLDivElement | null = null;
    if (options.toolbar !== false) {
      toolbarContainer = createContainer('atri-editor-toolbar');
      this.container.appendChild(toolbarContainer);
    }

    // 创建编辑区域
    const editorElement = createContainer('atri-editor-content-wrapper');
    this.container.appendChild(editorElement);

    // 初始化核心编辑器
    this.coreEditor = new CoreEditor({
      element: editorElement,
      content: options.content,
      contentFormat: options.contentFormat,
      editable: options.editable,
      placeholder: options.placeholder,
      extensions: options.extensions,
      markdown: options.markdown,
      onCreate: () => {
        this.onEditorCreated();
      },
      onUpdate: () => {
        this.options.onChange?.(this);
      },
      onFocus: () => {
        this.options.onFocus?.(this);
      },
      onBlur: () => {
        this.options.onBlur?.(this);
      },
      onDestroy: () => {
        this.options.onDestroy?.(this);
      },
    });

    // 初始化 Markdown 服务
    this.markdownService = new MarkdownService(this.editor, options.markdown);

    // 初始化工具栏
    if (toolbarContainer && options.toolbar !== false) {
      this.toolbarManager = new ToolbarManager(this.editor, toolbarContainer, options.toolbar);
    }

    // 初始化 AI 服务
    if (options.ai) {
      this.initAI(options.ai);
    }
  }

  private onEditorCreated(): void {
    // 初始化 AI 命令菜单
    if (this.options.ai?.functions) {
      this.aiMenuManager = new AICommandMenuManager(
        this.editor,
        this.options.ai.functions,
        '/',
        (func) => {
          this.aiService?.execute(func.id);
        }
      );
    }

    this.options.onCreate?.(this);
  }

  private initAI(config: AtriAIConfig): void {
    this.aiService = new AIService(this.editor, config, this.markdownService);
  }

  /**
   * 获取 Tiptap Editor 实例
   */
  get editor(): Editor {
    return this.coreEditor.getEditor();
  }

  /**
   * 获取 HTML 内容
   */
  getHTML(): string {
    return this.coreEditor.getHTML();
  }

  /**
   * 获取 JSON 内容
   */
  getJSON(): object {
    return this.coreEditor.getJSON();
  }

  /**
   * 获取 Markdown 内容
   */
  getMarkdown(): string {
    return this.markdownService.getMarkdown();
  }

  /**
   * 设置内容
   */
  setContent(content: string | object, options?: SetContentOptions): void {
    const format = options?.format || this.options.contentFormat;
    const emitUpdate = options?.emitUpdate ?? true;

    if (format === 'markdown' && typeof content === 'string') {
      this.setMarkdown(content);
    } else {
      this.coreEditor.setContent(content, emitUpdate);
    }
  }

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(content: string): void {
    this.markdownService.setMarkdown(content);
  }

  /**
   * 清空内容
   */
  clearContent(): void {
    this.coreEditor.clearContent();
  }

  /**
   * 是否为空
   */
  isEmpty(): boolean {
    return this.coreEditor.isEmpty();
  }

  /**
   * Markdown 转 HTML
   */
  markdownToHTML(markdown: string): string {
    return this.markdownService.markdownToHTML(markdown);
  }

  /**
   * HTML 转 Markdown
   */
  htmlToMarkdown(html: string): string {
    return this.markdownService.htmlToMarkdown(html);
  }

  /**
   * Markdown 转 JSON
   */
  markdownToJSON(markdown: string): object {
    return this.markdownService.markdownToJSON(markdown);
  }

  /**
   * 获取选中文本
   */
  getSelectedText(): string {
    const { selection } = this.editor.state;
    if (selection.empty) return '';
    return getTextBetween(this.editor.state.doc, {
      from: selection.from,
      to: selection.to,
    });
  }

  /**
   * 插入内容
   */
  insertContent(content: string): void {
    this.coreEditor.insertContent(content);
  }

  /**
   * 设置可编辑状态
   */
  setEditable(editable: boolean): void {
    this.coreEditor.setEditable(editable);
  }

  /**
   * 是否可编辑
   */
  isEditable(): boolean {
    return this.coreEditor.isEditable();
  }

  /**
   * 聚焦
   */
  focus(): void {
    this.coreEditor.focus();
  }

  /**
   * 失焦
   */
  blur(): void {
    this.coreEditor.blur();
  }

  /**
   * 获取 AI 服务
   */
  get ai(): AIService | null {
    return this.aiService;
  }

  /**
   * 获取主题管理器
   */
  get theme(): ThemeManager {
    return this.themeManager;
  }

  /**
   * 获取国际化管理器
   */
  get i18n(): I18nManager {
    return this.i18nManager;
  }

  /**
   * 获取扩展管理器
   */
  get extensions(): ExtensionManager {
    return this.extensionManager;
  }

  /**
   * 设置主题
   */
  setTheme(theme: 'light' | 'dark' | string): void {
    this.themeManager.setTheme(theme);
  }

  /**
   * 切换主题
   */
  toggleTheme(): void {
    this.themeManager.toggleTheme();
  }

  /**
   * 切换语言
   */
  async setLanguage(lang: string): Promise<void> {
    await this.i18nManager.changeLanguage(lang);
  }

  /**
   * 更新 AI 配置
   */
  updateAIConfig(config: Partial<AtriAIConfig>): void {
    if (this.aiService) {
      this.aiService.updateConfig(config);
    }
  }

  /**
   * 销毁编辑器
   */
  destroy(): void {
    this.toolbarManager?.destroy();
    this.aiMenuManager?.destroy();
    this.coreEditor.destroy();
    this.container.remove();
  }
}
