import { describe, expect, it, vi } from 'vitest';
import type { AIResponse, AtriAIConfig } from '../src/types';
import { AICommandMenuManager } from '../src/ai/AICommandMenu';
import { mount, stubGeometry } from './utils';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pendingAI(overrides: Partial<AtriAIConfig> = {}) {
  const response = deferred<AIResponse>();
  const onError = vi.fn();
  const afterRender = vi.fn();
  const config: AtriAIConfig = {
    functions: [{ id: 'rewrite', name: 'Rewrite', outputMode: 'replace' }],
    requestEndpoint: () => response.promise,
    onError,
    interceptors: { afterRender },
    ...overrides,
  };
  return { response, onError, afterRender, config };
}

describe('AI request targets', () => {
  it.each(['replace', 'insert'] as const)(
    'keeps the original range in %s mode',
    async (outputMode) => {
      const ai = pendingAI({ functions: [{ id: 'rewrite', name: 'Rewrite', outputMode }] });
      const editor = await mount({ content: '<p>alpha beta</p>', ai: ai.config });
      editor.editor.commands.setTextSelection({ from: 1, to: 6 });
      const pending = editor.ai!.execute('rewrite');
      editor.editor.commands.setTextSelection({ from: 7, to: 11 });
      ai.response.resolve({ content: 'ALPHA', contentType: 'text' });
      await pending;
      expect(editor.editor.state.doc.textContent).toBe('ALPHA beta');
      expect(ai.onError).not.toHaveBeenCalled();
    }
  );

  it('maps the range through edits before it and in other paragraphs', async () => {
    const ai = pendingAI();
    const editor = await mount({ content: '<p>alpha beta</p><p>tail</p>', ai: ai.config });
    editor.editor.commands.setTextSelection({ from: 7, to: 11 });
    const pending = editor.ai!.execute('rewrite');
    editor.editor.commands.insertContentAt(1, 'prefix ');
    editor.editor.commands.insertContentAt(editor.editor.state.doc.content.size - 1, '!');
    ai.response.resolve({ content: 'BETA' });
    await pending;
    expect(editor.editor.state.doc.textContent).toBe('prefix alpha BETAtail!');
    expect(ai.onError).not.toHaveBeenCalled();
  });

  it.each(['edit', 'delete', 'format', 'replace-document', 'readonly', 'cursor-input'] as const)(
    'invalidates the response after %s',
    async (change) => {
      const ai = pendingAI();
      const editor = await mount({ content: '<p>alpha beta</p>', ai: ai.config });
      editor.editor.commands.setTextSelection({ from: 1, to: change === 'cursor-input' ? 1 : 6 });
      const pending = editor.ai!.execute('rewrite');
      switch (change) {
        case 'edit':
          editor.editor.commands.insertContentAt(3, 'x');
          break;
        case 'delete':
          editor.editor.commands.deleteRange({ from: 1, to: 6 });
          break;
        case 'format':
          editor.editor.commands.toggleBold();
          break;
        case 'replace-document':
          editor.setContent('<p>new</p>');
          break;
        case 'readonly':
          editor.setEditable(false);
          break;
        case 'cursor-input':
          editor.editor.commands.insertContent('x');
          break;
      }
      const before = editor.getHTML();
      await pending;
      ai.response.resolve({ content: 'LATE' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(editor.getHTML()).toBe(before);
      expect(ai.onError).toHaveBeenCalledOnce();
      expect(ai.onError.mock.calls[0][0].name).toBe('AIResultInvalidatedError');
      expect(ai.afterRender).not.toHaveBeenCalled();
    }
  );

  it.each(['destroy', 'rebuild'] as const)('ignores late responses after %s', async (action) => {
    const afterPost = vi.fn((response: AIResponse) => response);
    const beforeRender = vi.fn((content: string) => content);
    const ai = pendingAI();
    ai.config.interceptors = { afterPost, beforeRender, afterRender: ai.afterRender };
    const editor = await mount({ content: '<p>alpha</p>', ai: ai.config });
    const pending = editor.ai!.execute('rewrite');
    await Promise.resolve();
    if (action === 'destroy') editor.destroy();
    else editor.registerNodeViews([]);
    await pending;
    ai.response.resolve({ content: 'LATE' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    if (action === 'rebuild') expect(editor.getHTML()).not.toContain('LATE');
    expect(ai.onError).not.toHaveBeenCalled();
    expect(afterPost).not.toHaveBeenCalled();
    expect(beforeRender).not.toHaveBeenCalled();
    expect(ai.afterRender).not.toHaveBeenCalled();
  });

  it('cleans up timed out requests and blocks late host callbacks', async () => {
    const afterPost = vi.fn((response: AIResponse) => response);
    const ai = pendingAI({ timeout: 5, interceptors: { afterPost } });
    const editor = await mount({ content: '<p>alpha</p>', ai: ai.config });
    await editor.ai!.execute('rewrite');
    expect(ai.onError).toHaveBeenCalledOnce();
    expect(ai.onError.mock.calls[0][0].message).toContain('timed out');
    editor.editor.commands.insertContentAt(2, 'x');
    ai.response.resolve({ content: 'LATE' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getHTML()).toBe('<p>axlpha</p>');
    expect(afterPost).not.toHaveBeenCalled();
    expect(ai.onError).toHaveBeenCalledOnce();
  });

  it('applies concurrent disjoint requests to their own mapped ranges', async () => {
    const first = deferred<AIResponse>();
    const second = deferred<AIResponse>();
    const endpoint = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const ai = pendingAI({ requestEndpoint: endpoint });
    const editor = await mount({ content: '<p>alpha beta</p>', ai: ai.config });
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    const a = editor.ai!.execute('rewrite');
    editor.editor.commands.setTextSelection({ from: 7, to: 11 });
    const b = editor.ai!.execute('rewrite');
    first.resolve({ content: 'A' });
    await a;
    second.resolve({ content: 'B' });
    await b;
    expect(editor.editor.state.doc.textContent).toBe('A B');
    expect(ai.onError).not.toHaveBeenCalled();
  });

  it('appends at the current end after unrelated edits', async () => {
    const ai = pendingAI({ functions: [{ id: 'rewrite', name: 'Rewrite', outputMode: 'append' }] });
    const editor = await mount({ content: '<p>alpha</p>', ai: ai.config });
    editor.editor.commands.setTextSelection(3);
    const pending = editor.ai!.execute('rewrite');
    editor.editor.commands.insertContentAt(1, 'prefix ');
    ai.response.resolve({ content: '<p>last</p>' });
    await pending;
    expect(editor.getHTML()).toBe('<p>prefix alpha</p><p>last</p>');
  });

  it('invalidates append output when its original input target changes', async () => {
    const ai = pendingAI({ functions: [{ id: 'rewrite', name: 'Rewrite', outputMode: 'append' }] });
    const editor = await mount({ content: '<p>alpha</p>', ai: ai.config });
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    const pending = editor.ai!.execute('rewrite');
    editor.editor.commands.insertContentAt(3, 'x');
    await pending;
    ai.response.resolve({ content: '<p>outdated</p>' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(editor.getHTML()).toBe('<p>alxpha</p>');
    expect(ai.onError.mock.calls[0][0].name).toBe('AIResultInvalidatedError');
  });

  it.each(['endpoint', 'beforeRender'] as const)(
    'keeps the document when %s returns empty output',
    async (source) => {
      const ai = pendingAI();
      if (source === 'beforeRender') ai.config.interceptors!.beforeRender = () => '';
      const editor = await mount({ content: '<p>alpha beta</p>', ai: ai.config });
      editor.editor.commands.setTextSelection({ from: 1, to: 6 });
      const pending = editor.ai!.execute('rewrite');
      ai.response.resolve({ content: source === 'endpoint' ? '' : 'discard' });
      await pending;
      expect(editor.getHTML()).toBe('<p>alpha beta</p>');
      expect(ai.onError).not.toHaveBeenCalled();
      expect(ai.afterRender).not.toHaveBeenCalled();
    }
  );

  it.each([true, false])('preserves text when Markdown conversion is %s', async (convert) => {
    const ai = pendingAI({ autoTranslateMarkdownToHTML: convert });
    const editor = await mount({ content: '<p>alpha</p>', ai: ai.config });
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    const pending = editor.ai!.execute('rewrite');
    ai.response.resolve({ content: 'Use <b>bold</b> &  spaces\nnext', contentType: 'text' });
    await pending;
    expect(editor.getHTML()).toBe('<p>Use &lt;b&gt;bold&lt;/b&gt; &amp;  spaces<br>next</p>');
  });
});

describe('AI menu trigger lifetime', () => {
  it.each(['delete', 'move', 'blur', 'readonly'] as const)('closes after %s', async (action) => {
    const endpoint = vi.fn(async () => ({ content: 'AI' }));
    const editor = await mount({
      content: '<p>abc</p>',
      ai: {
        functions: [{ id: 'f', name: 'F' }],
        requestEndpoint: endpoint,
      },
    });
    stubGeometry(editor);
    editor.editor.isFocused = true;
    editor.editor.commands.setTextSelection(4);
    editor.editor.commands.insertContent('/');
    expect(document.querySelector('.atri-ai-command-menu')).not.toBeNull();
    switch (action) {
      case 'delete':
        editor.editor.commands.deleteRange({ from: 4, to: 5 });
        break;
      case 'move':
        editor.editor.commands.setTextSelection(1);
        break;
      case 'blur':
        editor.editor.emit('blur', {
          editor: editor.editor,
          event: new FocusEvent('blur'),
          transaction: editor.editor.state.tr,
        });
        break;
      case 'readonly':
        editor.setEditable(false);
        break;
    }
    expect(document.querySelector('.atri-ai-command-menu')).toBeNull();
    expect(endpoint).not.toHaveBeenCalled();
    if (action === 'delete') {
      editor.editor.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
      expect(editor.editor.state.doc.childCount).toBe(2);
      expect(endpoint).not.toHaveBeenCalled();
    }
  });

  it('still supports a manually opened menu without deleting unrelated text', async () => {
    const editor = await mount({ content: '<p>abc/</p>' });
    const selected = vi.fn();
    const menu = new AICommandMenuManager(editor.editor, [{ id: 'f', name: 'F' }], '/', selected);
    editor.editor.commands.setTextSelection(5);
    menu.show();
    menu.handleKeyDown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(editor.editor.state.doc.textContent).toBe('abc/');
    expect(selected).toHaveBeenCalledOnce();
    menu.destroy();
  });
});
