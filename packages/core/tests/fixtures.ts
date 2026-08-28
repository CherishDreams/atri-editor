import type { AtriNodeViewConfig } from '../src/types';

/**
 * 测试用的自定义原子节点：带 HTML 往返与 Markdown 序列化规则
 */
export const customCardNodeView: AtriNodeViewConfig = {
  name: 'customCard',
  group: 'block',
  atom: true,
  attributes: {
    title: { default: 'T' },
    content: { default: 'C' },
  },
  parseHTML: () => [
    {
      tag: 'custom-card',
      getAttrs: (el) => ({
        title: el.getAttribute('title') || 'T',
        content: el.getAttribute('content') || 'C',
      }),
    },
  ],
  renderHTML: ({ HTMLAttributes }) => ['custom-card', HTMLAttributes],
  nodeView: () => ({ dom: document.createElement('div') }),
  markdownSerialize: (node) => `> **${node.attrs.title}**\n> ${node.attrs.content}\n`,
};
