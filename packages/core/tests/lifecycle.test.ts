import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Node as PmNode } from '@tiptap/pm/model';
import { CoreEditor } from '../src/core/CoreEditor';
import { findTaskPosition, MediaRuntime } from '../src/media/MediaRuntime';
import { AtriEditor } from '../src/index';
import type { AtriMediaConfig, UploadContext, UploadResult } from '../src/types';
import { customCardNodeView } from './fixtures';

/**
 * 挂起不结的上传通道：让"有请求在飞"这个状态一直保持，
 * 销毁路径该不该中止它才看得出来
 */
function hangingMedia(sinks: UploadContext[]): AtriMediaConfig {
  return {
    upload: (_file: File, context: UploadContext) => {
      sinks.push(context);
      // 永不 resolve：让"有请求在飞"这个状态一直保持
      return new Promise<UploadResult>(() => {});
    },
  };
}

function last(sinks: UploadContext[]): UploadContext {
  const context = sinks.at(-1);
  if (!context) throw new Error('the upload handler was never called');
  return context;
}

function imageFile(): File {
  return new File([new Uint8Array(1024)], 'a.png', { type: 'image/png' });
}

function mountCore(media: AtriMediaConfig, runtime?: MediaRuntime): CoreEditor {
  const element = document.createElement('div');
  document.body.appendChild(element);
  return new CoreEditor({
    element,
    content: '<p>正文</p>',
    media,
    ...(runtime ? { mediaRuntime: runtime } : {}),
  });
}

/** jsdom 没实现 object URL，测试自己发号，好让"预览地址有没有被放出"可断言 */
const previews = {
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL,
  revoked: [] as string[],
  sequence: 0,
};

beforeEach(() => {
  previews.revoked = [];
  previews.sequence = 0;
  URL.createObjectURL = () => `blob:preview/${(previews.sequence += 1)}`;
  URL.revokeObjectURL = (url: string | Blob) => {
    previews.revoked.push(typeof url === 'string' ? url : 'blob');
  };
});

afterEach(() => {
  URL.createObjectURL = previews.create;
  URL.revokeObjectURL = previews.revoke;
  document.body.replaceChildren();
});

describe('CoreEditor 对上传运行时的所有权', () => {
  it('自建的运行时归它回收：destroy 中止在途请求并放出预览地址', async () => {
    const sinks: UploadContext[] = [];
    const core = mountCore(hangingMedia(sinks));
    const runtime = core.getMediaRuntime();
    expect(runtime).not.toBeNull();

    void runtime!.handleFiles([imageFile()]);
    await Promise.resolve();
    expect(last(sinks).signal.aborted).toBe(false);

    core.destroy();

    expect(last(sinks).signal.aborted).toBe(true);
    expect(previews.revoked).toEqual(['blob:preview/1']);
  });

  it('注入进来的运行时不能动：门面还要拿它跑重建后的编辑器', async () => {
    const sinks: UploadContext[] = [];
    const shared = new MediaRuntime(hangingMedia(sinks));
    const core = mountCore({}, shared);

    void shared.handleFiles([imageFile()]);
    await Promise.resolve();

    core.destroy();

    expect(last(sinks).signal.aborted).toBe(false);
    expect(previews.revoked).toEqual([]);
    shared.destroy();
  });
});

describe('销毁后的门面', () => {
  async function mounted(): Promise<AtriEditor> {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new AtriEditor({ element, content: '<p>正文</p>', toolbar: false });
    // Tiptap 在 setTimeout 里才 emit create，装配要等一个宏任务
    await new Promise((resolve) => setTimeout(resolve, 0));
    return editor;
  }

  it('registerNodeView 不再往已离开的容器里复活编辑器', async () => {
    const editor = await mounted();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    editor.destroy();
    editor.registerNodeView(customCardNodeView);

    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain('registerNodeView');
    expect(editor.getNodeViews().size).toBe(0);
    warn.mockRestore();
  });

  it('registerNodeViews 同样早退，配置不写进注册表', async () => {
    const editor = await mounted();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    editor.destroy();
    editor.registerNodeViews([customCardNodeView]);

    expect(String(warn.mock.calls[0]?.[0])).toContain('registerNodeViews');
    expect(editor.getNodeViews().size).toBe(0);
    warn.mockRestore();
  });

  it('重复 destroy 不做第二遍', async () => {
    const editor = await mounted();
    editor.destroy();

    expect(() => editor.destroy()).not.toThrow();
  });
});

describe('findTaskPosition', () => {
  /** 位置不写死：从同一棵树里现取，免得过几年 nodeSize 一变就假失败 */
  function docWithImages(attrs: { src: string | null; uploadId?: string }[]): {
    doc: PmNode;
    positions: number[];
  } {
    const core = mountCore({});
    const { schema } = core.getEditor().state;
    const doc = schema.node(
      'doc',
      null,
      attrs.map(({ src, uploadId }) => schema.node('image', { src, uploadId: uploadId ?? null }))
    );
    const positions: number[] = [];
    doc.descendants((node, position) => {
      if (node.type.name === 'image') positions.push(position);
    });
    core.destroy();
    return { doc, positions };
  }

  it('优先按 uploadId 定位，而不是先命中哪张算哪张', () => {
    const { doc, positions } = docWithImages([
      { src: 'blob:preview/1' },
      { src: null, uploadId: 'task-2' },
    ]);

    // 第一张的 src 正好等于 previewUrl，但它不是这个任务的节点
    expect(findTaskPosition(doc, { id: 'task-2', previewUrl: 'blob:preview/1' })).toBe(
      positions[1]
    );
  });

  it('预览地址已回收时不再拿它当线索，免得写进不相干的卡片', () => {
    // revokePreviewUrl 把 previewUrl 置 null，而"src 也是 null"对任何未落地的节点都成立
    const { doc } = docWithImages([{ src: null }, { src: null }]);

    expect(findTaskPosition(doc, { id: 'missing', previewUrl: null })).toBeNull();
  });

  it('uploadId 认不到时才退回预览地址匹配', () => {
    const { doc, positions } = docWithImages([
      { src: 'blob:preview/1' },
      { src: 'blob:preview/2' },
    ]);

    expect(findTaskPosition(doc, { id: 'missing', previewUrl: 'blob:preview/2' })).toBe(
      positions[1]
    );
  });
});
