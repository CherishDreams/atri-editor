/**
 * 选区浮动工具栏的判定：这一次要不要浮出、浮出哪一组
 *
 * 只读状态、不碰排版，BubbleMenu 的 shouldShow 直接喂这里的函数，
 * 单测也就不必先给 jsdom 补一套它根本没有的布局能力
 */
import { isNodeSelection, type Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

/** 浮层的作用对象：一段文字，还是一个整节点 */
export type BubbleGroup = 'text' | 'node';

/** 文字组只放行内格式：块级与列表留在顶栏，浮层短到不遮住所选的字 */
export const BUBBLE_TEXT_ITEMS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

/** 节点组换一批：附件能切形态，图片与附件都能删 */
export const BUBBLE_NODE_ITEMS = ['attachmentDisplay', 'delete'] as const;

/** 选中这些节点才有可施加的操作，别的整节点选择（将来的 atom 之类）什么都不浮 */
export const BUBBLE_SELECTABLE_NODES = ['image', 'attachment', 'attachmentLink'] as const;

/**
 * 选中的可操作节点叫什么，没选中或选的是别的节点就返回 null
 */
export function bubbleNodeNameFor(state: EditorState): string | null {
  if (!isNodeSelection(state.selection)) return null;
  const { name } = state.selection.node.type;
  return (BUBBLE_SELECTABLE_NODES as readonly string[]).includes(name) ? name : null;
}

/**
 * 这一次浮出哪一组。空选区与空白选区仍算 'text'，由 shouldShow 里那句 textBetween 判掉
 */
export function bubbleGroupFor(state: EditorState): BubbleGroup | null {
  if (isNodeSelection(state.selection)) return bubbleNodeNameFor(state) ? 'node' : null;
  return 'text';
}

/**
 * 选区所在的块允许浮层里哪个标记：只问 schema，不问按钮的 disabled
 *
 * 按钮状态是工具栏挂在 transaction 事件上同步的，而插件读 shouldShow 的时机在
 * view.updateState 之内，读到的永远是上一次选区留下的状态（选完附件再选文字就浮不出来）
 */
function allowsBubbleMark(state: EditorState, from: number): boolean {
  const parent = state.doc.resolve(from).parent.type;

  return BUBBLE_TEXT_ITEMS.some((markName) => {
    const mark = state.schema.marks[markName];
    return !!mark && parent.allowsMarkType(mark);
  });
}

/**
 * 交给 BubbleMenu.configure 的 shouldShow。
 *
 * 没照抄官方那句"编辑器必须有焦点"：失焦隐藏本来就归插件自己的 blurHandler 管，
 * 而 hasFocus() 在 jsdom 里恒假，加上它单测就完全驱动不了这个插件。
 */
export function shouldShowBubbleMenu(props: {
  editor: Editor;
  element: HTMLElement;
  state: EditorState;
  from: number;
  to: number;
}): boolean {
  const { editor, element, state, from, to } = props;

  let group = editor.isEditable ? bubbleGroupFor(state) : null;
  const nodeName = group === 'node' ? bubbleNodeNameFor(state) : null;

  // 空选区与只框到空白（拖选跨过空段时很常见）都没有可格式化的字：textBetween 空即是 from === to
  if (group === 'text' && !state.doc.textBetween(from, to).trim()) group = null;
  // 代码块里的文字五项标记一个都挂不上，别浮出一排按不动的灰按钮
  if (group === 'text' && !allowsBubbleMark(state, from)) group = null;

  // 哪一组该占宽度由 CSS 读这两个属性决定，所以必须赶在返回之前写好：
  // 插件紧接着就拿这个元素算位置，而 transaction 事件晚于 updateState，指望不上下一次状态同步
  element.dataset.atriBubbleMode = group ?? 'none';
  element.dataset.atriBubbleNode = nodeName ?? '';

  if (!group) return false;

  // 这一组一个按钮都没渲染出来（比如 media:false 把切形态那项连定义一起带走了）就别浮出空盒子
  return !!element.querySelector(`[data-atri-bubble-group="${group}"] [data-toolbar-item]`);
}
