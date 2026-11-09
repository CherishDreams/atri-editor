/**
 * AIService - AI 功能调度服务
 */
import type { Editor } from '@tiptap/core';
import type { Transaction } from '@tiptap/pm/state';
import type { AtriAIConfig, AtriAIFunction, AIRequestContext } from '../types';
import { AIInterceptor, executeAIChain } from './AIInterceptor';
import { MarkdownService } from '../core/MarkdownService';
import { runSafely } from '../utils/safe-call';
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

    // scope 只决定「主输入」{content}，三个上下文字段始终完整提供给端点
    const scopeContent: Record<NonNullable<AtriAIFunction['scope']>, string> = {
      selection,
      cursor: cursorContext,
      document: documentText,
    };
    const values: Record<string, string> = {
      selection,
      cursor: cursorContext,
      document: documentText,
      content: func.scope ? scopeContent[func.scope] : selection || cursorContext,
    };

    // 未识别的 {xxx} 原样保留，交给端点自行处理
    const prompt = func.prompt?.replace(/\{(\w+)\}/g, (raw, key: string) => values[key] ?? raw);

    return {
      functionId: func.id,
      scope: func.scope,
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
    const mode = func.outputMode ?? 'insert';
    let { from, to } = this.editor.state.selection;
    const original = this.editor.state.doc.slice(from, to);
    const timeout = this.config.timeout ?? 0;
    // 超时只能"停止等待"：请求是宿主发的，库无权取消。
    // 晚到的响应靠这个标记挡在插入之前，不能让它覆盖用户之后的光标位置
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let invalidated: Error | undefined;
    let rejectInvalidation!: (error: Error) => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectInvalidation = reject;
    });
    const invalidate = () => {
      if (finished || invalidated) return;
      invalidated = new Error('The AI request target changed before the response was applied.');
      invalidated.name = 'AIResultInvalidatedError';
      rejectInvalidation(invalidated);
    };
    const onTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (!transaction.docChanged) return;
      for (let index = 0; index < transaction.steps.length; index++) {
        const map = transaction.steps[index].getMap();
        map.forEach((start, end) => {
          if (start === 0 && end === transaction.docs[index].content.size && end > start) {
            invalidate();
          }
          const touches =
            from === to
              ? start <= from && end >= from
              : start === end
                ? start > from && start < to
                : start < to && end > from;
          if (touches) invalidate();
        });
        if (from === to) from = to = map.map(from, 1);
        else {
          from = map.map(from, 1);
          to = map.map(to, -1);
        }
      }
      if (!invalidated && !transaction.doc.slice(from, to).eq(original)) {
        invalidate();
      }
    };
    const onUpdate = () => {
      if (!this.editor.isEditable) invalidate();
    };
    const stopWatching = () => {
      this.editor.off('transaction', onTransaction);
      this.editor.off('update', onUpdate);
      this.editor.off('destroy', invalidate);
    };
    this.editor.on('transaction', onTransaction);
    this.editor.on('update', onUpdate);
    this.editor.on('destroy', invalidate);

    const assertActive = () => {
      if (
        finished ||
        timedOut ||
        invalidated ||
        this.editor.isDestroyed ||
        !this.editor.isEditable
      ) {
        throw invalidated ?? new Error('The AI request is no longer active.');
      }
    };
    const chain = executeAIChain(
      this.interceptor,
      context,
      this.config.requestEndpoint,
      (content) => {
        assertActive();
        stopWatching();
        this.insertContent(content, mode, { from, to });
      },
      assertActive
    );

    try {
      if (timeout > 0) {
        await Promise.race([
          chain,
          cancelled,
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              timedOut = true;
              reject(new Error(`AI function "${functionId}" timed out after ${timeout}ms.`));
            }, timeout);
          }),
        ]);
      } else {
        await Promise.race([chain, cancelled]);
      }
    } catch (error) {
      // 不 rethrow：门面调用 execute 时不 await，抛出只会变成 unhandled rejection。
      // 但没配 onError 也不能就这么静默——端点 500 与"这次确实没结果"得区分得开
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.editor.isDestroyed) return;
      if (this.config.onError) {
        runSafely(this.config.onError, 'ai.onError', [err, context]);
      } else {
        console.error(`[Atri Editor] AI function "${functionId}" failed:`, err);
      }
    } finally {
      finished = true;
      stopWatching();
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  /**
   * 插入内容到编辑器
   */
  private insertContent(
    content: string,
    mode: 'replace' | 'insert' | 'append',
    target: { from: number; to: number }
  ): void {
    this.editor.commands.insertContentAt(
      mode === 'append' ? this.editor.state.doc.content.size : target,
      content,
      { parseOptions: { preserveWhitespace: 'full' }, updateSelection: false }
    );
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
