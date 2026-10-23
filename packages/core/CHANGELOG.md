# @atri-editor/core

## 0.5.0

### Minor Changes

- c69bd5b: 新增 `getMarkdownLosses()` 与 `hasLossyContent()`

  序列化器对没有 `renderMarkdown` 钩子的类型是静默丢弃，`getMarkdown()` 的返回值里看不出少了什么。现在可以在导出之前问一遍：返回 `{ kind: 'node' | 'mark' | 'attribute', type, attribute?, count }` 的数组。会进报告的有段落与标题对齐、合并单元格与拖过的列宽（pipe table 表达不了，合并会退化成一格有内容一格空着）、`inlineStyles: 'drop'` 下的颜色与上下标，以及没有 markdown 钩子的第三方节点。`count` 按连续区间合并，一个被加粗切成三段的红色短语算一处。

## 0.4.0

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

- a969f68: 新增基础格式能力（文字颜色 / 背景色 / 字号 / 字体 / 高亮 / 上下标），并把它们的 Markdown 往返一并接通

  这组能力此前只有 Tiptap 原生命令、本包完全没注册，所以既没有按钮、外来 HTML 里的
  `<span style="color:…">` 也不会变成带样式的文字。本条补的是 mark 与数据链路；
  **工具栏按钮和取色面板还没接**，眼下要经 `editor.editor.commands.setColor(…)` 这类原生命令使用。

  - **默认注册** `textStyle`（承载颜色 / 背景色 / 字号 / 字体）、`highlight`（开 multicolor）、`subscript`、`superscript` 四类 mark；`formatting: false` 整片关掉。
  - **颜色等样式现在会随 Markdown 往返**。Markdown 没有这些的表示法，而序列化器对没有 `renderMarkdown` 钩子的类型是**静默丢弃**——正文照常输出、样式无痕消失、不报错也不留痕迹，导出侧一个钩子都没给。这里补上，落点是内联 HTML：`<span style="…">` / `<sub>` / `<sup>` / `<mark data-color>`。
  - **发出与载入逐字节幂等**：`getMarkdown → setMarkdown → getMarkdown` 输出不变。这是本条里真正难的部分。只挂 `renderMarkdown` 做不到——`<span>` 的内容走的是 HTML 解析而非 Markdown 解析，里面的 `**粗体**` 会回来成字面文本，且正文里的反斜杠每导出一次翻一倍，等于每存一次都再损坏一点。为此给内联片段写了自定义 tokenizer，对内层重新分词。
  - **彩色高亮的颜色不再丢**。上游 `Highlight` 的导出是 `==正文==` 且从不读属性，`multicolor` 一开颜色就在导出时消失；现在无色仍出 `==`、有色出 `<mark data-color>`。
  - **上下标不提供 `~x~` / `^x^` 写法**。marked 把单波浪线当 GFM 删除线，`H~2~O` 回来是 `<s>2</s>`——下标没做成还平白吃掉一个删除线语法。
  - 新增 `markdown.inlineStyles: 'html' | 'drop'`（默认 `'html'`）。`'drop'` 导出严格 CommonMark、代价是这次导出丢内容；两种模式下**导入都照常解析**，关掉一个导出偏好不会连带削掉导入能力。
  - 降级转换器（`markdown.enabled: false`）补上 `####` / `#####` / `######`，此前两个方向都只认到三级标题。

  **可见行为变化**：默认开启的前提下，粘贴 Word / 网页 HTML 从此会真的生成带颜色的文字，而 `getMarkdown()` 的输出里会出现内联 HTML 标签。要严格 Markdown 的下游设 `markdown.inlineStyles: 'drop'`；完全不想要这组能力设 `formatting: false`。

  **仍然存在的一处丢失**：段落与标题的对齐导出 Markdown 时会消失（node 属性没有 Markdown 归宿）。这是本条之前既有的行为，不是本次引入，下一次补上显式的丢失报告。

  包体积 +1.2 KB gzip（24.6 → 25.8 KB），四个上游扩展自身都零运行时依赖。

