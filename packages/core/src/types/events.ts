/**
 * 编辑器事件类型
 */
export type AtriEventType =
  | 'create'
  | 'change'
  | 'focus'
  | 'blur'
  | 'destroy'
  | 'ai:start'
  | 'ai:complete'
  | 'ai:error';

/**
 * 编辑器事件
 */
export interface AtriEvent {
  type: AtriEventType;
  editor: unknown;
  data?: unknown;
}

/**
 * AI 事件
 */
export interface AtriAIEvent {
  type: 'ai:start' | 'ai:complete' | 'ai:error';
  functionId: string;
  content?: string;
  error?: Error;
}

/**
 * 事件监听器
 */
export type AtriEventListener = (event: AtriEvent) => void;
