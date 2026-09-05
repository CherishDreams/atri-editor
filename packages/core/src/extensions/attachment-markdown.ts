/**
 * 附件两类节点（卡片 file / 行内链接 filelink）的 Markdown 三件套工厂。
 *
 * tokenize/parse/render 的结构完全相同，只差 token 名、语法层级与落点节点名，
 * 收拢成一份实现，避免两处手抄漂移。
 */
import type {
  JSONContent,
  MarkdownParseHelpers,
  MarkdownParseResult,
  MarkdownRendererHelpers,
  MarkdownToken,
  MarkdownTokenizer,
  RenderContext,
} from '@tiptap/core';
import { formatFileSize, parseFileSize } from '../media/file-policy';

export interface AttachmentMarkdownSpec {
  markdownTokenName: string;
  markdownTokenizer: MarkdownTokenizer;
  parseMarkdown: (token: MarkdownToken, helpers: MarkdownParseHelpers) => MarkdownParseResult;
  renderMarkdown: (
    node: JSONContent,
    helpers: MarkdownRendererHelpers,
    ctx: RenderContext
  ) => string;
}

export function makeAttachmentMarkdown(options: {
  /** token 名，语法前缀按 `!<name>[` 拼出：file / filelink */
  name: string;
  /** 语法层级：卡片是块级（要求行尾收束），行内链接是 inline */
  level: 'block' | 'inline';
  /** Markdown 解析落点节点名：attachment / attachmentLink */
  nodeName: string;
}): AttachmentMarkdownSpec {
  const { name, level, nodeName } = options;
  // 语法指令：!file / !filelink，方括号是名称组的开括号，不并入指令
  const directive = `!${name}`;
  // 块级语法要求行尾收束，行内语法不限制
  const trailing = level === 'block' ? '(?:\\n|$)' : '';
  const pattern = new RegExp(
    `^${directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\[([^\\]]*)\\]\\(\\s*([^\\s)]+)(?:\\s+"([^"]*)")?\\s*\\)${trailing}`
  );

  return {
    markdownTokenName: name,

    markdownTokenizer: {
      name,
      level,
      start: (src) => src.indexOf(`${directive}[`),
      tokenize: (src): MarkdownToken | undefined => {
        const match = pattern.exec(src);
        if (!match) return undefined;

        return {
          type: name,
          raw: match[0],
          text: match[1] ?? '',
          href: match[2] ?? '',
          title: match[3],
        };
      },
    },

    parseMarkdown: (token, helpers) =>
      helpers.createNode(
        nodeName,
        {
          src: token.href,
          name: token.text || null,
          size: parseFileSize(token.title) ?? null,
          mime: null,
        },
        []
      ),

    renderMarkdown: (node) => {
      const src = node.attrs?.src ?? '';
      const label = node.attrs?.name ?? '';
      const size = node.attrs?.size;

      return size
        ? `${directive}[${label}](${src} "${formatFileSize(size)}")`
        : `${directive}[${label}](${src})`;
    },
  };
}
