import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/index';
import { customCardNodeView } from './fixtures';
import type { AtriEditor, AtriEditorElement } from '../src/index';

const created: AtriEditorElement[] = [];

/**
 * 走真实的 customElements 升级链路：属性初值在 connectedCallback 里读，
 * 后续变更由 attributeChangedCallback 转发。
 * 需要等一个宏任务：Tiptap v3 在 setTimeout 里才 emit create
 */
async function mountElement(
  attributes: Record<string, string> = {},
  options: Parameters<AtriEditorElement['setOptions']>[0] = {}
): Promise<AtriEditorElement> {
  const element = document.createElement('atri-editor') as AtriEditorElement;
  element.setOptions(options);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, value);
  }
  document.body.appendChild(element);
  created.push(element);
  await new Promise((resolve) => setTimeout(resolve, 0));
  return element;
}

function editorOf(element: AtriEditorElement): AtriEditor {
  const editor = element.getEditor();
  if (!editor) throw new Error('编辑器未创建');
  return editor;
}

/**
 * 占位符由装饰写在空块自身的 data-placeholder 上
 */
function placeholderOf(element: AtriEditorElement): string | null {
  return element.querySelector('.is-editor-empty')?.getAttribute('data-placeholder') ?? null;
}

/**
 * 必须与 styles/index.scss 中的占位符规则保持同形：样式真正命中的就是这个元素。
 * 选择器写错一次就让占位符整体失效过，改样式时同步改这里
 */
function styledPlaceholderHost(element: AtriEditorElement): Element | null {
  return element.querySelector(
    '.atri-editor-content > .is-editor-empty:not([data-placeholder=""])'
  );
}

afterEach(() => {
  while (created.length) {
    created.pop()?.remove();
  }
  document.body.innerHTML = '';
});

describe('observedAttributes 每一项都真正生效', () => {
  it('theme 切换主题类', async () => {
    const element = await mountElement({ theme: 'light' });

    element.setAttribute('theme', 'dark');

    expect(element.querySelector('.atri-theme-dark')).not.toBeNull();
  });

  it('editable 切换可编辑状态', async () => {
    const element = await mountElement();

    element.setAttribute('editable', 'false');
    expect(editorOf(element).isEditable()).toBe(false);

    element.setAttribute('editable', 'true');
    expect(editorOf(element).isEditable()).toBe(true);
  });

  it('lang 切换语言', async () => {
    const element = await mountElement({ lang: 'zh' });

    element.setAttribute('lang', 'en');
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(editorOf(element).i18n.getLanguage()).toBe('en');
  });

  it('placeholder 变更后重设，删除属性则清空', async () => {
    const element = await mountElement({ placeholder: '初始占位' });

    expect(placeholderOf(element)).toBe('初始占位');
    expect(styledPlaceholderHost(element)).not.toBeNull();

    element.setAttribute('placeholder', '改后占位');
    expect(placeholderOf(element)).toBe('改后占位');

    element.removeAttribute('placeholder');
    expect(placeholderOf(element)).toBe('');
    // 空占位符不得被样式规则命中，否则会渲染一个空的浮动盒
    expect(styledPlaceholderHost(element)).toBeNull();
  });
});

describe('placeholder', () => {
  it('未配置占位符时样式规则不命中', async () => {
    const element = await mountElement();

    expect(styledPlaceholderHost(element)).toBeNull();
  });

  it('setPlaceholder 不触发 onChange，且不改动文档', async () => {
    const onChange = vi.fn();
    const element = await mountElement({ placeholder: 'a' }, { onChange });
    const editor = editorOf(element);
    editor.setContent('<p>keep me</p>');
    onChange.mockClear();

    editor.setPlaceholder('b');

    expect(editor.getHTML()).toContain('keep me');
    expect(onChange).not.toHaveBeenCalled();
    // 有内容时本就不该渲染占位符
    expect(placeholderOf(element)).toBeNull();

    editor.clearContent();

    expect(placeholderOf(element)).toBe('b');
  });

  it('重建编辑器后仍保留改后的占位符', async () => {
    const element = await mountElement({ placeholder: 'a' });
    const editor = editorOf(element);
    editor.setPlaceholder('b');

    // registerNodeView 在编辑器已创建时会整体重建
    editor.registerNodeView(customCardNodeView);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(placeholderOf(element)).toBe('b');
  });
});

describe('媒体委托方法', () => {
  it('未初始化时调用不抛错，hasPendingUploads 返回 false', () => {
    const element = document.createElement('atri-editor') as AtriEditorElement;

    expect(() => element.insertImage({ src: 'https://cdn.example.com/a.png' })).not.toThrow();
    expect(() => element.insertAttachment({ src: 'https://cdn.example.com/a.pdf' })).not.toThrow();
    expect(element.hasPendingUploads()).toBe(false);
  });

  // 插入 atom 节点后它会处于选中态，紧接着再插一个会替换掉前一个：这是 ProseMirror 的既有语义，
  // 所以两种节点各挂一个元素分别断言，而不是连着插进同一个文档
  it('insertImage 落到自定义元素内部', async () => {
    const element = await mountElement();

    element.insertImage({ src: 'https://cdn.example.com/a.png', alt: '封面' });

    expect(element.getHTML()).toContain('<img src="https://cdn.example.com/a.png" alt="封面"');
  });

  it('insertAttachment 产出卡片结构', async () => {
    const element = await mountElement();

    element.insertAttachment({ src: 'https://cdn.example.com/a.pdf', name: 'a.pdf', size: 2048 });

    const html = element.getHTML();
    expect(html).toContain('data-atri-attachment');
    expect(html).toContain('data-size="2048"');
    expect(html).toContain('>a.pdf</a>');
    expect(html).toContain('2 KB');
    expect(element.hasPendingUploads()).toBe(false);
  });

  it('uploadFiles 走同一条上传管线，retryFailedUploads 重试失败的批次', async () => {
    let attempts = 0;
    const handler = () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error('network down'))
        : Promise.resolve({ url: 'https://cdn.example.com/a.png' });
    };
    const element = await mountElement({}, { media: { upload: handler } });
    const file = new File([new Uint8Array(64)], 'a.png', { type: 'image/png' });

    await element.uploadFiles([file], 'image');
    expect(attempts).toBe(1);
    expect(element.hasPendingUploads()).toBe(true);

    await element.retryFailedUploads();
    expect(attempts).toBe(2);
    expect(element.hasPendingUploads()).toBe(false);
    expect(element.getHTML()).toContain('src="https://cdn.example.com/a.png"');
  });
});
