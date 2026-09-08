# @atri-editor/core

## 0.2.0

### Minor Changes

- 6934121: 工具栏新增「插入表格」：点击弹出网格悬停选择器（8×6，Notion 式），点击即插入；表格节点（Table/Row/Header/Cell）默认注册，pipe table 与 markdown 双向转换开箱可用。门面与 Web Component 同步提供 insertTable(options) API，`table: false` 可整体关闭。
- c59210e: 「附件样式」切换按钮不再常驻默认顶部工具栏，改由选中附件时浮出的选区工具栏承接；`toolbar.bubble` 默认随之改为开启。入口相应收窄：只有整节点选中（点卡片、方向键越过块级附件、插入命令收尾）才浮出，光标紧贴附件时不再有常驻按钮。需要旧行为可把 `attachmentDisplay` 显式写回 `toolbar.items`，或程序化走 `toggleAttachmentDisplay` 命令；不需要浮层传 `toolbar: { bubble: false }`。
