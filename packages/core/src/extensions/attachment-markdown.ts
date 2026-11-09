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
import { decodeEntities, escapeHtml } from '../utils/escape';

// The image lexer scans the remaining line too; avoid recursively tokenizing its attachments.
let parsingImage = false;

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

  return {
    markdownTokenName: name,

    markdownTokenizer: {
      name,
      level,
      start: (src) => src.indexOf(`${directive}[`),
      tokenize: (src, _tokens, lexer): MarkdownToken | undefined => {
        if (parsingImage || !src.startsWith(`${directive}[`)) return undefined;
        // The image lexer already handles balanced brackets, escaped labels and <destinations>.
        const line = src.split('\n', 1)[0];
        let image: MarkdownToken | undefined;
        parsingImage = true;
        try {
          image = lexer.inlineTokens(`!${line.slice(directive.length)}`)[0];
        } finally {
          parsingImage = false;
        }
        if (image?.type !== 'image' || typeof image.raw !== 'string') return undefined;
        let length = image.raw.length + directive.length - 1;
        if (level === 'block') {
          const ending = /^[ \t]*(?:\r?\n|$)/.exec(src.slice(length));
          if (!ending) return undefined;
          length += ending[0].length;
        }
        const label =
          image.tokens
            ?.map((token) =>
              token.type === 'escape'
                ? (token.text ?? '')
                : decodeEntities(token.raw ?? token.text ?? '')
            )
            .join('') ?? decodeEntities(image.text ?? '');

        return {
          type: name,
          raw: src.slice(0, length),
          text: label,
          href: image.href,
          title: image.title,
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
      const src = String(node.attrs?.src ?? '');
      const label = escapeHtml(String(node.attrs?.name ?? '')).replace(/[\\[\]`*_!]/g, '\\$&');
      const target = /[\s()<>\\]/.test(src) ? `<${src.replace(/[\\<>]/g, '\\$&')}>` : src;
      const size = node.attrs?.size;

      return size
        ? `${directive}[${label}](${target} "${formatFileSize(size)}")`
        : `${directive}[${label}](${target})`;
    },
  };
}
