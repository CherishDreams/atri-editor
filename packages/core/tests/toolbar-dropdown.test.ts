import { afterEach, describe, expect, it, vi } from 'vitest';
import { buttonOf, click, menuPanel, menuItem, mount, pointerDownOn, pressEscape } from './utils';

async function mountBar(options: Parameters<typeof mount>[0] = {}) {
  const { toolbar, ...rest } = options;
  return mount({
    content: '<p>hello world</p>',
    ...rest,
    toolbar: { bubble: false, ...toolbar },
  });
}

function rows(): HTMLButtonElement[] {
  return Array.from(menuPanel()?.querySelectorAll<HTMLButtonElement>('[data-menu-item]') ?? []);
}

describe('工具栏下拉菜单', () => {
  const warns: string[] = [];
  vi.spyOn(console, 'warn').mockImplementation((...args) => {
    warns.push(args.join(' '));
  });
  afterEach(() => {
    warns.length = 0;
  });

  it('标题菜单给全六级加正文——schema 一直是 1..6，缺的只是入口', async () => {
    const editor = await mountBar();
    expect(buttonOf(editor, 'heading').getAttribute('aria-haspopup')).toBe('menu');

    click(buttonOf(editor, 'heading'));
    const panel = menuPanel();
    expect(panel?.getAttribute('role')).toBe('menu');
    expect(rows().map((r) => r.dataset.menuItem)).toEqual([
      'heading1',
      'heading2',
      'heading3',
      'heading4',
      'heading5',
      'heading6',
      'paragraph',
    ]);
    // 当前是正文，所以「正文」那一项是唯一被勾选的
    expect(rows().map((r) => r.getAttribute('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
      'true',
    ]);
    expect(editor.getHTML()).toContain('<p>');
  });

  it('选「标题 4」真的出 h4——这批之前 4/5/6 级只能靠输入规则打 ####', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'heading'));
    click(menuItem('heading4'));

    expect(editor.getHTML()).toContain('<h4>hello world</h4>');
    expect(menuPanel()).toBeNull();
  });

  it('触发器把当前值显示出来：图标换、提示换，用户不必点开', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection(2);
    const trigger = buttonOf(editor, 'heading');
    expect(trigger.title).toBe('标题');

    click(trigger);
    click(menuItem('heading3'));

    expect(trigger.title).toBe('标题 3');
    // H3 的图标与通用 heading 图标不是同一段 SVG
    expect(trigger.innerHTML).toContain('M17.5 10.5');
  });

  it('菜单行是 menuitemradio + aria-checked，而不是普通 menuitem', async () => {
    const editor = await mountBar();
    editor.editor.commands.setContent('<h2>title here</h2>');

    click(buttonOf(editor, 'heading'));

    expect(rows().every((r) => r.getAttribute('role') === 'menuitemradio')).toBe(true);
    expect(menuItem('heading2').getAttribute('aria-checked')).toBe('true');
    expect(menuItem('heading2').classList.contains('active')).toBe(true);
    expect(menuItem('heading1').getAttribute('aria-checked')).toBe('false');
  });

  /**
   * 焦点还回编辑器这一手在 jsdom 里验不了：实测连既有的普通按钮路径
   * （点 bold，它早就在调 commands.focus()）之后也是 activeElement=BODY、isFocused=false，
   * 所以这里断言任何焦点判据都只会得到一个假失败。
   * 真实浏览器里单独验（见提交说明）。这边只守 jsdom 确实看得见的部分。
   */
  it('选中菜单项后菜单收起、改动落地', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'heading'));
    click(menuItem('heading2'));

    expect(menuPanel()).toBeNull();
    expect(editor.getHTML()).toContain('<h2>');
  });

  it('Escape 与点击外部都关闭菜单', async () => {
    const editor = await mountBar();

    click(buttonOf(editor, 'align'));
    expect(menuPanel()).not.toBeNull();
    pressEscape();
    expect(menuPanel()).toBeNull();

    click(buttonOf(editor, 'align'));
    expect(menuPanel()).not.toBeNull();
    pointerDownOn(document.body);
    expect(menuPanel()).toBeNull();
  });

  it('两个菜单共用一个实例：换一个是改开那个，不是把上一个关掉', async () => {
    const editor = await mountBar();

    click(buttonOf(editor, 'heading'));
    click(buttonOf(editor, 'align'));

    expect(menuPanel()).not.toBeNull();
    expect(rows().map((r) => r.dataset.menuItem)).toEqual([
      'alignLeft',
      'alignCenter',
      'alignRight',
      'alignJustify',
    ]);
    expect(buttonOf(editor, 'align').getAttribute('aria-expanded')).toBe('true');
    expect(buttonOf(editor, 'heading').getAttribute('aria-expanded')).toBe('false');
  });

  it('键盘能走完菜单：方向键移动、回车选中', async () => {
    const editor = await mountBar();
    editor.editor.commands.setTextSelection(2);

    click(buttonOf(editor, 'align'));
    const panel = menuPanel()!;
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows()[0]);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(rows()[1]);

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(rows()[0]);

    // 方向键在两端循环，不会走到没有焦点的地方
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(rows()[3]);

    rows()[0].click();
    expect(editor.getHTML()).toMatch(/text-align:\s*left/);
  });

  it('不可编辑时菜单能开、行全禁用、选不中任何东西', async () => {
    const editor = await mountBar({ editable: false });

    expect(buttonOf(editor, 'heading').disabled).toBe(true);
  });

  it('自定义 children 替换默认子项', async () => {
    const editor = await mountBar({
      toolbar: {
        bubble: false,
        items: [{ id: 'heading', children: [{ id: 'heading1' }, { id: 'paragraph' }] }],
      },
    });

    click(buttonOf(editor, 'heading'));
    expect(rows().map((r) => r.dataset.menuItem)).toEqual(['heading1', 'paragraph']);
  });

  it('children 里的未知 id 告警并跳过，不吊出一行按不动的', async () => {
    const editor = await mountBar({
      toolbar: {
        bubble: false,
        items: [{ id: 'align', children: [{ id: 'alignLeft' }, { id: 'nope' }] }],
      },
    });

    click(buttonOf(editor, 'align'));
    expect(rows().map((r) => r.dataset.menuItem)).toEqual(['alignLeft']);
    expect(warns.filter((w) => w.includes('unknown item'))).toHaveLength(1);
  });

  it('带浮层的子项不收：菜单一关面板就无处可锚', async () => {
    const editor = await mountBar({
      toolbar: {
        bubble: false,
        items: [{ id: 'align', children: [{ id: 'alignLeft' }, { id: 'textColor' }] }],
      },
    });

    click(buttonOf(editor, 'align'));
    expect(rows().map((r) => r.dataset.menuItem)).toEqual(['alignLeft']);
    expect(warns.some((w) => w.includes('which menus cannot host'))).toBe(true);
  });

  it('嵌套 children 只支持一层，多出来的告警并忽略', async () => {
    const editor = await mountBar({
      toolbar: {
        bubble: false,
        items: [{ id: 'align', children: [{ id: 'alignLeft', children: [{ id: 'alignRight' }] }] }],
      },
    });

    expect(warns.some((w) => w.includes('Nested children'))).toBe(true);
    click(buttonOf(editor, 'align'));
    expect(rows().map((r) => r.dataset.menuItem)).toEqual(['alignLeft']);
  });

  it('子项照样受能力门控：table:false 时菜单里不会出现插入表格', async () => {
    const editor = await mountBar({
      table: false,
      toolbar: {
        bubble: false,
        items: [{ id: 'align', children: [{ id: 'alignLeft' }, { id: 'insertTable' }] }],
      },
    });

    click(buttonOf(editor, 'align'));
    expect(rows().map((r) => r.dataset.menuItem)).toEqual(['alignLeft']);
    // insertTable 这一项连定义都不存在，所以走的是"未知 id"那条告警
    expect(warns.filter((w) => w.includes('unknown item'))).toHaveLength(1);
  });

  it('destroy 之后菜单不留在页面上', async () => {
    const editor = await mountBar();
    click(buttonOf(editor, 'heading'));
    expect(menuPanel()).not.toBeNull();

    editor.destroy();
    expect(menuPanel()).toBeNull();
  });
});
