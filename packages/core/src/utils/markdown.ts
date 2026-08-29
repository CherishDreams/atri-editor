/**
 * Markdown 工具函数
 */

/**
 * 简单的 Markdown 转 HTML（用于 AI 响应处理）
 * 注意：完整的 Markdown 解析由 @tiptap/markdown 处理
 * 这里仅提供基础的 Markdown 语法转换
 */
export function simpleMarkdownToHtml(markdown: string): string {
  let html = markdown;

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // 粗体和斜体
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // 代码块
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  // 图片：必须先于链接，否则 ![alt](src) 会被下面的链接规则从 ! 之后开始匹配，吞成一个 <a>
  html = html.replace(
    /!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"([^"]*)")?\s*\)/g,
    (_all, alt, src, title) => `<img src="${src}" alt="${alt}"${title ? ` title="${title}"` : ''}>`
  );

  // 链接
  html = html.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  // 列表
  html = html.replace(/^\* (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li>$2</li>');

  // 段落
  html = html.replace(/\n\n/g, '</p><p>');
  html = `<p>${html}</p>`;

  // 清理空段落
  html = html.replace(/<p><\/p>/g, '');
  html = html.replace(/<p>(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)<\/p>/g, '$1');
  html = html.replace(/<p>(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)<\/p>/g, '$1');
  html = html.replace(/<p>(<li>)/g, '$1');
  html = html.replace(/(<\/li>)<\/p>/g, '$1');

  return html;
}

/**
 * 简单的 HTML 转 Markdown
 */
export function simpleHtmlToMarkdown(html: string): string {
  let md = html;

  // 标题
  md = md.replace(/<h1[^>]*>(.+?)<\/h1>/gi, '# $1\n\n');
  md = md.replace(/<h2[^>]*>(.+?)<\/h2>/gi, '## $1\n\n');
  md = md.replace(/<h3[^>]*>(.+?)<\/h3>/gi, '### $1\n\n');

  // 粗体和斜体
  md = md.replace(/<strong[^>]*>(.+?)<\/strong>/gi, '**$1**');
  md = md.replace(/<b[^>]*>(.+?)<\/b>/gi, '**$1**');
  md = md.replace(/<em[^>]*>(.+?)<\/em>/gi, '*$1*');
  md = md.replace(/<i[^>]*>(.+?)<\/i>/gi, '*$1*');

  // 链接
  md = md.replace(/<a[^>]*href="([^"]*)"[^>]*>(.+?)<\/a>/gi, '[$2]($1)');

  // 图片：必须赶在剥除剩余标签之前，<img> 是自闭合的，被剥掉就再也找不回 src
  md = md.replace(/<img\b[^>]*>/gi, (tag) => {
    const src = /src="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const alt = /alt="([^"]*)"/i.exec(tag)?.[1] ?? '';
    return src ? `![${alt}](${src})` : alt;
  });

  // 代码
  md = md.replace(/<code[^>]*>(.+?)<\/code>/gi, '`$1`');
  md = md.replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');

  // 段落和换行
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '$1\n\n');

  // 移除剩余标签
  md = md.replace(/<[^>]+>/g, '');

  // 解码 HTML 实体
  md = md.replace(/&amp;/g, '&');
  md = md.replace(/&lt;/g, '<');
  md = md.replace(/&gt;/g, '>');
  md = md.replace(/&quot;/g, '"');
  md = md.replace(/&#39;/g, "'");

  // 清理多余空行
  md = md.replace(/\n{3,}/g, '\n\n');

  return md.trim();
}
