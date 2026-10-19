# @atri-editor/code-highlight

## 0.1.0

### Minor Changes

- 814cd5d: 新增 `@atri-editor/code-highlight`：代码块语法高亮，语法库由你自己带

  core 侧新增一档配置：

  - `codeBlock?: false` 关掉 StarterKit 内置的代码块，把 `codeBlock` 这个节点名让给你的实现。
    配套地，节点不存在时工具栏的「代码块」项不再注册（与 `table: false` / `media: false` 同一套做法）。
    这不是可选的整理：只写 `codeBlock: false` 而不给替代实现时，`toggleCodeBlock` 命令根本不存在，
    而按钮状态判定会无条件调它——实测是每次事务都抛 `editor.can(...).toggleCodeBlock is not a function`。

  新包 `@atri-editor/code-highlight`：

  ```ts
  import { withCodeHighlight } from '@atri-editor/code-highlight';
  import { createLowlight, common } from 'lowlight';

  new AtriEditor({ element, ...withCodeHighlight({ lowlight: createLowlight(common) }) });
  ```

  - **单独成包的理由是体积**：高亮的真实成本是 highlight.js（整包约 5.5 MB 未压缩），
    而 lowlight 支持只注册用到的语言。本包产物 500 B，语法库一个字节都不进来，
    并配了一条 4 KB gzip 的预算守着这条线。
  - **`withCodeHighlight` 一次给全两样东西**（关内置 + 上 lowlight 版）。只传 `extensions`
    也能工作——实测同名扩展是后注册的赢——但那踩的是 Tiptap 内部去重顺序，
    且每建一次编辑器都会打一句重名 warning。
  - **Markdown 往返不受影响**：`CodeBlockLowlight` 继承 `CodeBlock` 的围栏与 `language`
    双向钩子，` ```javascript ` 照原样回来。
  - 附一份最小 token 主题（`@atri-editor/code-highlight/theme`），作用域限定在 `.atri-editor` 内、
    颜色跟 core 的主题变量走。**没有它的话装上高亮在屏幕上看不出任何变化**——
    lowlight 只给 `<span class="hljs-keyword">` 这类标记，一个颜色都不给。
  - **高亮不会出现在 `getHTML()` 里**：分词是 ProseMirror decoration，只存在于视图 DOM，
    而 `getHTML()` 走 schema 序列化。保存的 HTML 与服务端渲染片段都没有着色，只有编辑期可见。

  `lowlight` 与 `@tiptap/extension-code-block-lowlight` 都是 peer，要自己装。

### Patch Changes

- Updated dependencies [814cd5d]
- Updated dependencies [a969f68]
- Updated dependencies [f8cd129]
- Updated dependencies [464b4d3]
- Updated dependencies [1eace9c]
- Updated dependencies [7a1e00e]
- Updated dependencies [ee07bdf]
  - @atri-editor/core@0.4.0
