---
'@atri-editor/core': minor
---

工具栏补上任务列表、分割线与两端对齐。

- 任务列表：一键把段落转成任务列表，勾选框写回 `checked`；Markdown 以 `- [ ]` / `- [x]` 双向往返，嵌套任务列表也不丢。新增运行时依赖 `@tiptap/extension-list`（与 StarterKit 同源同版本，不引入新的传递依赖）
- 分割线：工具栏可插 `<hr>`，与插入表格同组（都是"往正文里插一块"的动作），Markdown 以 `---` 往返
- 两端对齐：`alignJustify` 命令与快捷键此前已存在，这次补上按钮
- 内置项 id 新增 `taskList` `horizontalRule` `alignJustify`；默认布局按钮数 22 → 25，分组数不变