- f8cd129: 修复若干会导致内容丢失、安全漏洞与静默失败的问题

  - **Web Component 用法在生产构建里可能整个失效**：`package.json` 曾把 JS 入口声明为无副作用，而自定义元素的注册就在模块顶层。裸导入 `import '@atri-editor/core'` 经 esbuild 一类打包器会产出空包，`<atri-editor>` 永远不会被升级。已修正声明，并加了构建期校验。
  - **搬动节点不再丢内容**：过去 `disconnectedCallback` 同步销毁编辑器，于是 DOM 重排、框架 re-parent、虚拟列表滚动都会清空用户输入并中止在途上传。现在拆除排在微任务边界，重挂会接回断连前的内容。新增 `destroy()` 供"卸载后不再重建"使用。
  - **附件地址过协议白名单**：`javascript:` 之类的地址此前会原样写进 `href`。现在渲染层统一拒绝，非法地址退化成没有链接的文字。`insertAttachment()` 遇到非法地址返回 `false`。
    **可见行为变化**：`insertAttachment({ src: 'blob:…' })` / `'data:…'` 现在也被拒。这两类是媒体资源地址、不是可点击地址，过去的问题是"命令返回成功、节点却不带链接"。上传管线不受影响——它的本地预览地址是直接写节点属性进去的，不经这条命令。
  - **`upload.transformResult` 抛错不再把上传悬在半空**：过去异常绕过了 reject，卡片永久停在"上传中"、`hasPendingUploads()` 恒为 true，宿主"等上传落定再保存"的闸门被卡死。现在落成一个明确错误，并校验其返回的 `url` 确实可用。
  - **Markdown 降级转换器现在会转义**：`markdown.enabled: false` 时 `markdownToHTML()` 返回的裸 HTML 不转义尖括号与引号，不校验链接协议。宿主把它 `innerHTML` 进页面即有风险。
  - **失败不再静默**：AI 端点报错而未配 `ai.onError` 时过去既不日志也不抛出；空 `ai.functions` 会浮出一个没有选项的菜单并吃掉 Enter 键；上传重试、销毁后的回调等四处不完整的销毁路径已补齐。
  - **新增可选配置** `media.upload.timeout` 与 `ai.timeout`，**默认均不超时**，因此不配置时行为与之前完全一致。
  - 内部：工具栏与表格菜单共 40 处中文文案改为直接取 i18n 词条，不再各抄一份兜底字面量。

- 1eace9c: 基础格式接上 UI：顶栏开箱就有颜色、高亮、字号、字体、上下标与清除格式

  上一条提交补了这批 mark 的数据链路与 Markdown 往返，但只有命令、没有按钮。本条接上界面。

  - **顶栏新增八项**：`textColor` `highlight` `highlightColor` `fontSize` `fontFamily` `subscript` `superscript` `clearFormat`。默认布局从 25 项变 33 项、9 组；窄容器下换行而不是横向溢出。
  - **颜色 / 字号 / 字体是选择面板不是按钮**：色板 12 格 + 一行「其他颜色」（原生取色器）+「无」；字号 10 档 +「默认」；字体 7 项 +「默认」。面板沿用既有浮层底盘（`floating-panel`），键盘方向键可走完整个列表，Escape 与点击外部都关闭，主题类照常复制。
  - **换个入口点过去是改开那个**，而不是因为"面板已经开着"就直接关掉——四个入口共用一个面板实例，做成后者会得到"点了字号再点字体，什么都没发生"。按下态也只归当前那一个入口，不会四个一起亮。
  - **逐项按能力判定，不同生共死**：`textColor` / `fontSize` / `fontFamily` 要求 `textStyle` mark 上真的有那个属性**并且**对应命令存在（两条都看，只看配置会做出"按钮摆出来、点了没反应"）；`highlight` / `subscript` / `superscript` 各看自己的 mark。`formatting: false` 收掉这七项。
  - **`clearFormat` 不受 `formatting` 牵连**：它走 `unsetAllMarks` + `clearNodes`，加粗斜体本来就有，把它绑在这批 mark 上是错绑。
  - **整组空了连分隔符一起撤掉**：分隔符是按组序插的，`formatting: false` 时颜色组全空，不过滤就会在顶栏上吊出两根相邻的光杆。
  - 浮动工具栏的文字组从 5 项增到 8 项（加 `highlight` `subscript` `superscript`），仍只放纯开关——带面板的项锚不住按钮（按钮随浮层一起被摘出文档）。加了 8 项的宽度守卫测试与 CSS 上限（`max-width: min(90vw, 320px)` + 折行），再往下加必须先显式抬那个数。
  - 语言：新增 14 条中英词条，都各有真实读取方，没有一条是躺着没人读的。

  **可见行为变化**：默认顶栏的按钮数量与分组变了。把 `toolbar.items` 写死成一份列表的接入方不受影响（那条路径本来就不读默认布局）；依赖默认布局截图或对齐 CSS 的会看到差异。

  包体积 +3.1 KB gzip（25.8 → 28.9 KB），仍在预算内。其中 `icons.ts` 单个模块 +2.9 KB（八个内联 SVG），它已经是本包最大源模块。

