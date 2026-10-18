---
'@atri-editor/core': minor
---

基础格式接上 UI：顶栏开箱就有颜色、高亮、字号、字体、上下标与清除格式

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
