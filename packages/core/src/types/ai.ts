/**
 * AI 功能定义
 */
export interface AtriAIFunction {
  /** 功能唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** hover 提示描述 */
  description?: string;
  /** 图标（SVG 字符串或 URL） */
  icon?: string;
  /** 预设 Prompt 模板，支持 {selection} {content} 变量 */
  prompt?: string;
  /** 作用域 */
  scope?: 'selection' | 'cursor' | 'document';
  /** 输出模式 */
  outputMode?: 'replace' | 'insert' | 'append';
}

/**
 * AI 请求上下文
 */
export interface AIRequestContext {
  /** 触发的功能 ID */
  functionId: string;
  /** 当前选区文本 */
  selection: string;
  /** 光标前文本 */
  cursorContext: string;
  /** 完整文档内容（纯文本） */
  document: string;
  /** 预设 prompt */
  prompt?: string;
  /** 自定义扩展参数 */
  extra?: Record<string, unknown>;
}

/**
 * AI 响应结构
 */
export interface AIResponse {
  /** 输出内容 */
  content: string;
  /** 内容类型 */
  contentType?: 'html' | 'text' | 'markdown';
  /** 是否完成（流式场景） */
  done?: boolean;
}

/**
 * AI 拦截器
 */
export interface AtriAIInterceptors {
  /** 请求前拦截，返回 false 取消请求 */
  beforePost?: (context: AIRequestContext) => AIRequestContext | false;
  /** 请求后拦截，可修改原始响应 */
  afterPost?: (response: AIResponse, context: AIRequestContext) => AIResponse;
  /** 渲染前拦截（在 Markdown 转换之前执行） */
  beforeRender?: (content: string, context: AIRequestContext) => string;
  /** 渲染后回调 */
  afterRender?: (content: string, context: AIRequestContext) => void;
}

/**
 * AI 配置
 */
export interface AtriAIConfig {
  /** AI 功能列表 */
  functions: AtriAIFunction[];
  /** 请求端点，开发者完全控制网络请求 */
  requestEndpoint: (context: AIRequestContext) => Promise<AIResponse>;
  /** 拦截器链 */
  interceptors?: AtriAIInterceptors;
  /** 流式响应支持 */
  streamEnabled?: boolean;
  /** 自动将 AI 返回的 Markdown 转换为 HTML（默认 true） */
  autoTranslateMarkdownToHTML?: boolean;
  /** 全局错误处理 */
  onError?: (error: Error, context: AIRequestContext) => void;
}
