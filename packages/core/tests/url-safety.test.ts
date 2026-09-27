import { afterEach, describe, expect, it, vi } from 'vitest';
import { safeHref, safeMediaSrc } from '../src/utils/url';
import { escapeHtml, escapeQuotes } from '../src/utils/escape';
import { runSafely } from '../src/utils/safe-call';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('safeHref', () => {
  it('放行常见协议与相对路径', () => {
    expect(safeHref('https://example.com/a.pdf')).toBe('https://example.com/a.pdf');
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('mailto:someone@example.com')).toBe('mailto:someone@example.com');
    expect(safeHref('tel:+8613800000000')).toBe('tel:+8613800000000');
    // 同源相对路径是附件最常见的部署形态，按协议拦会打断正常用法
    expect(safeHref('/files/a.pdf')).toBe('/files/a.pdf');
    expect(safeHref('a.pdf')).toBe('a.pdf');
    expect(safeHref('./docs/a.pdf')).toBe('./docs/a.pdf');
    expect(safeHref('?q=1')).toBe('?q=1');
  });

  it('拒绝可执行协议', () => {
    expect(safeHref('javascript:alert(1)')).toBeNull();
    expect(safeHref('JaVaScRiPt:alert(1)')).toBeNull();
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
    // blob: 指向内容可控的本地对象，不放进可点击地址的白名单
    expect(safeHref('blob:https://example.com/uuid')).toBeNull();
  });

  it('拒绝靠空白与控制符绕过前缀匹配的写法', () => {
    expect(safeHref('  javascript:alert(1)')).toBeNull();
    expect(safeHref('java\tscript:alert(1)')).toBeNull();
    expect(safeHref('java\nscript:alert(1)')).toBeNull();
    expect(safeHref('\x01javascript:alert(1)')).toBeNull();
  });

  it('空值与非字符串返回 null，不返回空串', () => {
    expect(safeHref('')).toBeNull();
    expect(safeHref('   ')).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(123)).toBeNull();
  });

  it('允许调用方换一套协议白名单', () => {
    expect(safeHref('blob:https://example.com/uuid')).toBeNull();
    expect(safeHref('blob:https://example.com/uuid', ['blob'])).toBe(
      'blob:https://example.com/uuid'
    );
  });
});

describe('safeMediaSrc', () => {
  it('比 href 多放行 data: 与 blob:', () => {
    // 本地预览地址与上传失败后的内联退路全靠这两条
    expect(safeMediaSrc('blob:https://example.com/uuid')).toBe('blob:https://example.com/uuid');
    expect(safeMediaSrc('data:image/png;base64,iVBORw0KGgo=')).toBe(
      'data:image/png;base64,iVBORw0KGgo='
    );
    expect(safeMediaSrc('/img/a.png')).toBe('/img/a.png');
  });

  it('仍然拒绝需要点击才生效的可执行协议', () => {
    expect(safeMediaSrc('javascript:alert(1)')).toBeNull();
    expect(safeMediaSrc('vbscript:msgbox(1)')).toBeNull();
  });

  it('只管协议，不管内容形状', () => {
    // 上传响应体是不是 HTML 错误页，由 Uploader 的形状校验负责；
    // 在这里顺手挡掉会让"无 scheme 即相对路径"这条规则有了例外
    expect(safeMediaSrc('<!DOCTYPE html>')).toBe('<!DOCTYPE html>');
  });
});

describe('escapeHtml', () => {
  it('转义文本节点里的破出字符', () => {
    expect(escapeHtml('<img src=x onerror=alert(1)>')).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(escapeHtml('a & b')).toBe('a &amp; b');
    expect(escapeHtml('plain 文本')).toBe('plain 文本');
  });
});

describe('escapeQuotes', () => {
  it('只处理引号，不重复转义已经转过的 & < >', () => {
    expect(escapeQuotes('y" onclick="z')).toBe('y&quot; onclick=&quot;z');
    expect(escapeQuotes("it's")).toBe('it&#39;s');
    // 与 escapeHtml 是两个独立步骤：拼 HTML 时先整段 escapeHtml，捕获到的片段再过这里。
    // 合成一个全量转义会把它变成 &amp;amp;，地址与文字都跟着改坏
    expect(escapeQuotes('a &amp; b')).toBe('a &amp; b');
    expect(escapeQuotes('<a>')).toBe('<a>');
  });
});

describe('runSafely', () => {
  it('没配回调时静默返回', () => {
    expect(() => runSafely(undefined, 'onChange')).not.toThrow();
    expect(() => runSafely(null, 'onChange')).not.toThrow();
    expect(() => runSafely('not a function', 'onChange')).not.toThrow();
  });

  it('正常调用并透传参数', () => {
    const seen: unknown[] = [];
    runSafely((a: unknown, b: unknown) => seen.push(a, b), 'cb', [1, 2]);
    expect(seen).toEqual([1, 2]);
  });

  it('回调抛错时降级成日志，不打断调用方', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let reached = false;

    expect(() => {
      runSafely(() => {
        throw new Error('boom');
      }, 'onChange');
      reached = true;
    }).not.toThrow();

    expect(reached).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]?.[0])).toContain('"onChange"');
  });

  it('同一个坏回调反复触发只报一次，换引用后重新计', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const bad = () => {
      throw new Error('boom');
    };

    for (let i = 0; i < 5; i++) runSafely(bad, 'onUpdate');
    runSafely(bad, 'onUpdate');
    expect(spy).toHaveBeenCalledTimes(1);

    runSafely(() => {
      throw new Error('another');
    }, 'onUpdate');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
