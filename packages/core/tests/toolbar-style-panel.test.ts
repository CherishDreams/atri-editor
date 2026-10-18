import { describe, expect, it } from 'vitest';
import { TextStyle } from '@tiptap/extension-text-style';
import {
  buttonOf,
  click,
  mount,
  pointerDownOn,
  pressEscape,
  rootOf,
  toolbarButtons,
} from './utils';

const NEW_ITEMS = [
  'textColor',
  'highlight',
  'highlightColor',
  'fontSize',
  'fontFamily',
  'subscript',
  'superscript',
  'clearFormat',
];

function panels(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>('.atri-style-panel'));
}

function rows(panel?: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(panel?.querySelectorAll<HTMLButtonElement>('.atri-style-panel-row') ?? []);
}

function itemIds(editor: Awaited<ReturnType<typeof mount>>): string[] {
  return toolbarButtons(editor).map((b) => b.getAttribute('data-toolbar-item') ?? '');
}

/**
 * 本文件测的是顶栏与它的面板，不是浮动工具栏。
 * bubble 默认开着，一旦 setTextSelection 就会去 coordsAtPos 量选区，而 jsdom 的 Range
 * 根本没有 getClientRects——所以这里显式关掉，而不是给每个用例桩一层假几何。
 */
async function mountBar(options: Parameters<typeof mount>[0] = {}) {
  const { toolbar, ...rest } = options;
  return mount({
    content: '<p>hello world</p>',
    ...rest,
    toolbar: { bubble: false, ...toolbar },
  });
}

