# Markdown 往返与丢失报告

## 基本用法

```ts
const markdown = editor.getMarkdown();
editor.setMarkdown(markdown);

// 也可以在初始化时直接喂 Markdown
new AtriEditor({ element: '#editor', content: '# 标题', contentFormat: 'markdown' });

// 两个方向的单独转换
editor.markdownToHTML(markdown);
editor.htmlToMarkdown('<h1>标题</h1>');
```

## 往返能力矩阵

| 内容                                       | 导出成                                   | 载回    |
| ------------------------------------------ | ---------------------------------------- | ------- |
| 粗体 / 斜体 / 删除线 / 行内代码 / 链接     | `**b**` `*i*` `~~s~~` `` `c` `` `[t](u)` | ✅      |
| 标题 1–6 / 列表 / 任务列表 / 引用 / 分割线 | `# …` `- ` `- [x]` `> ` `---`            | ✅      |
| 代码块与语言                               | ` ```js … ``` `                          | ✅      |
| 表格与单元格对齐                           | pipe table + `:---` / `---:`             | ✅      |
| 图片 / 附件                                | `![alt](src)`、`!file[名字](url "大小")` | ✅      |
| 无色高亮                                   | `==text==`                               | ✅      |
| 文字颜色 / 背景色 / 字号 / 字体            | `<span style="…">…</span>`               | ✅      |
| 下标 / 上标                                | `<sub>…</sub>` / `<sup>…</sup>`          | ✅      |
| 彩色高亮                                   | `<mark data-color="…">…</mark>`          | ✅      |
| 段落 / 标题对齐                            | —                                        | ❌ 会丢 |
| 合并单元格 / 拖过的列宽                    | —                                        | ❌ 会丢 |

> 下标不用 `~x~` 那类写法：marked 会把单波浪线当 GFM 删除线，`H~2~O` 回来成 `<s>2</s>`。

## 逐字节幂等

`getMarkdown → setMarkdown → getMarkdown` 两轮输出必须相同。这件事比「能不能带上样式」更要紧——带不上只是少个特性，不幂等则是每存一次就再损坏一点。

为此，内联 HTML 片段必须自己写 tokenizer 重新分词内层内容，否则 `<span>` 里的 `**粗体**` 回来会变成字面文本，正文里的反斜杠也会每轮翻倍。

## 导出丢失报告

Markdown 表达不了的内容会被**静默跳过**：不报错、不降级、不留痕迹。所以只看 `getMarkdown()` 的返回值，看不出这一趟少了什么。

```ts
const losses = editor.getMarkdownLosses();
// [{ kind: 'attribute', type: 'paragraph', attribute: 'textAlign', count: 2 }]

if (losses.length && !window.confirm('有内容不会出现在导出的 Markdown 里，仍要保存吗？')) {
  return;
}
save(editor.getMarkdown());
```

`kind` 分三档：

| kind        | 含义                         |
| ----------- | ---------------------------- |
| `node`      | 整个节点连同子树没了         |
| `mark`      | 样式没了，正文留下           |
| `attribute` | 类型能渲染，但某个属性没人读 |

属性要单列：段落本身能导出，但它的对齐不能。

`count` 是这一趟丢了几处，连续区间合并——一个被加粗切成三段的红色短语算一处，不算三处。

### 报告是怎么判断的

依据的是「这个类型能不能被 Markdown 表达」，而不是对导出结果做逐字比对。逐字比对会被良性归一化干扰：空段落导出时会补成 `&nbsp;`、Markdown 转义会改写文本字节——这些都不是丢失。

表格的行列单元格由表格自身输出，内容不丢，也不会出现在报告里。

### 当前会进报告的东西

- 段落 / 标题对齐
- 合并单元格与拖过的列宽（合并会退化成一格有内容、一格空着）
- `inlineStyles: 'drop'` 下的 `textStyle` / `subscript` / `superscript` 与 `highlight` 的颜色
- 第三方注册、但 Markdown 表达不了的节点

`hasLossyContent()` 是同一件事的布尔版本，可以直接用在保存前的检查里。

## 配置

```ts
new AtriEditor({
  element: '#editor',
  markdown: {
    enabled: true, // 关掉后 getMarkdown() 走整篇 HTML 的降级转换
    indentation: { style: 'space', size: 2 }, // 列表与代码块缩进
    shortcuts: true, // 输入时实时转换 `**粗体**`、`# ` 等
    inlineStyles: 'html', // 或 'drop'
  },
});
```
