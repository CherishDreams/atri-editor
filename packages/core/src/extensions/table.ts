/**
 * 表格扩展装配
 *
 * 增量只有一处：列宽拖拽默认打开。单元格对齐不必动 schema —— extension-table 的单元格
 * 自带 align 属性（解析 style="text-align: …"，Markdown 的 pipe table 分隔行也对到它，
 * 双向都通），缺的只是按得动的按钮，那是操作菜单的事。
 */
import type { EditorOptions } from '@tiptap/core';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import type { AtriTableConfig } from '../types';
import { isBuiltinTableActive } from '../utils/table';

const DEFAULT_TABLE_CONFIG: Required<AtriTableConfig> = {
  resizable: true,
  menu: true,
};

/**
 * 补上默认值，供扩展装配与操作菜单共用：两处必须看到同一个配置，
 * 否则会出现"菜单浮得出来，节点却没注册"这种按了没反应的组合
 *
 * 只归一化 true / undefined / 对象三种写法，false（不注册表格）由调用方先行拦掉
 */
export function resolveTableConfig(table?: boolean | AtriTableConfig): Required<AtriTableConfig> {
  return { ...DEFAULT_TABLE_CONFIG, ...(typeof table === 'object' ? table : undefined) };
}

/**
 * 列宽拖拽由 prosemirror-tables 的列宽插件实现，它启动时按 spec.tableRole 找 table 节点，
 * 而用户用同名扩展顶掉内置 table 时赢的那个节点没有 tableRole——插件照常注册就会直接抛。
 * 插件建立时 schema 已经就绪，所以在此探测而不是在配置里假设
 */
const AtriTable = Table.extend({
  addProseMirrorPlugins() {
    if (!isBuiltinTableActive(this.editor)) return [];
    return this.parent?.() ?? [];
  },
});

/**
 * 构造表格扩展
 *
 * 四件套在这里集中，调用方不必知道 resizable 落在那一个扩展上
 */
export function createTableExtensions(
  table?: AtriTableConfig
): NonNullable<EditorOptions['extensions']> {
  const config = resolveTableConfig(table);

  return [AtriTable.configure({ resizable: config.resizable }), TableRow, TableHeader, TableCell];
}
