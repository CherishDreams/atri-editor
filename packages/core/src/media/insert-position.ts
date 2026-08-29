/**
 * 媒体节点的插入落点
 */
import { NodeSelection, type Selection } from '@tiptap/pm/state';

/**
 * 插完一个 atom 媒体节点，它会处于选中态；插入命令替换的是整个选区，
 * 于是空文档里连插两张图只剩一张。选中的正是媒体节点时，把落点挪到它后面。
 */
export function mediaInsertTarget(selection: Selection): number | { from: number; to: number } {
  if (
    selection instanceof NodeSelection &&
    (selection.node.type.name === 'image' || selection.node.type.name === 'attachment')
  ) {
    return selection.to;
  }

  return { from: selection.from, to: selection.to };
}
