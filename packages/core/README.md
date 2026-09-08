# @atri-editor/core

基于 Tiptap v3 的框架无关富文本编辑器：Web Component、Markdown 双向转换、表格（网格选择器插入、pipe table 双向转换）、图片与附件上传管线、可插拔 AI 集成、中英文 i18n 与亮/暗主题。

完整文档见 [仓库 README](https://github.com/CherishDreams/atri-editor#readme)，示例见 [demos/](https://github.com/CherishDreams/atri-editor/tree/main/demos)（vanilla / vue / react 三个）。

## 安装

```bash
npm install @atri-editor/core
# 或 pnpm add @atri-editor/core
```

## 使用

```typescript
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles'; // 样式需显式引入

const editor = new AtriEditor({
  element: '#editor',
  placeholder: '开始输入...',
  content: '<p>Hello World!</p>',
});

editor.getMarkdown(); // HTML ⇄ Markdown 双向
```

也可以直接用自定义元素（导入包即自动注册）：

```html
<atri-editor theme="light" placeholder="开始输入..."></atri-editor>
```

## 说明

- ESM-only（与上游 Tiptap v3 一致），需要现代打包器；Node 端 import 安全，编辑功能只在浏览器生效。
- `@tiptap/*`、`@floating-ui/dom`、`i18next` 为运行时依赖，由本包的 `dependencies` 声明；`@tiptap/core` 与 `@tiptap/pm` 是 peer 依赖，宿主项目里保持单实例。
- 本包已在 npm registry 发布，CHANGELOG.md 随包发布（版本变更由 changesets 的 Version PR 生成）；发布记录另见 [releases 页](https://github.com/CherishDreams/atri-editor/releases)。

## License

MIT
