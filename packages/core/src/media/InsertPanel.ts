/**
 * InsertPanel - 工具栏下方的插入浮层
 *
 * 挂在 document.body 上并用 fixed 定位：工具栏那一层链路上任何一处 overflow 都会把浮层裁掉。
 *
 * 注：media/ 目录同时承载上传运行时（MediaRuntime/Uploader/file-policy）与 UI
 * （本文件与 MediaStatusStrip），两者通过 MediaRuntime 的订阅接口协作，暂不拆分子目录。
 */
import type { Editor } from '@tiptap/core';
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import type { I18nManager } from '../core/I18nManager';
import type { MediaKind } from '../types';
import type { MediaRuntime } from './MediaRuntime';
import { filesOf } from '../utils/dom';

export type InsertPanelMode = 'image' | 'attachment';

export interface InsertPanelOptions {
  editor: Editor;
  runtime: MediaRuntime;
  i18n?: I18nManager;
  /** 开合时把控制权交回工具栏：按钮的 active 与 aria-expanded 由它维护 */
  onOpenChange?: (mode: InsertPanelMode | null) => void;
}

/** 每种模式给哪些字段：附件没有"填个网络地址"这条路 */
const FIELDS: Record<InsertPanelMode, { url: boolean; alt: boolean; kind: MediaKind }> = {
  image: { url: true, alt: true, kind: 'image' },
  attachment: { url: false, alt: false, kind: 'attachment' },
};

interface LabelledElement {
  el: HTMLElement;
  key: string;
  fallback: string;
}

export class InsertPanel {
  private editor: Editor;
  private runtime: MediaRuntime;
  private i18n?: I18nManager;
  private onOpenChange?: (mode: InsertPanelMode | null) => void;
  private unsubscribeLanguage?: () => void;

  private element: HTMLDivElement | null = null;
  private mode: InsertPanelMode | null = null;
  private stopAutoUpdate: (() => void) | null = null;
  private detachDismiss: (() => void) | null = null;
  private labelled: LabelledElement[] = [];

  constructor(options: InsertPanelOptions) {
    this.editor = options.editor;
    this.runtime = options.runtime;
    this.i18n = options.i18n;
    this.onOpenChange = options.onOpenChange;
    // 面板是即时创建的，但可能开着的时候宿主切了语言
    this.unsubscribeLanguage = this.i18n?.onLanguageChanged(() => this.applyLabels());
  }

  get openMode(): InsertPanelMode | null {
    return this.mode;
  }

  /**
   * 同一个按钮再点一次是关闭；换按钮则直接把浮层挪过去
   */
  toggle(anchor: HTMLElement, mode: InsertPanelMode): void {
    if (this.mode === mode) {
      this.close();
      return;
    }

    this.close();
    this.mode = mode;
    this.build(mode);
    this.position(anchor);
    this.listenForDismiss(anchor);
    this.onOpenChange?.(mode);
  }

  close(): void {
    this.detachDismiss?.();
    this.detachDismiss = null;
    this.stopAutoUpdate?.();
    this.stopAutoUpdate = null;
    this.element?.remove();
    this.element = null;
    this.labelled = [];

    if (this.mode === null) return;
    this.mode = null;
    this.onOpenChange?.(null);
  }

  destroy(): void {
    this.close();
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = undefined;
  }

  private t(key: string, fallback: string): string {
    // t() 在词条缺失时原样返回 key；未注入 i18n 或词条缺失时回退到内置文案，
    // 与工具栏 tooltip 同一套规矩（走 I18nManager.tOr）
    return this.i18n?.tOr(key, fallback) ?? fallback;
  }

  /**
   * 登记一处随语言重画的文案：input 画到 placeholder，其他画成文字
   */
  private label(el: HTMLElement, key: string, fallback: string): void {
    this.labelled.push({ el, key, fallback });
    this.applyLabel({ el, key, fallback });
  }

  private applyLabels(): void {
    this.labelled.forEach((entry) => this.applyLabel(entry));
  }

  private applyLabel({ el, key, fallback }: LabelledElement): void {
    const text = this.t(key, fallback);
    if (el instanceof HTMLInputElement) el.placeholder = text;
    else el.textContent = text;
  }

  private build(mode: InsertPanelMode): void {
    const fields = FIELDS[mode];
    const panel = document.createElement('div');
    panel.className = 'atri-media-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute(
      'aria-label',
      this.t(`editor.${mode === 'image' ? 'image' : 'attachment'}`, '插入')
    );

    let urlInput: HTMLInputElement | null = null;
    let altInput: HTMLInputElement | null = null;

