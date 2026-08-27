/**
 * MarkdownService - Markdown 解析/序列化服务
 */
import type { Editor } from '@tiptap/core';
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
      shortcuts: true,
      ...config,
    };
  }

  /**
   * 获取编辑器内容为 Markdown
   */
  getMarkdown(): string {
    const editorWithMarkdown = this.editor as Editor & {
      markdown?: { serialize: (content: object) => string };
    };
    if (editorWithMarkdown.markdown) {
      return editorWithMarkdown.markdown.serialize(this.editor.getJSON());
    }
    return simpleHtmlToMarkdown(this.editor.getHTML());
  }

  /**
   * 设置 Markdown 内容
   */
  setMarkdown(content: string): void {
    const editorWithMarkdown = this.editor as Editor & {
      markdown?: { parse: (content: string) => object };
    };
    if (editorWithMarkdown.markdown) {
      const parsed = editorWithMarkdown.markdown.parse(content);
      this.editor.commands.setContent(parsed as any);
    } else {
      const html = simpleMarkdownToHtml(content);
      this.editor.commands.setContent(html as any);
    }
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
    const editorWithMarkdown = this.editor as Editor & {
      markdown?: { serialize: (content: object) => string };
    };
    if (editorWithMarkdown.markdown) {
      // 使用编辑器解析 HTML 为 JSON，然后序列化
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html;
      // 简单转换：直接序列化 HTML
      return simpleHtmlToMarkdown(html);
    }
    return simpleHtmlToMarkdown(html);
  }

  /**
   * Markdown 转 JSON
   */
  markdownToJSON(markdown: string): object {
    const editorWithMarkdown = this.editor as Editor & {
      markdown?: { parse: (content: string) => object };
    };
    if (editorWithMarkdown.markdown) {
      return editorWithMarkdown.markdown.parse(markdown);
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
