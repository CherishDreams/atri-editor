import type { Editor, Extension } from '@tiptap/core';
import type { AtriAIConfig } from './ai';
import type { AtriMarkdownConfig } from './markdown';
import type { AtriNodeViewConfig } from './extension';

/**
 * 工具栏配置
 */
export interface ToolbarConfig {
  /** 工具栏项 */
  items: (string | ToolbarItem)[];
}

/**
 * 工具栏项
 */
export interface ToolbarItem {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  label?: string;
  /** 图标 */
  icon?: string;
  /** 提示文字 */
  tooltip?: string;
  /** 子菜单 */
  children?: ToolbarItem[];
}

/**
 * 气泡菜单配置
 */
export interface BubbleMenuConfig {
  /** 是否启用 */
  enabled?: boolean;
  /** 菜单项 */
  items?: string[];
}

/**
 * 上传配置
 */
export interface UploadConfig {
  /** 上传地址 */
  url?: string;
  /** 请求头 */
  headers?: Record<string, string>;
  /** 表单字段名 */
  fieldName?: string;
  /** 自定义上传函数 */
  customUpload?: (file: File) => Promise<string>;
  /** 最大文件大小（字节） */
  maxSize?: number;
  /** 允许的文件类型 */
  accept?: string;
}

/**
 * 设置内容选项
 */
export interface SetContentOptions {
  /** 内容格式 */
  format?: 'html' | 'json' | 'markdown';
  /** 是否触发变更事件 */
  emitUpdate?: boolean;
}

/**
 * 编辑器配置
 */
export interface AtriEditorOptions {
  /** 挂载元素 */
  element: string | HTMLElement;
  /** 初始内容 */
  content?: string | object;
  /** 内容格式 */
  contentFormat?: 'html' | 'json' | 'markdown';
  /** 主题 */
  theme?: 'light' | 'dark' | string;
  /** 语言 */
  lang?: string;
  /** 是否可编辑 */
  editable?: boolean;
  /** 占位符 */
  placeholder?: string;
  /** 工具栏配置 */
  toolbar?: ToolbarConfig | false;
  /** 气泡菜单配置 */
  bubbleMenu?: BubbleMenuConfig | false;
  /** 扩展列表 */
  extensions?: Extension[];
  /** NodeView 自定义组件配置 */
  nodeViews?: AtriNodeViewConfig[];
  /** AI 配置 */
  ai?: AtriAIConfig;
  /** Markdown 配置 */
  markdown?: AtriMarkdownConfig;
  /** 上传配置 */
  upload?: UploadConfig;
  /** 创建完成回调 */
  onCreate?: (editor: IAtriEditor) => void;
  /** 内容变更回调 */
  onChange?: (editor: IAtriEditor) => void;
  /** 聚焦回调 */
  onFocus?: (editor: IAtriEditor) => void;
  /** 失焦回调 */
  onBlur?: (editor: IAtriEditor) => void;
  /** 销毁回调 */
  onDestroy?: (editor: IAtriEditor) => void;
}

/**
 * 编辑器接口
 */
export interface IAtriEditor {
  /** Tiptap Editor 实例 */
  readonly editor: Editor;

  /** 获取 HTML 内容 */
  getHTML(): string;
  /** 获取 JSON 内容 */
  getJSON(): object;
  /** 获取 Markdown 内容 */
  getMarkdown(): string;
  /** 设置内容 */
  setContent(content: string | object, options?: SetContentOptions): void;
  /** 设置 Markdown 内容 */
  setMarkdown(content: string): void;
  /** 清空内容 */
  clearContent(): void;
  /** 是否为空 */
  isEmpty(): boolean;

  /** Markdown 转 HTML */
  markdownToHTML(markdown: string): string;
  /** HTML 转 Markdown */
  htmlToMarkdown(html: string): string;
  /** Markdown 转 JSON */
  markdownToJSON(markdown: string): object;

  /** 获取选中文本 */
  getSelectedText(): string;
  /** 插入内容 */
  insertContent(content: string): void;

  /** 设置可编辑状态 */
  setEditable(editable: boolean): void;
  /** 是否可编辑 */
  isEditable(): boolean;
  /** 聚焦 */
  focus(): void;
  /** 失焦 */
  blur(): void;

  /** 销毁编辑器 */
  destroy(): void;
}
