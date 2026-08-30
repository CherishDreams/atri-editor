/**
 * Attachment - 文件附件节点
 *
 * 不能走 ExtensionManager.registerNodeView：那条路合成的节点声明不了 addCommands 与
 * markdown 三件套（只有 renderMarkdown，导出得回来不去），附件要能往返。
 */
import { Node, mergeAttributes, type MarkdownToken } from '@tiptap/core';
import type { DOMOutputSpec } from '@tiptap/pm/model';
import type { InsertAttachmentOptions } from '../types';
import { formatFileSize, parseFileSize } from '../media/file-policy';
import { mediaInsertTarget } from '../media/insert-position';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachment: {
      /** 在选区处插入一个附件卡片 */
      setAttachment: (options: InsertAttachmentOptions) => ReturnType;
    };
  }
}

/** Markdown 里的附件语法：!file[名字](url "大小") */
const markdownPattern = /^!file\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)(?:\n|$)/;

/** 属性值一律走 data-* 或文本节点，不进 innerHTML：文件名可能来自上传方，不可信 */
function dataAttr(name: string, value: string | number | null | undefined): Record<string, string> {
  return value === null || value === undefined || value === '' ? {} : { [name]: String(value) };
}

/** 百分比同源写两份：data-* 是"知道进度"的开关，内联自定义属性给样式表取值 */
function progressAttrs(progress: number | null | undefined): Record<string, string> {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return {};
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  return {
    'data-atri-upload-progress': String(percent),
    style: `--atri-upload-progress: ${percent}%`,
  };
}

export const Attachment = Node.create({
  name: 'attachment',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-src'),
        renderHTML: (attributes) => dataAttr('data-src', attributes.src),
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-name'),
        renderHTML: (attributes) => dataAttr('data-name', attributes.name),
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute('data-size');
          const parsed = raw === null ? Number.NaN : Number(raw);
          return Number.isFinite(parsed) ? parsed : null;
        },
        renderHTML: (attributes) => dataAttr('data-size', attributes.size),
      },
      mime: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-mime'),
        renderHTML: (attributes) => dataAttr('data-mime', attributes.mime),
      },
      // 下面三项是上传过程中的瞬时态：写得出、读不回，
      // 免得保存下来的 HTML 里带着一个永远不会完成的"上传中"
      status: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) => dataAttr('data-atri-upload-status', attributes.status),
      },
      progress: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) => progressAttrs(attributes.progress),
      },
      uploadId: {
        default: null,
        parseHTML: () => null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-atri-attachment]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name, size, status } = node.attrs;
    const label =
      name ||
      String(src || '')
        .split('/')
        .pop() ||
      '';

    const children: DOMOutputSpec[] = [
      ['span', { class: 'atri-attachment-icon', 'aria-hidden': 'true' }],
    ];

    const body: DOMOutputSpec[] = [
      ['a', { class: 'atri-attachment-name', href: src, rel: 'noopener noreferrer' }, label],
    ];
    if (size) {
      body.push(['span', { class: 'atri-attachment-size' }, formatFileSize(size)]);
    }
    // 名字与大小各占一行：单行挤不下长文件名，省略号又藏掉了最关键的信息
    children.push(['div', { class: 'atri-attachment-body' }, ...body]);

    // 卡片上没有一处硬编码文案：状态只靠进度条与配色表达，
    // "上传中 2/3"、"重试"这类带文字的信息在本地化的状态条里
    if (status) {
      children.push([
        'span',
        { class: 'atri-attachment-progress' },
        ['span', { class: 'atri-attachment-progress-bar' }],
      ]);
    }

    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-atri-attachment': '', class: 'atri-attachment' }),
      ...children,
    ];
  },

  addCommands() {
    return {
      setAttachment:
        (options) =>
        ({ state, commands }) =>
          commands.insertContentAt(mediaInsertTarget(state.selection), {
            type: this.name,
            attrs: {
              src: options.src,
              name: options.name ?? null,
              size: options.size ?? null,
              mime: options.mime ?? null,
            },
          }),
    };
  },

  markdownTokenName: 'file',

  markdownTokenizer: {
    name: 'file',
    level: 'block',
    start: (src) => src.indexOf('!file['),
    tokenize: (src): MarkdownToken | undefined => {
      const match = markdownPattern.exec(src);
      if (!match) return undefined;

      return {
        type: 'file',
        raw: match[0],
        text: match[1] ?? '',
        href: match[2] ?? '',
        title: match[3],
      };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.createNode(
      'attachment',
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
    const name = node.attrs?.name ?? '';
    const size = node.attrs?.size;

    return size ? `!file[${name}](${src} "${formatFileSize(size)}")` : `!file[${name}](${src})`;
  },
});
