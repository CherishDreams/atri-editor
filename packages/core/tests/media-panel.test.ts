import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtriEditor } from '../src/index';
import type { AtriMediaConfig, UploadHandler, UploadResult } from '../src/types';
import { mount, rootOf, toolbarButtons, toolbarTitles } from './utils';

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

function buttonOf(editor: AtriEditor, id: string): HTMLButtonElement {
  const button = rootOf(editor).querySelector<HTMLButtonElement>(`[data-toolbar-item="${id}"]`);
  if (!button) throw new Error(`toolbar item "${id}" not rendered`);
  return button;
}

function click(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

function pointerDownOn(node: Node): void {
  node.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
}

function pressEscape(): void {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}

/** 面板挂在 document.body 上，不在编辑器容器里 */
function panels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.atri-media-panel'));
}

function inPanel<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(`.atri-media-panel ${selector}`);
}

function itemIds(editor: AtriEditor): string[] {
  return toolbarButtons(editor).map((button) => button.getAttribute('data-toolbar-item') ?? '');
}

function separatorCount(editor: AtriEditor): number {
  return rootOf(editor).querySelectorAll('.atri-editor-toolbar-separator').length;
}

function stripOf(editor: AtriEditor): HTMLElement {
  const strip = rootOf(editor).querySelector<HTMLElement>('.atri-media-status');
  if (!strip) throw new Error('media status strip not rendered');
  return strip;
}

