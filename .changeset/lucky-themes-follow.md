---
'@atri-editor/core': patch
---

修掉两个主题相关的缺陷

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
