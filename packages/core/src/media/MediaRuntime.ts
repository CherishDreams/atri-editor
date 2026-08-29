/**
 * MediaRuntime - 上传队列与节点瞬时态
 *
 * 生命周期比 CoreEditor 长：registerNodeView 会重建编辑器，进行中的上传不能跟着丢，
 * 所以它由 AtriEditor 持有一个实例，每次重建通过 bind() 换绑到新的 Editor。
 */
import type { Content, Editor } from '@tiptap/core';
import type { Node as PmNode } from '@tiptap/pm/model';
import type {
  AtriMediaConfig,
  MediaKind,
  MediaRejectReason,
  UploadProgress,
  UploadResult,
} from '../types';
import { createUploader, type Uploader } from './Uploader';
import { mediaInsertTarget } from './insert-position';
import { DEFAULT_MAX_FILES, acceptAttribute, isImageFile, validateFile } from './file-policy';

/** 节点瞬时态，写进 data-atri-upload-status */
export type MediaStatus = 'uploading' | 'error';

/** 队列快照，供状态条这类外部展示消费 */
export interface MediaState {
  uploading: number;
  /** 失败且内容还只存在于本地预览里的，丢了就是真丢了 */
  failed: number;
  /** 失败后已按配置内联成 data URL 的图片：不必再传也不该丢 */
  inline: number;
  /** 按文件体积加权的整体进度，无进行中任务时为 0 */
  percent: number;
}

export interface HandleFilesOptions {
  /** 缺省时按 MIME 分流到图片与附件 */
  kind?: MediaKind;
  /** 落点位置（拖放用）；省略时插在当前选区 */
  pos?: number;
}

/** 通过校验、排队待插的文件与它要落成的节点类型 */
interface MediaEntry {
  file: File;
  kind: MediaKind;
}

interface MediaTask {
  id: string;
  kind: MediaKind;
  file: File;
  /** 落地前的本地预览地址，也是编辑器重建后找回节点的钥匙（uploadId 不进 HTML） */
  previewUrl: string | null;
  status: MediaStatus;
  /** 未收到任何进度事件时为 null，让进度条走不定长动画 */
  percent: number | null;
  /** 失败后已内联成 data URL：src 不再指向 previewUrl，但节点仍标着 error 等重试 */
  inlined: boolean;
  controller: AbortController;
}

