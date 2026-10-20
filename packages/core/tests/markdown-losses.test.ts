import { describe, expect, it } from 'vitest';
import { Node } from '@tiptap/core';
import { mount } from './utils';

/** 没有 markdown 钩子的块级节点，用来模拟第三方扩展 */
const Callout = Node.create({
  name: 'atriCalloutProbe',
  group: 'block',
  content: 'block*',
  parseHTML: () => [{ tag: 'div[data-atri-callout]' }],
  renderHTML: () => ['div', { 'data-atri-callout': '' }, 0],
});

const TABLE_HTML = '<table><tbody><tr><th>h</th></tr><tr><td>cell</td></tr></tbody></table>';

describe('Markdown 丢失报告', () => {
  it('干净文档报不出东西', async () => {
    const editor = await mount({
      content:
        '<p>正文 <strong>加粗</strong> <a href="/x">链接</a></p><ul><li>项</li></ul><pre><code class="language-bash">ls</code></pre>',
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
    expect(editor.hasLossyContent()).toBe(false);
  });

  it('表格不误报：行列单元格自己没钩子，但 table 的 renderer 亲手把它们拼出来', async () => {
    const editor = await mount({ content: TABLE_HTML });

    // 这一条是这个 API 的生死线：照着 handler 注册表报，每一张表格都会被判成丢失
    expect(editor.getMarkdownLosses()).toEqual([]);
    expect(editor.getMarkdown()).toContain('cell');
  });

  it('样式走内联 HTML 时不算丢失', async () => {
    const editor = await mount({
      content: '<p><span style="color: red">r</span><sub>b</sub><mark>x</mark></p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('段落对齐：类型有 renderer，属性没有，所以记在 attribute 上', async () => {
    const editor = await mount({ content: '<p style="text-align: center">hi</p>' });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'attribute', type: 'paragraph', attribute: 'textAlign', count: 1 },
    ]);
    // 报告与真实输出对得上：默认导出确实没带任何对齐信息
    expect(editor.getMarkdown()).toBe('hi');
  });

  it('left 不算丢失：不设对齐也是左对齐，导出不带它等于没导出', async () => {
    const editor = await mount({ content: '<p style="text-align: left">hi</p>' });

    // 从 Word / Google Docs 粘贴进来的段落几乎每段都带显式 left，这条一旦误报，
    // 整份报告就再没人当真
    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('inherit 也不算丢失（TextAlign 把它直接解析成 null）', async () => {
    const editor = await mount({ content: '<p style="text-align: inherit">hi</p>' });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('标题对齐分开计在 heading 上，两处各算一处', async () => {
    const editor = await mount({
      content: '<h2 style="text-align: right">a</h2><p style="text-align: center">b</p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'attribute', type: 'heading', attribute: 'textAlign', count: 1 },
      { kind: 'attribute', type: 'paragraph', attribute: 'textAlign', count: 1 },
    ]);
  });

  it('未知节点报成 node，并且整个子树一起没了就不再逐处重复计', async () => {
    const editor = await mount({
      content: '<div data-atri-callout><p style="text-align: center">gone</p></div>',
      extensions: [Callout],
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'node', type: 'atriCalloutProbe', count: 1 },
    ]);
    expect(editor.getMarkdown()).not.toContain('gone');
    expect(editor.hasLossyContent()).toBe(true);
  });

  it('两个并列的未知节点合成一条，count 为 2', async () => {
    const editor = await mount({
      content: '<div data-atri-callout>a</div><div data-atri-callout>b</div>',
      extensions: [Callout],
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'node', type: 'atriCalloutProbe', count: 2 },
    ]);
  });

  it("inlineStyles: 'drop' 时整个 textStyle 报成 mark 丢失", async () => {
    const editor = await mount({
      markdown: { inlineStyles: 'drop' },
      content: '<p><span style="color: red">r</span></p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([{ kind: 'mark', type: 'textStyle', count: 1 }]);
    expect(editor.getMarkdown()).toBe('r');
  });

  it("'drop' 下同一颜色的连续片段只算一处，哪怕被加粗切成三段", async () => {
    const editor = await mount({
      markdown: { inlineStyles: 'drop' },
      content: '<p><span style="color: red">a<strong>b</strong>c</span></p>',
    });

    // 标记挂在每个被切出的文本节点上，不合并连续区间就会报成两处
    expect(editor.getMarkdownLosses()).toEqual([{ kind: 'mark', type: 'textStyle', count: 1 }]);
  });

  it("'drop' 下彩色高亮是属性丢失——正文回得来，颜色回不来", async () => {
    const editor = await mount({
      markdown: { inlineStyles: 'drop' },
      content: '<p><mark data-color="#ff0">x</mark></p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'attribute', type: 'highlight', attribute: 'color', count: 1 },
    ]);
    expect(editor.getMarkdown()).toBe('==x==');
  });

  it("'drop' 下无色的普通高亮仍然不算丢失", async () => {
    const editor = await mount({
      markdown: { inlineStyles: 'drop' },
      content: '<p><mark>x</mark></p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('合并出来的跨列：pipe table 拼不出，报在 tableHeader.colspan 上', async () => {
    const editor = await mount({
      content:
        '<table><tbody><tr><th colspan="2">h</th></tr><tr><td>a</td><td>b</td></tr></tbody></table>',
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'attribute', type: 'tableHeader', attribute: 'colspan', count: 1 },
    ]);
    // 合并退化成一格带内容、一格空着——报告说丢了，是真的丢了
    expect(editor.getMarkdown()).toBe('\n| h   |     |\n| --- | --- |\n| a   | b   |\n');
  });

  it('拖过的列宽报在 colwidth 上，没拖过的表不报', async () => {
    const editor = await mount();
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colwidth: [300, null] },
                  content: [{ type: 'paragraph' }],
                },
                { type: 'tableCell', content: [{ type: 'paragraph' }] },
              ],
            },
          ],
        },
      ],
    });

    expect(editor.getMarkdownLosses()).toEqual([
      { kind: 'attribute', type: 'tableCell', attribute: 'colwidth', count: 1 },
    ]);
  });

  it('整张表一列宽都没设过时，colwidth 数组不算丢失', async () => {
    const editor = await mount();
    editor.setContent({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  attrs: { colwidth: [null, null] },
                  content: [{ type: 'paragraph' }],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('formatting: false 时压根没有这些 mark，也就没什么可丢', async () => {
    const editor = await mount({
      formatting: false,
      content: '<p><span style="color: red">x</span></p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('空文档与空编辑器一样干净', async () => {
    const editor = await mount({ content: '' });

    expect(editor.getMarkdownLosses()).toEqual([]);
  });

  it('Markdown 关闭时没有可内省的序列化器，报告为空', async () => {
    const editor = await mount({
      markdown: { enabled: false },
      content: '<p style="text-align: center">hi</p>',
    });

    expect(editor.getMarkdownLosses()).toEqual([]);
    expect(editor.hasLossyContent()).toBe(false);
  });
});
