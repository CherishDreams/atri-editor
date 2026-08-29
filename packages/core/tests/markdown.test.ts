import { describe, expect, it, vi } from 'vitest';
import { simpleHtmlToMarkdown, simpleMarkdownToHtml } from '../src/index';
import { customCardNodeView } from './fixtures';
import { mount } from './utils';

describe('Markdown 内容链路', () => {
  it('contentFormat 为 markdown 的初始内容会被解析', async () => {
    const editor = await mount({
      contentFormat: 'markdown',
      content: '# Title\n\nHello **world**',
    });

    expect(editor.getHTML()).toBe('<h1>Title</h1><p>Hello <strong>world</strong></p>');
  });

  it('getMarkdown 不丢链接、列表与分隔线', async () => {
    const editor = await mount({ content: '<p>intro</p>' });
    editor.setContent(
      '<p>see <a href="https://example.com">the docs</a></p><ul><li>top</li></ul><hr>'
    );

    const markdown = editor.getMarkdown();

    expect(markdown).toContain('see [the docs](https://example.com)');
    expect(markdown).toContain('- top');
    expect(markdown).toContain('---');
  });

  it('注册带 markdownSerialize 的 NodeView 后，整篇导出仍走官方序列化器', async () => {
    const editor = await mount({
      content: '<p>intro</p>',
      nodeViews: [customCardNodeView],
    });
    editor.setContent(
      '<p>see <a href="https://example.com">the docs</a></p><ul><li>top</li></ul><hr>' +
        '<custom-card title="Card" content="Body"></custom-card>'
    );

    const markdown = editor.getMarkdown();

    // 自定义节点的规则由 renderMarkdown 钩子提供，不能因此牺牲标准节点的导出
    expect(markdown).toContain('> **Card**\n> Body');
    expect(markdown).toContain('see [the docs](https://example.com)');
    expect(markdown).toContain('- top');
    expect(markdown).toContain('---');
  });

  it('markdownToHTML 按 schema 解析嵌套列表，而非正则降级', async () => {
    const editor = await mount({ content: '<p>anchor</p>' });

    const html = editor.markdownToHTML('- a\n  - b');

    expect(html).toMatch(/<ul><li><p>a<\/p><ul><li><p>b<\/p>/);
  });

  it('htmlToMarkdown 用当前 schema 解析 HTML', async () => {
    const editor = await mount({ content: '<p>x</p>' });

    const markdown = editor.htmlToMarkdown(
      '<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul><p>text <strong>bold</strong></p>'
    );

    expect(markdown).toMatch(/- a\n\s+- b/);
    expect(markdown).toContain('**bold**');
  });
});

describe('emitUpdate', () => {
  it('emitUpdate 为 false 时不触发 onChange', async () => {
    const onChange = vi.fn();
    const editor = await mount({ content: '<p>init</p>', onChange });

    editor.setContent('<p>silent</p>', { emitUpdate: false });
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.getHTML()).toBe('<p>silent</p>');

    editor.setContent('<p>loud</p>', { emitUpdate: true });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('markdown 分支同样遵守 emitUpdate', async () => {
    const onChange = vi.fn();
    const editor = await mount({ contentFormat: 'markdown', content: '# a', onChange });

    editor.setContent('# silent md', { emitUpdate: false });

    expect(onChange).not.toHaveBeenCalled();
    expect(editor.getHTML()).toContain('<h1>silent md</h1>');
  });
});

describe('markdown.indentation', () => {
  const nested = '- a\n  - b';

  it('未配置时按两个空格缩进嵌套列表', async () => {
    const editor = await mount({ contentFormat: 'markdown', content: nested });

    expect(editor.getMarkdown()).toContain('- a\n  - b');
  });

  it('导出缩进跟随配置，且 style 与 size 可单独给出', async () => {
    const fourSpaces = await mount({
      contentFormat: 'markdown',
      content: nested,
      markdown: { indentation: { size: 4 } },
    });
    const oneTab = await mount({
      contentFormat: 'markdown',
      content: nested,
      markdown: { indentation: { style: 'tab', size: 1 } },
    });

    // 只有一条生效路径：配置原样转发给 Markdown 扩展，服务层不再各自留一份默认值
    expect(fourSpaces.getMarkdown()).toContain('- a\n    - b');
    expect(oneTab.getMarkdown()).toContain('- a\n\t- b');
  });
});

describe('正则降级链路（markdown.enabled 为 false）', () => {
  it('图片先于链接被识别，否则 ![alt](src) 会退化成 <a>', () => {
    expect(simpleMarkdownToHtml('![封面](https://cdn.example.com/a.png "标题")')).toBe(
      '<p><img src="https://cdn.example.com/a.png" alt="封面" title="标题"></p>'
    );
    expect(simpleMarkdownToHtml('[详情](https://example.com)')).toBe(
      '<p><a href="https://example.com">详情</a></p>'
    );
  });

  it('<img> 还原为 ![]()，而不是被剥标签规则当成空串吞掉', () => {
    expect(
      simpleHtmlToMarkdown('<p><img src="https://cdn.example.com/a.png" alt="封面"></p>')
    ).toBe('![封面](https://cdn.example.com/a.png)');
  });

  it('编辑器关掉 Markdown 扩展后，getMarkdown 与 setMarkdown 仍认得图片', async () => {
    const editor = await mount({
      content: '<p><img src="https://cdn.example.com/a.png" alt="封面"></p>',
      markdown: { enabled: false },
    });

    expect(editor.getMarkdown()).toBe('![封面](https://cdn.example.com/a.png)');
  });
});
