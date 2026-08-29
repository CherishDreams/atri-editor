import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import type { UploadResult } from '../src/types';
import { mount } from './utils';

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

/** jsdom 既没有 DataTransfer，也没有真正的剪贴板对象 */
function fakeTransfer(files: File[], text = '') {
  return {
    files,
    items: [],
    types: files.length ? ['Files'] : [],
    getData: (mime: string) => (mime === 'text/plain' ? text : ''),
    setData: () => undefined,
    clearData: () => undefined,
  };
}

/**
 * 把 drop / paste 真的派发到 ProseMirror 的 DOM 上，测的是"事件到上传管线"这段接线。
 * jsdom 没有排版，posAtCoords 恒为 null，PM 会在问到自己插件之前就先返回，
 * 所以拖放用例得把落点补上。
 */
function fireDrop(editor: Editor, files: File[], pos: number | null): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    dataTransfer: { value: fakeTransfer(files) },
    clientX: { value: 12 },
    clientY: { value: 12 },
  });

  const view = editor.view;
  const originalPosAtCoords = view.posAtCoords;
  view.posAtCoords = () => (pos === null ? null : { pos, inside: -1, textOffset: null });
  view.dom.dispatchEvent(event);
  view.posAtCoords = originalPosAtCoords;
  return event;
}

function firePaste(editor: Editor, files: File[], text = ''): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: fakeTransfer(files, text) });
  editor.view.dom.dispatchEvent(event);
  return event;
}

/** 文档里出现的媒体节点，按文档顺序列出（kind + 文件名，顺序断言用） */
function inserted(editor: Editor): [string, string][] {
  const nodes: [string, string][] = [];
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') nodes.push(['image', String(node.attrs.alt)]);
    if (node.type.name === 'attachment') nodes.push(['attachment', String(node.attrs.name)]);
  });
  return nodes;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 由测试手动了结的上传，好分别观察"上传中"与"已落地"两个瞬间 */
function deferredUpload() {
  let resolve!: (value: UploadResult) => void;
  const promise = new Promise<UploadResult>((res) => {
    resolve = res;
  });
  return { handler: () => promise, resolve };
}

/** 永不落定的上传：只关心节点插没插、插在哪 */
function neverUpload(): Promise<UploadResult> {
  return new Promise<UploadResult>(() => undefined);
}

const originalObjectUrls = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

beforeEach(() => {
  let sequence = 0;
  // jsdom 没实现 object URL，测试自己发号，"预览地址"这条线索才可断言
  URL.createObjectURL = () => `blob:preview/${(sequence += 1)}`;
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  URL.createObjectURL = originalObjectUrls.createObjectURL;
  URL.revokeObjectURL = originalObjectUrls.revokeObjectURL;
});

describe('拖放与剪贴板投放文件', () => {
  it('拖进来的文件按 MIME 分流，多个文件保持原有顺序', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: { upload: neverUpload } });

    fireDrop(
      editor.editor,
      [makeFile('a.png', 'image/png'), makeFile('报告.pdf', 'application/pdf')],
      1
    );
    await settled();

    expect(inserted(editor.editor)).toEqual([
      ['image', 'a.png'],
      ['attachment', '报告.pdf'],
    ]);
    expect(editor.hasPendingUploads()).toBe(true);
  });

  it('落点在正文中间时，媒体插在那里而不是选区处', async () => {
    const editor = await mount({
      content: '<p>前段</p><p>后段</p>',
      media: { upload: neverUpload },
    });
    editor.editor.commands.setTextSelection(1);

    fireDrop(editor.editor, [makeFile('a.png', 'image/png')], 4);
    await settled();

    const html = editor.getHTML();
    expect(html.indexOf('前段')).toBeLessThan(html.indexOf('blob:preview/1'));
    expect(html.indexOf('blob:preview/1')).toBeLessThan(html.indexOf('后段'));
    // 落点没有文本位置时也不能吃掉正文：靠的是传位置而不是改选区
    expect(html).toContain('前段');
    expect(html).toContain('后段');
  });

  it('粘贴剪贴板里的图片会走上传管线', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: { upload: neverUpload } });

    const event = firePaste(editor.editor, [
      makeFile('shot.png', 'image/png'),
      makeFile('shot2.jpg', 'image/jpeg'),
    ]);
    await settled();

    expect(event.defaultPrevented).toBe(true);
    expect(inserted(editor.editor)).toEqual([
      ['image', 'shot.png'],
      ['image', 'shot2.jpg'],
    ]);
  });

  it('纯文本粘贴不接管，仍然插字而不是起上传', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: { upload: neverUpload } });

    firePaste(editor.editor, [], '粘贴的文字');
    await settled();

    expect(editor.getHTML()).toContain('粘贴的文字');
    expect(inserted(editor.editor)).toEqual([]);
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('拖进来的是文字而不是文件时不接管', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: { upload: neverUpload } });

    fireDrop(editor.editor, [], 1);
    await settled();

    expect(editor.hasPendingUploads()).toBe(false);
    expect(inserted(editor.editor)).toEqual([]);
  });

  it('解析不出落点坐标时不插入也不报错', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: { upload: neverUpload } });

    fireDrop(editor.editor, [makeFile('a.png', 'image/png')], null);
    await settled();

    expect(editor.hasPendingUploads()).toBe(false);
    expect(inserted(editor.editor)).toEqual([]);
  });

  it('未配上传通道时附件报没有上传通道，也不插卡片', async () => {
    const reasons: string[] = [];
    const editor = await mount({
      content: '<p>正文</p>',
      media: { onError: ({ reason }) => reasons.push(reason) },
    });

    fireDrop(editor.editor, [makeFile('报告.pdf', 'application/pdf')], 1);
    await settled();

    expect(reasons).toEqual(['no-upload']);
    expect(inserted(editor.editor)).toEqual([]);
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('media:false 时既不注册拖放插件，内容也不被文件投放改动', async () => {
    const editor = await mount({ content: '<p>正文</p>', media: false });
    const html = editor.getHTML();

    fireDrop(editor.editor, [makeFile('a.png', 'image/png')], 1);
    await settled();

    expect(editor.getHTML()).toBe(html);
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('上传落地后原位的预览地址被换成服务端地址', async () => {
    const editor = await mount({
      content: '<p>正文</p>',
      media: { upload: (file) => Promise.resolve({ url: `https://cdn/${file.name}` }) },
    });

    const event = fireDrop(
      editor.editor,
      [makeFile('a.png', 'image/png'), makeFile('报告.pdf', 'application/pdf')],
      1
    );
    expect(event.defaultPrevented).toBe(true);
    await settled();

    const sources: string[] = [];
    editor.editor.state.doc.descendants((node) => {
      if (node.type.name === 'image' || node.type.name === 'attachment') {
        sources.push(String(node.attrs.src));
      }
    });
    expect(sources).toEqual(['https://cdn/a.png', 'https://cdn/报告.pdf']);
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('一次多文件拖放只占一步撤销历史', async () => {
    const upload = deferredUpload();
    const editor = await mount({ content: '<p>正文</p>', media: { upload: upload.handler } });

    fireDrop(
      editor.editor,
      [makeFile('a.png', 'image/png'), makeFile('报告.pdf', 'application/pdf')],
      1
    );
    await settled();
    upload.resolve({ url: 'https://cdn/done' });
    await settled();

    editor.editor.commands.undo();
    expect(editor.getHTML()).toBe('<p>正文</p>');
    expect(editor.editor.can().undo()).toBe(false);
    expect(editor.hasPendingUploads()).toBe(false);
  });
});
