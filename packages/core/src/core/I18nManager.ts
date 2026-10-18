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
    heading4: '标题 4',
    heading5: '标题 5',
    heading6: '标题 6',
    paragraph: '正文',
    bulletList: '无序列表',
    orderedList: '有序列表',
    taskList: '任务列表',
    codeBlock: '代码块',
    blockquote: '引用',
    horizontalRule: '分割线',
    link: '链接',
    image: '图片',
    attachment: '附件',
    attachmentDisplay: '附件样式',
    delete: '删除',
    video: '视频',
    table: '表格',
    undo: '撤销',
    redo: '重做',
    align: '对齐',
    alignLeft: '左对齐',
    alignCenter: '居中',
    alignRight: '右对齐',
    alignJustify: '两端对齐',
    textColor: '文字颜色',
    highlight: '高亮',
    highlightColor: '高亮色',
    fontSize: '字号',
    fontFamily: '字体',
    subscript: '下标',
    superscript: '上标',
    clearFormat: '清除格式',
  },
  formatting: {
    customColor: '其他颜色…',
    noColor: '无',
    defaultValue: '默认',
    fontSans: '无衬线',
    fontSerif: '衬线',
    fontMono: '等宽',
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
  table: {
    menuLabel: '表格操作',
    rowBefore: '上方插入行',
    rowAfter: '下方插入行',
    deleteRow: '删除行',
    columnBefore: '左侧插入列',
    columnAfter: '右侧插入列',
    deleteColumn: '删除列',
    mergeCells: '合并单元格',
    splitCell: '拆分单元格',
    toggleHeaderRow: '切换表头行',
    alignLeft: '单元格左对齐',
    alignCenter: '单元格居中',
    alignRight: '单元格右对齐',
    deleteTable: '删除表格',
  },
  link: {
    panelLabel: '链接',
    urlPlaceholder: '链接地址（https://…）',
    newWindow: '在新窗口打开',
    apply: '确定',
    remove: '移除链接',
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
    heading4: 'Heading 4',
    heading5: 'Heading 5',
    heading6: 'Heading 6',
    paragraph: 'Paragraph',
    bulletList: 'Bullet List',
    orderedList: 'Ordered List',
    taskList: 'Task List',
    codeBlock: 'Code Block',
    blockquote: 'Blockquote',
    horizontalRule: 'Divider',
    link: 'Link',
    image: 'Image',
    attachment: 'Attachment',
    attachmentDisplay: 'Attachment style',
    delete: 'Delete',
    video: 'Video',
    table: 'Table',
    undo: 'Undo',
    redo: 'Redo',
    align: 'Align',
    alignLeft: 'Align Left',
    alignCenter: 'Align Center',
    alignRight: 'Align Right',
    alignJustify: 'Justify',
    textColor: 'Text Color',
    highlight: 'Highlight',
    highlightColor: 'Highlight Color',
    fontSize: 'Font Size',
    fontFamily: 'Font',
    subscript: 'Subscript',
    superscript: 'Superscript',
    clearFormat: 'Clear Formatting',
  },
  formatting: {
    customColor: 'Custom color…',
    noColor: 'None',
    defaultValue: 'Default',
    fontSans: 'Sans',
    fontSerif: 'Serif',
    fontMono: 'Monospace',
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
  table: {
    menuLabel: 'Table actions',
    rowBefore: 'Insert row above',
    rowAfter: 'Insert row below',
    deleteRow: 'Delete row',
    columnBefore: 'Insert column left',
    columnAfter: 'Insert column right',
    deleteColumn: 'Delete column',
    mergeCells: 'Merge cells',
    splitCell: 'Split cell',
    toggleHeaderRow: 'Toggle header row',
    alignLeft: 'Align cell left',
    alignCenter: 'Center cell',
    alignRight: 'Align cell right',
    deleteTable: 'Delete table',
  },
  link: {
    panelLabel: 'Link',
    urlPlaceholder: 'Link URL (https://…)',
    newWindow: 'Open in new window',
    apply: 'Apply',
    remove: 'Remove link',
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

/**
 * 深拷贝内置词条。
 *
 * 不能把模块级字面量直接交给 i18next：init({ resources }) 存的是引用，而
 * addResourceBundle 的 deepMerge 是就地合并。于是接入方调一次 addResources 就会永久
 * 改掉 zhResources / enResources 本身——页面上所有编辑器实例、以及之后新建的实例，
 * 全都跟着被污染。zhText() 读的同样是这两个字面量，它作为内置默认文案的单源也会一起坏掉。
 * 每个实例持有一份自己的拷贝，注册才真的是"注册到这个编辑器"。
 */
function cloneResources<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

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
        zh: { translation: cloneResources(zhResources) },
        en: { translation: cloneResources(enResources) },
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
   * 翻译，词条缺失时回退到 fallback：i18next 缺词条时原样返回 key
   */
  tOr(key: string, fallback: string, options?: Record<string, unknown>): string {
    const translated = this.t(key, options);
    return translated && translated !== key ? translated : fallback;
  }

  /**
   * 切换语言
   */
  async changeLanguage(lang: string): Promise<void> {
    await this.instance.changeLanguage(lang);
  }

  /**
   * 注册语言包：给已存在的语言补词条，或引入一门内置清单之外的新语言。
   *
   * 内置词条是源码里的两个字面量对象，接入方改不到，于是 lang: 'ja' 只能静默回退中文
   * ——看起来像"支持可扩展"，实际没有入口。这里补上那个入口。
   *
   * overwrite 传 false：同名 key 以先注册的一方为准，防止后加载的包把内置文案悄悄换掉。
   * 要自定义措辞走 toolbar.items 的 tooltip，那本来就是优先级更高的显式入口。
   * 注册当前语言时补发一次 languageChanged，让已挂载的界面重取文案；
   * 不是当前语言就不发，白重刷一遍界面没有意义。
   */
  addResources(lang: string, resources: Record<string, unknown>): void {
    this.instance.addResourceBundle(lang, 'translation', resources, true, false);
    if (lang === this.instance.language) {
      this.instance.emit('languageChanged', lang);
    }
  }

  /**
   * 该语言是否已有语言包。未注册的语言不会抛错，只会按 fallbackLng 回退，
   * 所以想知道有没有真的生效得问这里。
   */
  hasLanguage(lang: string): boolean {
    return this.instance.hasResourceBundle(lang, 'translation');
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

/**
 * 浮层类 UI 共用的文案回退：未注入 i18n 或词条缺失时用内置文案
 * （t() 缺词条时原样返回 key，所以 tOr 已是类里的规矩，这里只补"可能压根没有 i18n"这一层）
 */
export function tOrFallback(i18n: I18nManager | undefined, key: string, fallback: string): string {
  return i18n?.tOr(key, fallback) ?? fallback;
}

/**
 * 直接取中文原文。
 *
 * 中文词条本身就是这些控件的默认文案，再在组件里抄一份字面量就是给漂移留位置：
 * 改一处、另一处不变，而 tOr 的回退值恰好是最不容易被发现出错的那条路径
 * （只在没注入 i18n 或词条缺失时才露出来）。有词条可指的地方用它。
 */
export function zhText(key: string): string {
  const found = key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      zhResources
    );

  return typeof found === 'string' ? found : '';
}
