# Atri Editor

一个基于 Tiptap v3 的框架无关富文本编辑器，支持 Web Component、Markdown、AI 集成。

## 特性

- **框架无关** - 基于 Web Component，可在 React/Vue/Angular/jQuery 等任意框架中使用
- **Tiptap v3 内核** - 使用最新的 Tiptap v3.30.4 作为编辑引擎
- **TypeScript 7** - 使用 TypeScript 7.x 开发，享受 10x 编译速度提升
- **Markdown 支持** - 内置双向 Markdown 支持，AI 输出自动转换
- **AI 集成** - 开放式 AI 集成架构，支持自定义 AI 服务商
- **图片与附件** - 上传通道可插拔（回调或内置 XHR），支持拖拽与粘贴投放、图片缩放手柄、上传进度与失败重试（图片可内联兜底）、类型与大小白名单；附件支持卡片与行内链接两种形态并可切换
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

### 图片与附件

工具栏的「图片」「附件」按钮打开浮层：填地址、选本地文件，或者直接把文件拖进编辑区、从截图工具粘贴。选中任一附件后，「附件样式」按钮在卡片与行内链接之间切换。

```typescript
const editor = new AtriEditor({
  element: '#editor',
  media: {
    // 内置上传通道：multipart/form-data + XHR，带上传进度
    upload: { endpoint: '/api/upload', fieldName: 'file' },
    // 或者完全接管：库不发请求，只把结果写回文档
    // upload: async (file, { onProgress, signal }) => ({ url: await myUpload(file, signal) }),
    maxFileSize: 10 * 1024 * 1024,
    image: { resize: true, allowBase64: false, accept: 'image/*' },
    attachment: { accept: ['.pdf', '.zip'], display: 'card' },
    onError: ({ file, reason }) => console.warn(file.name, reason),
  },
});

editor.insertImage({ src: 'https://cdn.example.com/a.png', alt: '封面' });
editor.insertAttachment({ src: 'https://cdn.example.com/a.pdf', name: '报告.pdf', size: 2048 });
await editor.uploadFiles(input.files, 'attachment');

// 上传中保存会把本地预览地址写进内容，保存前据此提示或阻断
if (editor.hasPendingUploads()) await editor.retryFailedUploads();
```

- **进度与失败**：附件卡片自带逐文件进度条，失败后图片与卡片显示失败态，编辑区右下角状态条汇总「上传中 2 个 · 60%」「1 个文件上传失败 / 重试」。撤销一步回到插入前，不会停在带预览地址的中间态。
- **上传失败后的 base64 兜底**：`image.fallbackToBase64: true` 时，图片传失败会就地读成 data URL（原位换 `src`，不插新节点，位置与撤销语义都不变），内容不再依赖一刷新就失效的本地预览地址。图片仍标着失败态、状态条仍给「重试」，重试成功后换成服务端地址；但 `hasPendingUploads()` 不再把它算作待处理——闸门挡的是「现在保存会丢内容」，不是「必须传到服务端」。兜底只对图片开：附件内联等于把几 MB 塞进 `!file[名字](data:…)` 那一行 Markdown。
  - 它连带打开 `image.allowBase64`：编辑器重建时按 `getHTML()` 回填，节点不认 data URL 的话图片重建一次就静默没了。
  - 代价是体积：data URL 约为原始文件的 1.37×，而 `maxFileSize` 校验的是文件本身，开启时建议把上限调小。
  - `status` 是「写得出、读不回」的瞬时态，所以编辑器重建后这张图就是一张普通 data URL 图片，重试机会随之丢失（内容不丢）。
- **不配上传通道时**：这是另一条 base64 退路，由 `image.allowBase64: true` 决定（外链图片与粘贴远程 `<img>` 都不需要上传通道）；附件没有合理退路，回调 `onError({ reason: 'no-upload' })` 且不插节点。
- **两种形态**：附件默认是块级卡片；`attachment.display: 'link'` 改为行内链接（文件图标 + 蓝色下划线文字，与正文同流），`insertAttachment({ display })` 可逐次覆盖。同一篇文档里卡片与链接可混排。附件点一下先选中（工具栏「附件样式」随即可以切），已选中再点它的链接文字才打开文件——「点击选中」与「点击下载」不会互相抢第一次点击。切换是整节点替换（两种形态是两个节点类型）：句中行链接转卡片会把所在段落劈开，这是块级语义使然；一步撤销只回切换。链接形态渲染成 `<a href download>`：`download` 只对同源地址触发下载，跨域时浏览器会退化成导航。
- **Markdown**：图片走标准 `![alt](src)`；附件用自定义语法，卡片 `!file[名字](url "大小")`、行内链接 `!filelink[名字](url "大小")`，双向不丢。关闭 `markdown.enabled` 时两者都以字面文本进来——与其余标记语法在同样条件下的行为一致。
- `media: false` 完全不注册图片与附件扩展，工具栏对应三项随之消失（显式声明则告警跳过），留给接入方自带扩展。

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

