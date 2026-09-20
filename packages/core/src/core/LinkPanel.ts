/**
 * LinkPanel - 链接插入 / 编辑浮层
 *
 * 与 InsertPanel 同为挂在 document.body 上的浮层，定位 / 关闭 / 主题三段走 floating-panel 公共底盘。
 *
 * 链接此前只有 schema 与命令、没有任何入口：工具栏没有按钮，插进去也改不了，
 * 而编辑态点击又会按链接扩展的默认行为直接导航，等于把当前页面连同未保存的内容一起交出去。
 * 这个浮层补上入口，同时把"点链接"改成"就地编辑"。
 */
import type { Editor } from '@tiptap/core';
import {
  copyThemeClasses,
  listenPanelDismiss,
  positionPanel,
  type FloatingPanel,
} from './floating-panel';
import { tOrFallback, type I18nManager } from './I18nManager';
import type { AtriLinkTarget } from '../types';

export interface LinkPanelOptions {
  editor: Editor;
  /**
   * 编辑器根容器（.atri-editor）
   *
   * 点击监听与主题类都挂在它身上，不碰 editor.view.dom：Tiptap v3 的视图是迟到且会被销毁的，
   * 构造时未必拿得到、销毁时已经没了，而这个容器由门面创建，生命周期与编辑器实例一致
   */
  root: HTMLElement;
  i18n?: I18nManager;
  /** 与交给链接扩展的 openOnClick 同源：扩展负责导航时浮层不抢点击 */
  openOnClick?: boolean;
  /** 新链接的打开方式，默认 '_blank' */
  target?: AtriLinkTarget;
  /** 开合时把控制权交回工具栏：按钮的 active 与 aria-expanded 由它维护 */
  onOpenChange?: (open: boolean) => void;
}

interface LabelledElement {
  el: HTMLElement;
  key: string;
  fallback: string;
}

/**
 * 补全协议：用户多半只贴 example.com，补成 https:// 浏览器与 Markdown 两边才都认。
 * 已有协议的（https:、mailto:…）与站内绝对路径 / 锚点 / 相对路径原样保留
 */
