/**
 * Atri Editor - 主入口
 *
 * 一个基于 Tiptap v3 的框架无关富文本编辑器
 * 支持 Web Component、Markdown、AI 集成
 */

// 导入样式
import './styles/index.scss';

// 导出主类
export { AtriEditor } from './AtriEditor';
export { AtriEditorElement, registerAtriElement } from './AtriEditorElement';

// 导出类型
export * from './types';

// 导出核心模块
export { CoreEditor, MarkdownService, ThemeManager, I18nManager, ExtensionManager, ToolbarManager } from './core';

export type { CoreEditorConfig, ThemeType } from './core';

// 导出 AI 模块
export { AIService, AIInterceptor, AICommandMenuManager } from './ai';

export type { AICommandMenuOptions } from './ai';

// 导出工具函数
export {
  resolveElement,
  createContainer,
  isBrowser,
  getSelectedText,
  getCursorContext,
  getDocumentText,
  simpleMarkdownToHtml,
  simpleHtmlToMarkdown,
} from './utils';
