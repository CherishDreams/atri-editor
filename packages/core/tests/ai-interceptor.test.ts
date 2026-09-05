import { describe, expect, it, vi } from 'vitest';
import { AIInterceptor } from '../src/ai/AIInterceptor';
import { MarkdownService } from '../src/core/MarkdownService';
import { mount } from './utils';
import type { AIRequestContext, AIResponse, AtriAIInterceptors } from '../src/types';

const ctx: AIRequestContext = {
  functionId: 'f',
  selection: '',
  cursorContext: '',
  document: '',
};

describe('AIInterceptor 拦截器链', () => {
  it('没有拦截器时各环节原样通过', async () => {
    const interceptor = new AIInterceptor();
    const response = { content: 'x' };

    expect(await interceptor.runBeforePost(ctx)).toBe(ctx);
    expect(await interceptor.runAfterPost(response, ctx)).toBe(response);
    expect(await interceptor.runBeforeRender('x', ctx)).toBe('x');
    expect(await interceptor.runAfterRender('x', ctx)).toBeUndefined();
  });

  it('beforePost 返回 false 取消请求，端点与插入都不执行', async () => {
    const endpoint = vi.fn(async () => ({ content: '' }));
    const insert = vi.fn();
    const interceptor = new AIInterceptor({ beforePost: () => false });

    await interceptor.executeChain(ctx, endpoint, insert);

    expect(endpoint).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('beforePost 修改后的上下文交给端点，afterPost 可改写响应', async () => {
    const endpoint = vi.fn(async (c: AIRequestContext): Promise<AIResponse> => ({
      content: typeof c.extra?.tag === 'string' ? c.extra.tag : '',
    }));
    const insert = vi.fn();
    const interceptors: AtriAIInterceptors = {
      beforePost: (c) => ({ ...c, extra: { tag: 'modified' } }),
      afterPost: (response) => ({ ...response, content: `${response.content}!` }),
    };

    await new AIInterceptor(interceptors).executeChain(ctx, endpoint, insert);

    expect(endpoint).toHaveBeenCalledWith(expect.objectContaining({ extra: { tag: 'modified' } }));
    expect(insert).toHaveBeenCalledWith('modified!');
  });

  it('beforeRender 在自动转换之前改写内容，afterRender 收到最终内容', async () => {
    const beforeRender = vi.fn((content: string) => content.toUpperCase());
    const afterRender = vi.fn();
    const insert = vi.fn();
    const interceptors: AtriAIInterceptors = {
      beforeRender,
      afterRender,
    };

    await new AIInterceptor(interceptors, null, true).executeChain(
      ctx,
      async () => ({ content: '# hi', contentType: 'markdown' }),
      insert
    );

    expect(beforeRender).toHaveBeenCalledWith('# hi', ctx);
    expect(insert).toHaveBeenCalledWith(expect.stringContaining('<h1>HI</h1>'));
    expect(afterRender).toHaveBeenCalledWith('<h1>HI</h1>', ctx);
  });

  it('contentType 为 markdown 时经 MarkdownService 转 HTML，其他类型原样返回', async () => {
    const editor = await mount({ content: '<p></p>' });
    const markdownService = new MarkdownService(editor.editor);
    const interceptor = new AIInterceptor({}, markdownService, true);

    expect(
      await interceptor.runAutoTranslateMarkdown('# hi', {
        content: '# hi',
        contentType: 'markdown',
      })
    ).toContain('<h1>hi</h1>');
    expect(await interceptor.runAutoTranslateMarkdown('# hi', { content: '# hi' })).toBe('# hi');
  });

  it('未开启自动转换时原样返回；缺 markdownService 时降级 simpleMarkdownToHtml', async () => {
    const disabled = new AIInterceptor({}, null, false);
    expect(
      await disabled.runAutoTranslateMarkdown('# hi', { content: '# hi', contentType: 'markdown' })
    ).toBe('# hi');

    const degraded = new AIInterceptor({}, null, true);
    expect(
      await degraded.runAutoTranslateMarkdown('# hi', { content: '# hi', contentType: 'markdown' })
    ).toContain('<h1>hi</h1>');
  });
});
