---
'@atri-editor/core': minor
---

新增 `getMarkdownLosses()` 与 `hasLossyContent()`

序列化器对没有 `renderMarkdown` 钩子的类型是静默丢弃，`getMarkdown()` 的返回值里看不出少了什么。现在可以在导出之前问一遍：返回 `{ kind: 'node' | 'mark' | 'attribute', type, attribute?, count }` 的数组。会进报告的有段落与标题对齐、合并单元格与拖过的列宽（pipe table 表达不了，合并会退化成一格有内容一格空着）、`inlineStyles: 'drop'` 下的颜色与上下标，以及没有 markdown 钩子的第三方节点。`count` 按连续区间合并，一个被加粗切成三段的红色短语算一处。
