/**
 * MarkdownService - Markdown 解析/序列化服务
 */
import type { Editor } from '@tiptap/core';
import type { AtriMarkdownConfig } from '../types';
import { simpleMarkdownToHtml, simpleHtmlToMarkdown } from '../utils/markdown';
import type { ExtensionManager } from './ExtensionManager';

export class MarkdownService {
  private editor: Editor;
  private config: AtriMarkdownConfig;
  private extensionManager?: ExtensionManager;

  constructor(editor: Editor, config: AtriMarkdownConfig = {}, extensionManager?: ExtensionManager) {
    this.editor = editor;
    this.config = {
      enabled: true,
      indentation: { style: 'space', size: 2 },
      shortcuts: true,
      ...config,
    };
    this.extensionManager = extensionManager;
  }

  /**
   * 获取编辑器内容为 Markdown
   */
  getMarkdown(): string {
    const editorWithMarkdown = this.editor as Editor & {
      markdown?: { serialize: (content: object) => string };
    };
    
    if (editorWithMarkdown.markdown) {
      const json = this.editor.getJSON() as any;
      
      // 如果有自定义序列化规则，应用它们
      if (this.extensionManager) {
        const serializers = this.extensionManager.getMarkdownSerializers();
        if (serializers.size > 0) {
          return this.serializeWithCustomRules(json, serializers);
        }
      }
      
      return editorWithMarkdown.markdown.serialize(json);
    }
    
    return simpleHtmlToMarkdown(this.editor.getHTML());
  }

  /**
   * 使用自定义规则序列化 JSON 为 Markdown
   */
  private serializeWithCustomRules(
    json: any,
    serializers: Map<string, (node: any) => string>
  ): string {
    if (!json.content || !Array.isArray(json.content)) {
      return '';
    }

    const lines: string[] = [];

    for (const node of json.content) {
      // 检查是否有自定义序列化规则
      if (serializers.has(node.type)) {
        const serializer = serializers.get(node.type)!;
        lines.push(serializer(node));
      } else {
        // 使用默认序列化
        lines.push(this.serializeNode(node));
      }
    }

    return lines.join('\n\n');
  }

  /**
   * 序列化内联内容（处理文本节点的 marks）
   */
  private serializeInlineContent(nodes: any[]): string {
    if (!Array.isArray(nodes)) return '';

    return nodes
      .map((node: any) => {
        if (node.type !== 'text') return '';

        let text = node.text || '';

        // 应用 marks（从内到外：code > bold > italic > strike > underline）
        if (node.marks && Array.isArray(node.marks)) {
          const markTypes = node.marks.map((m: any) => m.type);

          if (markTypes.includes('code')) {
            text = '`' + text + '`';
          }
          if (markTypes.includes('bold')) {
            text = '**' + text + '**';
          }
          if (markTypes.includes('italic')) {
            text = '*' + text + '*';
          }
          if (markTypes.includes('strike')) {
            text = '~~' + text + '~~';
          }
        }

        return text;
      })
      .join('');
  }

  /**
   * 序列化单个节点为 Markdown
   */
  private serializeNode(node: any): string {
    if (!node.content || !Array.isArray(node.content)) {
      return '';
    }

    const text = this.serializeInlineContent(
      node.content.filter((n: any) => n.type === 'text')
    );

    switch (node.type) {
      case 'paragraph':
        return text;
      case 'heading':
        const level = node.attrs?.level || 1;
        return '#'.repeat(level) + ' ' + text;
      case 'blockquote':
        return text.split('\n').map((line: string) => '> ' + line).join('\n');
      case 'bulletList':
        return node.content
          .map((item: any) => {
            const listItemContent = item.content?.[0]?.content || [];
            const itemText = this.serializeInlineContent(
              listItemContent.filter((n: any) => n.type === 'text')
            );
            return '- ' + itemText;
          })
          .join('\n');
      case 'orderedList':
        return node.content
          .map((item: any, index: number) => {
            const listItemContent = item.content?.[0]?.content || [];
            const itemText = this.serializeInlineContent(
              listItemContent.filter((n: any) => n.type === 'text')
            );
            return (index + 1) + '. ' + itemText;
          })
          .join('\n');
      case 'codeBlock':
        const language = node.attrs?.language || '';
        return '```' + language + '\n' + text + '\n```';
      default:
        return text;
    }
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
