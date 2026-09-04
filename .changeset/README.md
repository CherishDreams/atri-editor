# Changesets

这个目录存放版本变更记录。凡是改了 `packages/core` 的对外行为（修 bug、加功能、改 API），
在功能分支上跑一次：

```bash
pnpm changeset
```

按提示选择受影响的包、变更级别（patch / minor / major），并写一句变更摘要——
这句话会进 CHANGELOG，写给三个月后的用户看，不是写给同事看的。

提交 changeset 生成的 `.changeset/*.md` 文件随代码一起合并。
合并到 main 后 CI 会自动维护 Version PR；合并 Version PR 即完成 bump、CHANGELOG、tag 与 npm 发布。
纯文档、测试、CI 内部改动不需要 changeset。
