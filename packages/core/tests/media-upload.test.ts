import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AtriUploadConfig, UploadContext, UploadResult } from '../src/types';
import { createUploader } from '../src/media/Uploader';
import { customCardNodeView } from './fixtures';
import { mount } from './utils';

/** 手动了结的上传：测试自己决定何时成功、何时失败 */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeFile(name: string, type: string, size = 1024): File {
  return new File([new Uint8Array(size)], name, { type });
}

/**
 * 假的 XMLHttpRequest：把 send 时的现场留下来供断言，响应由测试手动触发
 */
class FakeXHR {
  static sent: FakeXHR[] = [];

  status = 200;
  responseText = '';
  withCredentials = false;
  upload = { onprogress: null as null | ((event: ProgressEvent) => void) };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  aborted = false;

  constructor() {
    FakeXHR.sent.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  send(body: FormData): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  /** 模拟上传进度 */
  progress(loaded: number, total: number): void {
    const event = { lengthComputable: true, loaded, total } as ProgressEvent;
    this.upload.onprogress?.(event);
  }

  /** 模拟响应到达 */
  respond(body: unknown, status = 200): void {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.onload?.();
  }

  failNetwork(): void {
    this.onerror?.();
  }
}

/** jsdom 没实现 object URL，测试自己发号，好让"预览地址"这条线索可断言 */
const originalObjectUrls = {
  createObjectURL: URL.createObjectURL,
  revokeObjectURL: URL.revokeObjectURL,
};

beforeEach(() => {
  FakeXHR.sent = [];
  let sequence = 0;
  URL.createObjectURL = () => `blob:preview/${(sequence += 1)}`;
  URL.revokeObjectURL = () => undefined;
  vi.stubGlobal('XMLHttpRequest', FakeXHR);
});

afterEach(() => {
  URL.createObjectURL = originalObjectUrls.createObjectURL;
  URL.revokeObjectURL = originalObjectUrls.revokeObjectURL;
  vi.unstubAllGlobals();
});

describe('Uploader', () => {
  it('handler 分支把进度与中止信号原样交给调用方', async () => {
    const uploader = createUploader((file, context: UploadContext) => {
      context.onProgress({ percent: 42, loaded: 420, total: 1000 });
      return Promise.resolve({ url: `https://cdn/${file.name}` });
    });

    const result = await uploader!.upload(makeFile('a.png', 'image/png'), {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });

    expect(result.url).toBe('https://cdn/a.png');
  });

  it('endpoint 分支用 FormData 发请求，并从响应里挑出 url', async () => {
    const uploader = createUploader({
      endpoint: '/api/upload',
      fieldName: 'media',
      headers: { Authorization: 'Bearer t' },
    });
    const onProgress = vi.fn();
    const pending = uploader!.upload(makeFile('报告.pdf', 'application/pdf'), {
      onProgress,
      signal: new AbortController().signal,
    });

    const xhr = FakeXHR.sent[0];
    expect([xhr.method, xhr.url]).toEqual(['POST', '/api/upload']);
    expect(xhr.headers).toEqual({ Authorization: 'Bearer t' });
    expect((xhr.body!.get('media') as File).name).toBe('报告.pdf');

    xhr.progress(500, 1000);
    expect(onProgress).toHaveBeenCalledWith({ percent: 50, loaded: 500, total: 1000 });

    xhr.respond({ data: { url: 'https://cdn/报告.pdf' } });
    await expect(pending).resolves.toEqual({ url: 'https://cdn/报告.pdf' });
  });

  it('transformResult 接管响应解析，非 2xx 视为失败', async () => {
    const uploader = createUploader({
      endpoint: '/api/upload',
      transformResult: (body) => ({ url: `https://cdn/${(body as any).id}` }),
    });
    const pending = uploader!.upload(makeFile('a.bin', ''), {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    FakeXHR.sent[0].respond({ id: '7' });
    await expect(pending).resolves.toEqual({ url: 'https://cdn/7' });

    const failing = uploader!.upload(makeFile('b.bin', ''), {
      onProgress: vi.fn(),
      signal: new AbortController().signal,
    });
    FakeXHR.sent[1].respond({ id: 'x' }, 500);
    await expect(failing).rejects.toThrow('HTTP 500');
  });

  it('signal 触发 xhr.abort，请求以 AbortError 收场', async () => {
    const uploader = createUploader({ endpoint: '/api/upload' });
    const controller = new AbortController();
    const pending = uploader!.upload(makeFile('a.bin', ''), {
      onProgress: vi.fn(),
      signal: controller.signal,
    });

    controller.abort();
    expect(FakeXHR.sent[0].aborted).toBe(true);
    await expect(pending).rejects.toThrow(/Abort/);
  });

  it('未配 endpoint 也没有 handler 时没有上传通道', () => {
    expect(createUploader(undefined)).toBeNull();
    expect(createUploader({} as AtriUploadConfig)).toBeNull();
  });
});

describe('上传管线', () => {
  it('本地文件先落一个预览节点，成功后一步换成服务端地址', async () => {
    const gate = deferred<UploadResult>();
    const editor = await mount({
      content: '<p>正文</p>',
      media: { upload: () => gate.promise },
    });

    const handled = editor.uploadFiles([makeFile('封面.png', 'image/png')]);
    expect(editor.hasPendingUploads()).toBe(true);

    const htmlWhileUploading = editor.getHTML();
    expect(htmlWhileUploading).toContain('blob:preview/1');
    expect(htmlWhileUploading).toContain('data-atri-upload-status="uploading"');

    gate.resolve({ url: 'https://cdn/cover.png' });
    await handled;

    const done = editor.getHTML();
    expect(done).toContain('src="https://cdn/cover.png"');
    expect(done).not.toContain('blob:preview/');
    expect(done).not.toContain('data-atri-upload-status');
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('附件卡片带进度条，完成或失败后不留瞬时态在输出里', async () => {
    const context = deferred<UploadContext>();
    const gate = deferred<UploadResult>();
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: (_file, ctx) => {
          context.resolve(ctx);
          return gate.promise;
        },
      },
    });

    const handled = editor.uploadFiles(
      [makeFile('报告.pdf', 'application/pdf', 2048)],
      'attachment'
    );
    const { onProgress } = await context.promise;

    onProgress({ percent: 30, loaded: 600, total: 2048 });
    const card = editor.editor.view.dom.querySelector('.atri-attachment')!;
    expect(card.getAttribute('data-atri-upload-status')).toBe('uploading');
    expect(card.getAttribute('data-atri-upload-progress')).toBe('30');
    expect(card.textContent).toContain('报告.pdf');
    // 状态不落成文字，否则中文编辑器里会冒出英文串
    expect(card.textContent).not.toContain('uploading');

    gate.resolve({ url: 'https://cdn/a.pdf' });
    await handled;

    const html = editor.getHTML();
    expect(html).toContain('data-name="报告.pdf"');
    expect(html).toContain('2 KB');
    expect(html).not.toContain('atri-attachment-progress');
    expect(html).not.toContain('uploading');
    expect(editor.getMarkdown()).toContain('!file[报告.pdf](https://cdn/a.pdf "2 KB")');
  });

  it('上传中的进度不占撤销步数，一步就回到插入前', async () => {
    const context = deferred<UploadContext>();
    const gate = deferred<UploadResult>();
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: (_file, ctx) => {
          context.resolve(ctx);
          return gate.promise;
        },
      },
    });

    const handled = editor.uploadFiles(
      [makeFile('a.bin', 'application/octet-stream')],
      'attachment'
    );
    const { onProgress } = await context.promise;
    onProgress({ percent: 10, loaded: 10, total: 100 });
    onProgress({ percent: 20, loaded: 20, total: 100 });

    gate.resolve({ url: 'https://cdn/a.bin' });
    await handled;

    expect(editor.editor.can().undo()).toBe(true);
    editor.editor.chain().undo().run();
    expect(editor.getHTML()).toBe('<p>正文</p>');
    expect(editor.editor.can().undo()).toBe(false);
  });

