/**
 * 基础格式扩展装配（文字颜色 / 背景色 / 字号 / 字体 / 高亮 / 上下标）
 *
 * 这些 mark 在 Tiptap 里都是零运行时依赖的小包，代价全在" Markdown 往返"这一侧：
 * 上游除 Highlight 的 `==x==` 之外一个 renderMarkdown 都没给，序列化器对没钩子的 mark
 * 是静默丢弃。所以本文件的主体不是注册扩展，而是给它们补发与补收，详见 markdown-inline-html.ts。
 *
 * 行高（LineHeight）刻意不装：上游它是 span 级属性，挂在选中的文字片段上，
 * 而用户心里的行高是段落属性——span 级改一下几乎看不出变化，还不如不给这个按钮。
 * 它和颜色同属一个 textStyle mark，将来要给就走同一条 attrsToStyleCss 路径加一项即可。
 */
import { Extension, type EditorOptions } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import {
  BackgroundColor,
  Color,
  FontFamily,
  FontSize,
  TextStyle,
} from '@tiptap/extension-text-style';
import { escapeHtml, escapeQuotes, decodeEntities } from '../utils/escape';
import { attrsToStyleCss, makeInlineHtmlReader, styleAttrToAttrs } from './markdown-inline-html';

/** 发出时转义，读回时 decodeEntities 逆掉——两边必须成对 */
function emitAttrValue(value: string): string {
  return escapeQuotes(escapeHtml(value));
}

/** mark 属性 → `<span style="…">`；一个属性都没有就不发标签，免得产出一堆空 span */
function renderStyleSpan(node: { attrs?: Record<string, unknown> }, inner: string): string {
  const css = attrsToStyleCss(node.attrs);
  if (!css) return inner;
  return `<span style="${emitAttrValue(css)}">${inner}</span>`;
}

const StyledTextStyle = TextStyle.extend({
  renderMarkdown: (node, helpers) => renderStyleSpan(node, helpers.renderChildren(node)),
});

const StyledSubscript = Subscript.extend({
  renderMarkdown: (_node, helpers) => `<sub>${helpers.renderChildren(_node)}</sub>`,
});

const StyledSuperscript = Superscript.extend({
  renderMarkdown: (_node, helpers) => `<sup>${helpers.renderChildren(_node)}</sup>`,
});

/**
 * 高亮有两个出口，分色与否决定用哪个：
 * 无色走 Markdown 原生的 `==x==`（上游本来就这样，但我们要覆盖 renderMarkdown 来加彩色分支，
 * 所以这一半也得自己写回来）；有色走 `<mark data-color>`——上游的 `==${children}==`
 * 从不读 attrs，multicolor 一开颜色就在导出时丢掉。
 */
const StyledHighlight = Highlight.configure({ multicolor: true }).extend({
  renderMarkdown: (node, helpers) => {
    const inner = helpers.renderChildren(node);
    const color = node.attrs?.color;
    if (typeof color !== 'string' || color.trim() === '') return `==${inner}==`;
    return `<mark data-color="${emitAttrValue(color)}" style="background-color: ${emitAttrValue(color)}; color: inherit">${inner}</mark>`;
  },
});

const StyledSpanReader = Extension.create({
  // Reader 也得有名有姓：Extension.create 不给 name 就会落成空串，
  // 三个匿名扩展同名会撞上 tiptap 的 Duplicate extension names 警告
  name: 'atriStyledSpanReader',
  ...makeInlineHtmlReader({
    tokenName: 'atriStyledSpan',
    // 非贪婪：我们的发出侧不会产出血缘嵌套的 span（同一个 mark 只出一个标签），
    // 遇到外来的嵌套就退回内层文本，不抛
    pattern: /^<span([^>]*)>([\s\S]*?)<\/span>/,
    begins: ['<span'],
    resolve: (token) => {
      const style = /(?:^|\s)style="([^"]*)"/i.exec(token.openAttrs ?? '')?.[1];
      if (!style) return null;
      const attrs = styleAttrToAttrs(decodeEntities(style));
      return Object.keys(attrs).length > 0 ? { markName: 'textStyle', attrs } : null;
    },
  }),
});

/**
 * `<sub>` / `<sup>` 不能借用 `~x~` / `^x^` 那类写法：实测 marked 把单波浪线当 GFM 删除线，
 * `H~2~O` 回来是 `<s>2</s>`，下标没做成还平白吃掉一个删除线语法。
 * 而上游这两个 mark 自己也没有任何 markdown 钩子，所以只有内联 HTML 这一条路。
 */
const SubSupReader = Extension.create({
  name: 'atriInlineTagReader',
  ...makeInlineHtmlReader({
    tokenName: 'atriInlineTag',
    pattern: /^<(sub|sup)>([\s\S]*?)<\/\1>/,
    begins: ['<sub>', '<sup>'],
    resolve: (token) => {
      const tag = (token.openAttrs ?? '').toLowerCase();
      if (tag !== 'sub' && tag !== 'sup') return null;
      return { markName: tag === 'sup' ? 'superscript' : 'subscript', attrs: {} };
    },
  }),
});

/**
 * `<mark>` 的 data-color 上游的 parseHTML 本来就认（入向免费），但上游的 tokenizer 只认
 * `==`；这里补的是"发出去那版的对偶"，让 `<mark data-color>` 形式的输入也走重分词那条路，
 * 从而和内层 markdown 共存。
 */
const HighlightReader = Extension.create({
  name: 'atriStyledMarkReader',
  ...makeInlineHtmlReader({
    tokenName: 'atriStyledMark',
    pattern: /^<mark([^>]*)>([\s\S]*?)<\/mark>/,
    begins: ['<mark'],
    resolve: (token) => {
      const color = /data-color="([^"]*)"/i.exec(token.openAttrs ?? '')?.[1];
      if (!color) return null;
      return { markName: 'highlight', attrs: { color: decodeEntities(color) } };
    },
  }),
});

export interface AtriFormattingOptions {
  /** 'drop' 时不挂发出侧的钩子，颜色类样式导出 Markdown 即丢失（入向仍会解析） */
  inlineStyles?: 'html' | 'drop';
}

/**
 * 构造基础格式扩展。
 *
 * 三个 Reader 与 inlineStyles 无关，'drop' 只关掉发出侧：粘贴与外来 .md 里的
 * `<span style>` 仍然应该解析成 mark，否则关掉一个导出偏好会连带把导入能力也削掉。
 */
export function createFormattingExtensions(
  options: AtriFormattingOptions = {}
): NonNullable<EditorOptions['extensions']> {
  const emit = options.inlineStyles !== 'drop';

  return [
    emit ? StyledTextStyle : TextStyle,
    Color,
    BackgroundColor,
    FontFamily,
    FontSize,
    emit ? StyledHighlight : Highlight.configure({ multicolor: true }),
    emit ? StyledSubscript : Subscript,
    emit ? StyledSuperscript : Superscript,
    StyledSpanReader,
    SubSupReader,
    HighlightReader,
  ];
}
