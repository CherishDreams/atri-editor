import { describe, expect, it } from 'vitest';
import type { UploadResult } from '../src/types';
import { mount } from './utils';

describe('图片节点', () => {
  it('默认注册 image 节点，setImage 产出 img', async () => {
    const editor = await mount({ content: '<p>正文</p>' });

    expect(editor.editor.state.schema.nodes.image).toBeDefined();

    editor.editor
      .chain()
      .focus()
      .setImage({ src: 'https://cdn.example.com/a.png', alt: '封面', title: '标题' })
      .run();

    expect(editor.getHTML()).toContain('<img');
    expect(editor.getHTML()).toContain('src="https://cdn.example.com/a.png"');
    expect(editor.getHTML()).toContain('alt="封面"');
  });

  it('![alt](src "title") 双向不丢', async () => {
    const markdown = '# 标题\n\n![封面](https://cdn.example.com/a.png "图片标题")\n';
    const editor = await mount({ contentFormat: 'markdown', content: markdown });

    expect(editor.getHTML()).toMatch(/<img[^>]*src="https:\/\/cdn\.example\.com\/a\.png"/);

    expect(editor.getMarkdown()).toContain('![封面](https://cdn.example.com/a.png "图片标题")');
  });

  it('media 为 false 时不注册图片节点，图片语法降级为文本而不抛错', async () => {
    const editor = await mount({
      media: false,
      contentFormat: 'markdown',
      content: '![封面](https://cdn.example.com/a.png)',
    });

    expect(editor.editor.state.schema.nodes.image).toBeUndefined();
    expect(editor.getHTML()).not.toContain('<img');
  });

  it('开启 resize 后 Tiptap 用 data 属性而非类名标记缩放结构', async () => {
    const editor = await mount({ content: '<p>正文</p>' });
    editor.editor.chain().setImage({ src: 'https://cdn.example.com/a.png' }).run();

    const wrapper = editor.editor.view.dom.querySelector('[data-resize-wrapper]');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.querySelector('[data-resize-handle]')).toBeTruthy();
  });
});

describe('连续插入媒体节点', () => {
  it('空文档里连插两张图片，两张都在', async () => {
    const editor = await mount({});

    editor.insertImage({ src: 'https://cdn.example.com/a.png', alt: 'A' });
    editor.insertImage({ src: 'https://cdn.example.com/b.png', alt: 'B' });

    expect(editor.getHTML()).toContain('a.png');
    expect(editor.getHTML()).toContain('b.png');
  });

  it('插完图片再插附件，图片不被顶掉', async () => {
    const editor = await mount({});

    editor.insertImage({ src: 'https://cdn.example.com/a.png', alt: 'A' });
    editor.insertAttachment({ src: 'https://cdn.example.com/b.pdf', name: 'b.pdf' });

    expect(editor.getHTML()).toContain('a.png');
    expect(editor.getHTML()).toContain('b.pdf');
  });

  it('选中一张图后拖入文件，落在它后面', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      media: { upload: () => new Promise<UploadResult>(() => undefined) },
    });
    editor.editor.commands.setImage({ src: 'https://cdn.example.com/a.png' });
    editor.editor.commands.setNodeSelection(0);

    // 这条通道永不落地，uploadFiles() 要等整批落定才 resolve，只能派出去不管
    void editor.uploadFiles([new File([new Uint8Array(8)], 'b.pdf', { type: 'application/pdf' })]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(editor.getHTML()).toContain('a.png');
    expect(editor.getHTML()).toContain('b.pdf');
  });

  it('选中一段文字时插入仍然替换这段文字', async () => {
    const editor = await mount({ content: '<p>要替换的文字</p>' });
    editor.editor.commands.setTextSelection({ from: 2, to: 5 });

    editor.insertImage({ src: 'https://cdn.example.com/a.png', alt: 'A' });

    expect(editor.getHTML()).toContain('a.png');
    expect(editor.getHTML()).not.toContain('替换');
  });
});
