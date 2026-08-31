/**
 * 选区浮动工具栏的判定：这一次要不要浮出
 *
 * 只读状态、不碰排版，BubbleMenu 的 shouldShow 直接喂这里的函数，
 * 单测也就不必先给 jsdom 补一套它根本没有的布局能力
 */
import { isNodeSelection, type Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';

/** 浮层只放行内格式：块级与列表留在顶栏，浮层短到不遮住所选的字 */
export const BUBBLE_TEXT_ITEMS = ['bold', 'italic', 'underline', 'strike', 'code'] as const;

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

  if (!editor.isEditable) return false;

  // 选中图片 / 附件那种整节点不是一段文字，没有可施加的行内格式
  if (isNodeSelection(state.selection)) return false;

  // 空选区与只框到空白（拖选跨过空段时很常见）都没有可格式化的字：
  // from === to 时 textBetween 本来就是空串，不必另外判
  if (!state.doc.textBetween(from, to).trim()) return false;

  // 一个按钮都没渲染出来（比如内置项被裁光）就别浮出一个空盒子
  return !!element.querySelector('[data-toolbar-item]:not([disabled])');
}
