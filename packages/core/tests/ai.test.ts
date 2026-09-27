import { describe, expect, it, vi } from 'vitest';
import { AICommandMenuManager } from '../src/index';
import { mount } from './utils';
import type { AIRequestContext } from '../src/types';

describe('AI 请求上下文', () => {
  async function contextFor(
    functionId: string,
    select?: { from: number; to: number } | number
  ): Promise<AIRequestContext> {
    const contexts: AIRequestContext[] = [];
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>hello world</p>',
      ai: {
        functions: [
          { id: 'sel', name: 's', scope: 'selection', prompt: 'C[{content}]|S[{selection}]' },
          { id: 'cur', name: 'c', scope: 'cursor', prompt: 'C[{content}]' },
          { id: 'doc', name: 'd', scope: 'document', prompt: 'C[{content}]|D[{document}]' },
          { id: 'none', name: 'n', prompt: 'C[{content}]' },
          { id: 'unk', name: 'u', prompt: 'U[{whatever}]|C[{content}]' },
        ],
        requestEndpoint: async (ctx) => {
          contexts.push(ctx);
          return { content: '' };
        },
        onError,
      },
    });

    if (typeof select === 'number') {
      editor.editor.commands.setTextSelection(select);
    } else if (select) {
      editor.editor.commands.setTextSelection(select);
    }
    await editor.ai!.execute(functionId);

    expect(onError).not.toHaveBeenCalled();
    return contexts[0];
  }

  it('scope 决定 {content} 的取值来源', async () => {
    expect((await contextFor('sel', { from: 1, to: 6 })).prompt).toBe('C[hello]|S[hello]');
    expect((await contextFor('cur', 7)).prompt).toBe('C[hello ]');
    expect((await contextFor('doc', { from: 1, to: 6 })).prompt).toBe(
      'C[hello world]|D[hello world]'
    );
  });

  it('省略 scope 时保持既有语义：选区优先，否则光标前文', async () => {
    expect((await contextFor('none', { from: 1, to: 6 })).prompt).toBe('C[hello]');
    expect((await contextFor('none', 7)).prompt).toBe('C[hello ]');
  });

  it('端点始终能拿到完整的三个上下文字段', async () => {
    const ctx = await contextFor('sel', { from: 1, to: 6 });

    expect(ctx.scope).toBe('selection');
    expect(ctx.selection).toBe('hello');
    expect(ctx.document).toBe('hello world');
    expect(ctx.functionId).toBe('sel');
  });

  it('scope 为 selection 但无选区时照常发起请求，{content} 为空', async () => {
    const ctx = await contextFor('sel', 7);

    expect(ctx.prompt).toBe('C[]|S[]');
  });

  it('未识别的模板变量原样保留', async () => {
    expect((await contextFor('unk', { from: 1, to: 6 })).prompt).toBe('U[{whatever}]|C[hello]');
  });
});

describe('AI 命令菜单键盘导航', () => {
  async function setup() {
    const executed: string[] = [];
    const editor = await mount({
      content: '<p>hello</p>',
      ai: {
        functions: [
          { id: 'first', name: '第一个', scope: 'cursor' },
          { id: 'second', name: '第二个', scope: 'cursor' },
        ],
        requestEndpoint: async (ctx) => {
          executed.push(ctx.functionId);
          return { content: '!' };
        },
      },
    });
    // jsdom 没有真实焦点，键盘处理的前置条件是编辑器处于聚焦态
    editor.editor.isFocused = true;
    // 提前捕获 DOM：销毁后再取 view.dom 会先抛错，测不到产品行为
    const dom = editor.editor.view.dom;

    const menu = () => document.querySelector('.atri-ai-command-menu');
    const activeIndex = () =>
      document.querySelector('.atri-ai-command-menu .active')?.getAttribute('data-index') ?? null;
    const press = (key: string) => {
      dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    };
    const typeSlash = () => {
      const { view } = editor.editor;
      const from = view.state.doc.content.size - 1;
      editor.editor.commands.setTextSelection(from);
      view.dispatch(view.state.tr.insertText('/', from));
    };

    return { editor, executed, menu, activeIndex, press, typeSlash };
  }

  it('输入触发字符后方向键可移动高亮，Enter 选中并清理触发字符', async () => {
    const t = await setup();
    t.typeSlash();
    expect(t.menu()).not.toBeNull();
    expect(t.activeIndex()).toBe('0');

    t.press('ArrowDown');
    expect(t.activeIndex()).toBe('1');
    t.press('ArrowUp');
    expect(t.activeIndex()).toBe('0');

    const paragraphs = t.editor.editor.state.doc.childCount;
    t.press('Enter');
    await vi.waitFor(() => {
      expect(t.executed).toEqual(['first']);
    });

    expect(t.menu()).toBeNull();
    // Enter 不能被编辑器拿去拆段，触发字符要删掉
    expect(t.editor.editor.state.doc.childCount).toBe(paragraphs);
    expect(t.editor.editor.state.doc.textContent).not.toContain('/');
    expect(t.editor.getHTML()).toContain('!');
  });

  it('Escape 只关闭菜单，不执行功能', async () => {
    const t = await setup();
    t.typeSlash();

    t.press('Escape');

    expect(t.menu()).toBeNull();
    expect(t.executed).toEqual([]);
  });

  it('菜单关闭时不抢占按键，Enter 仍由编辑器拆段', async () => {
    const t = await setup();
    const before = t.editor.editor.state.doc.childCount;
    t.editor.editor.commands.setTextSelection(t.editor.editor.state.doc.content.size - 1);

    t.press('Enter');

    expect(t.editor.editor.state.doc.childCount).toBe(before + 1);
    expect(t.executed).toEqual([]);
  });

  it('销毁后不再响应按键', async () => {
    const t = await setup();
    t.typeSlash();
    t.editor.destroy();

    expect(() => t.press('ArrowDown')).not.toThrow();
  });
});

