/**
 * AtriEditor - 编辑器主类
 */
import type { Editor, JSONContent } from '@tiptap/core';
import type {
  AtriEditorOptions,
  IAtriEditor,
  InsertAttachmentOptions,
  InsertImageOptions,
  MediaKind,
  SetContentOptions,
  AtriAIConfig,
  AtriNodeViewConfig,
} from './types';
import { CoreEditor } from './core/CoreEditor';
import { MarkdownService } from './core/MarkdownService';
import { ThemeManager } from './core/ThemeManager';
import { I18nManager } from './core/I18nManager';
import { ExtensionManager } from './core/ExtensionManager';
import type { ThemeType } from './core/ThemeManager';
import { ToolbarManager } from './core/ToolbarManager';
import { MediaRuntime } from './media/MediaRuntime';
import { MediaStatusStrip } from './media/MediaStatusStrip';
import { AIService } from './ai/AIService';
import { AICommandMenuManager } from './ai/AICommandMenu';
import { resolveElement, createContainer } from './utils/dom';
import { getSelectedText as getSelectedTextFromSelection } from './utils/selection';

export class AtriEditor implements IAtriEditor {
  // 以下两个字段经 createCoreEditor()/setupSubsystems() 在构造函数内建立，
  // 类型上标注「必已赋值」而非可空：门面所有公开方法都假定它们存在
  private coreEditor!: CoreEditor;
  private markdownService!: MarkdownService;
  private themeManager: ThemeManager;
  private i18nManager: I18nManager;
  private extensionManager: ExtensionManager;
  private toolbarManager: ToolbarManager | null = null;
  /** 工具栏容器引用：重建编辑器时复用同一个挂载点，不重新查询 DOM */
  private toolbarContainer: HTMLDivElement | null = null;
  private aiService: AIService | null = null;
  private aiMenuManager: AICommandMenuManager | null = null;
  private mediaRuntime: MediaRuntime | null;
  private mediaStatus: MediaStatusStrip | null = null;
  /** 重建后待恢复的选区，新视图就绪时应用 */
  private pendingViewState: { from: number; to: number } | null = null;
  /**
   * 浮动工具栏容器：BubbleMenu 显示时把它塞进编辑区、隐藏时直接摘掉，
   * 所以引用必须握在门面手里，重建编辑器后才能拿同一个元素再挂回去
   */
  private bubbleElement: HTMLDivElement | null = null;
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

    // 注册 NodeView 自定义组件（在创建编辑器之前）
    if (options.nodeViews && options.nodeViews.length > 0) {
      this.extensionManager.registerNodeViews(options.nodeViews);
    }

    // 创建工具栏容器（如果 toolbar 不为 false）
    if (options.toolbar !== false) {
      this.toolbarContainer = createContainer('atri-editor-toolbar');
      this.container.appendChild(this.toolbarContainer);
    }

    // 创建编辑区域
    const editorElement = createContainer('atri-editor-content-wrapper');
    this.container.appendChild(editorElement);

    // 上传运行时只建一次：registerNodeView 会重建编辑器，进行中的上传得跟着这个实例走
    this.mediaRuntime = options.media === false ? null : new MediaRuntime(options.media);

    // 状态条也只建一次，挂在根容器上：卡片上没有文字状态，上传反馈全在这一条里
    this.mediaStatus = this.mediaRuntime
      ? new MediaStatusStrip(this.mediaRuntime, this.container, this.i18nManager)
      : null;

