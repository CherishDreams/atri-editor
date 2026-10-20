---
'@atri-editor/code-highlight': patch
---

修复 0.1.0 装不上：产物里带着 npm 读不懂的 `workspace:` peer 范围

`npm install @atri-editor/code-highlight` 会直接 `EUNSUPPORTEDPROTOCOL: workspace:^` 失败——peer 依赖写的是 pnpm 的 workspace 协议，而发布用的 `npm publish` 不改写它，注册表上就留下了一个无法解析的范围。发布管线现在先由 `pnpm pack` 产出产物（协议换成真实版本），再交给 `npm publish` 打包，并在发出去之前拒绝任何仍带 `workspace:` 的 manifest。同时补上 `license: MIT`（npm 页面此前显示无授权）。

`@atri-editor/core` 不受影响，0.4.0 的产物本来就是干净的。
