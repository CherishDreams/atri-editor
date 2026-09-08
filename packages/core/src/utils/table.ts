/**
 * 表格能力探测：工具栏按钮与门面 insertTable 共用的 gate
 *
 * 内部使用，不进 utils barrel、不随包出口——检测口径（schema spec 上的 tableRole）
 * 是 extension-table 的实现细节，公共面只承诺"能不能插"这件事本身
 */
import type { Editor } from '@tiptap/core';

/**
 * 内置表格是否真的可用：table:false 不注册、用户用同名扩展顶掉，两种情况都该判 false
 *
 * 不能扫 extensionManager 里的名字：tiptap 对重名扩展只告警不去重，顶掉场景下
 * 内置 Table 仍在列表里、赢的却是用户的 schema 节点，而内置 insertTable 命令
 * 按 spec.tableRole 找型，找不到就在点击当场抛错。命令存在性 + schema 角色
 * 两条一起看，判定的才是"这一下真能插出来"
 */
export function canInsertTable(editor: Editor): boolean {
  if (typeof editor.commands.insertTable !== 'function') return false;
  // tableRole 由 extension-table 的 extendNodeSchema 写进 node spec，prosemirror 的类型里没有它
  const spec = editor.schema.nodes.table?.spec as { tableRole?: string } | undefined;
  return spec?.tableRole === 'table';
}
