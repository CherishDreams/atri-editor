# Atri Editor

一个基于 Tiptap v3 的框架无关富文本编辑器，支持 Web Component、Markdown、AI 集成。

## 特性

- **框架无关** - 基于 Web Component，可在 React/Vue/Angular/jQuery 等任意框架中使用
- **Tiptap v3 内核** - 使用最新的 Tiptap v3.30.4 作为编辑引擎
- **TypeScript 7** - 使用 TypeScript 7.x 开发，享受 10x 编译速度提升
- **Markdown 支持** - 内置双向 Markdown 支持，AI 输出自动转换
- **AI 集成** - 开放式 AI 集成架构，支持自定义 AI 服务商
- **主题系统** - 支持亮色/暗色主题切换
- **国际化** - 内置中英文支持，可扩展其他语言

## 快速开始

### 安装

```bash
# 安装依赖
pnpm install

# 构建核心包
pnpm build:core
```

### 基本使用

```typescript
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';

const editor = new AtriEditor({
  element: '#editor',
  placeholder: '开始输入...',
  theme: 'light',
  content: '<p>Hello World!</p>',
});

// 获取内容
const html = editor.getHTML();
const markdown = editor.getMarkdown();
const json = editor.getJSON();

// 设置内容
editor.setContent('<p>New content</p>');
editor.setMarkdown('# Hello\n\nWorld');
```

### Web Component 使用

```html
<atri-editor 
  theme="light" 
  placeholder="开始输入..."
  data-content="<p>初始内容</p>">
</atri-editor>

<script type="module">
  import '@atri-editor/core';
  
  const el = document.querySelector('atri-editor');
  const editor = el.getEditor();
</script>
```

### AI 集成

```typescript
const editor = new AtriEditor({
  element: '#editor',
  ai: {
    functions: [
      {
        id: 'continue',
        name: 'AI 续写',
        scope: 'cursor',
        outputMode: 'insert',
      },
      {
        id: 'translate',
        name: '翻译',
        scope: 'selection',
        outputMode: 'replace',
        prompt: '请将以下内容翻译为英文：{selection}',
      },
    ],
    // 开发者完全控制请求逻辑
    requestEndpoint: async (context) => {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          function: context.functionId,
          prompt: context.prompt,
          content: context.selection || context.cursorContext,
        }),
      });
      const data = await response.json();
      return { content: data.result, contentType: 'markdown' };
    },
    // 自动将 Markdown 转换为 HTML
    autoTranslateMarkdownToHTML: true,
    // 拦截器链
    interceptors: {
      beforePost: (ctx) => {
        ctx.extra = { token: localStorage.getItem('ai-token') };
        return ctx;
      },
      afterRender: (content, ctx) => {
        console.log('AI 输出已插入:', content);
      },
    },
  },
});
```

## 项目结构

```
atri-editor/
├── packages/
│   └── core/                    # 核心包
│       ├── src/
│       │   ├── types/           # 类型定义
│       │   ├── core/            # 核心模块
│       │   ├── ai/              # AI 模块
│       │   ├── utils/           # 工具函数
│       │   ├── styles/          # 样式文件
│       │   ├── AtriEditor.ts    # 编辑器主类
│       │   ├── AtriEditorElement.ts  # Web Component
│       │   └── index.ts         # 主入口
│       └── dist/                # 构建输出
├── demos/                       # 示例项目
└── docs/                        # 文档
```

## API 参考

### AtriEditor

| 方法 | 说明 |
|------|------|
| `getHTML()` | 获取 HTML 内容 |
| `getJSON()` | 获取 JSON 内容 |
| `getMarkdown()` | 获取 Markdown 内容 |
| `setContent(content, options?)` | 设置内容 |
| `setMarkdown(content)` | 设置 Markdown 内容 |
| `clearContent()` | 清空内容 |
| `isEmpty()` | 是否为空 |
| `markdownToHTML(md)` | Markdown 转 HTML |
| `htmlToMarkdown(html)` | HTML 转 Markdown |
| `setEditable(editable)` | 设置可编辑状态 |
| `focus()` | 聚焦 |
| `blur()` | 失焦 |
| `setTheme(theme)` | 设置主题 |
| `toggleTheme()` | 切换主题 |
| `destroy()` | 销毁编辑器 |

### AI 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `functions` | `AtriAIFunction[]` | AI 功能列表 |
| `requestEndpoint` | `(ctx) => Promise<AIResponse>` | 请求端点 |
| `interceptors` | `AtriAIInterceptors` | 拦截器链 |
| `autoTranslateMarkdownToHTML` | `boolean` | 自动转换 Markdown（默认 true） |
| `onError` | `(err, ctx) => void` | 错误处理 |

`prompt` 模板支持的变量：

| 变量 | 取值 |
|------|------|
| `{selection}` | 当前选区文本（无选区为空串） |
| `{cursor}` | 光标前文本（当前段落，最多 500 字） |
| `{document}` | 全文纯文本 |
| `{content}` | 主输入，由功能的 `scope` 决定：`selection` / `cursor` / `document`；省略 `scope` 时为「选区，否则光标前文」 |

### 工具栏配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `toolbar` | `ToolbarConfig \| false` | `false` 时不渲染工具栏 |
| `toolbar.items` | `(string \| ToolbarItem)[]` | 按顺序渲染，省略时使用默认全集 |

内置项 id：`undo` `redo` `heading1` `heading2` `heading3` `paragraph` `bold` `italic` `underline` `strike` `code` `bulletList` `orderedList` `blockquote` `codeBlock` `alignLeft` `alignCenter` `alignRight`。

`ToolbarItem` 只能挂在内置项上：`icon`（SVG 字符串）优先于 `label`（文字按钮）优先于内置图标；`tooltip` 优先于当前语言的内置词条；`children` 尚未实现，声明后会被忽略。未知 id 会告警并跳过。

```ts
toolbar: {
  items: ['bold', 'italic', { id: 'codeBlock', label: '代码块', tooltip: '插入代码块' }],
}
```

### Markdown 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 Markdown 解析与序列化（默认 true） |
| `indentation` | `{ style: 'space' \| 'tab'; size: number }` | 列表与代码块缩进 |
| `markedOptions` | `{ gfm?; breaks?; pedantic? }` | 传给 `marked` 的解析选项 |
| `shortcuts` | `boolean` | 输入时实时转换（`**粗体**`、`# ` 等），默认 true；不影响粘贴与序列化 |

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 代码检查（使用 oxlint）
pnpm lint

# 代码格式化（使用 oxfmt）
pnpm format

# 检查代码质量和格式
pnpm check

# 运行示例
cd demos/vanilla
npx serve
```

### 代码质量工具

项目使用基于 Rust 的高性能代码质量工具：

- **oxlint** (v1.80.0) - 比 ESLint 快 50-100x 的 JavaScript/TypeScript linter
- **oxfmt** (v0.65.0) - 比 Prettier 快的代码格式化工具

配置文件：
- `oxlintrc.json` - oxlint 配置
- `.oxfmtrc.json` - oxfmt 配置

## 技术栈

- **Tiptap v3.30.4** - 编辑引擎
- **ProseMirror** - 底层编辑器框架
- **TypeScript 7.x** - 类型系统
- **Vite** - 构建工具
- **Floating UI** - 弹出菜单定位
- **i18next** - 国际化
- **oxlint** - 代码检查
- **oxfmt** - 代码格式化

## License

MIT
