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
import { attachmentAttributes, attachmentLabel, insertAttachmentContent } from './attachment-attrs';

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

export const Attachment = Node.create({
  name: 'attachment',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return attachmentAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-atri-attachment]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name, size, status } = node.attrs;
    const label = attachmentLabel(name, src);

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
      setAttachment: (options) => (props) => insertAttachmentContent(props, this.name, options),
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
