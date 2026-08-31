/**
 * 附件两种形态（块级卡片 attachment / 行内链接 attachmentLink）共享的节点属性
 *
 * PM 的 inline/group 是 schema 级声明，一个类型当不了两种形态，只能拆成两个节点；
 * 但属性集必须完全一致，否则切换形态会丢字段，上传管线也得按类型开分支
 */
import type { Attribute, CommandProps } from '@tiptap/core';
import { NodeSelection, type Transaction } from '@tiptap/pm/state';
import type { InsertAttachmentOptions } from '../types';
import { mediaInsertTarget } from '../media/insert-position';

/** 两种形态的节点名，判一处用 */
export function isAttachmentForm(name: string): boolean {
  return name === 'attachment' || name === 'attachmentLink';
}

/** 把选区放到离 from 最近的、指定形态的附件节点上——只认"刚插的那种"，
 *  否则句中建卡片时旧链接会和新卡片打平距离，选错对象 */
export function selectNearestForm(tr: Transaction, from: number, typeName: string): void {
  let best = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  tr.doc.descendants((node, pos) => {
    if (node.type.name !== typeName) return;
    const dist = Math.abs(pos - from);
    if (dist < bestDist) {
      bestDist = dist;
      best = pos;
    }
  });
  if (best < 0) return;
  try {
    tr.setSelection(NodeSelection.create(tr.doc, best));
  } catch {
    // 选不上就算了，节点已经进文档
  }
}

/**
 * 插入附件节点并把选区落在它身上
 *
 * tiptap 的 insertContentAt 收尾只给 TextSelection，而这两种 atom 没有 NodeView
 * 不会自己选中——切形态、删除都以"选中的附件"为作用对象，插完就该是选中的
 */
export function insertAttachmentContent(
  props: CommandProps,
  typeName: string,
  options: InsertAttachmentOptions
): boolean {
  const { state, commands, tr, dispatch } = props;
  const target = mediaInsertTarget(state.selection);
  const anchor = typeof target === 'number' ? target : target.to;

  if (
    !commands.insertContentAt(target, {
      type: typeName,
      attrs: {
        src: options.src,
        name: options.name ?? null,
        size: options.size ?? null,
        mime: options.mime ?? null,
      },
    })
  ) {
    return false;
  }

  if (dispatch) selectNearestForm(tr, anchor, typeName);
  return true;
}

/** 属性值一律走 data-* 或文本节点，不进 innerHTML：文件名可能来自上传方，不可信 */
export function dataAttr(
  name: string,
  value: string | number | null | undefined
): Record<string, string> {
  return value === null || value === undefined || value === '' ? {} : { [name]: String(value) };
}

/** 百分比同源写两份：data-* 是"知道进度"的开关，内联自定义属性给样式表取值 */
export function progressAttrs(progress: number | null | undefined): Record<string, string> {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return {};
  const percent = Math.min(100, Math.max(0, Math.round(progress)));
  return {
    'data-atri-upload-progress': String(percent),
    style: `--atri-upload-progress: ${percent}%`,
  };
}

/** 展示名缺省时从地址尾巴推导 */
export function attachmentLabel(name: unknown, src: unknown): string {
  return (
    (name as string) ||
    String(src || '')
      .split('/')
      .pop() ||
    ''
  );
}

export function attachmentAttributes(): Record<string, Attribute> {
  return {
    src: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-src'),
      renderHTML: (attributes) => dataAttr('data-src', attributes.src),
    },
    name: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-name'),
      renderHTML: (attributes) => dataAttr('data-name', attributes.name),
    },
    size: {
      default: null,
      parseHTML: (element) => {
        const raw = element.getAttribute('data-size');
        const parsed = raw === null ? Number.NaN : Number(raw);
        return Number.isFinite(parsed) ? parsed : null;
      },
      renderHTML: (attributes) => dataAttr('data-size', attributes.size),
    },
    mime: {
      default: null,
      parseHTML: (element) => element.getAttribute('data-mime'),
      renderHTML: (attributes) => dataAttr('data-mime', attributes.mime),
    },
    // 下面三项是上传过程中的瞬时态：写得出、读不回，
    // 免得保存下来的 HTML 里带着一个永远不会完成的"上传中"
    status: {
      default: null,
      parseHTML: () => null,
      renderHTML: (attributes) => dataAttr('data-atri-upload-status', attributes.status),
    },
    // 行内链接没有卡片那条进度条，百分比只落 data 属性；
    // 照常定义是为了让运行时的补丁不分形态，切换后下一个进度 tick 也接得上
    progress: {
      default: null,
      parseHTML: () => null,
      renderHTML: (attributes) => progressAttrs(attributes.progress),
    },
    uploadId: {
      default: null,
      parseHTML: () => null,
      rendered: false,
    },
  };
}
