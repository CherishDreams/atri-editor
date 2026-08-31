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

/**
 * 浮层当前算的是哪一组：mode 由 shouldShow 直接写在容器上，null 即没浮出
 */
export function bubbleMode(editor: AtriEditor): string | null {
  return bubbleRoot(editor)?.dataset.atriBubbleMode ?? null;
}

/**
 * 按分组取按钮 id，跟这一组当前显不显示无关
 *
 * 两组按钮一次都渲染在同一个盒子里，隐藏那组靠 CSS 的 display:none，
 * jsdom 里没有排版也就能照样查结构
 */
export function bubbleGroupItems(editor: AtriEditor, group: string): string[] {
  const buttons = bubbleRoot(editor)?.querySelectorAll<HTMLButtonElement>(
    `[data-atri-bubble-group="${group}"] [data-toolbar-item]`
  );

  return Array.from(buttons ?? []).map((button) => button.getAttribute('data-toolbar-item') ?? '');
}

/**
 * 浮出来的按钮：只算当前那一组，另一组虽然挂在同一个盒子里，但用户看不见它
 */
export function bubbleItems(editor: AtriEditor): string[] {
  const mode = bubbleMode(editor);
  return mode ? bubbleGroupItems(editor, mode) : [];
}

/**
 * 把文档里第一个该类型的节点整节点选中
 *
 * 插入命令收尾不一定留下 NodeSelection（图片留的就是光标），而浏览器里点一下卡片
 * 本来就是选中，这一步得自己补上。选不到就直接抛，别留着旧选区断言出假阳性
 */
export function selectNode(editor: AtriEditor, nodeName: string): void {
  let pos = -1;
  editor.editor.state.doc.descendants((node, nodePos) => {
    if (pos < 0 && node.type.name === nodeName) pos = nodePos;
  });
  if (pos < 0) throw new Error(`Node "${nodeName}" is not in the document`);
  if (!editor.editor.commands.setNodeSelection(pos)) {
    throw new Error(`Node "${nodeName}" at ${pos} is not selectable`);
  }
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