  it('失败留下 error 态，retryUploads 复用同一个节点并成功清空', async () => {
    const onError = vi.fn();
    let attempts = 0;
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ url: 'https://cdn/a.bin' });
        },
        onError,
      },
    });

    await editor.uploadFiles([makeFile('a.bin', 'application/octet-stream')], 'attachment');

    const card = editor.editor.view.dom.querySelector('.atri-attachment')!;
    expect(card.getAttribute('data-atri-upload-status')).toBe('error');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'upload-failed' }));
    // 没传进服务端的文件仍算未落地，保存前该拦住
    expect(editor.hasPendingUploads()).toBe(true);

    editor.retryFailedUploads();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(attempts).toBe(2);
    expect(editor.getHTML()).toContain('src="https://cdn/a.bin"');
    expect(editor.getHTML()).not.toContain('data-atri-upload-status');
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('没开兜底时图片失败仍是预览地址，且计入待处理', async () => {
    const editor = await mount({
      content: '<p>正文</p>',
      media: { upload: () => Promise.reject(new Error('boom')) },
    });

    await editor.uploadFiles([makeFile('封面.png', 'image/png', 8)], 'image');

    const html = editor.getHTML();
    expect(html).toContain('src="blob:preview/');
    expect(html).toContain('data-atri-upload-status="error"');
    expect(html).not.toContain('data:image');
    expect(editor.hasPendingUploads()).toBe(true);
  });

  it('开启兜底后图片失败内联成 data URL，仍标 error 但不算待处理', async () => {
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: () => Promise.reject(new Error('boom')),
        onError,
        image: { fallbackToBase64: true },
      },
    });

    await editor.uploadFiles([makeFile('封面.png', 'image/png', 8)], 'image');

    const html = editor.getHTML();
    expect(html).toContain('src="data:image/png;base64,');
    // error 态留着：红框还在，重试按钮也还在，服务端地址迟早要换回去
    expect(html).toContain('data-atri-upload-status="error"');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'upload-failed' }));
    // 内容已经安全落进文档，保存闸门不该为一个一直失败的上传永久卡住
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('已内联的图片仍可重试，成功后换成服务端地址', async () => {
    let attempts = 0;
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: () => {
          attempts += 1;
          return attempts === 1
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ url: 'https://cdn/cover.png' });
        },
        image: { fallbackToBase64: true },
      },
    });

    await editor.uploadFiles([makeFile('封面.png', 'image/png', 8)], 'image');
    expect(editor.getHTML()).toContain('src="data:image/png;base64,');

    await editor.retryFailedUploads();

    expect(attempts).toBe(2);
    const html = editor.getHTML();
    expect(html).toContain('src="https://cdn/cover.png"');
    expect(html).not.toContain('data:image/png;base64,');
    expect(html).not.toContain('data-atri-upload-status');
  });

  it('连 data URL 都读不出来时退回普通失败态', async () => {
    vi.stubGlobal(
      'FileReader',
      class {
        onerror: ((event: Event) => void) | null = null;
        readAsDataURL() {
          this.onerror?.(new Event('error'));
        }
      }
    );
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        upload: () => Promise.reject(new Error('boom')),
        onError,
        image: { fallbackToBase64: true },
      },
    });

    await editor.uploadFiles([makeFile('封面.png', 'image/png', 8)], 'image');

    const html = editor.getHTML();
    expect(html).toContain('src="blob:preview/');
    expect(html).toContain('data-atri-upload-status="error"');
    expect(html).not.toContain('data:image');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(editor.hasPendingUploads()).toBe(true);
  });

  it('校验不过的文件不插节点，原因逐条回调', async () => {
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      media: {
        maxFileSize: 2048,
        maxFiles: 1,
        attachment: { accept: '.pdf' },
        upload: () => Promise.resolve({ url: 'https://cdn/x' }),
        onError,
      },
    });

    await editor.uploadFiles(
      [
        makeFile('big.pdf', 'application/pdf', 4096),
        makeFile('note.txt', 'text/plain'),
        makeFile('a.pdf', 'application/pdf'),
        makeFile('b.pdf', 'application/pdf'),
      ],
      'attachment'
    );

    expect(onError.mock.calls.map(([rejection]) => rejection.reason)).toEqual([
      'too-large',
      'unsupported-type',
      'too-many',
    ]);
    expect(editor.getHTML()).toContain('data-name="a.pdf"');
    expect(editor.getHTML()).not.toContain('note.txt');
  });

  it('没有上传通道时，附件报 no-upload，图片可退化成 base64', async () => {
    const onError = vi.fn();
    const blocked = await mount({ content: '<p>正文</p>', media: { onError } });
    await blocked.uploadFiles([makeFile('a.pdf', 'application/pdf')], 'attachment');
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ reason: 'no-upload' }));
    expect(blocked.getHTML()).toBe('<p>正文</p>');

    const inlined = await mount({
      content: '<p>正文</p>',
      media: { image: { allowBase64: true } },
    });
    await inlined.uploadFiles([makeFile('a.png', 'image/png', 8)], 'image');

    expect(inlined.getHTML()).toContain('src="data:image/png;base64,');
    expect(inlined.hasPendingUploads()).toBe(false);
  });

  it('删掉正在上传的卡片会中止队列里的任务', async () => {
    const editor = await mount({
      content: '<p>正文</p>',
      media: { upload: () => new Promise<UploadResult>(() => undefined) },
    });

    void editor.uploadFiles([makeFile('a.bin', 'application/octet-stream')], 'attachment');
    expect(editor.hasPendingUploads()).toBe(true);

    editor.editor.commands.clearContent();
    expect(editor.hasPendingUploads()).toBe(false);
  });

  it('编辑器重建后仍能认回在传的文件，并把结果写回新文档', async () => {
    const gate = deferred<UploadResult>();
    const editor = await mount({
      content: '<p>正文</p>',
      media: { upload: () => gate.promise },
    });

    const handled = editor.uploadFiles([makeFile('封面.png', 'image/png')]);
    expect(editor.editor.view.dom.querySelector('[data-atri-upload-status]')).toBeTruthy();

    // 注册 NodeView 会整个重建编辑器：文档换了实例，预览地址是唯一还认得的线索
    editor.registerNodeView(customCardNodeView);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(
      editor.editor.view.dom.querySelector('[data-atri-upload-status="uploading"]')
    ).toBeTruthy();

    gate.resolve({ url: 'https://cdn/cover.png' });
    await handled;

    expect(editor.getHTML()).toContain('src="https://cdn/cover.png"');
    expect(editor.getHTML()).not.toContain('data-atri-upload-status');
  });
});