    this.createCoreEditor({
      element: editorElement,
      content: options.content,
      contentFormat: options.contentFormat,
    });
    this.setupSubsystems();
  }

  /** 开了 bubble 才建元素，且故意不插进文档：挂载与定位全归 BubbleMenu 插件管 */
  private ensureBubbleElement(toolbar: AtriEditorOptions['toolbar']): HTMLDivElement | null {
    if (toolbar === false || !toolbar?.bubble) return null;
    this.bubbleElement ??= createContainer('atri-editor-bubble-toolbar');
    return this.bubbleElement;
  }

  private onEditorCreated(): void {
    // 视图就绪后才能恢复重建前的选区
    if (this.pendingViewState) {
      const { from, to } = this.pendingViewState;
      this.pendingViewState = null;

      const limit = this.editor.state.doc.content.size;
      this.editor.commands.setTextSelection({
        from: Math.min(from, limit),
        to: Math.min(to, limit),
      });
    }

    // 初始化 AI 命令菜单
    if (this.options.ai?.functions) {
      this.aiMenuManager = new AICommandMenuManager(
        this.editor,
        this.options.ai.functions,
        this.options.ai.triggerChar ?? '/',
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
   * 创建核心编辑器：构造函数与 recreateEditor 共用的装配点。
   * 只有编辑器壳（挂载元素/初始内容/内容格式）随重建变化，其余全部来自 this.options，
   * 逐项手抄两遍必然漂移——出错的第一现场就是两处不齐
   */
  private createCoreEditor(init: {
    element: HTMLElement;
    content?: string | object;
    contentFormat?: 'html' | 'json' | 'markdown';
  }): void {
    this.coreEditor = new CoreEditor({
      element: init.element,
      content: init.content,
      contentFormat: init.contentFormat,
      editable: this.options.editable,
      placeholder: this.options.placeholder,
      extensions: [...(this.options.extensions || []), ...this.extensionManager.getAll()],
      markdown: this.options.markdown,
      media: this.options.media,
      mediaRuntime: this.mediaRuntime ?? undefined,
      bubbleElement: this.ensureBubbleElement(this.options.toolbar),
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
  }

  /** 初始化依赖编辑器实例的子系统：Markdown 服务、工具栏、AI 服务，重建后同样要重新走一遍 */
  private setupSubsystems(): void {
    this.markdownService = new MarkdownService(this.editor, this.options.markdown);

    if (this.toolbarContainer && this.options.toolbar !== false) {
      this.toolbarManager = new ToolbarManager(
        this.editor,
        this.toolbarContainer,
        this.options.toolbar,
        this.i18nManager,
        this.mediaRuntime
      );
      if (this.bubbleElement) this.toolbarManager.attachBubbleToolbar(this.bubbleElement);
    }

    if (this.options.ai) {
      this.initAI(this.options.ai);
    }
  }

  /**
   * 重新创建编辑器（用于动态注册 NodeView 后更新 schema）
   * 会整体替换编辑器视图，因此内容与选区都要手动恢复
   */
  private recreateEditor(): void {
    // 保存当前内容与光标位置，待新视图就绪后恢复选区
    const previousEditor = this.coreEditor.getEditor();
    const currentContent = this.coreEditor.getHTML();
    const { from, to } = previousEditor.state.selection;
    this.pendingViewState = { from, to };

    // 销毁旧编辑器
    this.coreEditor.destroy();
    this.toolbarManager?.destroy();
    this.aiMenuManager?.destroy();

    // 换一个新的编辑区容器：旧容器连同内部视图一起离开文档
    const editorElement = this.container.querySelector(
      '.atri-editor-content-wrapper'
    ) as HTMLElement;
    const newEditorElement = createContainer('atri-editor-content-wrapper');
    if (editorElement) {
      editorElement.replaceWith(newEditorElement);
    } else {
      this.container.appendChild(newEditorElement);
    }

    this.createCoreEditor({
      element: newEditorElement,
      content: currentContent,
      // 当前内容取自 getHTML()，重建时按 html 回填，不能沿用用户的 contentFormat
      contentFormat: 'html',
    });
    this.setupSubsystems();
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
      this.markdownService.setMarkdown(content, emitUpdate);
    } else {
      this.coreEditor.setContent(content, emitUpdate);
    }
    this.collapseSelectionAfterReplace();
  }

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(content: string): void {
    this.markdownService.setMarkdown(content);
    this.collapseSelectionAfterReplace();
  }

  /**
   * 整体替换内容后收拢选区：替换前若是全选（Ctrl+A），ProseMirror 会把它映射成
   * 覆盖整篇新文档的 AllSelection——下一个字或下一次插入就把整篇吞掉，
   * 而"设置内容"之后用户的预期是安全的光标态，不是"再输入即全删"
   */
  private collapseSelectionAfterReplace(): void {
    const editor = this.coreEditor.getEditor();
    if (!editor || editor.state.selection.empty) return;
    editor.commands.setTextSelection(editor.state.doc.content.size);
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
  markdownToJSON(markdown: string): JSONContent {
    return this.markdownService.markdownToJSON(markdown);
  }

  /**
   * 获取选中文本
   */
  getSelectedText(): string {
    return getSelectedTextFromSelection(this.editor);
  }

  /**
   * 插入内容
   */
  insertContent(content: string): void {
    this.coreEditor.insertContent(content);
  }

  /**
   * 在选区处插入图片
   */
  insertImage(options: InsertImageOptions): void {
    this.editor.chain().focus().setImage(options).run();
  }

  /**
   * 在选区处插入附件（形态由 options.display 或 media.attachment.display 决定）
   */
  insertAttachment(options: InsertAttachmentOptions): void {
    const media = this.options.media;
    const configured = media === false ? undefined : media?.attachment?.display;
    const display = options.display ?? configured ?? 'card';
    const chain = this.editor.chain().focus();

    if (display === 'link') {
      chain.setAttachmentLink(options).run();
    } else {
      chain.setAttachment(options).run();
    }
  }

  /**
   * 走上传管线插入本地文件
   * kind 缺省时按 MIME 分流；promise 在这批文件全部落定（成功或失败）后 resolve
   */
  async uploadFiles(files: File[] | FileList, kind?: MediaKind): Promise<void> {
    if (!this.mediaRuntime) {
      console.warn('[Atri Editor] uploadFiles() ignored: media extensions are disabled.');
      return;
    }

    await this.mediaRuntime.handleFiles(files, { kind });
  }

  /**
   * 是否有文件还没落到服务端（上传中与失败都算）
   * 此时保存会把本地预览地址写进内容，接入方应据此提示或阻断
   */
  hasPendingUploads(): boolean {
    return this.mediaRuntime?.hasPendingUploads() ?? false;
  }

  /**
   * 重试所有失败的上传，卡片原地回到上传中
   */
  async retryFailedUploads(): Promise<void> {
    await this.mediaRuntime?.retryFailed();
  }

  /**
   * 设置占位符
   */
  setPlaceholder(placeholder: string): void {
    // 重建编辑器时占位符取自 options，不同步会退回旧值
    this.options.placeholder = placeholder;
    this.coreEditor.setPlaceholder(placeholder);
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
  setTheme(theme: ThemeType): void {
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
   * 注册自定义 NodeView 组件
   * 注意：编辑器已创建时，每次调用都会重建一次编辑器以更新 schema；
   * 连续注册多个组件请改用 registerNodeViews，只需重建一次
   */
  registerNodeView(config: AtriNodeViewConfig): void {
    this.extensionManager.registerNodeView(config);
    // 如果编辑器已创建，需要重新创建以更新 schema
    if (this.coreEditor) {
      this.recreateEditor();
    }
  }

  /**
   * 批量注册 NodeView
   * 注意：如果编辑器已创建，会重新创建编辑器以更新 schema
   */
  registerNodeViews(configs: AtriNodeViewConfig[]): void {
    this.extensionManager.registerNodeViews(configs);
    // 如果编辑器已创建，需要重新创建以更新 schema
    if (this.coreEditor) {
      this.recreateEditor();
    }
  }

  /**
   * 获取所有已注册的 NodeView
   */
  getNodeViews(): Map<string, AtriNodeViewConfig> {
    return this.extensionManager.getNodeViews();
  }

  /**
   * 销毁编辑器
   */
  destroy(): void {
    this.toolbarManager?.destroy();
    this.aiMenuManager?.destroy();
    this.coreEditor.destroy();
    this.mediaStatus?.destroy();
    // 在途请求随编辑器一起取消，不然回调会打到已销毁的视图上
    this.mediaRuntime?.destroy();
    // 浮层挂在编辑区内部，随 container 一起离开文档；引用断掉，销毁后的门面就再挂不回它
    this.bubbleElement = null;
    this.container.remove();
  }
}
