import { describe, expect, it, vi } from 'vitest';
import { createLowlight, common } from 'lowlight';
import { AtriEditor } from '@atri-editor/core';
import { createCodeHighlightExtensions, withCodeHighlight } from '../src/index';

async function mountEditor(options: Partial<ConstructorParameters<typeof AtriEditor>[0]> = {}) {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new AtriEditor({ element, toolbar: false, ...options });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

/**
 * 判据必须是 view.dom 而不是 getHTML()。
 *
 * lowlight 的分词是 ProseMirror decoration，只在视图层存在；而 Tiptap 的 getHTML()
 * 走 schema 的 renderHTML 序列化，永远看不到 decoration。拿 getHTML() 验会得出
 * "高亮没生效"的错误结论——这一点在写包 README 时也要写清楚，
 * 否则接入方会以为自己保存下来的 HTML 带着色。
 */
function viewHtmlOf(editor: AtriEditor): string {
  return editor.editor.view.dom.innerHTML;
}

const JS_SNIPPET = '```javascript\nconst answer = 42;\n```';

describe('@atri-editor/code-highlight', () => {
  it('装上之后视图里真的产出分词 span', async () => {
    const editor = await mountEditor(withCodeHighlight({ lowlight: createLowlight(common) }));
    editor.setMarkdown(JS_SNIPPET);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const html = viewHtmlOf(editor);
    expect(html).toContain('hljs-keyword');
    expect(html).toContain('hljs-number');
    editor.destroy();
  });

  it('不装时视图里没有分词 span（对照，证明上一条不是白过）', async () => {
    const editor = await mountEditor();
    editor.setMarkdown(JS_SNIPPET);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(viewHtmlOf(editor)).not.toContain('hljs-');
    editor.destroy();
  });

  it('codeBlock 只剩一个实现——内置的那个确实被关掉了', async () => {
    const editor = await mountEditor(withCodeHighlight({ lowlight: createLowlight(common) }));
    const registered = editor.editor.extensionManager.extensions.filter(
      (ext) => ext.name === 'codeBlock'
    );

    expect(registered).toHaveLength(1);
    expect(editor.editor.schema.nodes.codeBlock).toBeTruthy();
    editor.destroy();
  });

  it('只传扩展不关内置时也能出高亮，但会打一句重名 warning', async () => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warned.push(args.join(' '));
    });

    const editor = await mountEditor({
      extensions: createCodeHighlightExtensions({ lowlight: createLowlight(common) }),
    });
    editor.setMarkdown(JS_SNIPPET);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const registered = editor.editor.extensionManager.extensions.filter(
      (ext) => ext.name === 'codeBlock'
    );
    expect(registered).toHaveLength(2);
    // 后注册的赢，所以这条路是"能工作"的——不是静默失效。
    // 但它靠的是 ExtensionManager 的去重顺序，且 tiptap 每建一次编辑器都要喊一嗓子
    expect(viewHtmlOf(editor)).toContain('hljs-keyword');
    expect(warned.filter((line) => line.includes('Duplicate extension names'))).toHaveLength(1);

    editor.destroy();
    spy.mockRestore();
  });

  it('withCodeHighlight 不留那条重名 warning', async () => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warned.push(args.join(' '));
    });

    const editor = await mountEditor(withCodeHighlight({ lowlight: createLowlight(common) }));
    editor.setMarkdown(JS_SNIPPET);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(viewHtmlOf(editor)).toContain('hljs-keyword');
    expect(warned.join(' ')).not.toContain('Duplicate extension names');

    editor.destroy();
    spy.mockRestore();
  });

  it('围栏语法与 language 属性照常往返', async () => {
    const editor = await mountEditor(withCodeHighlight({ lowlight: createLowlight(common) }));
    editor.setMarkdown(JS_SNIPPET);

    const markdown = editor.getMarkdown();
    expect(markdown).toContain('```javascript');

    editor.setMarkdown(markdown);
    expect(editor.getMarkdown()).toBe(markdown);
    expect(editor.getHTML()).toContain('class="language-javascript"');
    editor.destroy();
  });

  it('codeBlock:false 而不带替代实现时，节点不在、顶栏项也不注册', async () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new AtriEditor({
      element,
      toolbar: { bubble: false },
      codeBlock: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(editor.editor.schema.nodes.codeBlock).toBeUndefined();
    // 不是"摆了个按不动的灰按钮"，而是整项不存在：能力不在就没有这一项，
    // 与 table:false / media:false 同一套做法。曾经的写法会在每次事务里抛
    // "editor.can(...).toggleCodeBlock is not a function"
    const ids = Array.from(element.querySelectorAll<HTMLElement>('[data-toolbar-item]')).map((el) =>
      el.getAttribute('data-toolbar-item')
    );
    expect(ids).not.toContain('codeBlock');
    // 而替代实现到位时这一项照常回来：关掉的只是内置那份，不是能力本身
    expect(ids).toContain('bold');
    editor.destroy();
  });

  it('用 withCodeHighlight 时代码块按钮还在（节点由 lowlight 版提供）', async () => {
    const editor = await mountEditor({
      toolbar: { bubble: false },
      ...withCodeHighlight({ lowlight: createLowlight(common) }),
    });

    const ids = Array.from(
      editor.editor.view.dom.ownerDocument.querySelectorAll<HTMLElement>('[data-toolbar-item]')
    ).map((el) => el.getAttribute('data-toolbar-item'));
    expect(ids).toContain('codeBlock');
    editor.destroy();
  });

  it('没给 lowlight 实例时抛出一条说得出下一步的错', () => {
    expect(() => createCodeHighlightExtensions({} as never)).toThrow(/createLowlight/);
    expect(() => withCodeHighlight({ lowlight: null } as never)).toThrow(/lowlight instance/);
  });

  it('defaultLanguage 与 languageClassPrefix 透传给上游', async () => {
    const editor = await mountEditor(
      withCodeHighlight({ lowlight: createLowlight(common), languageClassPrefix: 'lang-' })
    );
    editor.setMarkdown('```python\nx = 1\n```');

    expect(editor.getHTML()).toContain('class="lang-python"');
    editor.destroy();
  });
});