- 7a1e00e: 可以注册内置中英文之外的语言了

  README 早就写着"可扩展其他语言"，但实际没有入口：资源清单是源码里的两个字面量对象，
  `lang: 'ja'` 不报错，只是安静地回退中文——看起来像生效了，词条却一个字都没换。

  - 新增 `editor.i18n.addResources(lang, resources)` 与 `editor.i18n.hasLanguage(lang)`。
    前者注册语言包，后者是**唯一**能问出"这门语言到底有没有被收录"的地方：没收录时 `t()` 不抛错也不留痕迹，只会按 `fallbackLng` 给出中文。
  - **注册只影响这一个编辑器**。每个编辑器本来就持有独立的 i18next 实例，但注册语言包会就地合并进那份词条表，而这份表过去是模块级字面量的引用——于是一次 `addResources` 会污染页面上所有编辑器，**包括之后新建的**，还会连带改掉工具栏默认文案的单一来源。现在每个实例持有自己的拷贝。
  - **盖不掉内置文案**。同名 key 以先注册的一方为准，后加载的代码改不动 `editor.bold`。要自定义措辞请走 `toolbar.items` 的 `tooltip`，那是本来就优先级更高的显式入口。
  - 注册**当前**语言会立刻重刷已挂载界面的文案（工具栏 tooltip、浮层、上传状态条），注册别的语言则不打扰界面，等 `setLanguage` 过去再生效。

- ee07bdf: `ToolbarItem.children` 从桩变成真下拉；标题与对齐收成两个菜单

  `children` 这个字段类型上早就有，但实现只会在 `ToolbarManager` 里打一句"不支持"的告警。
  现在它是真的了。

  - **默认顶栏新增两个下拉**：`heading`（一到六级 + 正文）与 `align`（左/中/右/两端）。
    顶栏从 33 项回到 27 项——标题六级加正文七个取值、对齐四种，平铺要占十一个格子，
    而它们都是"多选一"，一次只用得上一个。
  - **触发器反映当前值**：光标在三级标题里时，按钮上就是 H3 的图标、悬停提示写「标题 3」，
    不点开也知道现在是什么。图标与提示由同一份判定得出，避免出现"画着 H3、写着标题"
    这种一半新一半旧的界面。
  - **4/5/6 级标题有了入口**。schema 与输入规则一直支持到六级（StarterKit 默认 `levels: 1..6`），
    `#### 文字` 本来就能成 h4，缺的只是能按的地方。它们也能单独写进 `toolbar.items`。
  - **`children` 可替换内置菜单的子项**，例如 `items: [{ id: 'heading', children: [...] }]`。
    子项走的是与顶栏项同一张表，因此同样受能力门控：`table: false` 时把 `insertTable` 写进
    子项也不会吊出一行按不动的。
  - **几条明确的拒绝**：只支持一层（嵌套 `children` 告警并忽略）；未知 id 告警并跳过；
    带浮层的子项（`textColor` 这类）不收——菜单一点就关，面板当场失去锚点；
    `children` 写在非下拉项上告警，而不是静默无效。
  - 无障碍：菜单是 `role="menu"` + `role="menuitemradio"` + `aria-checked`（标题级别与对齐方式
    都是多选一，读屏因此能报出当前选中的是哪一项），触发器 `aria-haspopup="menu"` 区别于
    面板类的 `dialog`。方向键走完列表并循环，Enter 选中，Escape 关闭。
  - 选完一项后焦点还给编辑器：顶栏普通按钮的路径本来就在做这件事，走菜单不经过那里，
    不还的话用户选完「标题 2」接着打字，字就丢了。

  **可见行为变化**：默认顶栏的 `heading1` `heading2` `heading3` `paragraph` 与四个 `align*`
  不再平铺出现，改由两个下拉承载。把 `toolbar.items` 写死成一份列表的接入方不受影响——
  那条路径本来就直接读这些 id，它们依然全部可用。

  包体积 +1.3 KB gzip（29.0 → 30.3 KB），仍在预算内。

### Patch Changes

