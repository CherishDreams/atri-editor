import { describe, expect, it } from 'vitest';
import { mount } from './utils';

/** 导出→载入→再导出，两轮输出必须逐字节相同。不幂等意味着每存一次都再损坏一点 */
async function assertIdempotent(html: string): Promise<string> {
  const editor = await mount();
  editor.setContent(html);
  const first = editor.getMarkdown();
  editor.setMarkdown(first);
  const second = editor.getMarkdown();
  expect(second).toBe(first);
  return first;
}

describe('基础格式的 Markdown 往返', () => {
  it('颜色不再被静默丢掉', async () => {
    const md = await assertIdempotent(
      '<p>plain <span style="color: rgb(255, 0, 0)">red</span> tail</p>'
    );
    expect(md).toContain('<span style="color: rgb(255, 0, 0)">red</span>');
  });

  it('背景色、字号、字体一起走同一个 span', async () => {
    const editor = await mount();
    editor.setContent(
      '<p><span style="color: red; background-color: yellow; font-size: 20px; font-family: Arial">x</span></p>'
    );
    const md = editor.getMarkdown();
    expect(md).toContain('color: red');
    expect(md).toContain('background-color: yellow');
    expect(md).toContain('font-size: 20px');
    expect(md).toContain('font-family: Arial');
    editor.setMarkdown(md);
    expect(editor.getMarkdown()).toBe(md);
  });

  it('片段内部的 markdown 会被重新分词，不是回来成字面文本', async () => {
    const editor = await mount();
    editor.setContent('<p><span style="color: red">A<strong>B</strong><em>C</em></span>D</p>');
    const md = editor.getMarkdown();
    editor.setMarkdown(md);
    expect(editor.getHTML()).toContain('<strong>B</strong>');
    expect(editor.getHTML()).toContain('<em>C</em>');
  });

  it('转义不随往返累积', async () => {
    const editor = await mount();
    editor.setContent('<p><span style="color: red">2*3 [x] _y_</span></p>');
    const first = editor.getMarkdown();
    editor.setMarkdown(first);
    const second = editor.getMarkdown();
    expect(second).toBe(first);
    expect(second.match(/\\\\/g) ?? []).toHaveLength(0);
    // 字面字符要真的还是字面字符，而不是被解成格式
    editor.setContent('<p><span style="color: red">2*3 [x] _y_</span></p>');
    editor.setMarkdown(editor.getMarkdown());
    expect(editor.editor.getText()).toBe('2*3 [x] _y_');
  });

  it('交替颜色与边界交叠', async () => {
    const md = await assertIdempotent(
      '<p><span style="color: red">A<strong>B</strong></span>' +
        '<span style="color: blue">C</span>D</p>'
    );
    expect(md).toBe('<span style="color: red">A**B**</span><span style="color: blue">C</span>D');
  });

  it('颜色套在链接里', async () => {
    const editor = await mount();
    editor.setContent('<p><a href="https://x.com"><span style="color: red">L</span></a></p>');
    const md = editor.getMarkdown();
    editor.setMarkdown(md);
    expect(editor.getMarkdown()).toBe(md);
    expect(editor.getHTML()).toContain('href="https://x.com"');
  });

  it('没有任何样式属性时不产出空 span', async () => {
    const md = await assertIdempotent('<p>nothing styled here</p>');
    expect(md).not.toContain('<span');
  });

  it('上下标走 <sub>/<sup>，且不能用 ~ ^ 那类写法', async () => {
    const md = await assertIdempotent('<p>H<sub>2</sub>O and x<sup>2</sup></p>');
    expect(md).toBe('H<sub>2</sub>O and x<sup>2</sup>');

    // marked 把单波浪线当 GFM 删除线：`H~2~O` 会回来成 <s>2</s>，
    // 既做不成下标又平白吃掉一个删除线语法，所以这条写法明确不支持
    const editor = await mount();
    editor.setMarkdown('H~2~O');
    expect(editor.getHTML()).not.toContain('<sub>');
  });

  it('高亮：无色出 ==，有色出 <mark data-color> 且颜色不丢', async () => {
    const plain = await assertIdempotent('<p>a <mark>mono</mark> b</p>');
    expect(plain).toBe('a ==mono== b');

    const colored = await assertIdempotent(
      '<p>x <mark data-color="#ff0000" style="background-color: rgb(255, 0, 0); color: inherit">c</mark> y</p>'
    );
    expect(colored).toContain('data-color="#ff0000"');
    const editor = await mount();
    editor.setMarkdown(colored);
    expect(editor.getHTML()).toContain('#ff0000');
  });

  it('`<span style>` 里的 & 与引号不会双重转义', async () => {
    const md = await assertIdempotent(
      '<p><span style="font-family: &quot;Fira Sans&quot;">a &amp; b</span></p>'
    );
    expect(md).not.toContain('&amp;amp;');
    expect(md).not.toContain('&quot;quot;');
  });

  it('不成对的 <span 退化成文本而不是抛错', async () => {
    const editor = await mount();
    expect(() => editor.setMarkdown('x <span style="color: red">unclosed y')).not.toThrow();
    expect(editor.editor.getText()).toContain('unclosed y');
  });

  it('inlineStyles: drop 时样式不导出，但导入仍然解析', async () => {
    const editor = await mount({ markdown: { inlineStyles: 'drop' } });
    editor.setContent('<p>plain <span style="color: rgb(255, 0, 0)">red</span></p>');
    expect(editor.getMarkdown()).toBe('plain red');

    // 关掉导出偏好不该连带把导入能力也削掉
    editor.setMarkdown('<span style="color: red">x</span>');
    expect(editor.editor.state.doc.toJSON).toBeTruthy();
    expect(editor.getHTML()).toContain('color: red');
  });

  it('formatting: false 时外来 span 不再成 mark，导出也不带样式', async () => {
    const editor = await mount({ formatting: false });
    editor.setContent('<p><span style="color: red">x</span></p>');
    expect(editor.getHTML()).not.toContain('color: red');
    editor.setMarkdown('<span style="color: red">y</span>');
    expect(editor.getMarkdown()).toBe('y');
  });

  it('经命令设置的样式也能往返', async () => {
    const editor = await mount();
    editor.setContent('<p>hello world</p>');
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.editor.commands.setColor('#aa0000');
    editor.editor.commands.setTextSelection({ from: 7, to: 12 });
    editor.editor.commands.setFontSize('20px');

    const md = editor.getMarkdown();
    expect(md).toContain('color: #aa0000');
    expect(md).toContain('font-size: 20px');
    editor.setMarkdown(md);
    expect(editor.getMarkdown()).toBe(md);
  });
});
