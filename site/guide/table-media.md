# 表格与上传

## 表格

```ts
editor.insertTable(); // 默认 3×3，带表头
```

顶栏的「插入表格」会先弹网格选择器。光标进入表格后浮出操作菜单：增删行列、合并拆分、切换表头、单元格对齐。列宽可以直接拖。

Markdown 一侧是标准 pipe table，单元格对齐随分隔行（`:---` / `---:`）双向往返。

合并单元格与拖过的列宽是 **pipe table 表达不了**的，导出会丢——这一点会出现在 [丢失报告](/guide/markdown#导出丢失报告) 里，而不是悄悄消失。

```ts
new AtriEditor({
  element: '#editor',
  table: false, // 不注册表格能力，工具栏对应项也不出现
});
```

## 上传

上传通道有两种：给一个接口地址走内置 XHR，或直接给函数完全接管。

```ts
new AtriEditor({
  element: '#editor',
  media: {
    upload: {
      endpoint: '/api/upload',
      fieldName: 'file',
      headers: { Authorization: 'Bearer …' },
      // 响应体形状各异，用它挑出 url；缺省依次找 url / data.url / location
      transformResult: (body) => ({ url: body.data.url }),
    },
    maxFileSize: 10 * 1024 * 1024, // 默认 10MB
    maxFiles: 10, // 一次投放的上限
    onError: (rejection) => toast(rejection.reason),
    image: {
      // 上传失败后把这张图读成 data URL 内联；会连带打开 allowBase64
      fallbackToBase64: true,
    },
  },
});
```

完全接管：

```ts
const editor = new AtriEditor({
  element: '#editor',
  media: {
    upload: async (file, { onProgress }) => {
      onProgress?.(50);
      const url = await myUpload(file);
      return { url };
    },
  },
});
```

拖拽与粘贴投放都走同一条通道。上传中不污染撤销历史；逐文件进度画在附件卡片上，整体进度由状态条表达。

## 保存前先检查

```ts
if (editor.hasPendingUploads()) {
  // 上传中与失败都算：此时保存会把本地预览地址写进内容
  await editor.retryFailedUploads();
}
```

图片开了 `fallbackToBase64` 并且已经内联成功时，`hasPendingUploads()` 不再把它算作待处理——它判断的是「现在保存会丢内容」，而不是「必须已经传到服务端」。

## 命令

```ts
editor.insertImage({ src: '/a.png', alt: 'A' });
editor.insertAttachment({ src: '/a.pdf', name: 'a.pdf', size: 1024 });
await editor.uploadFiles(fileList);
await editor.retryFailedUploads();
```

附件在 Markdown 里写成 `!file[名字](url "大小")`，这是本包的自定义语法，往返不丢。