`theme` / `editable` / `lang` / `placeholder` 四个属性是响应式的，改了立即生效；`placeholder` 置为空串即移除占位符。初始内容只读一次 `data-content`，运行期改内容请用 `setContent()`。媒体配置不是属性可表达的，用 `setOptions({ media })` 传入；`insertImage()` / `insertAttachment()` / `uploadFiles()` / `retryFailedUploads()` / `hasPendingUploads()` 在自定义元素上同名可用。

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

### AI 命令菜单

配置了 `ai.functions` 后，在编辑区输入 `/` 会在光标旁浮出命令菜单（Floating UI 定位，下方放不下时自动翻到上方并做视口避让），列出全部 AI 功能：图标、名称，`description` 作为悬停提示。↑ / ↓ 循环选择，Enter 选中，Esc 关闭；选中会先删掉触发字符 `/` 再执行对应功能。键盘监听挂在 document 捕获阶段，Enter 不会被 ProseMirror 的 keymap 抢去拆段落。未配置 `ai` 时命令菜单不注册。

### 国际化

内置中英文两套词条（`lang: 'zh' | 'en'`，默认中文，未收录的语言回退中文），工具栏 tooltip、插入浮层、上传状态条等界面文案随语言切换：

```typescript
const editor = new AtriEditor({ element: '#editor', lang: 'en' });
await editor.setLanguage('zh'); // 异步，语言包就绪后 resolve
```

每个编辑器实例持有独立的 i18next 实例，页面上多个编辑器互不污染语言设置。

### 主题

`theme: 'light' | 'dark'` 指定初始主题，运行期用 `setTheme(theme)` / `toggleTheme()` 切换。实现是替换 `.atri-editor` 容器上的 `atri-theme-light` / `atri-theme-dark` class，并同步 `data-atri-theme` 属性，因此也接受任意自定义主题名：`setTheme('sepia')` 挂上 `atri-theme-sepia`，样式自备（`toggleTheme()` 在自定义主题下会切回亮色）。Web Component 用法下 `theme` 属性是响应式的，改了立即生效。

## 项目结构

```
atri-editor/
├── packages/
│   └── core/                    # 核心包
│       ├── src/
│       │   ├── types/           # 类型定义
│       │   ├── core/            # 核心模块
│       │   ├── extensions/      # 图片 / 附件等节点扩展
│       │   ├── media/           # 上传通道、拖放粘贴、插入浮层
│       │   ├── ai/              # AI 模块
│       │   ├── utils/           # 工具函数
│       │   ├── styles/          # 样式文件
│       │   ├── AtriEditor.ts    # 编辑器主类
│       │   ├── AtriEditorElement.ts  # Web Component
│       │   └── index.ts         # 主入口
│       ├── tests/               # 回归测试（vitest + jsdom）
│       └── dist/                # 构建输出
├── demos/
│   └── vanilla/                 # 原生 JS 示例
└── .github/
    └── workflows/               # CI：check → test → build
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
| `getSelectedText()` | 获取当前选区纯文本 |
| `insertContent(content)` | 在选区处插入内容 |
| `markdownToHTML(md)` | Markdown 转 HTML |
| `htmlToMarkdown(html)` | HTML 转 Markdown |
| `markdownToJSON(md)` | Markdown 转 JSON |
| `setEditable(editable)` | 设置可编辑状态 |
| `isEditable()` | 当前是否可编辑 |
| `setPlaceholder(placeholder)` | 设置占位符，空串即移除 |
| `insertImage(options)` | 在选区处插入图片（外链地址，不进上传队列） |
| `insertAttachment(options)` | 在选区处插入附件，`options.display`（`'card' \| 'link'`）决定形态，缺省用 `media.attachment.display` 配置 |
| `uploadFiles(files, kind?)` | 走上传管线插入本地文件，`kind` 缺省时按 MIME 分流 |
| `retryFailedUploads()` | 重试所有失败的上传 |
| `hasPendingUploads()` | 是否还有文件的内容只存在于本地预览地址（上传中与失败都算；已内联成 data URL 的图片不算） |
| `focus()` | 聚焦 |
| `blur()` | 失焦 |
| `setTheme(theme)` | 设置主题 |
| `toggleTheme()` | 切换主题 |
| `setLanguage(lang)` | 切换语言（异步） |
| `updateAIConfig(config)` | 增量更新 AI 配置 |
| `registerNodeView(config)` | 注册自定义 NodeView；会重建编辑器，内容与选区保持不变 |
| `registerNodeViews(configs)` | 批量注册 NodeView |
| `getNodeViews()` | 获取已注册的 NodeView 配置表 |
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
| `toolbar.bubble` | `boolean` | 选中文字或图片 / 附件时在选区旁浮出的工具栏，默认 false；与固定顶栏共存 |

内置项 id：`undo` `redo` `heading1` `heading2` `heading3` `paragraph` `bold` `italic` `underline` `strike` `code` `bulletList` `orderedList` `blockquote` `codeBlock` `alignLeft` `alignCenter` `alignRight` `insertImage` `insertAttachment` `attachmentDisplay` `delete`。媒体三项与媒体扩展绑定（`media: false` 时不存在）：前两项打开插入浮层，`attachmentDisplay` 在选中附件时切换卡片与行内链接形态。`delete` 只在选中整节点（图片 / 附件）时有作用对象，所以不在顶栏默认布局里——浮层的节点组会带上它，想摆上顶栏就自己写进 `items`。

`ToolbarItem` 只能挂在内置项上：`icon`（SVG 字符串）优先于 `label`（文字按钮）优先于内置图标；`tooltip` 优先于当前语言的内置词条；`children` 尚未实现，声明后会被忽略。未知 id 会告警并跳过。

```ts
toolbar: {
  items: ['bold', 'italic', { id: 'codeBlock', label: '代码块', tooltip: '插入代码块' }],
}
```

`toolbar.bubble` 打开的是选区旁边浮出来的一小排按钮，按选中的对象分两组：选中文字给 `bold` `italic` `underline` `strike` `code`（块级与列表仍留在顶栏，免得浮层长到盖住所选的字；代码块里这五项一个都挂不上，于是索性不浮出），选中附件给 `attachmentDisplay` + `delete`，选中图片只给 `delete`。浮层挂在编辑区内部，所以随正文一起滚动、也被编辑区裁切；选区在首行放不下时会翻到选区下方。该开关只在创建时生效——tiptap v3 没有运行时注册扩展的入口，改配置需要重建编辑器。

### Markdown 配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `enabled` | `boolean` | 是否启用 Markdown 解析与序列化（默认 true） |
| `indentation` | `{ style?: 'space' \| 'tab'; size?: number }` | 列表与代码块缩进，默认 `{ style: 'space', size: 2 }` |
| `markedOptions` | `{ gfm?; breaks?; pedantic? }` | 传给 `marked` 的解析选项 |
| `shortcuts` | `boolean` | 输入时实时转换（`**粗体**`、`# ` 等），默认 true；不影响粘贴与序列化 |

