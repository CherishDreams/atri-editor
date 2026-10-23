# 安装与接入

## 安装

```bash
npm install @atri-editor/core
# 或 pnpm add @atri-editor/core
```

样式需要显式引入：

```ts
import '@atri-editor/core/styles';
```

`@atri-editor/core` 是 ESM-only（与上游 Tiptap v3 一致），需要一个现代打包器。Node 端 `import` 是安全的——编辑功能只在浏览器生效，服务端渲染不会因为 import 它而报错。

## 第一种：作为类使用

```ts
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';

const editor = new AtriEditor({
  element: '#editor',
  content: '<p>Hello World!</p>',
  placeholder: '开始输入…',
  theme: 'light',
});

editor.getMarkdown(); // 导出 Markdown
```

## 第二种：作为 Web Component

导入包即自动注册 `<atri-editor>`，不需要任何框架：

```html
<atri-editor theme="light" placeholder="开始输入…"></atri-editor>

<script type="module">
  import '@atri-editor/core';
  import '@atri-editor/core/styles';

  const el = document.querySelector('atri-editor');
  const editor = el.getEditor();
  editor.setContent('<p>Hello</p>');
</script>
```

`theme` / `editable` / `lang` / `placeholder` 四个属性是响应式的，改了立即生效。初始内容只读一次 `data-content`，运行期改内容请用 `setContent()`。媒体配置无法用属性表达，用 `setOptions({ media })` 传入。

## 在 Vue / React 里

Atri Editor 不依赖任何框架，接法与原生一致：在 `onMounted` / `useEffect` 里用容器元素创建，卸载时调用 `editor.destroy()`。仓库里有三个可运行的示例：

- [vanilla](https://github.com/CherishDreams/atri-editor/tree/main/demos/vanilla)
- [Vue](https://github.com/CherishDreams/atri-editor/tree/main/demos/vue)
- [React](https://github.com/CherishDreams/atri-editor/tree/main/demos/react)

## 依赖关系

`@tiptap/*`、`@floating-ui/dom`、`i18next` 是运行时依赖，由本包的 `dependencies` 声明；`@tiptap/core` 与 `@tiptap/pm` 是 peer，宿主项目里保持单实例。

下一步：[基础格式](/guide/formatting)
