---
'@atri-editor/core': minor
---

修复若干会导致内容丢失、安全漏洞与静默失败的问题

- **Web Component 用法在生产构建里可能整个失效**：`package.json` 曾把 JS 入口声明为无副作用，而自定义元素的注册就在模块顶层。裸导入 `import '@atri-editor/core'` 经 esbuild 一类打包器会产出空包，`<atri-editor>` 永远不会被升级。已修正声明，并加了构建期校验。
- **搬动节点不再丢内容**：过去 `disconnectedCallback` 同步销毁编辑器，于是 DOM 重排、框架 re-parent、虚拟列表滚动都会清空用户输入并中止在途上传。现在拆除排在微任务边界，重挂会接回断连前的内容。新增 `destroy()` 供"卸载后不再重建"使用。
- **附件地址过协议白名单**：`javascript:` 之类的地址此前会原样写进 `href`。现在渲染层统一拒绝，非法地址退化成没有链接的文字。`insertAttachment()` 遇到非法地址返回 `false`。
- **Markdown 降级转换器现在会转义**：`markdown.enabled: false` 时 `markdownToHTML()` 返回的裸 HTML 不转义尖括号与引号，不校验链接协议。宿主把它 `innerHTML` 进页面即有风险。
- **失败不再静默**：AI 端点报错而未配 `ai.onError` 时过去既不日志也不抛出；空 `ai.functions` 会浮出一个没有选项的菜单并吃掉 Enter 键；上传重试、销毁后的回调等四处不完整的销毁路径已补齐。
- **新增可选配置** `media.upload.timeout` 与 `ai.timeout`，**默认均不超时**，因此不配置时行为与之前完全一致。
- 内部：工具栏与表格菜单共 40 处中文文案改为直接取 i18n 词条，不再各抄一份兜底字面量。
