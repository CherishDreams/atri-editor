---
'@atri-editor/core': minor
---

「附件样式」切换按钮不再常驻默认顶部工具栏，改由选中附件时浮出的选区工具栏承接；`toolbar.bubble` 默认随之改为开启。入口相应收窄：只有整节点选中（点卡片、方向键越过块级附件、插入命令收尾）才浮出，光标紧贴附件时不再有常驻按钮。需要旧行为可把 `attachmentDisplay` 显式写回 `toolbar.items`，或程序化走 `toggleAttachmentDisplay` 命令；不需要浮层传 `toolbar: { bubble: false }`。
