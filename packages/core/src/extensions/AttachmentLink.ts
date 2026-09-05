/**
 * AttachmentLink - 行内链接形态的文件附件
 *
 * 与 attachment（块级卡片）是两个节点类型：PM 的 inline/group 在 schema 里静态声明，
 * 同一类型当不了两种形态。属性集、瞬时态补丁与 Markdown 语法家族都走共享模块，
 * 切换命令（Attachment.ts 的 setAttachmentDisplay）只在两者间换节点。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import type { InsertAttachmentOptions } from '../types';
import { attachmentAttributes, attachmentLabel, insertAttachmentContent } from './attachment-attrs';
import { makeAttachmentMarkdown } from './attachment-markdown';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachmentLink: {
      /** 在选区处插入一个行内附件链接 */
      setAttachmentLink: (options: InsertAttachmentOptions) => ReturnType;
    };
  }
}

export const AttachmentLink = Node.create({
  name: 'attachmentLink',

  inline: true,

  group: 'inline',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return attachmentAttributes();
  },

  parseHTML() {
    // priority 不能省：StarterKit 默认带 Link 扩展，它的 a[href] 规则会把这枚
    // <a> 抢成"链接 mark 包文字"，节点就静默退化成普通超链接
    return [
      {
        tag: 'a[data-atri-attachment-link]',
        priority: 100,
        // 手写或从别处粘来的 <a> 只带 href，没有 data-src：认下来，别留一枚空链接
        getAttrs: (element) =>
          element.getAttribute('data-src') ? {} : { src: element.getAttribute('href') ?? null },
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name } = node.attrs;

    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-atri-attachment-link': '',
        class: 'atri-attachment-link',
        href: src,
        // download 让同源地址点击即下载（跨域浏览器会退化成导航）；
        // mergeAttributes 会丢掉 null，没名字就只剩普通链接
        download: name,
        rel: 'noopener noreferrer',
      }),
      ['span', { class: 'atri-attachment-icon', 'aria-hidden': 'true' }],
      attachmentLabel(name, src),
    ];
  },

  addCommands() {
    return {
      setAttachmentLink: (options) => (props) => insertAttachmentContent(props, this.name, options),
    };
  },

  ...makeAttachmentMarkdown({
    name: 'filelink',
    level: 'inline',
    nodeName: 'attachmentLink',
  }),
});
