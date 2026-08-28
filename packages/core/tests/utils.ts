import { afterEach } from 'vitest';
import { AtriEditor } from '../src/index';
import type { AtriEditorOptions } from '../src/types';

const created: AtriEditor[] = [];

/**
 * 挂载一个测试编辑器实例，默认不渲染工具栏，测试结束后自动销毁
 * 需要等一个宏任务：Tiptap v3 在 setTimeout 里才 emit create，
 * 依赖 onCreate 的链路（AI 命令菜单）在那之后才建立
 */
export async function mount(options: Partial<AtriEditorOptions> = {}): Promise<AtriEditor> {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = new AtriEditor({
    ...options,
    element,
    toolbar: options.toolbar ?? false,
  });
  created.push(editor);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return editor;
}

/**
 * 取某个编辑器自己的容器，避免同一页面内多个编辑器互相干扰断言
 */
export function rootOf(editor: AtriEditor): HTMLElement {
  const element = editor.editor.options.element as HTMLElement | null;
  const root = element?.closest<HTMLElement>('.atri-editor');
  if (!root) {
    throw new Error('Atri Editor root element not found');
  }
  return root;
}

export function toolbarButtons(editor: AtriEditor): HTMLButtonElement[] {
  return Array.from(rootOf(editor).querySelectorAll<HTMLButtonElement>('[data-toolbar-item]'));
}

export function toolbarTitles(editor: AtriEditor): string[] {
  return toolbarButtons(editor).map((button) => button.title);
}

afterEach(() => {
  while (created.length) {
    created.pop()?.destroy();
  }
  document.body.innerHTML = '';
});
