/**
 * 格式选择面板的内置预设（色板 / 字号 / 字体）
 *
 * 先给固定默认值，不做成配置项：本轮要解决的是"开箱看不见这些能力"，让宿主换一套品牌
 * 色板是独立需求，向后兼容地加 `formatting.colors` 即可；现在预留一份没人读的配置
 * 只会多一处要同步的文档。
 *
 * 这里的文字一律**不写中文词条**：色块与字号本来就没有名字，用 CSS 值自己当无障碍标签
 * （`rgb(24, 144, 255)` 比"蓝"更准确，也不需要同步两份）；只有字体族的通用名需要翻译，
 * 那几条走 i18n key 写在 label 字段上，由面板取词。工具栏 40 项文案收成单源那次
 * （见提交 20c6a5a）说的就是"抄一份兜底字面量等于给漂移留位置"，这里不重犯。
 */

/** 面板的一行 */
export interface StyleOption {
  /** 写进 mark 属性的值 */
  value: string;
  /**
   * 行内文字。颜色与字号直接用 CSS 值；
   * 需要翻译的行由面板按 i18nKey 取词，取不到才回落到这里
   */
  label: string;
  /** 填了就用这个 CSS 值画色块，代替文字预览 */
  swatch?: string;
  /** 行文字的 font-family 预览样式 */
  preview?: string;
  /** 需要翻译的行指向的词条 key */
  i18nKey?: string;
  /** 这一行是"清除该属性"而不是设置某个值 */
  isClear?: boolean;
}

/**
 * 文字色：前 9 个对齐包内既有的 Ant 系主题色，后 3 个补常用正文色。
 * 不放纯黑纯白——正文本来就不是"黑"，而白字在亮色主题下等于隐形。
 */
export const TEXT_COLORS: StyleOption[] = [
  'rgb(31, 31, 31)',
  'rgb(89, 89, 89)',
  'rgb(24, 144, 255)',
  'rgb(82, 196, 26)',
  'rgb(250, 173, 20)',
  'rgb(245, 34, 45)',
  'rgb(114, 46, 209)',
  'rgb(235, 47, 150)',
  'rgb(19, 194, 194)',
  'rgb(47, 84, 235)',
  'rgb(160, 97, 42)',
  'rgb(120, 120, 120)',
].map((value) => ({ value, label: value, swatch: value }));

/**
 * 高亮色一律偏浅：深底配黑字刺眼，深底配白字则把"高亮"变成"遮挡"。
 * 值写成 rgb() 与 TEXT_COLORS 同形，避免同一份导出里混着 #hex 与 rgb() 两种写法。
 */
export const HIGHLIGHT_COLORS: StyleOption[] = [
  'rgb(255, 241, 184)',
  'rgb(200, 250, 170)',
  'rgb(168, 223, 255)',
  'rgb(255, 192, 203)',
  'rgb(223, 190, 255)',
  'rgb(255, 214, 168)',
  'rgb(178, 235, 242)',
  'rgb(230, 230, 230)',
].map((value) => ({ value, label: value, swatch: value }));

export const FONT_SIZES: StyleOption[] = [
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '24px',
  '28px',
  '32px',
  '40px',
  '48px',
].map((value) => ({ value, label: value }));

/**
 * 字体族。前三项按用途选，中文栈必须自己列——只写 sans-serif 时中文会落到系统默认宋体上，
 * 与英文部分的观感差一截。后三项按名字选，装了才有用，没装就退回系统默认，不报错。
 */
export const FONT_FAMILIES: StyleOption[] = [
  {
    value: '-apple-system, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif',
    label: 'Sans',
    i18nKey: 'formatting.fontSans',
    preview: 'sans-serif',
  },
  {
    value: 'Georgia, "Times New Roman", "Songti SC", SimSun, serif',
    label: 'Serif',
    i18nKey: 'formatting.fontSerif',
    preview: 'serif',
  },
  {
    value: '"SFMono-Regular", Consolas, Menlo, monospace',
    label: 'Monospace',
    i18nKey: 'formatting.fontMono',
    preview: 'monospace',
  },
  { value: '"PingFang SC", "Microsoft YaHei", sans-serif', label: 'PingFang / YaHei' },
  { value: 'SimSun, "Songti SC", serif', label: 'SimSun' },
  { value: 'SimHei, "Heiti SC", sans-serif', label: 'SimHei' },
  { value: 'KaiTi, "Kaiti SC", serif', label: 'KaiTi' },
];
