/**
 * I18nManager - 国际化支持
 */
import i18next, { type i18n as I18nInstance } from 'i18next';

// 默认中文资源
const zhResources = {
  editor: {
    placeholder: '请输入内容...',
    bold: '加粗',
    italic: '斜体',
    underline: '下划线',
    strikethrough: '删除线',
    code: '行内代码',
    heading: '标题',
    heading1: '标题 1',
    heading2: '标题 2',
    heading3: '标题 3',
    paragraph: '正文',
    bulletList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    codeBlock: '代码块',
    blockquote: '引用',
    link: '链接',
    image: '图片',
    attachment: '附件',
    attachmentDisplay: '附件样式',
    delete: '删除',
    video: '视频',
    table: '表格',
    undo: '撤销',
    redo: '重做',
    alignLeft: '左对齐',
    alignCenter: '居中',
    alignRight: '右对齐',
    alignJustify: '两端对齐',
  },
  media: {
    uploading: '上传中 {{files}} 个 · {{percent}}%',
    uploadFailed: '{{files}} 个文件上传失败',
    inlined: '{{files}} 张图片未上传（已随文档保存）',
    retry: '重试',
    browse: '选择文件',
    dropHere: '或将文件拖到这里',
    urlPlaceholder: '图片地址（https://…）',
    altPlaceholder: '替代文字',
    insert: '插入',
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
    code: 'Inline Code',
    heading: 'Heading',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    paragraph: 'Paragraph',
    bulletList: 'Bullet List',
    orderedList: 'Ordered List',
    taskList: 'Task List',
    codeBlock: 'Code Block',
    blockquote: 'Blockquote',
    link: 'Link',
    image: 'Image',
    attachment: 'Attachment',
    attachmentDisplay: 'Attachment style',
    delete: 'Delete',
    video: 'Video',
    table: 'Table',
    undo: 'Undo',
    redo: 'Redo',
    alignLeft: 'Align Left',
    alignCenter: 'Align Center',
    alignRight: 'Align Right',
    alignJustify: 'Justify',
  },
  media: {
    uploading: 'Uploading {{files}} · {{percent}}%',
    uploadFailed: '{{files}} file(s) failed to upload',
    inlined: '{{files}} image(s) saved with the document (not uploaded)',
    retry: 'Retry',
    browse: 'Browse',
    dropHere: 'or drop files here',
    urlPlaceholder: 'Image URL (https://…)',
    altPlaceholder: 'Alternative text',
    insert: 'Insert',
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
  private instance: I18nInstance;

  constructor(lang: string = 'zh') {
    // 每个编辑器独立实例：i18next 默认导出是全局单例，共用会让多个编辑器互相切换语言
    this.instance = i18next.createInstance();
    // 资源为内联对象，initImmediate: false 让初始化同步完成，构造后 t() 立即可用
    this.instance.init({
      lng: lang,
      fallbackLng: 'zh',
      initImmediate: false,
      resources: {
        zh: { translation: zhResources },
        en: { translation: enResources },
      },
    });
  }

  /**
   * 翻译
   */
  t(key: string, options?: Record<string, unknown>): string {
    return this.instance.t(key, options);
  }

  /**
   * 切换语言
   */
  async changeLanguage(lang: string): Promise<void> {
    await this.instance.changeLanguage(lang);
  }

  /**
   * 监听语言变更，返回取消订阅的函数
   */
  onLanguageChanged(handler: (lang: string) => void): () => void {
    this.instance.on('languageChanged', handler);
    return () => this.instance.off('languageChanged', handler);
  }

  /**
   * 获取当前语言
   */
  getLanguage(): string {
    return this.instance.language || 'zh';
  }
}
