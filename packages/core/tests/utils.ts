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

/**
 * 顶栏按钮：浮层挂在同一个 root 里且用的是同一套 data-toolbar-item，
 * 所以要限定在顶栏容器内查，不然浮出时会被一起数进去
 */
export function toolbarButtons(editor: AtriEditor): HTMLButtonElement[] {
  return Array.from(
    rootOf(editor).querySelectorAll<HTMLButtonElement>('.atri-editor-toolbar [data-toolbar-item]')
  );
}

export function toolbarTitles(editor: AtriEditor): string[] {
  return toolbarButtons(editor).map((button) => button.title);
}

/**
 * 浮动工具栏元素：插件每次隐藏都会把它摘出文档，所以只有显示中才在 DOM 里查得到
 * 这也正是"有没有浮出"的判据，jsdom 里没有排版，别去断言坐标
 */
export function bubbleRoot(editor: AtriEditor): HTMLDivElement | null {
  return rootOf(editor).querySelector<HTMLDivElement>('.atri-editor-bubble-toolbar');
}

export function bubbleItems(editor: AtriEditor): string[] {
  return Array.from(
    bubbleRoot(editor)?.querySelectorAll<HTMLButtonElement>('[data-toolbar-item]') ?? []
  ).map((button) => button.getAttribute('data-toolbar-item') ?? '');
}

/**
 * 桩掉选区排版：jsdom 的 Range 根本没有 getClientRects，而 BubbleMenu 从 coordsAtPos
 * 一路到 computePosition 整条链都没有 catch，不桩这一步选个文字就直接抛
 */
export function stubGeometry(editor: AtriEditor): void {
  editor.editor.view.coordsAtPos = () => ({ top: 10, bottom: 26, left: 12, right: 60 });
}

afterEach(() => {
  while (created.length) {
    created.pop()?.destroy();
  }
  document.body.innerHTML = '';
});
