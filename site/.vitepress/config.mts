import { defineConfig } from 'vitepress';
import { fileURLToPath } from 'node:url';

const packageSource = (path: string): string =>
  fileURLToPath(new URL(`../../packages/${path}`, import.meta.url));

export default defineConfig({
  lang: 'zh-CN',
  title: 'Atri Editor',
  description:
    '基于 Tiptap v3 的框架无关富文本编辑器：Markdown 双向全链路、表格、上传管线、主题与多语言、代码高亮。',
  // 部署在 GitHub Pages 的项目子路径下，路由必须带这个前缀
  base: '/atri-editor/',
  head: [
    ['link', { rel: 'icon', href: '/atri-editor/logo.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'theme-color', content: '#1890ff' }],
    ['meta', { property: 'og:title', content: 'Atri Editor' }],
    [
      'meta',
      {
        property: 'og:description',
        content: 'Markdown 往返不丢东西的富文本编辑器。基于 Tiptap v3，Web Component，ESM。',
      },
    ],
  ],

  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: '指南', link: '/guide/install', activeMatch: '/guide/' },
      { text: '在线试用', link: '/playground' },
      { text: '示例 Demo', link: 'https://cherishdreams.github.io/atri-editor/demo/' },
      { text: 'npm', link: 'https://www.npmjs.com/package/@atri-editor/core' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '安装与接入', link: '/guide/install' },
            { text: '基础格式', link: '/guide/formatting' },
            { text: '代码高亮', link: '/guide/code-highlight' },
          ],
        },
        {
          text: '能力',
          items: [
            { text: 'Markdown 往返与丢失报告', link: '/guide/markdown' },
            { text: '表格与上传', link: '/guide/table-media' },
            { text: '主题与多语言', link: '/guide/theme-i18n' },
          ],
        },
      ],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/CherishDreams/atri-editor' }],
    footer: {
      message: 'MIT License',
      copyright: 'Atri Editor',
    },
    outline: { label: '本页目录', level: [2, 3] },
    docFooter: { prev: '上一篇', next: '下一篇' },
    search: { provider: 'local' },
  },

  vite: {
    resolve: {
      alias: [
        // 与 demos/vanilla 同样的顺序：/styles 必须排在主入口之前，否则被前缀匹配抢走
        {
          find: '@atri-editor/core/styles',
          replacement: packageSource('core/src/styles/index.scss'),
        },
        { find: '@atri-editor/core', replacement: packageSource('core/src/index.ts') },
      ],
    },
    css: {
      preprocessorOptions: {
        scss: { api: 'modern-compiler' },
      },
    },
  },
});
