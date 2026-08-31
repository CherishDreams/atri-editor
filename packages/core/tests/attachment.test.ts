import { describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import { mount, rootOf } from './utils';

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

describe('附件形态切换', () => {
  it('卡片切成行内链接：包进段落、属性不丢、选区跟着走', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    editor.editor
      .chain()
      .setAttachment({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf', size: 1258291 })
      .run();

    // 真实节奏下插入与切换间隔远超 prosemirror-history 的 newGroupDelay（500ms），
    // 撤销一步只回切换；测试里两条事务同一瞬间派发会被并成一组，手动推过时间戳
    const realNow = Date.now;
    vi.spyOn(Date, 'now').mockReturnValue(realNow() + 1000);
    expect(editor.editor.commands.toggleAttachmentDisplay()).toBe(true);
    vi.restoreAllMocks();

    let link: PmNode | null = null;
    editor.editor.state.doc.descendants((node) => {
      if (node.type.name === 'attachmentLink') link = node;
    });
    expect(link).toBeTruthy();
    expect(link!.attrs.name).toBe('报告.pdf');
    expect(link!.attrs.size).toBe(1258291);
    // 切换动了结构，选区仍要落在新形态上：连着撤销或再切回去都不用重新点
    expect(editor.editor.isActive('attachmentLink')).toBe(true);

    editor.editor.chain().undo().run();
    let cardBack = false;
    editor.editor.state.doc.descendants((node) => {
      if (node.type.name === 'attachment') cardBack = true;
    });
    expect(cardBack).toBe(true);
  });

  it('句中链接切成卡片：段落按块级语义劈开，文字各留一边', async () => {
    const editor = await mount({
      content:
        '<p>先看<a href="https://cdn.example.com/a.pdf" data-atri-attachment-link data-name="报告.pdf"><span class="atri-attachment-icon"></span>报告.pdf</a>再看</p>',
    });

    let pos = -1;
    editor.editor.state.doc.descendants((node, p) => {
      if (node.type.name === 'attachmentLink') pos = p;
    });
    expect(pos).toBeGreaterThan(-1);

    editor.editor.chain().setNodeSelection(pos).toggleAttachmentDisplay().run();

    const doc = editor.editor.state.doc;
    const kinds = Array.from({ length: doc.childCount }, (_, i) => doc.child(i).type.name);
    expect(kinds).toEqual(['paragraph', 'attachment', 'paragraph']);
    expect(doc.child(0).textContent).toBe('先看');
    expect(doc.child(2).textContent).toBe('再看');
  });

  it('没选中附件时切换返回 false', async () => {
    const editor = await mount({ content: '<p>正文</p>' });

    expect(editor.editor.commands.toggleAttachmentDisplay()).toBe(false);
    expect(editor.editor.commands.setAttachmentDisplay({ display: 'link' })).toBe(false);
  });

  it('门面 insertAttachment 按 display 分派两种形态', async () => {
    const editor = await mount({
      content: '<p>正文</p>',
      media: { attachment: { display: 'link' } },
    });

    editor.insertAttachment({ src: 'https://cdn.example.com/a.pdf', name: 'a.pdf' });
    expect(editor.editor.isActive('attachmentLink')).toBe(true);

    editor.insertAttachment({
      src: 'https://cdn.example.com/b.pdf',
      name: 'b.pdf',
      display: 'card',
    });
    expect(editor.editor.isActive('attachment')).toBe(true);
  });

  /**
   * 取附件选中插件的 DOM 处理器，返回"送一个事件"的函数。
   * 直接调处理器而不是派发：派发会连带跑 PM 原生 mousedown，jsdom 没有排版，
   * posAtCoords 要 elementFromPoint / getClientRects，桩得比断言还多
   */
  function attachmentClickHandler(view: EditorView, target: Element) {
    // Plugin.key 由 Schema 赋值，类型上没声明
    const plugin = view.state.plugins.find((p) =>
      String((p as { key?: string }).key).includes('atriAttachmentSelection')
    );
    const handlers = plugin!.props.handleDOMEvents as unknown as Record<
      'mousedown' | 'click',
      (view: EditorView, event: Event) => boolean
    >;
    return (type: 'mousedown' | 'click') => {
      const event = new MouseEvent(type, { cancelable: true });
      Object.defineProperty(event, 'target', { value: target });
      return { handled: handlers[type](view, event), prevented: event.defaultPrevented };
    };
  }

  it('点附件只选中不导航，已选中再点才交给浏览器打开', async () => {
    for (const [form, className] of [
      ['attachment', '.atri-attachment-name'],
      ['attachmentLink', 'a.atri-attachment-link'],
    ] as const) {
      const editor = await mount({ content: '<p>正文</p>' });
      editor.editor.commands[form === 'attachment' ? 'setAttachment' : 'setAttachmentLink']({
        src: 'https://cdn.example.com/a.pdf',
        name: '报告.pdf',
      });
      const view = editor.editor.view;
      // 插入命令末尾会把附件选中，光标得挪回正文这一笔才算"第一次点"。用文末而不是
      // atStart：卡片是块级节点且排在正文前，从文档头找最近位置先撞上卡片自己
      editor.editor.commands.focus('end');
      const target = view.dom.querySelector(className)!;

      const fire = attachmentClickHandler(view, target);
      // 第一次：mousedown 选中，click 压住导航——否则永远选不中，切不了形态
      expect(fire('mousedown'), form).toEqual({ handled: true, prevented: true });
      expect(fire('click'), form).toEqual({ handled: true, prevented: true });
      expect(editor.editor.isActive(form), form).toBe(true);

      // 第二次：已选中，两个事件都原样放行，跳转/下载交回浏览器
      // （行内链接带 download，所以那一笔是下载而不是换页）
      expect(fire('mousedown'), form).toEqual({ handled: false, prevented: false });
      expect(fire('click'), form).toEqual({ handled: false, prevented: false });
    }
  });

  it('行内链接带 download，同源地址点了直接落盘', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    editor.editor
      .chain()
      .setAttachmentLink({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf' })
      .run();

    const link = editor.editor.view.dom.querySelector('a.atri-attachment-link')!;
    expect(link.getAttribute('download')).toBe('报告.pdf');
    expect(link.getAttribute('href')).toBe('https://cdn.example.com/a.pdf');
  });

  it('手写的 <a data-atri-attachment-link href> 没有 data-src 也认', async () => {
    const editor = await mount({
      content:
        '<p>先看<a href="https://cdn.example.com/a.pdf" data-atri-attachment-link>报告.pdf</a>再看</p>',
    });

    let src: unknown = null;
    let name: unknown = null;
    editor.editor.state.doc.descendants((node) => {
      if (node.type.name === 'attachmentLink') {
        src = node.attrs.src;
        name = node.attrs.name;
      }
    });
    expect(src).toBe('https://cdn.example.com/a.pdf');
    expect(name).toBeNull();
    // 名字缺省时标签退回地址尾巴，链接不会是空的
    const html = editor.getHTML();
    expect(html).toContain('href="https://cdn.example.com/a.pdf"');
    expect(html).toContain('>a.pdf</a>');
  });

  it('工具栏按钮跟着选区走：没附件禁用，选中附件点亮', async () => {
    const editor = await mount({ content: '<p>正文</p>', toolbar: {} });
    const button = rootOf(editor).querySelector<HTMLButtonElement>(
      '[data-toolbar-item="attachmentDisplay"]'
    )!;

    expect(button.disabled).toBe(true);

    editor.editor
      .chain()
      .setAttachment({ src: 'https://cdn.example.com/a.pdf', name: 'a.pdf' })
      .run();
    expect(button.disabled).toBe(false);
    expect(button.classList.contains('active')).toBe(true);
  });
});
