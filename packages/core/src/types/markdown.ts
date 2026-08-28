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
}
