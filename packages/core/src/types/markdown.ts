/**
 * Markdown 配置
 */
export interface AtriMarkdownConfig {
  /** 是否启用 Markdown 支持（默认 true） */
  enabled?: boolean;
  /** 缩进样式 */
  indentation?: {
    style: 'space' | 'tab';
    size: number;
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
  /** Markdown 快捷键开关（输入时实时转换） */
  shortcuts?: boolean;
}