describe('AI 失败的上报与超时', () => {
  const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  it('没配 onError 时端点报错会留下日志，而不是静默', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f' }],
        requestEndpoint: async () => {
          throw new Error('端点 500');
        },
      },
    });

    await editor.ai!.execute('f');

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).toContain('"f"');
    warn.mockRestore();
  });

  it('配了 onError 就走回调，不另外打日志', async () => {
    const warn = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f' }],
        requestEndpoint: async () => {
          throw new Error('端点 500');
        },
        onError,
      },
    });

    await editor.ai!.execute('f');

    expect(onError).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('端点返回的形状不对时按失败处理，而不是悄悄什么都不插', async () => {
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f', outputMode: 'insert' }],
        // 4xx 的 HTML 响应体是最常见的一种"看起来成功了"
        requestEndpoint: async () => undefined as never,
        onError,
      },
    });

    await editor.ai!.execute('f');

    expect(onError).toHaveBeenCalledOnce();
    expect(editor.getHTML()).toBe('<p>正文</p>');
  });

  it('空内容是合法结果：不报错，也不产出节点', async () => {
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f' }],
        requestEndpoint: async () => ({ content: '' }),
        onError,
      },
    });

    await editor.ai!.execute('f');

    expect(onError).not.toHaveBeenCalled();
  });

  it('配了 timeout 就停止等待，晚到的响应不再插进编辑器', async () => {
    const onError = vi.fn();
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f', outputMode: 'insert' }],
        requestEndpoint: async () => {
          await tick(50);
          return { content: '<p>迟到的结果</p>' };
        },
        timeout: 10,
        onError,
      },
    });

    await editor.ai!.execute('f');

    expect(onError).toHaveBeenCalledOnce();
    expect(String(onError.mock.calls[0]?.[0])).toContain('timed out');

    // 等真实响应赶回来：光标位置早已不属于那次请求，不能插
    await tick(80);
    expect(editor.getHTML()).toBe('<p>正文</p>');
  });

  it('没配 timeout 时慢响应照常落地（默认行为不变）', async () => {
    const editor = await mount({
      content: '<p>正文</p>',
      ai: {
        functions: [{ id: 'f', name: 'f', outputMode: 'insert' }],
        requestEndpoint: async () => {
          await tick(30);
          return { content: '<p>慢但有效</p>' };
        },
      },
    });

    await editor.ai!.execute('f');

    expect(editor.getHTML()).toContain('慢但有效');
  });
});

describe('AI 命令菜单销毁后的订阅', () => {
  it('destroy 之后再输入触发字符不浮出菜单', async () => {
    const editor = await mount({ content: '<p>hello</p>' });
    const menu = new AICommandMenuManager(editor.editor, [{ id: 'a', name: 'A' }], '/', () => {});

    const typeSlash = () => {
      const { view } = editor.editor;
      const pos = view.state.doc.content.size - 1;
      // 先落选区：getLastTypedChar 从 selection.from 往回看一个字符，
      // 选区停在 0 时它直接返回空串，菜单永远不会浮出
      editor.editor.commands.setTextSelection(pos);
      view.dispatch(view.state.tr.insertText('/', pos));
    };

    typeSlash();
    expect(document.querySelector('.atri-ai-command-menu')).not.toBeNull();

    menu.destroy();
    // hide() 会把菜单摘出文档，清空后才能把"没有再挂回来"和"没被摘掉"分辨开
    document.body.replaceChildren();
    typeSlash();

    expect(document.querySelector('.atri-ai-command-menu')).toBeNull();
  });
});

describe('空的 AI functions', () => {
  it('functions 为空数组时不浮出菜单，也不吃掉 Enter', async () => {
    const editor = await mount({
      content: '<p>hello</p>',
      ai: { functions: [], requestEndpoint: async () => ({ content: '!' }) },
    });
    editor.editor.isFocused = true;
    const dom = editor.editor.view.dom;

    const typeSlash = () => {
      const { view } = editor.editor;
      const pos = view.state.doc.content.size - 1;
      editor.editor.commands.setTextSelection(pos);
      view.dispatch(view.state.tr.insertText('/', pos));
    };

    typeSlash();
    expect(document.querySelector('.atri-ai-command-menu')).toBeNull();

    // 空菜单此前会 preventDefault 掉 Enter 并 selectItem(NaN)，把"换段"这个意图吞了。
    // 判据用文档变化而不是 defaultPrevented —— ProseMirror 自己的 keymap 处理成功时也会 prevent
    const before = editor.editor.state.doc.childCount;
    dom.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    );
    expect(editor.editor.state.doc.childCount).toBe(before + 1);
  });
});
