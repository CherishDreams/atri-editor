---
'@atri-editor/core': minor
---

表格与链接补上操作入口，其中链接的点击行为有变更。

### 表格

- 光标进入表格时在单元格上方浮出操作菜单：上/下插入行、删行、左/右插入列、删列、合并单元格、拆分单元格、切换表头行、单元格左/中/右对齐、删除表格。合并与拆分够不着时是禁用而不是隐藏，位置不跳
- 列宽可拖拽（`table.resizable`，默认开），拖出来的列宽写回单元格 `colwidth`，随 JSON / HTML 一起保存
- 单元格对齐写在单元格自带的 `align` 属性上，导出 Markdown 时落到 pipe table 分隔行的 `:---` / `---:` / `:---:`，双向都不丢
- `table` 选项从 `boolean` 扩为 `boolean | AtriTableConfig`（`{ resizable?, menu? }`）；`false` 的语义不变，仍是节点、按钮、菜单与 `insertTable()` 一并不提供

### 链接

- 新增工具栏「链接」项与插入 / 编辑浮层：填地址、切「在新窗口打开」、移除链接；只贴域名会自动补 `https://`
- **行为变更**：`openOnClick` 默认从 Tiptap 的 `true` 改为 `false`。编辑态点击链接不再导航，而是在浮层里就地编辑——此前这次点击会被链接扩展整个吃掉（连光标都放不进去）并打开新标签页，未保存的内容会跟着一起丢。需要原来的导航行为就显式设 `link: { openOnClick: true }`
- 新增 `link.target`（默认 `'_blank'`）与 `link.markdownLinks`（默认 false）

### 其他

- 新增 i18n 词条 `table.*` 与 `link.*`（中英双语）
- `ToolbarManager.updateButtonStates()` 由私有改为公开：挂在门面上的浮层开合不改文档，等不到 transaction，按钮状态需要外部主动刷一次