describe('格式选择面板', () => {
  it('默认顶栏带上这八项', async () => {
    const editor = await mountBar();
    const ids = itemIds(editor);

    NEW_ITEMS.forEach((id) => expect(ids, id).toContain(id));
    // 分组顺序：颜色那组紧跟行内格式，上下标与清除格式单独一组
    expect(ids.slice(ids.indexOf('textColor'), ids.indexOf('bulletList'))).toEqual([
      'textColor',
      'highlight',
      'highlightColor',
      'fontSize',
      'fontFamily',
    ]);
  });

  it('formatting:false 时这批 mark 相关的项消失，且不留光杆分隔符', async () => {
    const editor = await mountBar({ formatting: false });
    const ids = itemIds(editor);

    [
      'textColor',
      'highlight',
      'highlightColor',
      'fontSize',
      'fontFamily',
      'subscript',
      'superscript',
    ].forEach((id) => expect(ids, id).not.toContain(id));
    // 清除格式走的是 unsetAllMarks + clearNodes，加粗斜体本来就有，
    // 所以它不随这批 mark 一起关——关掉它反而是把一个通用能力错绑在 mark 组上
    expect(ids).toContain('clearFormat');

    // 分隔符按组序插，整组空了不过滤就会吊出相邻两根。
    // 颜色组整组消失、上下标组还剩清除格式，于是 9 组变 8 组、8 根变 7 根
    const children = Array.from(rootOf(editor).querySelector('.atri-editor-toolbar')!.children);
    const classNames = children.map((el) => el.className);
    expect(children.filter((el) => el.className.includes('separator'))).toHaveLength(7);
    // 没有连续两根分隔符——那正是"空组"留下的痕迹
    expect(
      classNames.some(
        (name, i) => name.includes('separator') && classNames[i + 1]?.includes('separator')
      )
    ).toBe(false);
  });

  it('面板是懒创建的：没点开过就不该有 DOM 挂在上', async () => {
    const editor = await mountBar();
    expect(panels()).toHaveLength(0);

    click(buttonOf(editor, 'textColor'));
    expect(panels()).toHaveLength(1);
  });

  it('选一个颜色：写进文档、面板关闭、按钮态复位', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    const button = buttonOf(editor, 'textColor');
    expect(button.getAttribute('aria-expanded')).toBe('false');

    click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    const swatch = rows(panels()[0])[2];
    click(swatch);

    expect(panels()).toHaveLength(0);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(editor.getHTML()).toContain('color: rgb(24, 144, 255)');
    // 选色是文档变更，撤销一步要能退回去
    editor.editor.commands.undo();
    expect(editor.getHTML()).not.toContain('rgb(24, 144, 255)');
  });

  it('「无」那行清除颜色，而不是设成空串', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.editor.commands.setColor('#ff0000');

    click(buttonOf(editor, 'textColor'));
    const clear = rows(panels()[0]).find((row) =>
      row.classList.contains('atri-style-panel-row--clear')
    );
    click(clear!);

    // 属性为空串的 textStyle 会在往返里吐出 <span style=""> 那种看不见的噪音
    expect(editor.getHTML()).not.toContain('<span');
    expect(editor.getMarkdown()).toBe('hello world');
  });

  it('其他颜色走原生取色器，用 change 而不是 input', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    click(buttonOf(editor, 'textColor'));
    const input = panels()[0].querySelector<HTMLInputElement>('input[type="color"]');
    expect(input, '取色输入框').not.toBeNull();

    // input 会在拖动过程中每像素发一次，每次都进撤销历史，一步撤销等于没撤销
    input!.value = '#123456';
    input!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(editor.getHTML()).not.toContain('#123456');

    input!.dispatchEvent(new Event('change', { bubbles: true }));
    expect(editor.getHTML()).toContain('color: rgb(18, 52, 86)');
    expect(panels()).toHaveLength(0);
  });

  it('Escape 与点击外部都关闭面板', async () => {
    const editor = await mountBar();

    click(buttonOf(editor, 'fontSize'));
    expect(panels()).toHaveLength(1);
    pressEscape();
    expect(panels()).toHaveLength(0);

    click(buttonOf(editor, 'fontSize'));
    expect(panels()).toHaveLength(1);
    pointerDownOn(document.body);
    expect(panels()).toHaveLength(0);
  });

  it('换个入口点过去是改开那个，不是因为"已经开着"而关掉', async () => {
    const editor = await mountBar();

    click(buttonOf(editor, 'textColor'));
    click(buttonOf(editor, 'fontSize'));

    const panel = panels();
    expect(panel).toHaveLength(1);
    expect(panel[0].className).toContain('atri-style-panel--list');
    // 按下态只归当前这一个入口，两个一起亮就是假状态
    expect(buttonOf(editor, 'fontSize').getAttribute('aria-expanded')).toBe('true');
    expect(buttonOf(editor, 'textColor').getAttribute('aria-expanded')).toBe('false');

    // 同一个按钮再点是关
    click(buttonOf(editor, 'fontSize'));
    expect(panels()).toHaveLength(0);
  });

  it('字号面板列出全部预设加一行「默认」', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    click(buttonOf(editor, 'fontSize'));
    const list = rows(panels()[0]);
    expect(list).toHaveLength(11);
    expect(list[0].textContent).toBe('12px');

    click(list[3]);
    expect(editor.getHTML()).toContain('font-size: 18px');
  });

  it('字体面板的通用名走词条，切语言跟着变', async () => {
    const editor = await mountBar({ lang: 'zh' });

    click(buttonOf(editor, 'fontFamily'));
    const zh = rows(panels()[0]).map((r) => r.textContent);
    expect(zh.slice(0, 3)).toEqual(['无衬线', '衬线', '等宽']);
    pressEscape();

    await editor.setLanguage('en');
    click(buttonOf(editor, 'fontFamily'));
    const en = rows(panels()[0]).map((r) => r.textContent);
    expect(en.slice(0, 3)).toEqual(['Sans', 'Serif', 'Monospace']);
  });

  it('键盘能走完整个面板：方向键进列表、回车选中', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    click(buttonOf(editor, 'fontSize'));
    const panel = panels()[0];
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(panel)[0]);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows(panel)[1]);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(rows(panel)[0]);

    click(rows(panel)[0]);
    expect(editor.getHTML()).toContain('font-size: 12px');
  });

  it('高亮开关与高亮色面板是两件事', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    click(buttonOf(editor, 'highlight'));
    expect(editor.getHTML()).toContain('<mark>');
    // 无色的就是 Markdown 原生那层，导出应该回到 ==
    expect(editor.getMarkdown()).toContain('==hello==');

    click(buttonOf(editor, 'highlightColor'));
    const swatch = rows(panels()[0])[0];
    click(swatch);
    expect(editor.getHTML()).toContain('data-color');
    expect(editor.getMarkdown()).toContain('<mark data-color=');
  });

  it('上下标是开关，连按会挂上又摘掉', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });

    click(buttonOf(editor, 'subscript'));
    expect(editor.getHTML()).toContain('<sub>');
    expect(buttonOf(editor, 'subscript').classList.contains('active')).toBe(true);

    click(buttonOf(editor, 'subscript'));
    expect(editor.getHTML()).not.toContain('<sub>');
  });

  it('清除格式把 mark 与块级类型一起退回默认', async () => {
    const editor = await mountBar({
      content: '<h2><strong><span style="color: red">styled</span></strong></h2>',
    });

    // styled 六个字符：h2 的内容从 1 开始，要盖到 7 才是整词，差一格就留一个带格式的 d
    editor.editor.commands.setTextSelection({ from: 1, to: 7 });
    click(buttonOf(editor, 'clearFormat'));

    expect(editor.getHTML()).toContain('<p>styled</p>');
    expect(editor.getHTML()).not.toContain('color');
    expect(editor.getHTML()).not.toContain('<strong>');
    expect(editor.getHTML()).not.toContain('<h2>');
  });

  it('不可编辑时这八项全部禁用', async () => {
    const editor = await mountBar({ editable: false });

    NEW_ITEMS.forEach((id) => {
      expect(buttonOf(editor, id).disabled, id).toBe(true);
    });
  });

  it('mark 在册但属性不在册时，按钮照旧收起——两个信号都得对上', async () => {
    // 顶掉整个 textStyle 并不会收起这些项：Color / FontSize 那几个是 addGlobalAttributes
    // 的独立扩展，照样把属性挂到赢的那个 mark 上，命令与属性都真实可用。
    // 真正会踩到的是"mark 在、属性不在"：宿主只自带一个裸 TextStyle。
    // 这时 setColor 命令不存在、spec.attrs 里也没有 color，两项各判各的都该说"不行"
    const editor = await mountBar({
      formatting: false,
      extensions: [TextStyle] as never,
    });
    const ids = itemIds(editor);

    expect(editor.editor.schema.marks.textStyle).toBeTruthy();
    expect(Object.keys(editor.editor.schema.marks.textStyle?.spec.attrs ?? {})).not.toContain(
      'color'
    );
    ['textColor', 'fontSize', 'fontFamily'].forEach((id) => {
      expect(ids, id).not.toContain(id);
    });
    // 与 textStyle 无关的两项不受牵连
    expect(ids).toContain('clearFormat');
    expect(ids).not.toContain('highlight');
  });

  it('destroy 之后面板不留在页面上', async () => {
    const editor = await mountBar();
    click(buttonOf(editor, 'textColor'));
    expect(panels()).toHaveLength(1);

    editor.destroy();
    expect(panels()).toHaveLength(0);
  });
});
