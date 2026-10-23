# 在线试用

下面这个编辑器就是真实的 `@atri-editor/core`，样式、工具栏、Markdown 序列化都是线上那一份。随便改。

<ClientOnly>
  <Playground />
</ClientOnly>

## 值得试的几件事

- 选中一段文字，点顶栏的对齐下拉选择居中，再点「丢失报告」——Markdown 没有对齐的写法，编辑器会如实告诉你这一趟导出丢了 `paragraph.textAlign`。
- 点「看 Markdown」，看 `getMarkdown()` 的真实输出：表格、任务列表、代码块语言都在里面。
- 切到暗色，编辑器与页面会一起换主题；工具栏与浮层的配色来自同一组 CSS 变量。
- 表格：点顶栏插入表格，光标进入后浮出操作菜单，试试合并单元格再导出——合并会出现在丢失报告里。

完整示例（含上传、自定义节点、AI 挂载）见 [Demo](https://cherishdreams.github.io/atri-editor/demo/)。
