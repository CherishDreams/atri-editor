import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadContext, UploadResult } from '../src/types';
import { mount, rootOf } from './utils';

function uploader() {
  const requests: {
    context: UploadContext;
    resolve: (result: UploadResult) => void;
    reject: (error: Error) => void;
  }[] = [];
  const upload = vi.fn(
    (_file: File, context: UploadContext) =>
      new Promise<UploadResult>((resolve, reject) => {
        requests.push({ context, resolve, reject });
      })
  );
  return { upload, requests };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const file = () => new File(['data'], 'file.png', { type: 'image/png' });

beforeEach(() => {
  let id = 0;
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = vi.fn(() => `blob:history/${++id}`);
      static revokeObjectURL = vi.fn();
    }
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('upload history', () => {
  it.each(['image', 'card', 'link'] as const)(
    'restarts %s after undo/redo and ignores old callbacks',
    async (form) => {
      const network = uploader();
      const editor = await mount({
        content: '<p>text</p>',
        media: {
          upload: network.upload,
          attachment: { display: form === 'link' ? 'link' : 'card' },
        },
      });
      const pending = editor.uploadFiles([file()], form === 'image' ? 'image' : 'attachment');
      const old = network.requests[0];
      expect(editor.hasPendingUploads()).toBe(true);
      editor.editor.commands.undo();
      await pending;
      expect(old.context.signal.aborted).toBe(true);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:history/1');
      expect(editor.hasPendingUploads()).toBe(false);
      expect(rootOf(editor).querySelector('.atri-media-status')?.hasAttribute('hidden')).toBe(true);
      editor.editor.commands.redo();
      expect(editor.hasPendingUploads()).toBe(true);
      await tick();
      expect(network.upload).toHaveBeenCalledTimes(2);
      expect(editor.getHTML()).toContain('blob:history/2');
      old.context.onProgress({ percent: 99, loaded: 99, total: 100 });
      old.resolve({ url: '/old.png' });
      await tick();
      expect(editor.getHTML()).not.toContain('/old.png');
      expect(editor.getHTML()).not.toContain('data-atri-upload-progress="99"');
      network.requests[1].resolve({ url: '/new.png' });
      await tick();
      expect(editor.getHTML()).toContain('/new.png');
      expect(editor.hasPendingUploads()).toBe(false);
      editor.editor.commands.undo();
      editor.editor.commands.redo();
      await tick();
      expect(editor.getHTML()).toContain('/new.png');
      expect(network.upload).toHaveBeenCalledTimes(2);
    }
  );

  it('handles repeated undo/redo and stale rejections', async () => {
    const network = uploader();
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>text</p>',
      media: { upload: network.upload, onError },
    });
    const pending = editor.uploadFiles([file()]);
    editor.editor.commands.undo();
    await pending;
    editor.editor.commands.redo();
    await tick();
    editor.editor.commands.undo();
    editor.editor.commands.redo();
    await tick();
    expect(network.requests).toHaveLength(3);
    network.requests[0].reject(new Error('old failure'));
    network.requests[1].reject(new Error('old failure'));
    network.requests[2].resolve({ url: '/latest.png' });
    await tick();
    expect(editor.getHTML()).toContain('/latest.png');
    expect(onError).not.toHaveBeenCalled();
  });

  it('coalesces redo restarts queued in the same event loop', async () => {
    const network = uploader();
    const editor = await mount({ media: { upload: network.upload } });
    const pending = editor.uploadFiles([file()]);
    editor.editor.commands.undo();
    editor.editor.commands.redo();
    editor.editor.commands.undo();
    editor.editor.commands.redo();
    await pending;
    await tick();
    expect(network.requests).toHaveLength(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:history/2');
    network.requests[1].resolve({ url: '/latest.png' });
    await tick();
    expect(editor.getHTML()).toContain('/latest.png');
  });

  it('restores an inlined failure with a fresh preview when redoing', async () => {
    const network = uploader();
    const editor = await mount({
      media: { upload: network.upload, image: { fallbackToBase64: true }, onError: () => {} },
    });
    const pending = editor.uploadFiles([file()]);
    network.requests[0].reject(new Error('offline'));
    await pending;
    expect(editor.hasPendingUploads()).toBe(false);
    editor.editor.commands.undo();
    editor.editor.commands.redo();
    expect(editor.hasPendingUploads()).toBe(true);
    await tick();
    expect(editor.getHTML()).toContain('blob:history/2');
    network.requests[1].resolve({ url: '/restored.png' });
    await tick();
    expect(editor.getHTML()).toContain('/restored.png');
  });

  it('restarts a deleted upload when the deletion is undone', async () => {
    const network = uploader();
    const editor = await mount({ content: '<p>text</p>', media: { upload: network.upload } });
    const pending = editor.uploadFiles([file()]);
    // Separate the deletion from the insertion in history without relying on wall time.
    const { closeHistory } = await import('@tiptap/pm/history');
    editor.editor.view.dispatch(closeHistory(editor.editor.state.tr));
    let pos = -1;
    editor.editor.state.doc.descendants((node, at) => {
      if (node.type.name === 'image') pos = at;
    });
    editor.editor.commands.deleteRange({ from: pos, to: pos + 1 });
    await pending;
    expect(editor.hasPendingUploads()).toBe(false);
    editor.editor.commands.undo();
    await tick();
    expect(network.requests).toHaveLength(2);
    network.requests[1].resolve({ url: '/restored.png' });
    await tick();
    expect(editor.getHTML()).toContain('/restored.png');
  });

  it.each(['uploading', 'failed', 'inlined'] as const)(
    'keeps %s tasks across a rebuild',
    async (state) => {
      const network = uploader();
      const editor = await mount({
        content: '<p>text</p>',
        media: {
          upload: network.upload,
          image: { fallbackToBase64: state === 'inlined' },
          onError: () => {},
        },
      });
      const pending = editor.uploadFiles([file()]);
      if (state !== 'uploading') {
        network.requests[0].reject(new Error('offline'));
        await pending;
      }
      editor.registerNodeViews([]);
      await tick();
      if (state !== 'uploading') {
        const retried = editor.retryFailedUploads();
        expect(network.requests).toHaveLength(2);
        network.requests[1].resolve({ url: '/rebuilt.png' });
        await retried;
      } else {
        network.requests[0].resolve({ url: '/rebuilt.png' });
        await pending;
      }
      expect(editor.getHTML()).toContain('/rebuilt.png');
      expect(editor.getHTML()).not.toContain('data-atri-upload-status');
      expect(editor.hasPendingUploads()).toBe(false);
    }
  );

  it('releases detached history records on rebuild and active uploads on destroy', async () => {
    const network = uploader();
    const editor = await mount({ content: '<p>text</p>', media: { upload: network.upload } });
    const first = editor.uploadFiles([file()]);
    editor.editor.commands.undo();
    await first;
    editor.registerNodeViews([]);
    await tick();
    expect(editor.editor.commands.redo()).toBe(false);
    const second = editor.uploadFiles([file()]);
    editor.destroy();
    await second;
    expect(network.requests[1].context.signal.aborted).toBe(true);
    network.requests[1].resolve({ url: '/late.png' });
    await tick();
    expect(editor.hasPendingUploads()).toBe(false);
  });
});
