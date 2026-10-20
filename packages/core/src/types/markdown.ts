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

/** 导出 Markdown 时丢失的类别：整个节点、整个标记，还是类型上一个没被 renderer 读到的属性 */
export type MarkdownLossKind = 'node' | 'mark' | 'attribute';

/**
 * 一处会在 `getMarkdown()` 中丢失的内容，由 `AtriEditor.getMarkdownLosses()` 产出
 *
 * Tiptap 的序列化器对没有 `renderMarkdown` 钩子的类型是静默丢弃——不抛错、不降级成 HTML、
 * 不留痕迹，所以光看返回值看不出这一趟少了什么。
 */
export interface MarkdownLoss {
  /** 丢的是节点、标记，还是一个属性 */
  kind: MarkdownLossKind;
  /** schema 里的类型名，如 `'paragraph'` */
  type: string;
  /** `kind === 'attribute'` 时给出属性名，其余情况省略 */
  attribute?: string;
  /** 这一趟导出里会丢几处。标记按连续区间计，一个红色短语不会数出三处 */
  count: number;
}
