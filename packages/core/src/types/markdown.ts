/**
 * Markdown 配置
 */
export interface AtriMarkdownConfig {
  /** 是否启用 Markdown 支持（默认 true） */
  enabled?: boolean;
  /**
   * 列表与代码块的缩进，原样转发给 Tiptap 的 Markdown 扩展，默认 `{ style: 'space', size: 2 }`
   */
  indentation?: {
    style?: 'space' | 'tab';
    size?: number;
  };
  /** marked 配置选项 */
  markedOptions?: {
    /** GitHub Flavored Markdown */
    gfm?: boolean;
    /** \n 转 <br> */
    breaks?: boolean;
    /** 严格模式 */
    pedantic?: boolean;
  };
  /**
   * 输入时实时转换（Markdown 风格 input rules），默认 true
   * 作用于所有扩展注册的 input rules，不影响粘贴处理与 Markdown 序列化
   */
  shortcuts?: boolean;
  /**
   * 文字颜色 / 背景色 / 字号 / 字体 / 彩色高亮 / 上下标在导出 Markdown 时怎么落。
   *
   * Markdown 没有这些的表示法，默认 `'html'` 用内联 HTML（`<span style>` / `<sub>` /
   * `<mark data-color>`）承载：自家 `getMarkdown → setMarkdown` 无损且幂等，发到 GitHub
   * 一类渲染器时样式会被剥掉但**不会露出字面标签**，读者看到的是干净纯文本。
   *
   * `'drop'` 则完全不发出这些样式，导出的是最纯粹的 CommonMark，代价是这次导出丢内容
   * （粘贴与外来 .md 里的 `<span style>` 仍会正常解析进来）。要发给严格的
   * Markdown 渲染器就用它，配合 `getMarkdownLosses()` 自己决定要不要提示用户。
   *
   * 默认 `'html'`
   */
  inlineStyles?: 'html' | 'drop';
}
