/**
 * 选区工具函数
 */
import type { Editor } from '@tiptap/core';
import { getTextBetween } from '@tiptap/core';

/**
 * 获取选中文本
 */
export function getSelectedText(editor: Editor): string {
  const { selection } = editor.state;
  if (selection.empty) return '';
  return getTextBetween(editor.state.doc, {
    from: selection.from,
    to: selection.to,
  });
}

/**
 * 获取光标前的文本（当前段落）
 */
export function getCursorContext(editor: Editor, maxLength: number = 500): string {
  const { selection, doc } = editor.state;
  const pos = selection.from;

  // 获取当前段落的起始位置
  const startPos = pos - editor.state.doc.resolve(pos).parentOffset;
  const from = Math.max(0, startPos - maxLength);

  return getTextBetween(doc, { from, to: pos });
}

/**
 * 获取文档纯文本
 */
export function getDocumentText(editor: Editor): string {
  return editor.state.doc.textContent;
}
