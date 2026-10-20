/**
 * MarkdownService - Markdown 解析/序列化服务
 */
import {
  elementFromString,
  getHTMLFromFragment,
  type Editor,
  type JSONContent,
} from '@tiptap/core';
import { DOMParser as ProseMirrorDOMParser, Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { MarkdownManager } from '@tiptap/markdown';
import type { AtriMarkdownConfig, MarkdownLoss } from '../types';
import { simpleMarkdownToHtml, simpleHtmlToMarkdown } from '../utils/markdown';
import { collectMarkdownLosses } from './markdown-losses';

export class MarkdownService {
  private editor: Editor;
  private config: AtriMarkdownConfig;

  constructor(editor: Editor, config: AtriMarkdownConfig = {}) {
    this.editor = editor;
    this.config = {
      enabled: true,
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
   * 与 htmlToMarkdown 方向对称：解析为 JSON 后再按当前 schema 序列化为 HTML
   */
  markdownToHTML(markdown: string): string {
    const manager = this.manager;
    if (!manager) {
      return simpleMarkdownToHtml(markdown);
    }
    const { schema } = this.editor;
    return getHTMLFromFragment(
      ProseMirrorNode.fromJSON(schema, manager.parse(markdown)).content,
      schema
    );
  }

  /**
   * HTML 转 Markdown
   */
  htmlToMarkdown(html: string): string {
    const manager = this.manager;
    if (!manager) {
      return simpleHtmlToMarkdown(html);
    }
    const parsed = ProseMirrorDOMParser.fromSchema(this.editor.schema).parse(
      elementFromString(html)
    );
    return manager.serialize(parsed.toJSON());
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
   * 这一趟 getMarkdown() 会丢掉什么，判据见 markdown-losses.ts
   *
   * Markdown 关闭时返回空数组：那时 getMarkdown() 走的是整篇 HTML 的降级转换，
   * 不按类型分派，也就没有"哪个类型没有 renderer"可问。
   */
  getLosses(): MarkdownLoss[] {
    if (!this.manager) {
      return [];
    }
    return collectMarkdownLosses(this.editor, {
      inlineStyles: this.config.inlineStyles ?? 'html',
    });
  }

  /**
   * 有没有内容在导出 Markdown 时会丢，命名对齐 hasPendingUploads()
   */
  hasLossyContent(): boolean {
    return this.getLosses().length > 0;
  }

  /**
   * 是否启用
   */
  isEnabled(): boolean {
    return this.config.enabled !== false;
  }
}
