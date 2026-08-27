/**
 * AIService - AI 功能调度服务
 */
import type { Editor } from '@tiptap/core';
import type { AtriAIConfig, AtriAIFunction, AIRequestContext } from '../types';
import { AIInterceptor } from './AIInterceptor';
import { MarkdownService } from '../core/MarkdownService';
import { getSelectedText, getCursorContext, getDocumentText } from '../utils/selection';

export class AIService {
  private editor: Editor;
  private config: AtriAIConfig;
  private interceptor: AIInterceptor;
  private markdownService: MarkdownService | null = null;

  constructor(
    editor: Editor,
    config: AtriAIConfig,
    markdownService: MarkdownService | null = null
  ) {
    this.editor = editor;
    this.config = {
      autoTranslateMarkdownToHTML: true,
      ...config,
    };
    this.markdownService = markdownService;
    this.interceptor = new AIInterceptor(
      config.interceptors || {},
      markdownService,
      this.config.autoTranslateMarkdownToHTML
    );
  }

  /**
   * 获取所有 AI 功能
   */
  getFunctions(): AtriAIFunction[] {
    return this.config.functions || [];
  }

  /**
   * 根据 ID 获取 AI 功能
   */
  getFunction(id: string): AtriAIFunction | undefined {
    return this.config.functions?.find((f) => f.id === id);
  }

  /**
   * 构建请求上下文
   */
  private buildContext(func: AtriAIFunction): AIRequestContext {
    const selection = getSelectedText(this.editor);
    const cursorContext = getCursorContext(this.editor);
    const documentText = getDocumentText(this.editor);

    // 处理 prompt 模板变量
    let prompt = func.prompt;
    if (prompt) {
      prompt = prompt.replace(/\{selection\}/g, selection);
      prompt = prompt.replace(/\{content\}/g, selection || cursorContext);
    }

    return {
      functionId: func.id,
      selection,
      cursorContext,
      document: documentText,
      prompt,
      extra: {},
    };
  }

  /**
   * 执行 AI 功能
   */
  async execute(functionId: string): Promise<void> {
    const func = this.getFunction(functionId);
    if (!func) {
      console.error(`AI function "${functionId}" not found.`);
      return;
    }

    const context = this.buildContext(func);

    try {
      await this.interceptor.executeChain(context, this.config.requestEndpoint, (content) =>
        this.insertContent(content, func.outputMode || 'insert')
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.config.onError?.(err, context);
    }
  }

  /**
   * 插入内容到编辑器
   */
  private insertContent(content: string, mode: 'replace' | 'insert' | 'append'): void {
    const { selection } = this.editor.state;

    switch (mode) {
      case 'replace':
        // 替换选区内容
        if (!selection.empty) {
          this.editor
            .chain()
            .deleteRange({ from: selection.from, to: selection.to })
            .insertContent(content)
            .run();
        } else {
          this.editor.commands.insertContent(content);
        }
        break;

      case 'insert':
        // 插入到光标位置
        this.editor.commands.insertContent(content);
        break;

      case 'append':
        // 追加到文档末尾
        this.editor.commands.insertContentAt(this.editor.state.doc.content.size, content);
        break;
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AtriAIConfig>): void {
    this.config = { ...this.config, ...config };
    this.interceptor = new AIInterceptor(
      config.interceptors || this.config.interceptors || {},
      this.markdownService,
      this.config.autoTranslateMarkdownToHTML ?? true
    );
  }

  /**
   * 设置 Markdown 服务
   */
  setMarkdownService(service: MarkdownService): void {
    this.markdownService = service;
    this.interceptor = new AIInterceptor(
      this.config.interceptors || {},
      service,
      this.config.autoTranslateMarkdownToHTML ?? true
    );
  }
}
