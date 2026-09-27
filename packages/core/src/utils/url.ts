/**
 * URL 协议白名单
 *
 * 库里有五条来源会把 URL 写进可点击的 DOM 属性：宿主调 insertImage/insertAttachment、
 * 上传服务的响应体、外部粘贴的 HTML、setJSON 回灌、以及节点属性的 setNodeMarkup。
 * 逐条在入口校验拦不住全部——只有渲染层是唯一的收口点，所以校验放在 renderHTML。
 */

/** 可点击地址：data: 会让 javascript: / data:text/html 点击即导航执行，故不在列 */
const HREF_SCHEMES = ['http', 'https', 'mailto', 'tel', 'ftp', 'ftps'] as const;

/** 媒体资源地址：blob: 是本地预览、data: 是上传失败后的内联退路，两者都必须留 */
const MEDIA_SCHEMES = ['http', 'https', 'data', 'blob'] as const;

/**
 * 浏览器解析 URL 前会做的清理：任意位置的 tab/CR/LF 被删掉，首尾的 C0 控制符与空格被剥掉。
 * 不先做这一步，`java\tscript:` 与 `\x01javascript:` 这类写法就会绕过前缀匹配。
 * 用 charCodeAt 而不是正则字符类，是为了不在库源码里压制 no-control-regex。
 */
function stripUrlNoise(value: string): string {
  const collapsed = value.replace(/[\t\n\r]/g, '');

  let start = 0;
  let end = collapsed.length;
  while (start < end && isStripped(collapsed.charCodeAt(start))) start += 1;
  while (end > start && isStripped(collapsed.charCodeAt(end - 1))) end -= 1;

  return collapsed.slice(start, end);
}

function isStripped(code: number): boolean {
  return code <= 0x20 || code === 0x7f;
}

/** scheme 必须是字母开头，后跟字母数字或 + - . */
const SCHEME_PREFIX = /^([a-z][a-z0-9+.-]*):/i;

/**
 * 校验 URL 的协议是否安全，返回清洗后的地址；不接受时返回 null。
 *
 * 没有 scheme 的相对路径（/files/a.pdf、a.pdf、#anchor、?q=1）一律放行：
 * 附件与图片的常见部署形态就是同源相对路径，按协议拦会把正常用法打断。
 */
export function safeHref(value: unknown, schemes: readonly string[] = HREF_SCHEMES): string | null {
  if (typeof value !== 'string') return null;

  const url = stripUrlNoise(value);
  if (!url) return null;

  const scheme = SCHEME_PREFIX.exec(url)?.[1];
  if (!scheme) return url;

  return schemes.includes(scheme.toLowerCase()) ? url : null;
}

/**
 * 校验图片 / 附件的资源地址：比 href 多允许 data: 与 blob:，
 * 因为「本地预览 → 上传完成后换成服务端地址」这条链路全程依赖它们。
 */
export function safeMediaSrc(value: unknown): string | null {
  return safeHref(value, MEDIA_SCHEMES);
}