function stripText(editor: AtriEditor): string {
  return stripOf(editor).querySelector('.atri-media-status-text')?.textContent ?? '';
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * uploadFiles() 会等整条队列落地，永不 resolve 的通道会把用例挂住。
 * 插节点与状态回填都在 handleFiles 的第一个 await 之前同步完成，派出去再让出一个宏任务就能看到"上传中"
 */
async function sendFiles(editor: AtriEditor, files: File[], kind?: 'image' | 'attachment') {
  void editor.uploadFiles(files, kind);
  await settled();
}

/** 由测试手动了结的上传，好分别观察"上传中"与"已落地"两个瞬间 */
function deferredUpload() {
  let resolve!: (value: UploadResult) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<UploadResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { handler: () => promise, resolve, reject };
}

/** 第一次必失败、之后成功的通道：重试路径不用伸手进实现内部 */
function flakyUpload(): UploadHandler {
  let attempts = 0;
  return () => {
    attempts += 1;
    if (attempts === 1) return Promise.reject(new Error('network down'));
    return Promise.resolve({ url: 'https://cdn.example.com/a.png' });
  };
}

/** 永不落定的上传：只关心状态条显示什么 */
function pendingUpload(): UploadHandler {
  return () => new Promise<UploadResult>(() => undefined);
}

const originalObjectUrls = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

beforeEach(() => {
  let sequence = 0;
  URL.createObjectURL = () => `blob:preview/${(sequence += 1)}`;
  URL.revokeObjectURL = () => undefined;
});

afterEach(() => {
  URL.createObjectURL = originalObjectUrls.createObjectURL;
  URL.revokeObjectURL = originalObjectUrls.revokeObjectURL;
});

describe('插入浮层', () => {
  const warns: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warns.push(args.join(' '));
  });

  afterEach(() => {
    warns.length = 0;
  });

  it('默认工具栏末尾多出图片与附件两项', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });

    expect(itemIds(editor).slice(-2)).toEqual(['insertImage', 'insertAttachment']);
    expect(toolbarButtons(editor)).toHaveLength(20);
    expect(separatorCount(editor)).toBe(5);
    expect(toolbarTitles(editor).slice(-2)).toEqual(['图片', '附件']);
    expect(buttonOf(editor, 'insertImage').querySelector('svg')).not.toBeNull();
  });

  it('切语言后新按钮的 tooltip 与开着的面板一起改文案', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    click(buttonOf(editor, 'insertImage'));
    const urlInput = inPanel<HTMLInputElement>('.atri-media-panel-url')!;

    expect(urlInput.placeholder).toBe('图片地址（https://…）');
    await editor.setLanguage('en');

    expect(toolbarTitles(editor)).toEqual(['Image']);
    expect(urlInput.placeholder).toBe('Image URL (https://…)');
    expect(inPanel<HTMLButtonElement>('.atri-media-panel-insert')!.textContent).toBe('Insert');
  });

  it('深色主题下面板带上同一份主题类', async () => {
    // 面板挂在 body 上，够不着 .atri-editor 里定义的变量：不跟主题类就还是白底
    const editor = await mount({
      content: '<p>x</p>',
      theme: 'dark',
      toolbar: { items: ['insertImage'] },
    });
    click(buttonOf(editor, 'insertImage'));

    expect(panels()[0].classList.contains('atri-theme-dark')).toBe(true);
  });

  it('点开后焦点落在地址输入框，而不是被抢回编辑器', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    const imageButton = buttonOf(editor, 'insertImage');
    editor.editor.commands.focus();

    click(imageButton);

    expect(panels()).toHaveLength(1);
    expect(document.activeElement).toBe(inPanel('.atri-media-panel-url'));
    expect(editor.editor.view.dom.contains(document.activeElement)).toBe(false);
    expect(imageButton.classList.contains('active')).toBe(true);
    expect(imageButton.getAttribute('aria-haspopup')).toBe('dialog');
    expect(imageButton.getAttribute('aria-expanded')).toBe('true');
  });

  it('填地址插入图片，面板随即收起', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    click(buttonOf(editor, 'insertImage'));

    inPanel<HTMLInputElement>('.atri-media-panel-url')!.value = 'https://cdn.example.com/a.png';
    inPanel<HTMLInputElement>('.atri-media-panel-alt')!.value = '封面';
    click(inPanel<HTMLButtonElement>('.atri-media-panel-insert')!);

    expect(editor.getHTML()).toContain('src="https://cdn.example.com/a.png"');
    expect(editor.getHTML()).toContain('alt="封面"');
    expect(panels()).toHaveLength(0);
    expect(buttonOf(editor, 'insertImage').getAttribute('aria-expanded')).toBe('false');
  });

  it('地址栏回车等同点插入，空白地址不动作', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    click(buttonOf(editor, 'insertImage'));
    const urlInput = inPanel<HTMLInputElement>('.atri-media-panel-url')!;

    urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panels()).toHaveLength(1);
    expect(editor.getHTML()).toBe('<p>x</p>');

    urlInput.value = '  https://cdn.example.com/a.png  ';
    urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(panels()).toHaveLength(0);
    expect(editor.getHTML()).toContain('https://cdn.example.com/a.png');
  });

  it('附件面板只有选文件，没有地址栏与插入按钮', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['insertAttachment'] },
      media: { attachment: { accept: ['.pdf', 'image/png'] } },
    });
    click(buttonOf(editor, 'insertAttachment'));

    expect(inPanel('.atri-media-panel-url')).toBeNull();
    expect(inPanel('.atri-media-panel-insert')).toBeNull();
    expect(inPanel<HTMLInputElement>('.atri-media-panel-file')!.accept).toBe('.pdf,image/png');
    // 没有输入框可落，焦点给选择文件按钮
    expect(document.activeElement).toBe(inPanel('.atri-media-panel-browse'));
  });

  it('面板里选中的文件走同一条上传管线', async () => {
    const upload = deferredUpload();
    const config: AtriMediaConfig = { upload: upload.handler };
    const editor = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['insertAttachment'] },
      media: config,
    });
    click(buttonOf(editor, 'insertAttachment'));

    const fileInput = inPanel<HTMLInputElement>('.atri-media-panel-file')!;
    Object.defineProperty(fileInput, 'files', { value: [makeFile('报告.pdf', 'application/pdf')] });
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    await settled();

    expect(panels()).toHaveLength(0);
    expect(
      rootOf(editor).querySelector('.atri-attachment[data-atri-upload-status="uploading"]')
    ).not.toBeNull();

    upload.resolve({ url: 'https://cdn.example.com/report.pdf' });
    await settled();
    expect(rootOf(editor).querySelector('[data-atri-upload-status]')).toBeNull();
  });

  it('Escape 与点外面都关闭，同一按钮再点是关闭，换按钮是搬过去', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {} });
    const imageButton = buttonOf(editor, 'insertImage');
    const attachmentButton = buttonOf(editor, 'insertAttachment');

    click(imageButton);
    pressEscape();
    expect(panels()).toHaveLength(0);
    expect(imageButton.getAttribute('aria-expanded')).toBe('false');

    click(imageButton);
    pointerDownOn(document.body);
    expect(panels()).toHaveLength(0);

    click(imageButton);
    click(attachmentButton);
    expect(panels()).toHaveLength(1);
    expect(inPanel('.atri-media-panel-url')).toBeNull();
    expect(imageButton.classList.contains('active')).toBe(false);
    expect(attachmentButton.classList.contains('active')).toBe(true);

    click(attachmentButton);
    expect(panels()).toHaveLength(0);
  });

  it('浏览器里点一次锚点按钮（pointerdown + click）的净效果是关闭，而非关了又重开', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    const imageButton = buttonOf(editor, 'insertImage');
    click(imageButton);
    expect(panels()).toHaveLength(1);

    pointerDownOn(imageButton);
    expect(panels()).toHaveLength(1);
    click(imageButton);
    expect(panels()).toHaveLength(0);
  });

  it('面板内部的点击不关闭面板', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    click(buttonOf(editor, 'insertImage'));
    const urlInput = inPanel<HTMLInputElement>('.atri-media-panel-url')!;

    pointerDownOn(urlInput);
    click(urlInput);
    expect(panels()).toHaveLength(1);
  });

  it('销毁编辑器时留在 body 上的面板一起清掉', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: { items: ['insertImage'] } });
    click(buttonOf(editor, 'insertImage'));
    expect(panels()).toHaveLength(1);

    editor.destroy();
    expect(panels()).toHaveLength(0);
  });

  it('media:false 时两项从默认布局里消失，显式声明则跳过并告警', async () => {
    const plain = await mount({ content: '<p>x</p>', toolbar: {}, media: false });
    expect(itemIds(plain)).toHaveLength(18);
    expect(separatorCount(plain)).toBe(4);

    const warned = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['bold', 'insertImage', 'insertAttachment'] },
      media: false,
    });
    expect(itemIds(warned)).toEqual(['bold']);
    expect(warns.filter((w) => w.includes('Unknown toolbar item'))).toHaveLength(2);
  });

  it('只读编辑器上该项按钮禁用', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      toolbar: { items: ['insertImage'] },
      editable: false,
    });

    expect(buttonOf(editor, 'insertImage').disabled).toBe(true);
  });
});

