/**
 * HTML 转义
 *
 * 只服务一件事：把用户或远端来的文本拼成 HTML 字符串（见 utils/markdown.ts 的降级路径）。
 * 走 ProseMirror schema 的正常渲染不需要这里——DOMOutputSpec 的文本与属性由 PM 自己处理，
 * 手工转义反而转出新实体。
 */

const TEXT_CHARS: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

const QUOTE_CHARS: Readonly<Record<string, string>> = {
  '"': '&quot;',
  "'": '&#39;',
};

function replaceAll(
  value: string,
  table: Readonly<Record<string, string>>,
  pattern: RegExp
): string {
  return value.replace(pattern, (char) => table[char] ?? char);
}

/**
 * 转义文本节点内容：挡住 `<img src=x onerror=…>` 这类标签破出。
 * 不动引号，所以已确定要进属性的文本还得再过一道 escapeQuotes。
 */
export function escapeHtml(value: string): string {
  return replaceAll(value, TEXT_CHARS, /[&<>]/g);
}

/**
 * 转义引号：`[x](y" onclick="z)` 会闭合掉属性定界符，把 URL 尾巴变成新属性。
 *
 * 与 escapeHtml 是两个独立步骤而不是一个 escapeAttr，因为拼 HTML 的正确顺序是
 * "整段先过 escapeHtml、再按语法片段插值"——那时捕获到的文本里 `&` 已经是 `&amp;`，
 * 再跑一遍全量转义就成了 `&amp;amp;`，双重转义会把地址改坏。
 */
export function escapeQuotes(value: string): string {
  return replaceAll(value, QUOTE_CHARS, /["']/g);
}

const DECODED: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
};

/**
 * escapeHtml + escapeQuotes 的逆运算。
 *
 * 只有一处需要它：内联 HTML 片段的 Markdown 往返（见 extensions/markdown-inline-html.ts）。
 * 那边发出时把值转义成 &amp;，读回来却不会再解码，于是同一个值每导出一次就多背一层
 * 转义（& → &amp; → &amp;amp;），getMarkdown→setMarkdown→getMarkdown 直接不幂等。
 * 发与收必须成对改动，只改一边就把幂等性换掉了。
 */
export function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => DECODED[entity] ?? entity);
}
