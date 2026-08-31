import type { Editor, Extension } from '@tiptap/core';
import type { AtriAIConfig } from './ai';
import type { AtriMarkdownConfig } from './markdown';
import type {
  AtriMediaConfig,
  InsertAttachmentOptions,
  InsertImageOptions,
  MediaKind,
} from './media';
import type { AtriNodeViewConfig } from './extension';

/**
 * 工具栏配置
 */
export interface ToolbarConfig {
  /**
   * 工具栏项，按顺序渲染；省略时使用默认全集
   * 字符串为内置项 id，ToolbarItem 可在内置项基础上覆盖图标与文案
   */
  items?: (string | ToolbarItem)[];
  /**
   * 选中文字时在选区旁浮出的工具栏（行内格式五项），默认关闭，与固定顶栏共存
   * 只在创建时生效：BubbleMenu 的挂载元素走扩展选项，而 tiptap v3 没有运行时注册扩展的入口
   */
  bubble?: boolean;
}

/**
 * 工具栏项
 */
export interface ToolbarItem {
  /** 内置项标识 */
  id: string;
  /** 显示名称（无 icon 时以文字渲染按钮） */
  label?: string;
  /** 图标（SVG 字符串，优先于 label 与内置图标） */
  icon?: string;
  /** 提示文字，优先于当前语言的内置词条 */
  tooltip?: string;
  /** 子菜单（尚未实现，声明后会被忽略） */
  children?: ToolbarItem[];
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
  /** 扩展列表 */
  extensions?: Extension[];
  /** NodeView 自定义组件配置 */
  nodeViews?: AtriNodeViewConfig[];
  /** AI 配置 */
  ai?: AtriAIConfig;
  /** Markdown 配置 */
  markdown?: AtriMarkdownConfig;
  /** 媒体（图片 / 附件）配置，false 时不注册图片与附件节点 */
  media?: AtriMediaConfig | false;
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
  /** 设置占位符 */
  setPlaceholder(placeholder: string): void;

  /** 在选区处插入图片 */
  insertImage(options: InsertImageOptions): void;
  /** 在选区处插入附件卡片 */
  insertAttachment(options: InsertAttachmentOptions): void;
  /** 走上传管线插入本地文件，promise 在这批文件全部落定后 resolve */
  uploadFiles(files: File[] | FileList, kind?: MediaKind): Promise<void>;
  /** 重试所有失败的上传 */
  retryFailedUploads(): Promise<void>;
  /** 是否有文件还没落到服务端（上传中与失败都算） */
  hasPendingUploads(): boolean;

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