    if (fields.url) {
      urlInput = document.createElement('input');
      urlInput.type = 'url';
      urlInput.className = 'atri-media-panel-url';
      this.label(urlInput, 'media.urlPlaceholder', '图片地址（https://…）');
      urlInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.insertFromUrl(urlInput, altInput);
        }
      });
      panel.appendChild(urlInput);
    }

    if (fields.alt) {
      altInput = document.createElement('input');
      altInput.type = 'text';
      altInput.className = 'atri-media-panel-alt';
      this.label(altInput, 'media.altPlaceholder', '替代文字');
      panel.appendChild(altInput);
    }

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.className = 'atri-media-panel-file';
    fileInput.hidden = true;
    fileInput.multiple = true;
    const accept = this.runtime.acceptFor(fields.kind);
    if (accept) fileInput.accept = accept;
    fileInput.addEventListener('change', () => {
      this.upload(Array.from(fileInput.files ?? []), fields.kind);
      // 同一个文件连选两次也要还能再触发 change
      fileInput.value = '';
    });
    panel.appendChild(fileInput);

    const drop = document.createElement('div');
    drop.className = 'atri-media-panel-drop';
    this.label(drop, 'media.dropHere', '或将文件拖到这里');
    drop.addEventListener('dragover', (event) => event.preventDefault());
    drop.addEventListener('drop', (event) => {
      // 不挡下默认行为，整个页面会跳去那个文件
      event.preventDefault();
      this.upload(filesOf((event as DragEvent).dataTransfer), fields.kind);
    });

    const browse = document.createElement('button');
    browse.type = 'button';
    browse.className = 'atri-media-panel-browse';
    this.label(browse, 'media.browse', '选择文件');
    browse.addEventListener('click', () => fileInput.click());
    drop.appendChild(browse);
    panel.appendChild(drop);

    let insert: HTMLButtonElement | null = null;
    if (fields.url) {
      insert = document.createElement('button');
      insert.type = 'button';
      insert.className = 'atri-media-panel-insert';
      this.label(insert, 'media.insert', '插入');
      insert.addEventListener('click', () => this.insertFromUrl(urlInput, altInput));
      panel.appendChild(insert);
    }

    document.body.appendChild(panel);
    this.element = panel;
    this.applyTheme(panel);

    // 焦点落进面板：图片先落在地址栏，附件没有输入框就落在选择文件按钮上
    (urlInput ?? altInput ?? browse).focus();
  }

  /**
   * 主题变量写在 .atri-editor 上，浮层挂在 body 上够不着，只能把主题类复制一份
   */
  private applyTheme(panel: HTMLElement): void {
    const root = this.editor.view.dom.closest('.atri-editor');
    const themes = Array.from(root?.classList ?? []).filter((name) =>
      name.startsWith('atri-theme-')
    );
    panel.classList.add(...themes);
  }

  /**
   * 外链图片当场就插，不进上传队列：地址本来就是可用的
   */
  private insertFromUrl(
    urlInput: HTMLInputElement | null,
    altInput: HTMLInputElement | null
  ): void {
    const src = urlInput?.value.trim();
    if (!src) return;

    this.editor
      .chain()
      .focus()
      .setImage({ src, alt: altInput?.value.trim() || undefined })
      .run();
    this.close();
  }

  private upload(files: File[], kind: MediaKind): void {
    if (!files.length) return;

    void this.runtime.handleFiles(files, { kind });
    this.close();
  }

  private async position(anchor: HTMLElement): Promise<void> {
    const panel = this.element;
    if (!panel) return;

    const update = async () => {
      if (this.element !== panel) return;
      try {
        const { x, y } = await computePosition(anchor, panel, {
          placement: 'bottom-start',
          middleware: [offset(6), flip(), shift({ padding: 8 })],
        });
        // 算位置的这几微秒里面板可能已经关了
        if (this.element !== panel) return;
        panel.style.position = 'fixed';
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
      } catch {
        // 量不到也要让面板看得见：宁可位置不理想，也不能点了没反应
      }
    };

    await update();
    if (this.element === panel) {
      this.stopAutoUpdate = autoUpdate(anchor, panel, () => void update());
    }
  }

  /**
   * 点外面与 Escape 关闭；锚点按钮交给 toggle，否则关了又立刻被这次点击重开
   */
  private listenForDismiss(anchor: HTMLElement): void {
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (!target || this.element?.contains(target) || anchor.contains(target)) return;
      this.close();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.close();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    this.detachDismiss = () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }
}
