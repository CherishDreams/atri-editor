/**
 * AtriEditorElement - Web Component 封装
 */
import { AtriEditor } from './AtriEditor';
import type {
  AtriEditorOptions,
  InsertAttachmentOptions,
  InsertImageOptions,
  InsertTableOptions,
  MarkdownLoss,
  MediaKind,
} from './types';

const ELEMENT_NAME = 'atri-editor';

/**
 * SSR / 纯 Node 安全基类：类声明会在模块加载时求值 extends 后的表达式，
 * 直接 `extends HTMLElement` 会让无 DOM 的环境（Next/Nuxt 服务端、vitest node 池）
 * import 即抛 "HTMLElement is not defined"。自定义元素只有在浏览器才真正生效，
 * 这里回退到空基类，注册仍由 registerAtriElement 里的 customElements 守卫把关。
 */
const AtriEditorBase: typeof HTMLElement =
  typeof HTMLElement !== 'undefined' ? HTMLElement : (class {} as unknown as typeof HTMLElement);

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
export class AtriEditorElement extends AtriEditorBase {
  private editor: AtriEditor | null = null;
  private _options: Partial<AtriEditorOptions> = {};
  /** 连接与显式销毁都递增它，用来作废已经排队的拆除任务 */
  private teardownToken = 0;
  /** 断连时留下的内容，重连时接回去 */
  private detachedContent: string | null = null;
  /** 显式销毁过：之后重挂不再自动重建，也不该带任何快照 */
  private destroyed = false;

  static get observedAttributes(): string[] {
    return ['theme', 'editable', 'lang', 'placeholder'];
  }

  constructor() {
    super();
  }

  connectedCallback(): void {
    this.teardownToken += 1;
    if (this.destroyed) return;
    this.initEditor();
  }

  disconnectedCallback(): void {
    // 搬动节点（appendChild 重挂、框架 re-parent、虚拟列表滚动）会先同步 disconnect
    // 再同步 connect。拆到微任务边界上，isConnected 已经恢复 true，据此把"搬家"
    // 和"真的卸载"分开——同步拆的话用户输入连同在途上传一起没了。
    // token 则挡住另一种情形：这一批里被重挂过，就不该再拆后来那个实例
    const token = this.teardownToken;
    queueMicrotask(() => {
      if (token === this.teardownToken && !this.isConnected) this.teardownEditor();
    });
  }

  /**
   * 显式销毁：之后重挂不再自动重建，内容快照也一并丢掉
   *
   * 框架里对应 unmount 钩子（Vue 的 unmounted、React effect 的 cleanup）。
   * 断连本身已经会延迟拆除，这个方法的意义在于"别接回去了"
   */
  destroy(): void {
    // 顺序要紧：先置 destroyed，teardownEditor 才不会把快照又写回来
    this.destroyed = true;
    this.teardownToken += 1;
    this.detachedContent = null;
    this.teardownEditor();
  }

  private teardownEditor(): void {
    if (!this.editor) return;
    // 快照优先于 data-content：后者是用户动手之前的初值，拿它重建等于回滚输入。
    // 但显式 destroy 不留快照——宿主说的是"结束了"，重挂不该拿回已销毁实例的内容
    if (!this.destroyed) this.detachedContent = this.editor.getHTML();
    this.editor.destroy();
    this.editor = null;
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null): void {
    if (oldValue === newValue) return;

    switch (name) {
      case 'theme':
        if (this.editor && newValue) {
          this.editor.setTheme(newValue);
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
    // 宿主显式给了内容就以它为准，断连快照不能压过它
    if ('content' in options) this.detachedContent = null;
  }

  private initEditor(): void {
    if (this.editor) return;

    const options: AtriEditorOptions = {
      element: this,
      ...this._options,
    };

    // 从 HTML 属性读取配置
    const theme = this.getAttribute('theme');
    if (theme) options.theme = theme;

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

    // 快照排在最后：它是重连前那一刻的 HTML，优先级高于作为"初值"的 data-content。
    // contentFormat 也得跟着钉成 html，否则属性写着 markdown 时会拿 Markdown 去解这段 HTML。
    // 只消费一次，第二次重连（宿主自己 destroy 过）就该回到配置的初值
    if (this.detachedContent !== null) {
      options.content = this.detachedContent;
      options.contentFormat = 'html';
      this.detachedContent = null;
    }

    this.editor = new AtriEditor(options);

    // 派发创建事件
    this.dispatchEvent(
      new CustomEvent('editor-created', {
        detail: { editor: this.editor },
        bubbles: true,
      })
    );
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
   * 这一次 getMarkdown() 会丢掉哪些内容
   *
   * 元素还没初始化时是 null 而不是空数组——"没什么可丢"和"还没建起来"是两件事，
   * 混在一起会让接入方把没就绪当成安全。
   */
  getMarkdownLosses(): MarkdownLoss[] | null {
    return this.editor?.getMarkdownLosses() ?? null;
  }

  /**
   * 当前内容里有没有导出 Markdown 时会丢的东西
   */
  hasLossyContent(): boolean {
    return this.editor?.hasLossyContent() ?? false;
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
   * 在选区处插入图片
   */
  insertImage(options: InsertImageOptions): void {
    this.editor?.insertImage(options);
  }

  /**
   * 在选区处插入附件卡片
   */
  insertAttachment(options: InsertAttachmentOptions): void {
    this.editor?.insertAttachment(options);
  }

  /**
   * 在选区处插入表格
   */
  insertTable(options?: InsertTableOptions): void {
    this.editor?.insertTable(options);
  }

  /**
   * 走上传管线插入本地文件
   */
  async uploadFiles(files: File[] | FileList, kind?: MediaKind): Promise<void> {
    await this.editor?.uploadFiles(files, kind);
  }

  /**
   * 重试所有失败的上传
   */
  async retryFailedUploads(): Promise<void> {
    await this.editor?.retryFailedUploads();
  }

  /**
   * 是否有文件还没落到服务端（上传中与失败都算），保存前可据此提示
   */
  hasPendingUploads(): boolean {
    return this.editor?.hasPendingUploads() ?? false;
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
