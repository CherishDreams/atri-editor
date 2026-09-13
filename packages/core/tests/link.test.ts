import { describe, expect, it } from 'vitest';
import type { AtriEditor, AtriLinkConfig } from '../src/index';
import { buttonOf, click, mount, pointerDownOn, pressEscape, stubGeometry } from './utils';

/** 浮层挂在 document.body 上，与图片 / 附件插入浮层同一套底盘 */
function panel(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.atri-link-panel');
}

function urlInput(): HTMLInputElement {
  const input = panel()?.querySelector<HTMLInputElement>('.atri-link-panel-url');
  if (!input) throw new Error('link panel url input not found');
  return input;
}

function targetCheckbox(): HTMLInputElement {
  const input = panel()?.querySelector<HTMLInputElement>('.atri-link-panel-target input');
  if (!input) throw new Error('link panel target checkbox not found');
  return input;
}

function action(name: 'apply' | 'remove'): HTMLButtonElement {
  const button = panel()?.querySelector<HTMLButtonElement>(`.atri-link-panel-${name}`);
  if (!button) throw new Error(`link panel "${name}" button not found`);
  return button;
}

function settled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** 落到编辑器实例上的链接选项：点击行为归扩展管，只有在配置这一层验得到 */
function linkOptions(editor: AtriEditor): {
  openOnClick?: boolean;
  markdownLinks?: boolean;
  HTMLAttributes?: { target?: string };
} {
  const link = editor.editor.extensionManager.extensions.find(
    (extension) => extension.name === 'link'
  );
  if (!link) throw new Error('link extension is not registered');
  return link.options as ReturnType<typeof linkOptions>;
}

/**
 * 带工具栏挂一个编辑器并桩掉排版：选区一变浮动工具栏就要量位置，
 * 而 jsdom 的 Range 没有 getClientRects
 */
async function mountEditor(
  content = '<p>hello world</p>',
  link?: AtriLinkConfig
): Promise<AtriEditor> {
  const editor = await mount({ content, toolbar: {}, link });
  stubGeometry(editor);
  await settled();
  return editor;
}

/** 把光标放进文档里第一个链接的文字里（选区得先收拢，点击才算"编辑"而不是拖选收尾） */
function cursorIntoLink(editor: AtriEditor): void {
  let pos = -1;
  editor.editor.state.doc.descendants((node, nodePos) => {
    if (pos < 0 && node.marks.some((mark) => mark.type.name === 'link')) {
      pos = nodePos + Math.min(2, node.nodeSize);
    }
  });
  if (pos < 0) throw new Error('document has no link');
  editor.editor.commands.setTextSelection(pos);
}

function anchorOf(editor: AtriEditor): HTMLElement {
  const anchor = editor.editor.view.dom.querySelector('a');
  if (!anchor) throw new Error('anchor is not rendered');
  return anchor;
}

const LINK_CONTENT = '<p><a href="https://example.com">docs</a> tail</p>';

describe('LinkPanel 链接浮层', () => {
  it('默认交给浮层：openOnClick 关，点链接就地编辑而不是导航', async () => {
    const editor = await mountEditor(LINK_CONTENT);

    expect(linkOptions(editor).openOnClick).toBe(false);

    cursorIntoLink(editor);
    click(anchorOf(editor));

    expect(panel()).not.toBeNull();
    // 已有链接带出原地址，改的是这一条
    expect(urlInput().value).toBe('https://example.com');
  });

  it('openOnClick 为 true 时交还扩展去导航，浮层不抢这一下', async () => {
    const editor = await mountEditor(LINK_CONTENT, {
      openOnClick: true,
      target: '_self',
      markdownLinks: true,
    });

    // jsdom 驱动不了 ProseMirror 的 handleClick（要真实排版），所以在这一层验配置落到了扩展上
    expect(linkOptions(editor)).toMatchObject({
      openOnClick: true,
      markdownLinks: true,
      HTMLAttributes: { target: '_self' },
    });

    cursorIntoLink(editor);
    click(anchorOf(editor));

    expect(panel()).toBeNull();
  });

  it('工具栏按钮打开浮层，填地址套住选中文字', async () => {
    const editor = await mountEditor();
    editor.editor.commands.setTextSelection({ from: 2, to: 6 });

    click(buttonOf(editor, 'insertLink'));
    expect(panel()).not.toBeNull();

    urlInput().value = 'example.com/docs';
    click(action('apply'));

    // 只贴域名时补上协议：浏览器与 Markdown 两边都才认
    const html = editor.getHTML();
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    // 选区是 2..6，也就是 "ello"
    expect(html).toContain('h<a');
    expect(html).toContain('>ello</a>');
    expect(panel()).toBeNull();
  });

  it('无选区时把地址本身当链接文字插进去', async () => {
    const editor = await mountEditor('<p>x</p>');
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'insertLink'));
    urlInput().value = 'https://example.com/a';
    click(action('apply'));

    expect(editor.getHTML()).toContain('>https://example.com/a</a>');
  });

  it('编辑既有链接时可改地址、切打开方式，也可移除', async () => {
    const editor = await mountEditor(LINK_CONTENT);
    cursorIntoLink(editor);
    click(anchorOf(editor));
    // 内置默认 _blank，勾选框跟着链接现状走
    expect(targetCheckbox().checked).toBe(true);

    urlInput().value = 'https://example.org/b';
    targetCheckbox().checked = false;
    click(action('apply'));
    expect(editor.getHTML()).toContain('href="https://example.org/b"');
    expect(editor.getHTML()).toContain('target="_self"');

    cursorIntoLink(editor);
    click(anchorOf(editor));
    click(action('remove'));
    expect(editor.getHTML()).not.toContain('<a');
  });

  it('已有协议的地址原样保留，站内路径不补 https', async () => {
    const editor = await mountEditor('<p>x</p>');
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'insertLink'));
    urlInput().value = 'mailto:hi@example.com';
    click(action('apply'));
    expect(editor.getHTML()).toContain('href="mailto:hi@example.com"');

    editor.editor.commands.setTextSelection(editor.editor.state.doc.content.size);
    click(buttonOf(editor, 'insertLink'));
    urlInput().value = '/docs/intro';
    click(action('apply'));
    expect(editor.getHTML()).toContain('href="/docs/intro"');
  });

  it('插入新链接时没有移除按钮', async () => {
    const editor = await mountEditor('<p>x</p>');
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'insertLink'));
    expect(panel()?.querySelector('.atri-link-panel-remove')).toBeNull();
    expect(action('apply').textContent).toBe('确定');
  });

  it('Escape 与点击外部都关闭，按钮的 aria-expanded 跟着走', async () => {
    const editor = await mountEditor('<p>x</p>');
    const button = buttonOf(editor, 'insertLink');
    editor.editor.commands.setTextSelection(2);

    click(button);
    expect(panel()).not.toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.classList.contains('active')).toBe(true);

    pressEscape();
    expect(panel()).toBeNull();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.classList.contains('active')).toBe(false);

    click(button);
    pointerDownOn(document.body);
    expect(panel()).toBeNull();
  });

  it('只读时按钮禁用', async () => {
    const editor = await mount({ content: '<p>x</p>', toolbar: {}, editable: false });
    expect(buttonOf(editor, 'insertLink').disabled).toBe(true);
  });

  it('destroy 时开着的浮层一起清掉', async () => {
    const editor = await mountEditor(LINK_CONTENT);
    cursorIntoLink(editor);
    click(anchorOf(editor));
    expect(panel()).not.toBeNull();

    editor.destroy();
    expect(panel()).toBeNull();
  });
});
