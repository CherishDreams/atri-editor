# @atri-editor/code-highlight

给 [`@atri-editor/core`](../core) 的代码块加语法高亮。**语法库由你自己带**。

## 为什么单独成一个包

高亮的实际成本是 highlight.js：整包未压缩约 5.5 MB。lowlight 提供
`createLowlight(grammars)`，让你只注册这一页真正用到的语言。所以这份开销该由宿主按页面决定，
而不是让每个装了 `@atri-editor/core` 的人都背一份 `common` 甚至 `all`。

本包产物 **500 B**（minified）。语法库一个字节都不进来，有 CI 的体积预算守着这条线。

## 用法

```ts
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';
import { createLowlight, common } from 'lowlight';
import { withCodeHighlight } from '@atri-editor/code-highlight';
import '@atri-editor/code-highlight/theme';

const lowlight = createLowlight(common); // 约 35 个常用语言

const editor = new AtriEditor({
  element: '#editor',
  ...withCodeHighlight({ lowlight }),
});
```

`withCodeHighlight` 一次给出两样东西：`codeBlock: false`（关掉 core 内置的那个代码块）
和 `extensions: [CodeBlockLowlight…]`。**请用它而不是只传 `extensions`**——
只传扩展会让两个实现都叫 `codeBlock` 并存，虽然实测仍然能工作（后注册的赢），
但那是踩在 Tiptap `ExtensionManager` 的去重顺序这个内部行为上，
而且每建一次编辑器都喊一嗓子 `Duplicate extension names found: ['codeBlock']`。

只要个别语言时自己建实例，体积可以压到几 KB：

```ts
import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';

const lowlight = createLowlight({ javascript, bash });
```

## 两件必须知道的事

**1. 高亮不会出现在 `getHTML()` 里。**

lowlight 的分词是 ProseMirror 的 **decoration**，只存在于编辑器的视图 DOM；
而 `getHTML()` 走 schema 的 `renderHTML` 序列化，永远看不到 decoration。
所以保存下来的 HTML、以及服务端渲染出来的片段，都不带着色——着色只在浏览器里、
只在编辑期的那个 `contenteditable` 内发生。

要导出带高亮的 HTML，得在渲染端自己再跑一遍 highlight（或者接受导出版本没有颜色）。
同理，这一条也意味着高亮与 `@atri-editor/core` 的 SSR 安全性不冲突：服务端不渲染 decoration，
也就不会因此报错。

**2. 得带一份主题 CSS，否则屏幕上看不出任何变化。**

lowlight 只产出 `<span class="hljs-keyword">` 这类标记，一个颜色都不给。本包附了一份
最小主题（`import '@atri-editor/code-highlight/theme'`），只覆盖常用 token、颜色跟着
core 的主题变量走，因此暗色主题自动适配；它的作用域限定在 `.atri-editor` 内，
不会和宿主页面自己已有的 hljs 主题抢。想要完整配色就换 highlight.js 官方主题，
不用本包那份即可。

## 与其它能力的关系

- **Markdown 往返不受影响。** `CodeBlockLowlight` 是 `CodeBlock.extend(...)` 出来的，
  自己不定义任何 markdown 字段，因此继承围栏语法与 `language` 属性的双向钩子。
  换它上来不会动 `.md` 的往返能力，` ```javascript ` 照原样回来。
- **`codeBlock: false` 且没有替代实现时**，代码块节点不存在，工具栏的「代码块」项
  随之不注册（与 `table: false` / `media: false` 同一套做法），而不是摆一个按不动的灰按钮。
- 顶栏按钮、Markdown 输入规则、`editor.isActive('codeBlock')` 全部照常。

## 依赖

`lowlight` 与 `@tiptap/extension-code-block-lowlight` 都是 **peer** 依赖，要自己装。

关于第二个 peer 有一句实话：本仓库的 demo 里只装了 `lowlight`，跑起来没问题——但那是因为
它在 monorepo 里本来就躺在 workspace 的 store 中（是 `packages/code-highlight` 自己的
devDependency），**这个实验证明不了外部消费者的处境**。两个 peer 都显式装上，别依赖提升
带来的运气。
