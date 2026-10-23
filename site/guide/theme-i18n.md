# 主题与多语言

## 主题

内置 `light` / `dark`，也可以传自定义主题名：

```ts
new AtriEditor({ element: '#editor', theme: 'dark' });

editor.setTheme('light');
```

主题通过根节点上的 `atri-theme-<name>` 类生效，切换时会按前缀把旧类摘干净。浮层（链接编辑、表格菜单、选择面板）会跟随编辑器根节点的主题类，不会出现「编辑器切暗色、下拉还是白的」。

配色走 CSS 变量，自定义主题就是给自己那组变量赋值：

```css
.atri-theme-brand {
  --atri-color-primary: #7b61ff;
  --atri-bg-color: #10121a;
  --atri-bg-color-secondary: #1a1e2a;
  --atri-text-color: #e6e8f0;
  --atri-border-color: #2a3040;
}
```

```ts
editor.setTheme('brand');
```

常用变量：`--atri-color-primary`、`--atri-bg-color`、`--atri-bg-color-secondary`、`--atri-text-color`、`--atri-text-color-secondary`、`--atri-border-color`。

## 多语言

内置中英文，初始化时指定：

```ts
const editor = new AtriEditor({ element: '#editor', lang: 'en' });

await editor.setLanguage('zh');
```

## 注册自己的语言包

```ts
editor.i18n.addResources('ja', {
  editor: {
    bold: '太字',
    italic: '斜体',
    // 键名与内置词条一致，未覆盖的会落到默认语言
  },
});

editor.i18n.hasLanguage('ja'); // true
await editor.setLanguage('ja');
```

每个编辑器实例持有独立的 i18n 实例：在 A 实例上注册的语言包不会影响 B，也不会污染之后新建的实例。

## Web Component 上的对应属性

```html
<atri-editor theme="dark" lang="en" placeholder="Start typing…" editable="true"></atri-editor>
```

四个属性都是响应式的，改了立即生效。`placeholder` 置为空串即移除占位符。