describe('上传状态条', () => {
  it('空闲时不占位，编辑器销毁后整条移除', async () => {
    const editor = await mount({ content: '<p>x</p>' });
    const strip = stripOf(editor);

    expect(strip.hidden).toBe(true);
    expect(strip.getAttribute('role')).toBe('status');

    editor.destroy();
    expect(rootOf(editor).querySelector('.atri-media-status')).toBeNull();
  });

  it('上传中显示聚合进度，落地后重新隐藏', async () => {
    const upload = deferredUpload();
    const editor = await mount({ content: '<p>x</p>', media: { upload: upload.handler } });

    await sendFiles(editor, [makeFile('a.png', 'image/png', 2000)], 'image');
    const strip = stripOf(editor);
    expect(strip.hidden).toBe(false);
    expect(strip.getAttribute('data-atri-media-status')).toBe('uploading');
    expect(stripText(editor)).toBe('上传中 1 个 · 0%');

    upload.resolve({ url: 'https://cdn.example.com/a.png' });
    await settled();
    expect(strip.hidden).toBe(true);
  });

  it('整体进度按文件体积加权，逐个落地后读数随之减少', async () => {
    const pending: ((result: UploadResult) => void)[] = [];
    const handler: UploadHandler = (file, { onProgress }) =>
      new Promise<UploadResult>((resolve) => {
        pending.push(resolve);
        onProgress({
          percent: file.name === 'big.png' ? 50 : 0,
          loaded: 0,
          total: 0,
        });
      });
    const editor = await mount({ content: '<p>x</p>', media: { upload: handler } });

    await sendFiles(
      editor,
      [makeFile('big.png', 'image/png', 3000), makeFile('small.png', 'image/png', 1000)],
      'image'
    );
    // 3000 传到一半、1000 没动：加权后是 1500 / 4000
    expect(stripText(editor)).toBe('上传中 2 个 · 38%');

    pending[0]({ url: 'https://cdn.example.com/big.png' });
    await settled();
    expect(stripText(editor)).toBe('上传中 1 个 · 0%');

    pending[1]({ url: 'https://cdn.example.com/small.png' });
    await settled();
    expect(stripOf(editor).hidden).toBe(true);
  });

  it('失败时留一条带重试按钮的读数，重试成功后清空', async () => {
    const editor = await mount({ content: '<p>x</p>', media: { upload: flakyUpload() } });
    await sendFiles(editor, [makeFile('a.png', 'image/png')], 'image');

    const strip = stripOf(editor);
    const retry = strip.querySelector<HTMLButtonElement>('.atri-media-status-retry')!;
    expect(strip.getAttribute('data-atri-media-status')).toBe('error');
    expect(stripText(editor)).toBe('1 个文件上传失败');
    expect(retry.textContent).toBe('重试');
    expect(retry.hidden).toBe(false);
    expect(editor.hasPendingUploads()).toBe(true);

    click(retry);
    await settled();

    expect(strip.hidden).toBe(true);
    expect(editor.hasPendingUploads()).toBe(false);
    expect(rootOf(editor).querySelector('[data-atri-upload-status]')).toBeNull();
  });

  it('内联兜底改口说「已随文档保存」，读数仍可重试', async () => {
    const editor = await mount({
      content: '<p>x</p>',
      media: { upload: flakyUpload(), image: { fallbackToBase64: true } },
    });
    await sendFiles(editor, [makeFile('a.png', 'image/png')], 'image');
    // 内联要等 FileReader，读盘是异步的：再多让一个任务才看得到最终读数
    await settled();

    const strip = stripOf(editor);
    const retry = strip.querySelector<HTMLButtonElement>('.atri-media-status-retry')!;
    expect(strip.getAttribute('data-atri-media-status')).toBe('error');
    expect(stripText(editor)).toBe('1 张图片未上传（已随文档保存）');
    expect(retry.hidden).toBe(false);
    // 内容已经安全在文档里，保存闸门先放开
    expect(editor.hasPendingUploads()).toBe(false);

    await editor.setLanguage('en');
    expect(stripText(editor)).toBe('1 image(s) saved with the document (not uploaded)');

    click(retry);
    await settled();
    await settled();

    expect(strip.hidden).toBe(true);
    expect(editor.getHTML()).toContain('src="https://cdn.example.com/a.png"');
  });

  it('切语言后重画为英文', async () => {
    const editor = await mount({ content: '<p>x</p>', media: { upload: pendingUpload() } });
    await sendFiles(editor, [makeFile('a.png', 'image/png')], 'image');

    await editor.setLanguage('en');
    expect(stripText(editor)).toBe('Uploading 1 · 0%');
  });
});
