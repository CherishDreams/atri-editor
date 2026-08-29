/**
 * MediaStatusStrip - 上传队列状态条
 *
 * 卡片与图片上没有一处文字状态（那都由样式表靠 data 属性表达），
 * "上传中 2 个""1 个失败""重试"这些要读得懂的话都集中在这里，本地化只发生在这一处。
 */
import type { I18nManager } from '../core/I18nManager';
import type { MediaRuntime, MediaState } from './MediaRuntime';

interface Labels {
  uploading: (files: number, percent: number) => string;
  failed: (files: number) => string;
  retry: () => string;
}

export class MediaStatusStrip {
  private labels: Labels;
  private element: HTMLDivElement;
  private text: HTMLSpanElement;
  private retry: HTMLButtonElement;
  private unsubscribe?: () => void;
  private unsubscribeLanguage?: () => void;

  constructor(runtime: MediaRuntime, container: HTMLElement, i18n?: I18nManager) {
    // t() 在词条缺失时会原样返回 key，此时回退到内置文案
    const t = (key: string, fallback: string, options?: Record<string, unknown>) => {
      const translated = i18n?.t(key, options);
      return translated && translated !== key ? translated : fallback;
    };

    this.labels = {
      uploading: (files, percent) =>
        t('media.uploading', '上传中 {{files}} 个 · {{percent}}%', { files, percent }),
      failed: (files) => t('media.uploadFailed', '{{files}} 个文件上传失败', { files }),
      retry: () => t('media.retry', '重试'),
    };

    this.element = document.createElement('div');
    this.element.className = 'atri-media-status';
    // role=status 已隐含 aria-live=polite，不必再写一遍
    this.element.setAttribute('role', 'status');
    this.element.hidden = true;

    this.text = document.createElement('span');
    this.text.className = 'atri-media-status-text';

    this.retry = document.createElement('button');
    this.retry.type = 'button';
    this.retry.className = 'atri-media-status-retry';
    this.retry.hidden = true;
    this.retry.addEventListener('click', () => void runtime.retryFailed());

    this.element.append(this.text, this.retry);
    container.appendChild(this.element);

    this.unsubscribe = runtime.subscribe((state) => this.render(state));
    // 上传能持续很久，中途切语言时这条读数不能还停在旧语言
    this.unsubscribeLanguage = i18n?.onLanguageChanged(() => this.render(runtime.getState()));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribeLanguage?.();
    this.element.remove();
  }

  private render(state: MediaState): void {
    const parts: string[] = [];
    if (state.uploading) parts.push(this.labels.uploading(state.uploading, state.percent));
    if (state.failed) parts.push(this.labels.failed(state.failed));

    // 失败态是这一条唯一的分色依据，靠 :has() 找子元素太脆
    this.element.setAttribute('data-atri-media-status', state.failed ? 'error' : 'uploading');
    this.element.hidden = !parts.length;
    // 两段话各占一个 span，分隔交给样式表：拼接用的标点没有中立写法
    this.text.replaceChildren(
      ...parts.map((part) => {
        const span = document.createElement('span');
        span.textContent = part;
        return span;
      })
    );
    this.retry.hidden = !state.failed;
    this.retry.textContent = this.labels.retry();
  }
}
