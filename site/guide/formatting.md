# 基础格式

顶栏默认就有这一组：文字颜色、背景色、字号、字体、高亮（含多色）、下标、上标、清除格式。取色与字号是选择面板，颜色还能用原生取色器取任意值。

## 命令

```ts
editor.editor.chain().setColor('#1890ff').run();
editor.editor.chain().setFontSize('24px').run();
editor.editor.chain().setHighlight({ color: 'rgb(255, 241, 184)' }).run();
editor.editor.chain().toggleSubscript().run();
editor.editor.chain().unsetAllMarks().run(); // 清除格式
```

`editor.editor` 是底层的 Tiptap `Editor`。Atri 只是产品化的封装层，需要绕过封装时它一直开着。

## 关掉整组

```ts
new AtriEditor({
  element: '#editor',
  formatting: false, // 不再注册颜色 / 字号 / 字体 / 高亮 / 上下标
});
```

关掉之后，粘贴进来的 `<span style>` 也不会变成格式——不是隐藏按钮，而是这套 mark 根本不存在。

## 导出 Markdown 时怎么落

Markdown 没有「这段字是红的」这种语法，所以默认用内联 HTML 承载：

```ts
new AtriEditor({
  element: '#editor',
  markdown: {
    inlineStyles: 'html', // 默认：<span style> / <sub> / <mark data-color>
  },
});
```

`'html'` 下自家往返无损且幂等，发到 GitHub 一类渲染器时样式被剥掉、但不会露出字面标签。

`'drop'` 则完全不发这些样式，导出最纯粹的 CommonMark，代价是这次导出丢内容。这个代价不是无声的——见 [丢失报告](/guide/markdown#导出丢失报告)。无论哪种模式，**导入**都照常解析外来 `<span style>`：关掉一个导出偏好，不该连带削掉导入能力。