/** 读文件为 data URL：本地文件仅有的两条不经过服务端的退路都靠它，前提是图片认 data URL */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export class MediaRuntime {
  private config: AtriMediaConfig;
  private uploader: Uploader | null;
  private editor: Editor | null = null;
  private tasks: Map<string, MediaTask> = new Map();
  private listeners: Set<(state: MediaState) => void> = new Set();
  private sequence = 0;

  constructor(config: AtriMediaConfig = {}) {
    this.config = config;
    this.uploader = createUploader(config.upload);
  }

  /**
   * 换绑到新的 Editor 实例，并把瞬时态补回重建后的文档
   */
  bind(editor: Editor): void {
    this.editor = editor;
    this.restoreTransientState();

    // 上传中删掉卡片、或撤销掉刚插入的节点时，顺手把任务摘掉，
    // 否则 hasPendingUploads() 会一直为 true
    editor.on('transaction', ({ transaction }) => {
      if (transaction.docChanged && this.tasks.size) this.prune();
    });
  }

  /**
   * 处理一批文件：校验 → 插节点 → 上传 → 回写
   * kind 缺省时按 MIME 分流；MediaKind 与节点名一一对应，直接当 type 用
   */
  async handleFiles(files: File[] | FileList, options: HandleFilesOptions = {}): Promise<void> {
    if (!this.editor) return;

    const { kind, pos } = options;
    const maxFiles = this.config.maxFiles ?? DEFAULT_MAX_FILES;
    const queue: MediaEntry[] = [];

    for (const file of Array.from(files)) {
      const mediaKind = kind ?? (isImageFile(file) ? 'image' : 'attachment');
      const accept =
        mediaKind === 'image' ? this.config.image?.accept : this.config.attachment?.accept;
      const validation = validateFile(file, { accept, maxFileSize: this.config.maxFileSize });

      if (!validation.ok) {
        this.reject(file, validation.reason);
        continue;
      }

      // 先校验后限流：既不合格又超额的文件只报它自己的毛病，不报 too-many
      if (queue.length >= maxFiles) {
        this.reject(file, 'too-many');
        continue;
      }

      queue.push({ file, kind: mediaKind });
    }

    if (!this.uploader) {
      await this.inlineImages(queue, pos);
      return;
    }

    const tasks = queue.map(({ file, kind: mediaKind }) => this.createTask(file, mediaKind));
    this.insertContents(
      tasks.map((task) => this.nodeSpec(task)),
      pos
    );
    await Promise.all(tasks.map((task) => this.startUpload(task)));
  }

  /**
   * 该类型的文件白名单，已归一成 <input accept> 能用的写法
   * 面板与校验共用同一份配置，免得选得到却传不了
   */
  acceptFor(kind: MediaKind): string | undefined {
    return acceptAttribute(
      kind === 'image' ? this.config.image?.accept : this.config.attachment?.accept
    );
  }

  /**
   * 重试所有失败的上传，卡片原地回到上传中
   * 失败后已内联成 data URL 的图片也在其中：换到服务端地址前它一直算"失败"
   */
  retryFailed(): Promise<void> {
    const retried = Array.from(this.tasks.values())
      .filter((task) => task.status === 'error')
      .map((task) => this.startUpload(task));

    return Promise.all(retried).then(() => undefined);
  }

  /**
   * 文档里是否还有"现在就保存会丢内容"的文件：上传中与失败都算，
   * 因为它们的 src 还指着本地预览地址（blob:），刷新即失效
   *
   * 失败后已按配置内联成 data URL 的图片不计入——内容已经安全落进文档，
   * 服务端地址只是可选的优化，别让一个一直失败的上传把保存永久卡住
   */
  hasPendingUploads(): boolean {
    return Array.from(this.tasks.values()).some((task) => !task.inlined);
  }

  getState(): MediaState {
    const tasks = Array.from(this.tasks.values());
    const uploading = tasks.filter((task) => task.status === 'uploading');
    const total = uploading.reduce((sum, task) => sum + task.file.size, 0);
    const loaded = uploading.reduce(
      (sum, task) => sum + (task.file.size * clampPercent(task.percent ?? 0)) / 100,
      0
    );

    return {
      uploading: uploading.length,
      failed: tasks.filter((task) => task.status === 'error' && !task.inlined).length,
      inline: tasks.filter((task) => task.inlined).length,
      percent: total ? Math.round((loaded / total) * 100) : 0,
    };
  }

  subscribe(listener: (state: MediaState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  destroy(): void {
    this.tasks.forEach((task) => {
      task.controller.abort();
      revokePreviewUrl(task);
    });
    this.tasks.clear();
    this.listeners.clear();
    this.editor = null;
  }

  /**
   * 无上传通道：图片按配置退化成 base64 内联，附件没有合理退路
   * 先把文件都读完再一起插，顺序才与选文件时一致
   */
  private async inlineImages(entries: MediaEntry[], pos?: number): Promise<void> {
    const contents: Content[] = [];

    for (const { file, kind } of entries) {
      if (kind !== 'image' || !this.config.image?.allowBase64) {
        this.reject(file, 'no-upload');
        continue;
      }

      try {
        const src = await readFileAsDataUrl(file);
        contents.push({ type: 'image', attrs: { src, alt: file.name } });
      } catch (cause) {
        this.reject(file, 'upload-failed', cause);
      }
    }

    this.insertContents(contents, pos);
  }

  private createTask(file: File, kind: MediaKind): MediaTask {
    const task: MediaTask = {
      id: `atri-upload-${(this.sequence += 1)}`,
      kind,
      file,
      previewUrl: createPreviewUrl(file),
      status: 'uploading',
      percent: null,
      inlined: false,
      controller: new AbortController(),
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * 带本地预览的节点内容；上传完这些地址就被服务端地址换掉
   */
  private nodeSpec(task: MediaTask): Content {
    const { file, previewUrl } = task;
    const attrs: Record<string, unknown> = {
      src: previewUrl ?? file.name,
      status: task.status,
      uploadId: task.id,
    };

    if (task.kind === 'attachment') {
      attrs.name = file.name;
      attrs.size = file.size;
      attrs.mime = file.type || null;
    } else {
      attrs.alt = file.name;
    }

    return { type: task.kind, attrs };
  }

  /**
   * 一批节点走一次事务：逐个插的话每插一个"那个位置"的含义就变一次，顺序会乱；
   * 顺带让一次多文件拖放只需撤销一步
   * pos 为拖放落点，省略时落在当前选区（选中的媒体节点不被顶掉）
   */
  private insertContents(contents: Content[], pos?: number): void {
    const editor = this.editor;
    if (!editor || !contents.length) return;

    editor
      .chain()
      .insertContentAt(pos ?? mediaInsertTarget(editor.state.selection), contents)
      .run();
    this.emit();
  }

  private async startUpload(task: MediaTask): Promise<void> {
    if (!this.uploader) return;

    task.status = 'uploading';
    task.percent = null;
    // 重试一张已内联的图：src 先留着 data URL（换地址前它仍是能看的图），
    // 但闸门回到"有上传在飞"，再失败也会重新判一次要不要内联
    task.inlined = false;
    task.controller = new AbortController();
    this.patch(task, this.stateAttrs(task, 'uploading'));
    this.emit();

    try {
      const result = await this.uploader.upload(task.file, {
        onProgress: (progress) => this.updateProgress(task, progress),
        signal: task.controller.signal,
      });

      // 请求期间节点可能已被删掉，那时任务已经清理过了
      if (!this.tasks.has(task.id)) return;
      this.applyResult(task, result);
    } catch (cause) {
      if (task.controller.signal.aborted) {
        this.dropTask(task);
        return;
      }

      task.status = 'error';
      task.percent = null;

      // 只有图片有 base64 退路：附件内联等于把几 MB 塞进 !file[..](data:…) 那一行
      const canInline = task.kind === 'image' && this.config.image?.fallbackToBase64 === true;
      const inlined = canInline && (await this.inlineAfterFailure(task));

      if (!inlined) {
        this.patch(task, this.stateAttrs(task, 'error'));
        // patch 只改节点不广播，失败态得靠这一次 emit 才会上到状态条
        this.emit();
      }
      // 内联成不成功都该让宿主知道这次上传失败了；图片能不能显示是另一件事
      this.reject(task.file, 'upload-failed', cause);
    }
  }

  /**
   * 上传失败后把图片读成 data URL，原位换掉 src
   *
   * 是 patch 而不是插新节点：位置与"撤销一步回到插入前"这两条语义都靠它才不碎。
   * error 态留着——重试按钮还在，网络恢复后能把 data URL 换成服务端地址
   */
  private async inlineAfterFailure(task: MediaTask): Promise<boolean> {
    // 请求期间节点可能已被删掉，那时任务已经清理过了
    if (!this.tasks.has(task.id)) return false;

    let src: string;
    try {
      src = await readFileAsDataUrl(task.file);
    } catch {
      return false;
    }

    this.patch(task, { src, ...this.stateAttrs(task, 'error') });
    // patch 找不到节点时会把任务摘掉，那时没什么可内联的
    if (!this.tasks.has(task.id)) return false;

    task.inlined = true;
    // blob 地址已经不被文档引用了，留着就是白占一份文件内存
    revokePreviewUrl(task);
    this.emit();
    return true;
  }

  private applyResult(task: MediaTask, result: UploadResult): void {
    const { file } = task;
    const attrs: Record<string, unknown> = {
      src: result.url,
      status: null,
      uploadId: null,
    };

    if (task.kind === 'attachment') {
      attrs.progress = null;
      attrs.name = result.name ?? file.name;
      attrs.size = result.size ?? file.size;
      attrs.mime = result.mime ?? (file.type || null);
    } else {
      attrs.alt = result.name ?? file.name;
    }

    this.patch(task, attrs);
    this.tasks.delete(task.id);
    revokePreviewUrl(task);
    this.emit();
  }

  private updateProgress(task: MediaTask, progress: UploadProgress): void {
    if (task.status !== 'uploading') return;

    const percent = Number.isFinite(progress.percent) ? clampPercent(progress.percent) : null;
    task.percent = percent;

    // 图片节点上没有 progress 属性，逐文件百分比只画在附件卡片上；
    // 图片的整体进度走队列快照，顺带省掉每次进度都重建一次 DOM
    if (task.kind === 'attachment') {
      this.patch(task, { progress: percent }, { silent: true });
    }
    this.emit();
  }

  /**
   * 写进节点的那份状态；附件卡片额外带百分比
   */
  private stateAttrs(
    task: MediaTask,
    status: MediaStatus,
    progress: number | null = null
  ): Record<string, unknown> {
    return task.kind === 'attachment' ? { status, progress } : { status };
  }

  private patch(
    task: MediaTask,
    attrs: Record<string, unknown>,
    options: { silent?: boolean } = {}
  ): void {
    const editor = this.editor;
    // 编辑器正在重建时丢掉这次更新：bind() 之后按队列现状补齐
    if (!editor || editor.isDestroyed) return;

    const position = this.findPosition(task);
    if (position === null) {
      // 找不到节点说明用户删了它，继续传上去也没人接收
      task.controller.abort();
      this.dropTask(task);
      return;
    }

    const node = editor.state.doc.nodeAt(position);
    if (!node) return;

    const tr = editor.state.tr.setNodeMarkup(position, undefined, {
      ...node.attrs,
      ...attrs,
    });

    // 撤销一步回到插入前，而不是回到"带预览地址的中间态"；
    // 代价是重做后节点退回预览地址，需要重新上传
    tr.setMeta('addToHistory', false);
    if (options.silent) tr.setMeta('preventUpdate', true);

    editor.view.dispatch(tr);
  }

  /**
   * 编辑器重建后 uploadId 不在 HTML 里，靠本地预览地址把瞬时态补回文档
   */
  private restoreTransientState(): void {
    const editor = this.editor;
    if (!editor || !this.tasks.size) return;

    const pending: { position: number; node: PmNode; task: MediaTask }[] = [];
    editor.state.doc.descendants((node, position) => {
      const task = this.taskByPreviewUrl(node.attrs.src);
      if (task && node.attrs.uploadId == null) pending.push({ position, node, task });
    });
    if (!pending.length) return;

    const tr = editor.state.tr;
    // setNodeMarkup 不改叶子节点尺寸，倒序写免得位置偏移
    pending
      .sort((a, b) => b.position - a.position)
      .forEach(({ position, node, task }) => {
        tr.setNodeMarkup(position, undefined, {
          ...node.attrs,
          uploadId: task.id,
          ...this.stateAttrs(task, task.status, task.percent),
        });
      });
    tr.setMeta('addToHistory', false);
    tr.setMeta('preventUpdate', true);
    editor.view.dispatch(tr);
  }

  /**
   * 丢掉文档里已经没有对应节点的任务，中止其请求
   */
  private prune(): void {
    const editor = this.editor;
    if (!editor || editor.isDestroyed) return;

    const alive = new Set<string>();
    editor.state.doc.descendants((node) => {
      if (typeof node.attrs.uploadId === 'string') alive.add(node.attrs.uploadId);
      if (typeof node.attrs.src === 'string') alive.add(node.attrs.src);
    });

    this.tasks.forEach((task) => {
      const exists = alive.has(task.id) || (task.previewUrl !== null && alive.has(task.previewUrl));
      if (exists) return;

      task.controller.abort();
      this.dropTask(task);
    });
  }

  private findPosition(task: MediaTask): number | null {
    const editor = this.editor;
    if (!editor) return null;

    let found: number | null = null;
    editor.state.doc.descendants((node, position) => {
      if (found !== null) return;
      if (node.attrs.uploadId === task.id || node.attrs.src === task.previewUrl) {
        found = position;
      }
    });
    return found;
  }

  private taskByPreviewUrl(src: unknown): MediaTask | null {
    if (typeof src !== 'string' || !src) return null;
    for (const task of this.tasks.values()) {
      if (task.previewUrl === src) return task;
    }
    return null;
  }

  /**
   * 摘掉任务并回收预览地址；是否 abort 由调用方决定
   */
  private dropTask(task: MediaTask): void {
    if (this.tasks.get(task.id) !== task) return;
    this.tasks.delete(task.id);
    revokePreviewUrl(task);
    this.emit();
  }

  private reject(file: File, reason: MediaRejectReason, cause?: unknown): void {
    if (this.config.onError) {
      this.config.onError({ file, reason, cause });
      return;
    }

    // 没配回调也留一条日志：文件被静默丢弃是最难排查的那种"点了没反应"
    console.warn(`[Atri Editor] File "${file.name}" was rejected (${reason}).`);
  }

  private emit(): void {
    if (!this.listeners.size) return;
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }
}

function clampPercent(percent: number): number {
  return Math.round(Math.min(100, Math.max(0, percent)));
}

/**
 * 预览地址只在浏览器里有；拿不到时节点用文件名占位，上传完就被真实地址替换
 */
function createPreviewUrl(file: File): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function revokePreviewUrl(task: MediaTask): void {
  const { previewUrl } = task;
  if (!previewUrl) return;
  if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return;

  URL.revokeObjectURL(previewUrl);
  task.previewUrl = null;
}
