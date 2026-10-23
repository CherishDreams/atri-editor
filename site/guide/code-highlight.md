# 代码高亮

代码块的语法高亮由 `@atri-editor/code-highlight` 提供，语法库按需注册。

## 安装

```bash
npm install @atri-editor/code-highlight lowlight @tiptap/extension-code-block-lowlight
```

`lowlight` 与 `@tiptap/extension-code-block-lowlight` 是 peer 依赖，需要与本包一起安装。

## 使用

```ts
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';
import { withCodeHighlight } from '@atri-editor/code-highlight';
import '@atri-editor/code-highlight/theme';
import { createLowlight, common } from 'lowlight';

const lowlight = createLowlight(common); // 约 35 个常用语言

const editor = new AtriEditor({
  element: '#editor',
  ...withCodeHighlight({ lowlight }),
});
```

`withCodeHighlight` 一次给出两样东西：`codeBlock: false`（关掉 core 内置的代码块）和替换用的扩展。请用它而不是只传 `extensions`——只传扩展会让两个 `codeBlock` 同名并存，控制台会打印重复扩展告警。

只要个别语言时自己建实例，体积能压到几 KB：

```ts
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';

const lowlight = createLowlight({ javascript, bash });
```

## 主题

```ts
import '@atri-editor/code-highlight/theme';
```

lowlight 只产出 `class="hljs-keyword"` 这类标记，一个颜色都不给。本包附了一份最小主题，作用域限定在 `.atri-editor` 内，颜色跟随 core 的主题变量，因此暗色主题自动适配。想要完整配色就换 highlight.js 官方主题。

## 两个要知道的限制

**高亮不会出现在 `getHTML()` 里。** lowlight 的分词是 ProseMirror 的 decoration，只存在于编辑器视图 DOM；`getHTML()` 走 schema 序列化，永远看不到 decoration。要导出带高亮的 HTML，得在渲染端自己再跑一遍 highlight。

**代码块的语言照常往返。** `CodeBlockLowlight` 是 `CodeBlock.extend(...)` 出来的，继承围栏语法与 `language` 属性的双向钩子，` ```javascript ` 能原样回来。

## 与 Markdown 的关系

高亮不影响 Markdown 的往返。围栏信息串（语言）由上游 `codeBlock` 的 markdown 钩子负责，这个包里没有任何 markdown 相关代码。
