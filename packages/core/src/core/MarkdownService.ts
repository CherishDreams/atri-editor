/**
 * MarkdownService - Markdown 解析/序列化服务
 */
import { generateJSON, type Editor, type JSONContent } from '@tiptap/core';
import type { MarkdownManager } from '@tiptap/markdown';
import type { AtriMarkdownConfig } from '../types';
import { simpleMarkdownToHtml, simpleHtmlToMarkdown } from '../utils/markdown';

export class MarkdownService {
  private editor: Editor;
  private config: AtriMarkdownConfig;

  constructor(editor: Editor, config: AtriMarkdownConfig = {}) {
    this.editor = editor;
    this.config = {
      enabled: true,
      indentation: { style: 'space', size: 2 },
      ...config,
    };
  }

  /**
   * Tiptap Markdown 序列化器，未注册 Markdown 扩展时为 null
   */
  private get manager(): MarkdownManager | null {
    return this.editor.markdown ?? null;
  }

  /**
   * 获取编辑器内容为 Markdown
   * 自定义节点的输出由其 renderMarkdown 钩子负责（见 ExtensionManager.registerNodeView），
   * 因此这里始终走 Tiptap 序列化器，不对整篇文档做额外替换。
   */
  getMarkdown(): string {
    const manager = this.manager;
    if (!manager) {
      return simpleHtmlToMarkdown(this.editor.getHTML());
    }
    return manager.serialize(this.editor.getJSON());
  }

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(content: string, emitUpdate = true): void {
    if (this.manager) {
      this.editor.commands.setContent(content, { contentType: 'markdown', emitUpdate });
      return;
    }
    this.editor.commands.setContent(simpleMarkdownToHtml(content), { emitUpdate });
  }

  /**
   * Markdown 转 HTML
   */
  markdownToHTML(markdown: string): string {
    // 使用简单的 HTML 转换作为降级方案
    // 完整的转换需要 DOMSerializer，这里使用简单方法
    return simpleMarkdownToHtml(markdown);
  }

  /**
   * HTML 转 Markdown
   */
  htmlToMarkdown(html: string): string {
    const manager = this.manager;
    if (!manager) {
      return simpleHtmlToMarkdown(html);
    }
    return manager.serialize(generateJSON(html, this.editor.extensionManager.extensions));
  }

  /**
   * Markdown 转 JSON
   */
  markdownToJSON(markdown: string): JSONContent {
    const manager = this.manager;
    if (manager) {
      return manager.parse(markdown);
    }
    // 降级：返回简单结构
    return {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: markdown }],
        },
      ],
    };
  }

  /**
   * 是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled !== false;
  }
}
