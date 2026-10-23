---
layout: home

hero:
  name: Atri Editor
  text: Markdown 往返，一个字节都不丢
  tagline: 基于 Tiptap v3 的框架无关富文本编辑器。表格、任务列表、代码语言、图片与附件，导出的 Markdown 都能原样载回来——连「这次导出会丢什么」也能提前问出来。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/install
    - theme: alt
      text: 在线试用
      link: /playground
    - theme: alt
      text: GitHub
      link: https://github.com/CherishDreams/atri-editor

features:
  - title: Markdown 全链路往返
    details: 表格与单元格对齐、任务列表、围栏代码块的语言、图片与附件都能导出去再载回来。往返做了逐字节幂等：导出 → 载入 → 再导出，两份完全相同。
  - title: 导出丢失报告
    details: 序列化器对没有 renderMarkdown 钩子的类型是静默丢弃。getMarkdownLosses() 在保存前告诉你哪些节点、标记或属性会消失，各丢几处。
  - title: 上传管线
    details: 逐文件进度、失败重试、图片 base64 兜底；上传态不污染撤销历史。保存前用 hasPendingUploads() 挡住「把本地预览地址写进内容」。
  - title: 表格
    details: 网格选择器插入、行列操作菜单、列宽拖拽；Markdown 一侧是可读的 pipe table。合并单元格与列宽这类 pipe table 表达不了的东西，会如实进丢失报告。
  - title: 主题与多语言
    details: 亮/暗主题、中英文开箱可用，主题色走 CSS 变量；语言包可以自己注册，实例之间互不影响。
  - title: 代码高亮是独立包
    details: highlight.js 的体积不该由每个使用者承担。语法库按需注册，不装就只有代码块、没有着色；主包因此守住 32 KB 的体积闸门。
---