### 媒体配置

| 属性 | 类型 | 说明 |
|------|------|------|
| `media` | `AtriMediaConfig \| false` | `false` 时不注册图片与附件扩展 |
| `media.upload` | `AtriUploadConfig \| UploadHandler` | 上传通道；省略时本地文件无从上传（图片可选 base64 内联） |
| `media.maxFileSize` | `number` | 单个文件上限（字节），默认 10MB |
| `media.maxFiles` | `number` | 一次投放/选择的文件数上限，默认 10；超出的逐个回调 `onError` |
| `media.onError` | `(rejection) => void` | 校验不通过或上传失败时回调，编辑器不弹任何默认提示 |
| `media.image.inline` | `boolean` | 作为内联节点插入，默认 false（块级） |
| `media.image.allowBase64` | `boolean` | 认不认 data URL：决定 `img[src^="data:"]` 能否解析回来，也是没有上传通道时能否内联，默认 false |
| `media.image.fallbackToBase64` | `boolean` | 上传失败后把图片内联成 data URL 兜底（只作用于图片），默认 false；开启即连带打开 `allowBase64` |
| `media.image.resize` | `boolean` | 显示缩放手柄，默认 true |
| `media.image.accept` / `media.attachment.accept` | `string \| string[]` | 类型白名单，支持 `.pdf`、`image/*`、`image/png` 三种写法 |
| `media.attachment.display` | `'card' \| 'link'` | 新插入附件的默认形态，默认 `'card'`；单个插入可用 `insertAttachment({ display })` 覆盖 |

`upload` 给对象时走内置 XHR：

| 属性 | 类型 | 说明 |
|------|------|------|
| `endpoint` | `string` | 接收 `multipart/form-data` 的接口地址 |
| `fieldName` | `string` | 文件字段名，默认 `file` |
| `headers` | `Record<string, string>` | 附加请求头，如授权令牌 |
| `withCredentials` | `boolean` | 是否携带 Cookie |
| `requestName` | `(file) => string` | 服务端要求的文件名与本地不同时使用 |
| `transformResult` | `(body, file) => UploadResult` | 从响应体里挑出 `url`；缺省依次找 `url` / `data.url` / `location` |

给函数时完全接管：`(file, { onProgress, signal }) => Promise<UploadResult>`。`onProgress({ percent, loaded, total })` 可不上报（附件卡片会走不定长动画），`signal` 在编辑器销毁或用户删掉节点时中止；`UploadResult` 为 `{ url, name?, size?, mime? }`，后三项缺省时沿用本地文件的值。

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

# 运行测试（vitest + jsdom，用例在 packages/core/tests/）
pnpm test

# 运行示例（端口 3000，自动打开浏览器；
# demo 的 vite 配置把 @atri-editor/core 直接 alias 到 packages/core/src，
# 改源码即时生效，无需先构建）
pnpm demo
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