export function normalizeHref(value: string): string {
  const href = value.trim();
  if (!href) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || /^[/#.]/.test(href)) return href;
  return `https://${href}`;
}

export class LinkPanel {
  private editor: Editor;
  private root: HTMLElement;
  private i18n?: I18nManager;
  private openOnClick: boolean;
  private defaultTarget: AtriLinkTarget;
  private onOpenChange?: (open: boolean) => void;
  private unsubscribeLanguage?: () => void;

  private element: HTMLDivElement | null = null;
  private floating: FloatingPanel | null = null;
  private detachDismiss: (() => void) | null = null;
  private labelled: LabelledElement[] = [];
  private urlInput: HTMLInputElement | null = null;
  private targetInput: HTMLInputElement | null = null;
  /** 打开时选区内是否已有链接：决定"确定"是改这一条还是新插一条 */
  private editing = false;

  constructor(options: LinkPanelOptions) {
    this.editor = options.editor;
    this.root = options.root;
    this.i18n = options.i18n;
    this.openOnClick = options.openOnClick ?? false;
    this.defaultTarget = options.target ?? '_blank';
    this.onOpenChange = options.onOpenChange;

    // 面板是即时创建的，但可能开着的时候宿主切了语言
    this.unsubscribeLanguage = this.i18n?.onLanguageChanged(() => this.applyLabels());
    this.root.addEventListener('click', this.onEditorClick);
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.open(anchor);
  }

  open(anchor: HTMLElement): void {
    this.close();
    this.editing = this.editor.isActive('link');
    this.build();
    const panel = this.element;
    if (!panel) return;

    this.floating = positionPanel(anchor, panel, () => this.element === panel);
    this.detachDismiss = listenPanelDismiss(anchor, panel, () => this.close());
    this.onOpenChange?.(true);
  }

  close(): void {
    const wasOpen = this.element !== null;

    this.detachDismiss?.();
    this.detachDismiss = null;
    this.floating?.stop();
    this.floating = null;
    this.element?.remove();
    this.element = null;
    this.urlInput = null;
    this.targetInput = null;
    this.labelled = [];
    this.editing = false;

    if (wasOpen) this.onOpenChange?.(false);
  }

  destroy(): void {
    this.root.removeEventListener('click', this.onEditorClick);
    this.close();
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = undefined;
  }

  /**
   * 编辑态点击链接就地编辑（与 wangEditor / AIEditor 一致）
   *
   * 拖选收尾也会派发 click，所以只在选区收拢时接管；openOnClick 开着说明点击归扩展导航
   */
  private onEditorClick = (event: MouseEvent): void => {
    if (this.openOnClick || !this.editor.isEditable) return;
    // 选区不空就是拖选（或双击选词）的收尾，不该弹编辑框
    if (!this.editor.state.selection.empty) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor || !this.root.contains(anchor)) return;

    // 接管这一下点击，同时挡掉 <a> 的默认导航：真实浏览器里 contenteditable 本来就不导航，
    // 但缺这层语义的环境（jsdom、扩展注入的 DOM）会真的把页面带走
    event.preventDefault();
    this.open(anchor);
  };

  private t(key: string, fallback: string): string {
    return tOrFallback(this.i18n, key, fallback);
  }

  /** 登记一处随语言重画的文案：input 画到 placeholder，其他画成文字 */
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

  private build(): void {
    const panel = document.createElement('div');
    panel.className = 'atri-link-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', this.t('link.panelLabel', '链接'));

    const url = document.createElement('input');
    url.type = 'url';
    url.className = 'atri-link-panel-url';
    this.label(url, 'link.urlPlaceholder', '链接地址（https://…）');
    // 已有链接带出原地址：编辑的是这一条，不该让用户重抄一遍
    url.value = this.editing ? String(this.editor.getAttributes('link').href ?? '') : '';
    url.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.apply();
      }
    });
    panel.appendChild(url);
    this.urlInput = url;

    const targetLabel = document.createElement('label');
    targetLabel.className = 'atri-link-panel-target';
    const target = document.createElement('input');
    target.type = 'checkbox';
    target.checked = this.editing
      ? this.editor.getAttributes('link').target !== '_self'
      : this.defaultTarget === '_blank';
    const targetText = document.createElement('span');
    this.label(targetText, 'link.newWindow', '在新窗口打开');
    targetLabel.append(target, targetText);
    panel.appendChild(targetLabel);
    this.targetInput = target;

    const actions = document.createElement('div');
    actions.className = 'atri-link-panel-actions';

    // 移除只在编辑既有链接时出现：没链接可移除的时候摆个灰按钮没有意义
    if (this.editing) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'atri-link-panel-remove';
      this.label(remove, 'link.remove', '移除链接');
      remove.addEventListener('click', () => this.remove());
      actions.appendChild(remove);
    }

    const apply = document.createElement('button');
    apply.type = 'button';
    apply.className = 'atri-link-panel-apply';
    this.label(apply, 'link.apply', '确定');
    apply.addEventListener('click', () => this.apply());
    actions.appendChild(apply);

    panel.appendChild(actions);
    document.body.appendChild(panel);
    this.element = panel;
    copyThemeClasses(this.root, panel);

    url.focus();
    url.select();
  }

  /** 有链接就整条改（extendMarkRange 把范围摊到整段链接），没链接就看选区：套住它，或者把地址本身当链接文字插进去 */
  private apply(): void {
    const href = normalizeHref(this.urlInput?.value ?? '');
    if (!href) return;

    const target: AtriLinkTarget = this.targetInput?.checked ? '_blank' : '_self';
    const { editor } = this;
    const chain = editor.chain().focus();

    if (this.editing) {
      chain.extendMarkRange('link').setLink({ href, target }).run();
    } else if (editor.state.selection.empty) {
      chain
        .insertContent({
          type: 'text',
          text: href,
          marks: [{ type: 'link', attrs: { href, target } }],
        })
        .run();
    } else {
      chain.setLink({ href, target }).run();
    }

    this.close();
  }

  private remove(): void {
    this.editor.chain().focus().extendMarkRange('link').unsetLink().run();
    this.close();
  }
}
