# @atri-editor/core

基于 Tiptap v3 的框架无关富文本编辑器：Web Component、Markdown 双向转换、图片与附件上传管线、可插拔 AI 集成、中英文 i18n 与亮/暗主题。

完整文档见仓库根 README 与 `demos/`（vanilla / vue / react 三个示例）。

## 安装

```bash
pnpm add @atri-editor/core
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
- `@tiptap/*`、`@floating-ui/dom`、`i18next` 为运行时依赖，由本包的 `dependencies` 声明。
- 当前版本尚未发布到 npm registry；以 workspace 或 `pnpm pack` 产物形式消费。

## License

MIT
