# @atri-editor/code-highlight

为 [`@atri-editor/core`](https://www.npmjs.com/package/@atri-editor/core) 的代码块提供语法高亮，基于 [lowlight](https://github.com/wooorm/lowlight) / [highlight.js](https://highlightjs.org/)。需要高亮的语言由调用方注册。

## 安装

```bash
npm install @atri-editor/core @atri-editor/code-highlight lowlight @tiptap/extension-code-block-lowlight
```

`lowlight` 与 `@tiptap/extension-code-block-lowlight` 是 peer 依赖，需一并安装。

## 使用

```ts
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';
import { withCodeHighlight } from '@atri-editor/code-highlight';
import '@atri-editor/code-highlight/theme';
import { createLowlight, common } from 'lowlight';

const editor = new AtriEditor({
  element: '#editor',
  ...withCodeHighlight({ lowlight: createLowlight(common) }),
});
```

`withCodeHighlight()` 返回 `{ codeBlock: false, extensions }`，按上面的方式展开进编辑器配置即可。

## API

### `withCodeHighlight(config)`

返回 `{ codeBlock: false, extensions }`。

建议优先使用它而不是只传 `createCodeHighlightExtensions()` 的结果：只传扩展时 core 内置的 `CodeBlock` 仍然在册，两份同名实现并存会触发 Tiptap 的 `Duplicate extension names found: ['codeBlock']` 告警。

### `createCodeHighlightExtensions(config)`

只返回扩展，不关闭 core 内置的代码块。

#### config

| 选项                  | 类型             | 默认值        | 说明                            |
| --------------------- | ---------------- | ------------- | ------------------------------- |
| `lowlight`            | `Lowlight`       | —             | 必填，`createLowlight()` 的实例 |
| `defaultLanguage`     | `string \| null` | `null`        | 代码块未标注语言时采用的语言    |
| `languageClassPrefix` | `string`         | `'language-'` | 写在 `<code>` 上的类名前缀      |

## 语言

`createLowlight(common)` 注册约 35 种常用语言。只需要少数几种时按需引入：

```ts
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';

const lowlight = createLowlight({ javascript, bash });
```

`createLowlight()` 不带参数则不注册任何语言，可稍后调用 `lowlight.register()` 追加。

## 主题

`@atri-editor/code-highlight/theme` 是一份覆盖常见 `hljs-*` token 的样式表：取值来自 core 的 CSS 变量，因此跟随编辑器亮/暗主题；作用域限定在 `.atri-editor` 内，不会与页面已有的 hljs 主题冲突。也可以用任意 highlight.js 官方主题替代。

本包只输出 `hljs-*` 类名、不输出颜色，因此不引入样式表时页面上看不到高亮效果。

## 注意

- 高亮只存在于编辑器视图 DOM。它通过 ProseMirror decoration 实现，因此 `editor.getHTML()` 与服务端渲染得到的是不含 token span 的 `<pre><code class="language-…">`。
- 不影响 Markdown 往返：围栏语法与 `language` 属性双向保留。
- 单独设置 `codeBlock: false` 而不提供实现时，代码块节点将不存在，对应的工具栏项也不会注册。

## License

MIT
