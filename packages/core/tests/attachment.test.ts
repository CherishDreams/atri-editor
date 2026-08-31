import { describe, expect, it } from 'vitest';
import { mount } from './utils';

describe('附件节点', () => {
  it('默认注册 attachment 节点，setAttachment 产出卡片结构', async () => {
    const editor = await mount({ content: '<p>正文</p>' });

    expect(editor.editor.state.schema.nodes.attachment).toBeDefined();

    editor.editor
      .chain()
      .setAttachment({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf', size: 1258291 })
      .run();

    const html = editor.getHTML();

    expect(html).toContain('data-atri-attachment');
    expect(html).toContain('data-src="https://cdn.example.com/a.pdf"');
    expect(html).toContain('data-name="报告.pdf"');
    expect(html).toContain('1.2 MB');
  });

  it('文件名只作为属性值与文本出现，不产出元素', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    const malicious = '<img src=x onerror=alert(1)>' + 'a"b';

    editor.editor
      .chain()
      .setAttachment({ src: 'https://cdn.example.com/x.bin', name: malicious })
      .run();

    const html = editor.getHTML();

    // 文本节点里的尖括号必须被转义
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    // 属性值里的引号不能提前闭合属性，否则后面就能挂事件处理器
    expect(editor.editor.view.dom.querySelectorAll('img')).toHaveLength(0);
    expect(editor.editor.view.dom.querySelectorAll('[onerror]')).toHaveLength(0);

    // HTML 回读仍然是同一个字符串，而不是被解析成标记
    editor.setContent(html);
    const attachmentType = editor.editor.state.schema.nodes.attachment;
    let name: unknown = null;
    editor.editor.state.doc.descendants((node) => {
      if (node.type === attachmentType) name = node.attrs.name;
    });

    expect(name).toBe(malicious);
  });

  it('!file[名字](url "大小") 双向不丢', async () => {
    const markdown = '前言\n\n!file[报告.pdf](https://cdn.example.com/a.pdf "1.2 MB")\n\n后记\n';
    const editor = await mount({ contentFormat: 'markdown', content: markdown });

    const attachmentType = editor.editor.state.schema.nodes.attachment;
    let card: { attrs: Record<string, unknown> } | null = null;
    editor.editor.state.doc.descendants((node) => {
      if (node.type === attachmentType) card = node;
    });

    expect(card).toBeTruthy();
    expect(card!.attrs.src).toBe('https://cdn.example.com/a.pdf');
    expect(card!.attrs.name).toBe('报告.pdf');
    expect(card!.attrs.size).toBe(1258291);

    expect(editor.getMarkdown()).toContain(
      '!file[报告.pdf](https://cdn.example.com/a.pdf "1.2 MB")'
    );
  });

  it('media 为 false 时不注册附件节点', async () => {
    const editor = await mount({ media: false, content: '<p>正文</p>' });

    expect(editor.editor.state.schema.nodes.attachment).toBeUndefined();
  });
});

describe('行内链接附件', () => {
  it('attachmentLink 是行内 atom，setAttachmentLink 产出可下载链接', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    const type = editor.editor.state.schema.nodes.attachmentLink;

    expect(type).toBeDefined();
    expect(type.isInline).toBe(true);

    editor.editor
      .chain()
      .setAttachmentLink({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf', size: 1258291 })
      .run();

    const html = editor.getHTML();
    expect(html).toContain('data-atri-attachment-link');
    expect(html).toContain('href="https://cdn.example.com/a.pdf"');
    expect(html).toContain('download="报告.pdf"');
    // 卡片是块级 div，链接必须落在段落里与文字同流（默认选区在段首，链接排在文字前）
    expect(html).toMatch(/<p><a [^>]*atri-attachment-link/);
  });

  it('!filelink 在句子中间双向不丢', async () => {
    const markdown = '先看!filelink[报告.pdf](https://cdn.example.com/a.pdf "1.2 MB")再看\n';
    const editor = await mount({ contentFormat: 'markdown', content: markdown });

    const linkType = editor.editor.state.schema.nodes.attachmentLink;
    const paragraph = editor.editor.state.doc.child(0);
    const kinds = Array.from(
      { length: paragraph.childCount },
      (_, i) => paragraph.child(i).type.name
    );

    expect(kinds).toEqual(['text', 'attachmentLink', 'text']);
    expect(paragraph.child(1).attrs.name).toBe('报告.pdf');
    expect(paragraph.child(1).attrs.size).toBe(1258291);

    expect(editor.getMarkdown()).toContain(
      '先看!filelink[报告.pdf](https://cdn.example.com/a.pdf "1.2 MB")再看'
    );
    expect(linkType).toBeDefined();
  });

  it('HTML 回读不被 StarterKit 的 Link 扩展抢成普通链接', async () => {
    const editor = await mount({ content: '<p>正文</p>' });

    editor.editor
      .chain()
      .setAttachmentLink({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf' })
      .run();
    const html = editor.getHTML();

    editor.setContent(html);
    const linkType = editor.editor.state.schema.nodes.attachmentLink;
    let found: { src: unknown; name: unknown } | null = null;
    let linkMarkOnText = false;
    editor.editor.state.doc.descendants((node, _pos, parent) => {
      if (node.type === linkType) found = { src: node.attrs.src, name: node.attrs.name };
      if (parent?.type.name === 'attachmentLink') return false;
      node.marks.forEach((mark) => {
        if (mark.type.name === 'link') linkMarkOnText = true;
      });
    });

    expect(found).toBeTruthy();
    expect(found!.src).toBe('https://cdn.example.com/a.pdf');
    expect(found!.name).toBe('报告.pdf');
    expect(linkMarkOnText).toBe(false);
  });

  it('文件名在链接形态同样只作属性与文本，不产出元素', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    const malicious = '<img src=x onerror=alert(1)>';

    editor.editor
      .chain()
      .setAttachmentLink({ src: 'https://cdn.example.com/x.bin', name: malicious })
      .run();

    expect(editor.getHTML()).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(editor.editor.view.dom.querySelectorAll('img')).toHaveLength(0);
    expect(editor.editor.view.dom.querySelectorAll('[onerror]')).toHaveLength(0);
  });

  it('media 为 false 时不注册行内链接节点', async () => {
    const editor = await mount({ media: false, content: '<p>正文</p>' });

    expect(editor.editor.state.schema.nodes.attachmentLink).toBeUndefined();
  });
});
