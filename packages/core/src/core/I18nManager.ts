/**
 * I18nManager - 国际化支持
 */
import i18next from 'i18next';

// 默认中文资源
const zhResources = {
  editor: {
    placeholder: '请输入内容...',
    bold: '加粗',
    italic: '斜体',
    underline: '下划线',
    strikethrough: '删除线',
    heading: '标题',
    paragraph: '正文',
    bulletList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    codeBlock: '代码块',
    blockquote: '引用',
    link: '链接',
    image: '图片',
    video: '视频',
    table: '表格',
    undo: '撤销',
    redo: '重做',
    alignLeft: '左对齐',
    alignCenter: '居中',
    alignRight: '右对齐',
    alignJustify: '两端对齐',
  },
  ai: {
    menu: 'AI 菜单',
    continue: 'AI 续写',
    translate: 'AI 翻译',
    optimize: 'AI 优化',
    summarize: '生成摘要',
    processing: 'AI 处理中...',
    error: 'AI 处理出错',
  },
};

// 英文资源
const enResources = {
  editor: {
    placeholder: 'Type something...',
    bold: 'Bold',
    italic: 'Italic',
    underline: 'Underline',
    strikethrough: 'Strikethrough',
    heading: 'Heading',
    paragraph: 'Paragraph',
    bulletList: 'Bullet List',
    orderedList: 'Ordered List',
    taskList: 'Task List',
    codeBlock: 'Code Block',
    blockquote: 'Blockquote',
    link: 'Link',
    image: 'Image',
    video: 'Video',
    table: 'Table',
    undo: 'Undo',
    redo: 'Redo',
    alignLeft: 'Align Left',
    alignCenter: 'Align Center',
    alignRight: 'Align Right',
    alignJustify: 'Justify',
  },
  ai: {
    menu: 'AI Menu',
    continue: 'AI Continue',
    translate: 'AI Translate',
    optimize: 'AI Optimize',
    summarize: 'AI Summarize',
    processing: 'AI Processing...',
    error: 'AI Error',
  },
};

export class I18nManager {
  private initialized = false;

  constructor(lang: string = 'zh') {
    this.init(lang);
  }

  private async init(lang: string): Promise<void> {
    if (this.initialized) return;

    await i18next.init({
      lng: lang,
      fallbackLng: 'zh',
      resources: {
        zh: { translation: zhResources },
        en: { translation: enResources },
      },
    });

    this.initialized = true;
  }

  /**
   * 翻译
   */
  t(key: string, options?: Record<string, unknown>): string {
    return i18next.t(key, options);
  }

  /**
   * 切换语言
   */
  async changeLanguage(lang: string): Promise<void> {
    await i18next.changeLanguage(lang);
  }

  /**
   * 获取当前语言
   */
  getLanguage(): string {
    return i18next.language || 'zh';
  }
}
