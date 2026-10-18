---
'@atri-editor/core': minor
---

新增基础格式能力（文字颜色 / 背景色 / 字号 / 字体 / 高亮 / 上下标），并把它们的 Markdown 往返一并接通

这组能力此前只有 Tiptap 原生命令、本包完全没注册，所以既没有按钮、外来 HTML 里的
`<span style="color:…">` 也不会变成带样式的文字。本条补的是 mark 与数据链路；
**工具栏按钮和取色面板还没接**，眼下要经 `editor.editor.commands.setColor(…)` 这类原生命令使用。

- **默认注册** `textStyle`（承载颜色 / 背景色 / 字号 / 字体）、`highlight`（开 multicolor）、`subscript`、`superscript` 四类 mark；`formatting: false` 整片关掉。
- **颜色等样式现在会随 Markdown 往返**。Markdown 没有这些的表示法，而序列化器对没有 `renderMarkdown` 钩子的类型是**静默丢弃**——正文照常输出、样式无痕消失、不报错也不留痕迹，导出侧一个钩子都没给。这里补上，落点是内联 HTML：`<span style="…">` / `<sub>` / `<sup>` / `<mark data-color>`。
- **发出与载入逐字节幂等**：`getMarkdown → setMarkdown → getMarkdown` 输出不变。这是本条里真正难的部分。只挂 `renderMarkdown` 做不到——`<span>` 的内容走的是 HTML 解析而非 Markdown 解析，里面的 `**粗体**` 会回来成字面文本，且正文里的反斜杠每导出一次翻一倍，等于每存一次都再损坏一点。为此给内联片段写了自定义 tokenizer，对内层重新分词。
- **彩色高亮的颜色不再丢**。上游 `Highlight` 的导出是 `==正文==` 且从不读属性，`multicolor` 一开颜色就在导出时消失；现在无色仍出 `==`、有色出 `<mark data-color>`。
- **上下标不提供 `~x~` / `^x^` 写法**。marked 把单波浪线当 GFM 删除线，`H~2~O` 回来是 `<s>2</s>`——下标没做成还平白吃掉一个删除线语法。
- 新增 `markdown.inlineStyles: 'html' | 'drop'`（默认 `'html'`）。`'drop'` 导出严格 CommonMark、代价是这次导出丢内容；两种模式下**导入都照常解析**，关掉一个导出偏好不会连带削掉导入能力。
- 降级转换器（`markdown.enabled: false`）补上 `####` / `#####` / `######`，此前两个方向都只认到三级标题。

**可见行为变化**：默认开启的前提下，粘贴 Word / 网页 HTML 从此会真的生成带颜色的文字，而 `getMarkdown()` 的输出里会出现内联 HTML 标签。要严格 Markdown 的下游设 `markdown.inlineStyles: 'drop'`；完全不想要这组能力设 `formatting: false`。

**仍然存在的一处丢失**：段落与标题的对齐导出 Markdown 时会消失（node 属性没有 Markdown 归宿）。这是本条之前既有的行为，不是本次引入，下一次补上显式的丢失报告。

包体积 +1.2 KB gzip（24.6 → 25.8 KB），四个上游扩展自身都零运行时依赖。
