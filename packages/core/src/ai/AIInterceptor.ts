/**
 * AIInterceptor - AI 拦截器链执行
 */
import type { AIRequestContext, AIResponse, AtriAIInterceptors } from '../types';
import type { MarkdownService } from '../core/MarkdownService';

export class AIInterceptor {
  private interceptors: AtriAIInterceptors;
  private markdownService: MarkdownService | null;
  private autoTranslateMarkdown: boolean;

  constructor(
    interceptors: AtriAIInterceptors = {},
    markdownService: MarkdownService | null = null,
    autoTranslateMarkdown: boolean = true
  ) {
    this.interceptors = interceptors;
    this.markdownService = markdownService;
    this.autoTranslateMarkdown = autoTranslateMarkdown;
  }

  /**
   * 执行 beforePost 拦截器
   * @returns 处理后的 context，返回 false 表示取消请求
   */
  async runBeforePost(context: AIRequestContext): Promise<AIRequestContext | false> {
    if (!this.interceptors.beforePost) {
      return context;
    }
    const result = this.interceptors.beforePost(context);
    return result;
  }

  /**
   * 执行 afterPost 拦截器
   */
  async runAfterPost(response: AIResponse, context: AIRequestContext): Promise<AIResponse> {
    if (!this.interceptors.afterPost) {
      return response;
    }
    return this.interceptors.afterPost(response, context);
  }

  /**
   * 执行 beforeRender 拦截器
   */
  async runBeforeRender(content: string, context: AIRequestContext): Promise<string> {
    if (!this.interceptors.beforeRender) {
      return content;
    }
    return this.interceptors.beforeRender(content, context);
  }

  /**
   * 执行 autoTranslateMarkdownToHTML
   * 在 beforeRender 之后执行，自动将 Markdown 转为 HTML
   */
  async runAutoTranslateMarkdown(content: string, response: AIResponse): Promise<string> {
    if (!this.autoTranslateMarkdown) {
      return content;
    }

    // 仅当 contentType 为 markdown 时自动转换
    if (response.contentType !== 'markdown') {
      return content;
    }

    if (this.markdownService) {
      return this.markdownService.markdownToHTML(content);
    }

    // 降级：使用简单转换
    const { simpleMarkdownToHtml } = await import('../utils/markdown');
    return simpleMarkdownToHtml(content);
  }

  /**
   * 执行 afterRender 回调
   */
  async runAfterRender(content: string, context: AIRequestContext): Promise<void> {
    if (!this.interceptors.afterRender) {
      return;
    }
    this.interceptors.afterRender(content, context);
  }

  /**
   * 完整执行拦截器链
   * 流程: beforePost -> requestEndpoint -> afterPost -> beforeRender -> autoTranslateMarkdown -> insert -> afterRender
   */
  async executeChain(
    context: AIRequestContext,
    requestEndpoint: (ctx: AIRequestContext) => Promise<AIResponse>,
    insertCallback: (content: string) => void
  ): Promise<void> {
    // 1. beforePost
    const processedContext = await this.runBeforePost(context);
    if (processedContext === false) {
      return; // 取消请求
    }

    // 2. requestEndpoint
    let response = await requestEndpoint(processedContext);

    // 3. afterPost
    response = await this.runAfterPost(response, processedContext);

    // 4. beforeRender
    let content = await this.runBeforeRender(response.content, processedContext);

    // 5. autoTranslateMarkdownToHTML
    content = await this.runAutoTranslateMarkdown(content, response);

    // 6. 插入编辑器
    insertCallback(content);

    // 7. afterRender
    await this.runAfterRender(content, processedContext);
  }
}
