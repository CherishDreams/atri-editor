/**
 * 内联 HTML 片段的 Markdown 双向支持
 *
 * Markdown 没有"颜色 / 字号 / 上下标"的表示法，上游对这些 mark 一个 renderMarkdown 钩子
 * 都没给，于是 @tiptap/markdown 会把它们**静默丢掉**（MarkdownManager 的 getMarkOpening
 * 在没有钩子时返回空串），正文原样输出、样式无痕消失。这里给它们补上钩子，落点是内联 HTML。
 *
 * 为什么必须自己写 tokenizer、而不能只挂 renderMarkdown 让 marked 的通用 html token 接回去：
 * 实测那样做 `<span style="…">**b**</span>` 里的 `**b**` 会回来成字面文本——因为
 * parseHTMLToken 走的是 generateJSON，即 **HTML 解析而不是 Markdown 解析**，
 * 片段内部的语法永远不会被重新分词。后果不只是丢格式：正文里的反斜杠每导出一次翻一倍，
 * getMarkdown → setMarkdown → getMarkdown 不幂等，对内容编辑器是最不能接受的一类缺陷。
 * 所以内层必须显式重新分词——用 tokenizer 收到的第三个参数 lexer.inlineTokens，
 * 它的类型注释就写着"useful while tokenizing child tokens"。
 */
import type { MarkdownLexerConfiguration, MarkdownParseHelpers, MarkdownToken } from '@tiptap/core';

/** 从 style 属性里认出来的属性名 → mark 属性名 */
export type StyleProp = 'color' | 'backgroundColor' | 'fontSize' | 'fontFamily';

const STYLE_TO_ATTR: Record<string, StyleProp> = {
  color: 'color',
  'background-color': 'backgroundColor',
  'font-size': 'fontSize',
  'font-family': 'fontFamily',
};

const ATTR_TO_STYLE: Record<StyleProp, string> = {
  color: 'color',
  backgroundColor: 'background-color',
  fontSize: 'font-size',
  fontFamily: 'font-family',
};

/**
 * 空串要当"没有"：上游那几个 addGlobalAttributes 的默认值在被 HTML 解析回来时
 * 给出的是空串而不是 null（`<span style="">` 甚至真的会产出一个空属性 textStyle mark），
 * 只判 null 就会拼出 `<span style=";;">` 这种噪音。
 */
function hasValue(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/** `style="color: red; font-size: 20px"` → { color: 'red', fontSize: '20px' } */
export function styleAttrToAttrs(styleText: string): Partial<Record<StyleProp, string>> {
  const attrs: Partial<Record<StyleProp, string>> = {};
  for (const declaration of styleText.split(';')) {
    const separator = declaration.indexOf(':');
    if (separator < 1) continue;
    const prop = declaration.slice(0, separator).trim().toLowerCase();
    const value = declaration.slice(separator + 1).trim();
    const mapped = STYLE_TO_ATTR[prop];
    if (mapped && hasValue(value)) attrs[mapped] = value;
  }
  return attrs;
}

/** mark 属性 → style 字符串；一个都没有时返回空串，调用方据此不发标签 */
export function attrsToStyleCss(attrs: Record<string, unknown> = {}): string {
  const declarations: string[] = [];
  for (const attr of Object.keys(ATTR_TO_STYLE) as StyleProp[]) {
    const value = attrs[attr];
    if (hasValue(value)) declarations.push(`${ATTR_TO_STYLE[attr]}: ${value}`);
  }
  return declarations.join('; ');
}

export interface InlineHtmlToken extends MarkdownToken {
  /** 开始标签与它之间的原始文本，如 ` style="color: red"` */
  openAttrs?: string;
  /** 内层已重新分词的结果，由 tokenize 通过官方 lexer.inlineTokens 产出 */
  tokens?: MarkdownToken[];
}

/**
 * 一个内联标签的 tokenizer + parseMarkdown。
 *
 * 只负责"读进来"这一侧；发出去那一侧（renderMarkdown）必须挂在 mark 自己身上，
 * 因为序列化器是按 mark 类型去查钩子的。
 */
export function makeInlineHtmlReader(options: {
  /** marked 的 token 名，同时是 markdownTokenName */
  tokenName: string;
  /** 起始标签匹配片段，需自带捕获组给出标签名与内层文本 */
  pattern: RegExp;
  /** 快速定位用，避免每次都对整段源码跑正则 */
  begins: string[];
  /** token → { markName, attrs }；返回 null 表示这个 token 不该产出 mark */
  resolve: (token: InlineHtmlToken) => { markName: string; attrs: Record<string, string> } | null;
}) {
  const { tokenName, pattern, begins, resolve } = options;

  return {
    markdownTokenName: tokenName,

    markdownTokenizer: {
      name: tokenName,
      level: 'inline' as const,
      start: (src: string) => {
        let earliest = -1;
        for (const needle of begins) {
          const at = src.indexOf(needle);
          if (at >= 0 && (earliest < 0 || at < earliest)) earliest = at;
        }
        return earliest;
      },
      tokenize: (src: string, _tokens: MarkdownToken[], lexer: MarkdownLexerConfiguration) => {
        const match = pattern.exec(src);
        if (!match) return undefined;
        return {
          type: tokenName,
          raw: match[0],
          text: match[2] ?? '',
          openAttrs: match[1] ?? '',
          // 这一步是整个设计的关键：不在这里重分词，内层的 **粗体** 与转义就会
          // 在 parse 阶段被当成字面文本，进而每导出一次转义翻一倍
          tokens: lexer.inlineTokens(match[2] ?? ''),
        };
      },
    },

    /**
     * token.tokens 已经是分好词的内层，直接 parseInline。
     *
     * resolve 认不出属性时（`<span class="x">` 这种）照样解析内层、只是不套 mark——
     * 把整个 token 丢给 parseInline 会让里面的文字一起消失。
     */
    parseMarkdown: (token: InlineHtmlToken, helpers: MarkdownParseHelpers) => {
      const content = helpers.parseInline(token.tokens ?? []);
      const resolved = resolve(token);
      return resolved ? helpers.applyMark(resolved.markName, content, resolved.attrs) : content;
    },
  };
}