- 464b4d3: 修掉两个主题相关的缺陷

  - **自定义主题名会留残类**。`ThemeManager` 换主题时写死了 `remove('atri-theme-light', 'atri-theme-dark')`，
    只摘这两个名字。而 `ThemeType` 是接受任意主题名的（README 就宣传 `setTheme('sepia')`），
    于是 `setTheme('sepia')` 之后再 `setTheme('light')`，容器上是
    `atri-theme-sepia atri-theme-light` ——两套变量同时生效，最终谁赢取决于样式里的声明顺序，
    而不是用户最后选了哪个主题。改成按 `atri-theme-` 前缀摘干净再加。
  - **已经打开的浮层不跟随主题切换**。浮层挂在 `document.body` 上够不着编辑器上的主题变量，
    所以打开时会把主题类复制一份——但只复制那一次。于是"开着面板切主题"得到一个浅色面板
    配深色正文。现在改成持续跟随：观察编辑器容器自己的 class 变动并重拍，
    面板关闭时断开。五个浮层（插入浮层、表格网格、链接、表格操作菜单、格式选择）
    一次全好，因为它们走的是同一个 `floating-panel` 底盘。

  两处都补了回归钉，并且都反向验证过：把修复抽掉，新增的 5 条断言全部变红。
  既有测试之所以放过了第一个 bug，是因为它们只断言"新类加上了"，从没有一条断言"旧类摘掉了"。

## 0.3.0

### Minor Changes

- d3b367d: 表格与链接补上操作入口，其中链接的点击行为有变更。

  ### 表格
  - 光标进入表格时在单元格上方浮出操作菜单：上/下插入行、删行、左/右插入列、删列、合并单元格、拆分单元格、切换表头行、单元格左/中/右对齐、删除表格。合并与拆分够不着时是禁用而不是隐藏，位置不跳
  - 列宽可拖拽（`table.resizable`，默认开），拖出来的列宽写回单元格 `colwidth`，随 JSON / HTML 一起保存
  - 单元格对齐写在单元格自带的 `align` 属性上，导出 Markdown 时落到 pipe table 分隔行的 `:---` / `---:` / `:---:`，双向都不丢
  - `table` 选项从 `boolean` 扩为 `boolean | AtriTableConfig`（`{ resizable?, menu? }`）；`false` 的语义不变，仍是节点、按钮、菜单与 `insertTable()` 一并不提供

  ### 链接
  - 新增工具栏「链接」项与插入 / 编辑浮层：填地址、切「在新窗口打开」、移除链接；只贴域名会自动补 `https://`
  - **行为变更**：`openOnClick` 默认从 Tiptap 的 `true` 改为 `false`。编辑态点击链接不再导航，而是在浮层里就地编辑——此前这次点击会被链接扩展整个吃掉（连光标都放不进去）并打开新标签页，未保存的内容会跟着一起丢。需要原来的导航行为就显式设 `link: { openOnClick: true }`
  - 新增 `link.target`（默认 `'_blank'`）与 `link.markdownLinks`（默认 false）

  ### 其他
  - 新增 i18n 词条 `table.*` 与 `link.*`（中英双语）
  - `ToolbarManager.updateButtonStates()` 由私有改为公开：挂在门面上的浮层开合不改文档，等不到 transaction，按钮状态需要外部主动刷一次

- 938fd17: 工具栏补上任务列表、分割线与两端对齐。

  - 任务列表：一键把段落转成任务列表，勾选框写回 `checked`；Markdown 以 `- [ ]` / `- [x]` 双向往返，嵌套任务列表也不丢。新增运行时依赖 `@tiptap/extension-list`（与 StarterKit 同源同版本，不引入新的传递依赖）
  - 分割线：工具栏可插 `<hr>`，与插入表格同组（都是"往正文里插一块"的动作），Markdown 以 `---` 往返
  - 两端对齐：`alignJustify` 命令与快捷键此前已存在，这次补上按钮
  - 内置项 id 新增 `taskList` `horizontalRule` `alignJustify`；默认布局按钮数 22 → 25，分组数不变

## 0.2.0

### Minor Changes

- 6934121: 工具栏新增「插入表格」：点击弹出网格悬停选择器（8×6，Notion 式），点击即插入；表格节点（Table/Row/Header/Cell）默认注册，pipe table 与 markdown 双向转换开箱可用。门面与 Web Component 同步提供 insertTable(options) API，`table: false` 可整体关闭。
- c59210e: 「附件样式」切换按钮不再常驻默认顶部工具栏，改由选中附件时浮出的选区工具栏承接；`toolbar.bubble` 默认随之改为开启。入口相应收窄：只有整节点选中（点卡片、方向键越过块级附件、插入命令收尾）才浮出，光标紧贴附件时不再有常驻按钮。需要旧行为可把 `attachmentDisplay` 显式写回 `toolbar.items`，或程序化走 `toggleAttachmentDisplay` 命令；不需要浮层传 `toolbar: { bubble: false }`。
