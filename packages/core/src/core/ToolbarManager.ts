/**
 * ToolbarManager - 工具栏管理器
 * 负责创建工具栏 DOM、绑定按钮事件、更新按钮状态
 */
import { isNodeSelection, type Editor } from '@tiptap/core';
import type { ToolbarConfig, ToolbarItem } from '../types';
import { InsertPanel, type InsertPanelMode } from '../media/InsertPanel';
import type { MediaRuntime } from '../media/MediaRuntime';
import { BUBBLE_NODE_ITEMS, BUBBLE_TEXT_ITEMS } from './bubble-toolbar';
import { zhText, type I18nManager } from './I18nManager';
import type { LinkPanel } from './LinkPanel';
import { StyleOptionPanel, type StylePanelSpec } from './StyleOptionPanel';
import {
  FONT_FAMILIES,
  FONT_SIZES,
  HIGHLIGHT_COLORS,
  TEXT_COLORS,
  type StyleOption,
} from './style-presets';
import { TableGridPanel } from './TableGridPanel';
import {
  ToolbarMenuPanel,
  type ToolbarMenuItemRow,
  type ToolbarMenuSpec,
} from './ToolbarMenuPanel';
import { canInsertTable } from '../utils/table';
import { canUseTextStyle, hasMark, type TextStyleAttr } from '../utils/formatting';
import { icons } from './icons';

/**
 * 工具栏项定义
 */
interface ToolbarItemDef {
  id: string;
  icon: string;
  /** 没有词条映射时的回退文案；内置项都走 TOOLTIP_KEYS -> 中文词条，不在此抄一份 */
  tooltip?: string;
  /**
   * 会打开浮层。true（或 'dialog'）是带输入框的面板，'menu' 是下拉菜单：
   * 两者的 aria-haspopup 不同，读屏报出来的语义也不同。
   * 不管是哪种，都不能把焦点抢回编辑器——抢了浮层里的输入框就根本打不了字
   */
  popup?: boolean | 'menu';
  /**
   * 下拉菜单里的子项 id，走的仍是同一张 itemDefs 表：
   * 子项因此和顶栏项一样受能力门控（比如表格被顶掉时 insertTable 就不会出现在菜单里）
   */
  children?: string[];
  command: (editor: Editor, button: HTMLButtonElement) => void;
  isActive: (editor: Editor) => boolean;
  isDisabled: (editor: Editor) => boolean;
}

/**
 * 工具栏项与 i18n 词条的映射（这些项的默认文案就是中文词条本身，见 zhText）
 */
const TOOLTIP_KEYS: Record<string, string> = {
  undo: 'editor.undo',
  redo: 'editor.redo',
  heading1: 'editor.heading1',
  heading2: 'editor.heading2',
  heading3: 'editor.heading3',
  heading4: 'editor.heading4',
  heading5: 'editor.heading5',
  heading6: 'editor.heading6',
  // 两个下拉触发器。'editor.heading' 这条词条躺了很久、背后没有任何功能，
  // 这批终于有了真正读它的人
  heading: 'editor.heading',
  align: 'editor.align',
  paragraph: 'editor.paragraph',
  bold: 'editor.bold',
  italic: 'editor.italic',
  underline: 'editor.underline',
  strike: 'editor.strikethrough',
  code: 'editor.code',
  bulletList: 'editor.bulletList',
  orderedList: 'editor.orderedList',
  taskList: 'editor.taskList',
  blockquote: 'editor.blockquote',
  codeBlock: 'editor.codeBlock',
  horizontalRule: 'editor.horizontalRule',
  alignLeft: 'editor.alignLeft',
  alignCenter: 'editor.alignCenter',
  alignRight: 'editor.alignRight',
  alignJustify: 'editor.alignJustify',
  insertImage: 'editor.image',
  insertAttachment: 'editor.attachment',
  attachmentDisplay: 'editor.attachmentDisplay',
  insertTable: 'editor.table',
  insertLink: 'editor.link',
  delete: 'editor.delete',
  textColor: 'editor.textColor',
  highlight: 'editor.highlight',
  highlightColor: 'editor.highlightColor',
  fontSize: 'editor.fontSize',
  fontFamily: 'editor.fontFamily',
  subscript: 'editor.subscript',
  superscript: 'editor.superscript',
  clearFormat: 'editor.clearFormat',
};

/**
 * 工具栏管理器
 */
export class ToolbarManager {
  private container: HTMLElement;
  private editor: Editor;
  private i18n?: I18nManager;
  private config?: ToolbarConfig;
  private mediaRuntime: MediaRuntime | null;
  /** 链接浮层由门面持有：编辑态点击链接也要能打开它，跟工具栏渲染不渲染无关 */
  private linkPanel: LinkPanel | null;
  private unsubscribeLanguage?: () => void;
  private unsubscribeEditor?: () => void;
  /** 同一个项可能同时渲染在顶栏与浮动工具栏里，所以一个 id 对应一组按钮 */
  private buttons: Map<string, Set<HTMLButtonElement>> = new Map();
  /** 按 id 记的覆盖文案：顶栏与浮层共用一份，改一处两处一起改，这是有意的 */
  private customTooltips: Map<string, string> = new Map();
  private itemDefs: Map<string, ToolbarItemDef>;
  private createdElements: HTMLElement[] = [];
  private panel: InsertPanel | null = null;
  private tablePanel: TableGridPanel | null = null;
  /** 颜色 / 字号 / 字体四个入口共用一个面板实例：同时只会开一个 */
  private stylePanel: StyleOptionPanel | null = null;
  /** 下拉菜单同理，所有 children 菜单共用一个实例 */
  private menuPanel: ToolbarMenuPanel | null = null;

  constructor(
    editor: Editor,
    container: HTMLElement,
    config?: ToolbarConfig,
    i18n?: I18nManager,
    mediaRuntime?: MediaRuntime | null,
    linkPanel?: LinkPanel | null
  ) {
    this.editor = editor;
    this.container = container;
    this.config = config;
    this.i18n = i18n;
    this.mediaRuntime = mediaRuntime ?? null;
    this.linkPanel = linkPanel ?? null;
    this.itemDefs = this.getDefaultItems();
    this.createToolbarDOM();
    this.bindEditorEvents();

    this.unsubscribeLanguage = this.i18n?.onLanguageChanged(() => this.applyTooltips());
  }

  /**
   * 把浮动工具栏的按钮渲染进给定的元素
   *
   * 元素由门面创建并持有：BubbleMenu 每次隐藏都会把它从文档里摘掉，重建编辑器后
   * 还得拿同一个元素重新 attach，所以它不进 createdElements、也不在这里 remove
   */
  attachBubbleToolbar(element: HTMLElement): void {
    // 重建编辑器后是"新的管理器 + 同一个元素"再走一遍这里：先清干净，
    // 否则上一任的按钮还留在盒子里，却再也等不到状态同步
    element.replaceChildren();

    // 两组一次都渲染出来，靠 CSS 读容器上的 data-atri-bubble-mode 决定哪组占宽度
    const groups: [string, readonly string[]][] = [
      ['text', BUBBLE_TEXT_ITEMS],
      ['node', BUBBLE_NODE_ITEMS],
    ];

    groups.forEach(([groupId, itemIds]) => {
      const group = document.createElement('div');
      group.className = 'atri-editor-bubble-group';
      group.setAttribute('data-atri-bubble-group', groupId);

      itemIds.forEach((itemId) => {
        const itemDef = this.itemDefs.get(itemId);
        if (!itemDef) return;

        // 带浮层的项不能进这里：面板锚在按钮上，而按钮跟着浮层一起被摘出文档
        if (itemDef.popup) {
          console.warn(
            `[Atri Editor] Toolbar item "${itemId}" opens a panel, which bubble toolbar cannot host.`
          );
          return;
        }

        group.appendChild(this.createButton(itemId, itemDef));
      });

      element.appendChild(group);
    });

    this.applyTooltips();
    this.updateButtonStates();
  }

  /**
   * 插入浮层按需创建：没点开过就不该有一个实例挂在编辑器上
   */
  private get insertPanel(): InsertPanel | null {
    if (!this.mediaRuntime) return null;
    this.panel ??= new InsertPanel({
      editor: this.editor,
      runtime: this.mediaRuntime,
      i18n: this.i18n,
      // 开合不改文档，等不到 transaction，得主动刷一次按钮状态
      onOpenChange: () => this.updateButtonStates(),
    });
    return this.panel;
  }

  private openInsert(mode: InsertPanelMode, button: HTMLButtonElement): void {
    this.insertPanel?.toggle(button, mode);
  }

  /**
   * 表格网格面板按需创建：没点开过就不该有一个实例挂在编辑器上
   */
  private get gridPanel(): TableGridPanel | null {
    if (!this.tableExtensionRegistered) return null;
    this.tablePanel ??= new TableGridPanel({
      editor: this.editor,
      i18n: this.i18n,
      // 开合不改文档，等不到 transaction，得主动刷一次按钮状态
      onOpenChange: () => this.updateButtonStates(),
    });
    return this.tablePanel;
  }

  /** 内置表格真可用才摆按钮：table:false 未注册、或被用户同名扩展顶掉都不摆（判定见 canInsertTable） */
  private get tableExtensionRegistered(): boolean {
    return canInsertTable(this.editor);
  }

  /** 格式面板按需创建：没点开过就不该有一个实例挂在编辑器上 */
  private get styleOptionPanel(): StyleOptionPanel {
    this.stylePanel ??= new StyleOptionPanel({
      editor: this.editor,
      i18n: this.i18n,
      // 开合不改文档，等不到 transaction，得主动刷一次按钮状态
      onOpenChange: () => this.updateButtonStates(),
    });
    return this.stylePanel;
  }

  private tOr(key: string, fallback: string): string {
    return this.i18n?.tOr(key, fallback) ?? fallback;
  }

  /** 下拉菜单面板按需创建：没点开过就不该有一个实例挂在编辑器上 */
  private get menu(): ToolbarMenuPanel {
    this.menuPanel ??= new ToolbarMenuPanel({
      editor: this.editor,
      // 开合不改文档，等不到 transaction，得主动刷一次按钮状态
      onOpenChange: () => this.updateButtonStates(),
    });
    return this.menuPanel;
  }

  /**
   * 把一个项做成下拉触发器。
   * 子项走的仍是同一张 itemDefs 表，所以它们和顶栏项一样受能力门控——
   * 表格被顶掉时 insertTable 就不会出现在菜单里，而不是摆一行按了没反应的
   */
  private menuItem(key: string, icon: string, children: string[]): ToolbarItemDef {
    const def: ToolbarItemDef = {
      id: key,
      icon,
      popup: 'menu',
      children,
      command: (_editor, button) => {
        // 必须现读而不是用上面那个闭包参数：宿主用 { id: 'heading', children: [...] }
        // 覆盖时改的就是 def.children，闭包里那份还是内置默认值，
        // 用闭包会让"覆盖写在类型上、点在旧列表上"这种错配静默生效
        const live = this.itemDefs.get(key)?.children ?? children;
        this.menu.toggle(button, this.menuSpec(key, live, button));
      },
      isActive: () => this.menuPanel?.openKey === key,
      isDisabled: (editor) => !editor.isEditable,
    };
    return def;
  }

  /** 当前命中的子项：触发器的图标与提示都跟着它走，用户不必点开就知道现在的级别 */
  private activeChild(def: ToolbarItemDef): ToolbarItemDef | null {
    for (const childId of def.children ?? []) {
      const child = this.itemDefs.get(childId);
      if (child && !child.popup && child.isActive(this.editor) && !child.isDisabled(this.editor)) {
        return child;
      }
    }
    return null;
  }

  /** 子项词条 key；没有映射的（宿主的自定义项）退回定义里的兜底文案 */
  private rowLabel(childId: string, child: ToolbarItemDef): string {
    const key = TOOLTIP_KEYS[childId];
    return key ? this.tOr(key, zhText(key)) : (child.tooltip ?? childId);
  }

  /**
   * 菜单里带浮层的子项一律不收：子项被点中后菜单就关了，
   * 而面板要锚在触发器上——锚一个即将从文档里消失的行没有意义。
   * 这与 attachBubbleToolbar 拒绝浮层项是同一条理由。
   */
  private menuSpec(key: string, children: string[], trigger: HTMLButtonElement): ToolbarMenuSpec {
    const menuKey = TOOLTIP_KEYS[key];
    return {
      key,
      label: menuKey ? this.tOr(menuKey, zhText(menuKey)) : key,
      rows: children.reduce<ToolbarMenuItemRow[]>((rows, childId) => {
        const child = this.itemDefs.get(childId);
        if (!child) {
          console.warn(`[Atri Editor] Menu "${key}" declares unknown item "${childId}".`);
          return rows;
        }
        if (child.popup) {
          console.warn(
            `[Atri Editor] Menu item "${childId}" opens a panel, which menus cannot host.`
          );
          return rows;
        }
        rows.push({
          id: childId,
          label: this.rowLabel(childId, child),
          active: child.isActive(this.editor),
          disabled: child.isDisabled(this.editor),
          // 子项自己不需要触发器元素（只有浮层项会用），传过去是为了共用同一份定义
          run: () => child.command(this.editor, trigger),
        });
        return rows;
      }, []),
    };
  }

  /**
   * 面板文案在这里现取，不在建项时算好存下来：
   * 语言切换后重开面板要拿到新词条，而项定义只在建栏时求值一次
   */
  private styleSpec(
    key: string,
    parts: {
      shape: 'grid' | 'list';
      options: StyleOption[];
      swatch: boolean;
      attr: TextStyleAttr | 'highlight';
    }
  ): StylePanelSpec {
    return {
      key,
      label: this.tOr(`editor.${key}`, key),
      shape: parts.shape,
      options: parts.options,
      // 色板才有"其他颜色"这一行；字号字体用原生控件选不出任意值
      customColorLabel: parts.swatch ? this.tOr('formatting.customColor', '其他颜色…') : undefined,
      // 清除行的措辞按形状分：颜色去掉是"无"，字号字体退回的是"默认"
      clearLabel: parts.swatch
        ? this.tOr('formatting.noColor', '无')
        : this.tOr('formatting.defaultValue', '默认'),
      onPick: (value) => this.applyStyle(parts.attr, value),
    };
  }

  /**
   * 空串是"清除"而不是"设成空值"：设成空串会留下一个属性为空串的 mark，
   * 而 textStyle 的 renderHTML 对空值照样会吐出一个 `<span style="">`，
   * 那种节点既看不见又会在往返里产噪音（见 extensions/formatting.ts 的发出侧）
   */
  private applyStyle(attr: TextStyleAttr | 'highlight', value: string): void {
    const chain = this.editor.chain().focus();
    if (attr === 'highlight') {
      if (value === '') chain.unsetHighlight().run();
      else chain.setHighlight({ color: value }).run();
      return;
    }
    switch (attr) {
      case 'color':
        if (value === '') chain.unsetColor().run();
        else chain.setColor(value).run();
        return;
      case 'backgroundColor':
        if (value === '') chain.unsetBackgroundColor().run();
        else chain.setBackgroundColor(value).run();
        return;
      case 'fontSize':
        if (value === '') chain.unsetFontSize().run();
        else chain.setFontSize(value).run();
        return;
      case 'fontFamily':
        if (value === '') chain.unsetFontFamily().run();
        else chain.setFontFamily(value).run();
        return;
    }
  }

  /**
   * 创建工具栏 DOM - 直接将按钮插入 container
   */
  private createToolbarDOM(): void {
    const items = this.config?.items;

    if (items) {
      items.forEach((item) => {
        const resolved = this.resolveItem(item);
        if (!resolved) return;
        const button = this.createButton(resolved.id, resolved.def, resolved.overrides);
        this.container.appendChild(button);
        this.createdElements.push(button);
      });
      this.applyTooltips();
      return;
    }

    // 默认工具栏布局（分组）
    const layout = [
      ['undo', 'redo'],
      // 标题收成一下拉：一到六级加正文七个取值平铺要占七格，而一次只用得上一个
      ['heading'],
      // 链接跟着行内格式走：它也是一段文字上的标记，只是要填地址所以带浮层
      ['bold', 'italic', 'underline', 'strike', 'code', 'insertLink'],
      // 颜色与字号字体自成一组：都是"这段文字长什么样"，且除 highlight 外都带浮层
      ['textColor', 'highlight', 'highlightColor', 'fontSize', 'fontFamily'],
      ['bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock'],
      // 对齐同样收成一下拉
      ['align'],
      // 分割线与表格是一组：都是"往正文里插一块"的动作，没有激活态
      ['horizontalRule', 'insertTable'],
      // 上下标与清除格式：作用于选区已有的格式，而不是加一种新格式
      ['subscript', 'superscript', 'clearFormat'],
      ['insertImage', 'insertAttachment'],
    ];

    // 整组一项都不存在就不摆这一组：分隔符是按组序插的，留下一组空的就会多出
    // 一根光杆（formatting:false 时那两组全空，table:false / media:false 同理）
    const groups = layout.filter((group) => group.some((itemId) => this.itemDefs.has(itemId)));

    groups.forEach((group, groupIndex) => {
      if (groupIndex > 0) {
        const separator = document.createElement('div');
        separator.className = 'atri-editor-toolbar-separator';
        this.container.appendChild(separator);
        this.createdElements.push(separator);
      }

      group.forEach((itemId) => {
        const itemDef = this.itemDefs.get(itemId);
        if (!itemDef) return;

        const button = this.createButton(itemId, itemDef);
        this.container.appendChild(button);
        this.createdElements.push(button);
      });
    });

    this.applyTooltips();
  }

  /**
   * 解析配置项：字符串按 id 取内置定义，ToolbarItem 允许覆盖展示文案
   */
  private resolveItem(
    item: string | ToolbarItem
  ): { id: string; def: ToolbarItemDef; overrides?: ToolbarItem } | null {
    const id = typeof item === 'string' ? item : item.id;
    const def = this.itemDefs.get(id);

    if (!def) {
      console.warn(`[Atri Editor] Unknown toolbar item "${id}" was skipped.`);
      return null;
    }

    if (typeof item === 'string') {
      return { id, def };
    }

    if (item.children?.length) {
      // 目前只有内置的下拉项（heading / align）能挂子项：公开注册自定义项还没有入口，
      // 让宿主把 children 写在普通按钮上只会得到一个静默无效的声明——
      // 那正是本包在别处反复消除的"写了没反应"，所以这里明确告警而不是默默吞掉
      if (def.popup !== 'menu') {
        console.warn(
          `[Atri Editor] Toolbar item "${id}" declares children, but it is not a dropdown; ` +
            'only the built-in dropdown items (heading, align) accept children.'
        );
      } else {
        // 只支持一层：子项再带 children 就变成"菜单里套菜单"，而菜单面板没有嵌套定位能力。
        // 覆盖写在 def 上而不是只记这一次渲染，因为同一个项可能同时出现在顶栏与浮层，
        // 与 customTooltips 一样是"一份定义两处共用"的有意选择
        const nested = item.children.filter((child) => child.children?.length);
        if (nested.length) {
          console.warn(
            `[Atri Editor] Nested children on "${nested
              .map((child) => child.id)
              .join(', ')}" are not supported and were ignored.`
          );
        }
        def.children = item.children.map((child) => child.id);
      }
    }

    return { id, def, overrides: item };
  }

  private createButton(
    itemId: string,
    itemDef: ToolbarItemDef,
    overrides?: ToolbarItem
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'atri-editor-toolbar-btn';
    button.setAttribute('data-toolbar-item', itemId);

    if (overrides?.icon) {
      button.innerHTML = overrides.icon;
    } else if (overrides?.label) {
      button.textContent = overrides.label;
    } else {
      button.innerHTML = itemDef.icon;
    }

    if (overrides?.tooltip) {
      this.customTooltips.set(itemId, overrides.tooltip);
    }

    if (itemDef.popup) {
      button.setAttribute('aria-haspopup', itemDef.popup === 'menu' ? 'menu' : 'dialog');
      button.setAttribute('aria-expanded', 'false');
    }

    if (itemDef.popup === 'menu') {
      // 下拉触发器要带一个下箭头：不带的话它和旁边的普通按钮长得一模一样，
      // 用户得点下去才知道里面还有一层。
      // 基础图标单独存一份：状态刷新要按"当前命中的子项"换图标，
      // 换完还得能退回建按钮时那一版（里面可能带着宿主覆盖的图标）
      button.classList.add('atri-editor-toolbar-btn--menu');
      button.dataset.menuIcon = button.innerHTML;
      button.innerHTML += icons.chevronDown;
    }

    button.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      itemDef.command(this.editor, button);
      // 浮层项自己管焦点：抢回编辑器会让浮层里的输入框根本打不了字
      if (!itemDef.popup) this.editor.commands.focus();
    });

    let group = this.buttons.get(itemId);
    if (!group) {
      group = new Set();
      this.buttons.set(itemId, group);
    }
    group.add(button);
    return button;
  }

  /**
   * 按当前语言刷新按钮 tooltip
   */
  private applyTooltips(): void {
    this.buttons.forEach((buttons, itemId) => {
      const itemDef = this.itemDefs.get(itemId);
      if (!itemDef) return;

      // 有词条映射的项，中文原文就是词条本身；只有不带词条的自定义项才用定义里的 tooltip。
      // 下拉触发器与宿主覆盖的优先级都收在 itemTitle 里，与状态刷新共用同一份判定
      const title = this.itemTitle(itemId, itemDef);

      buttons.forEach((button) => {
        button.title = title;
      });
    });
  }

  /**
   * 获取默认工具栏项定义
   */
  private getDefaultItems(): Map<string, ToolbarItemDef> {
    const items = new Map<string, ToolbarItemDef>();

    // 媒体节点没注册（media:false）时这两个命令压根不存在，按钮也不提供
    if (this.mediaRuntime) {
      items.set('insertImage', {
        id: 'insertImage',
        icon: icons.image,
        popup: true,
        command: (_editor, button) => this.openInsert('image', button),
        isActive: () => this.panel?.openMode === 'image',
        isDisabled: (editor) => !editor.isEditable,
      });

      items.set('insertAttachment', {
        id: 'insertAttachment',
        icon: icons.paperclip,
        popup: true,
        command: (_editor, button) => this.openInsert('attachment', button),
        isActive: () => this.panel?.openMode === 'attachment',
        isDisabled: (editor) => !editor.isEditable,
      });

      // 卡片↔行内链接是选中态上的操作：没选中附件就没有作用对象
      items.set('attachmentDisplay', {
        id: 'attachmentDisplay',
        icon: icons.link,
        command: (editor) => editor.chain().focus().toggleAttachmentDisplay().run(),
        isActive: (editor) => editor.isActive('attachment') || editor.isActive('attachmentLink'),
        isDisabled: (editor) =>
          !editor.isActive('attachment') && !editor.isActive('attachmentLink'),
      });
    }

    // 内置表格不可用（table:false 或被用户顶掉）时 insertTable 命令跑不通，按钮也不提供
    if (this.tableExtensionRegistered) {
      items.set('insertTable', {
        id: 'insertTable',
        icon: icons.table,
        popup: true,
        command: (_editor, button) => this.gridPanel?.toggle(button),
        isActive: () => this.tablePanel?.isOpen === true,
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    // 链接入口：浮层归门面所有（点链接就地编辑也要用它），这里只摆一个触发按钮
    if (this.linkPanel) {
      items.set('insertLink', {
        id: 'insertLink',
        icon: icons.link,
        popup: true,
        command: (_editor, button) => this.linkPanel?.toggle(button),
        // 浮层开着时按下去是关，所以按钮的"按下态"跟的是浮层，不是选区里有没有链接
        isActive: (editor) => this.linkPanel?.isOpen === true || editor.isActive('link'),
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    // 基础格式：按能力摆项。formatting:false 没注册、或宿主用同名扩展顶掉内置 mark 时，
    // 一条都不出——判据是"命令在不在 + schema 里有没有那个属性"两条，见 utils/formatting.ts。
    // 这一组全部按能力各自判定，不是一荣俱荣：宿主完全可能只顶掉 textStyle 而留着 highlight。
    const textStyleReady = (attr: TextStyleAttr) => canUseTextStyle(this.editor, attr);

    if (textStyleReady('color')) {
      items.set('textColor', {
        id: 'textColor',
        icon: icons.textColor,
        popup: true,
        command: (_editor, button) =>
          this.styleOptionPanel.toggle(
            button,
            this.styleSpec('textColor', {
              shape: 'grid',
              options: TEXT_COLORS,
              swatch: true,
              attr: 'color',
            })
          ),
        // 浮层项的按下态只跟浮层走：选区里有没有颜色是文档事实，不是"这个按钮正按着"
        isActive: () => this.stylePanel?.openKey === 'textColor',
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    if (hasMark(this.editor, 'highlight')) {
      // 无色的 ==text== 是个纯开关，与"挑一个高亮色"是两件事，所以分成两项
      items.set('highlight', {
        id: 'highlight',
        icon: icons.highlight,
        command: (editor) => editor.chain().focus().toggleHighlight().run(),
        isActive: (editor) => editor.isActive('highlight'),
        isDisabled: (editor) => !editor.isEditable,
      });

      items.set('highlightColor', {
        id: 'highlightColor',
        icon: icons.highlightColor,
        popup: true,
        command: (_editor, button) =>
          this.styleOptionPanel.toggle(
            button,
            this.styleSpec('highlightColor', {
              shape: 'grid',
              options: HIGHLIGHT_COLORS,
              swatch: true,
              attr: 'highlight',
            })
          ),
        isActive: () => this.stylePanel?.openKey === 'highlightColor',
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    if (textStyleReady('fontSize')) {
      items.set('fontSize', {
        id: 'fontSize',
        icon: icons.fontSize,
        popup: true,
        command: (_editor, button) =>
          this.styleOptionPanel.toggle(
            button,
            this.styleSpec('fontSize', {
              shape: 'list',
              options: FONT_SIZES,
              swatch: false,
              attr: 'fontSize',
            })
          ),
        isActive: () => this.stylePanel?.openKey === 'fontSize',
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    if (textStyleReady('fontFamily')) {
      items.set('fontFamily', {
        id: 'fontFamily',
        icon: icons.fontFamily,
        popup: true,
        command: (_editor, button) =>
          this.styleOptionPanel.toggle(
            button,
            this.styleSpec('fontFamily', {
              shape: 'list',
              options: FONT_FAMILIES,
              swatch: false,
              attr: 'fontFamily',
            })
          ),
        isActive: () => this.stylePanel?.openKey === 'fontFamily',
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    if (hasMark(this.editor, 'subscript')) {
      items.set('subscript', {
        id: 'subscript',
        icon: icons.subscript,
        command: (editor) => editor.chain().focus().toggleSubscript().run(),
        isActive: (editor) => editor.isActive('subscript'),
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    if (hasMark(this.editor, 'superscript')) {
      items.set('superscript', {
        id: 'superscript',
        icon: icons.superscript,
        command: (editor) => editor.chain().focus().toggleSuperscript().run(),
        isActive: (editor) => editor.isActive('superscript'),
        isDisabled: (editor) => !editor.isEditable,
      });
    }

    // 清除格式：把选区上所有 mark 与块级类型一起退回默认。
    // 常驻不禁用——unsetAllMarks 对空格式光标是无操作，而不是报错，
    // 要为"有没有可清除的东西"做判定就得遍历选区，不值当
    items.set('clearFormat', {
      id: 'clearFormat',
      icon: icons.clearFormat,
      command: (editor) => editor.chain().focus().unsetAllMarks().clearNodes().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.isEditable,
    });

    // 删除作用于选中的整节点：一段文字该交给 Delete 键，所以它不进顶栏默认布局
    items.set('delete', {
      id: 'delete',
      icon: icons.trash,
      command: (editor) => editor.chain().deleteSelection().run(),
      isActive: () => false,
      isDisabled: (editor) => !isNodeSelection(editor.state.selection),
    });

    // 撤销
    items.set('undo', {
      id: 'undo',
      icon: icons.undo,
      command: (editor) => editor.chain().undo().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.can().undo(),
    });

    // 重做
    items.set('redo', {
      id: 'redo',
      icon: icons.redo,
      command: (editor) => editor.chain().redo().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.can().redo(),
    });

    // 标题 1–6。原来只到 3，而 schema 与输入规则一直是 1..6（StarterKit 默认 levels），
    // 缺的只是入口——4/5/6 落在标题菜单里，不用点开顶栏也够得着。
    // 四个新级别用通用 heading 图标：它们只在菜单里以文字标签出现，
    // 而我要是真去手搓三个数字字形，既没法验证好不好看、又和 tooltip 里的"标题 4"重复
    [1, 2, 3, 4, 5, 6].forEach((level) => {
      const id = `heading${level}`;
      items.set(id, {
        id,
        icon: level <= 3 ? icons[id] : icons.heading,
        command: (editor) =>
          editor
            .chain()
            .toggleHeading({ level } as never)
            .run(),
        isActive: (editor) => editor.isActive('heading', { level } as never),
        isDisabled: (editor) => !editor.can().toggleHeading({ level } as never),
      });
    });

    // 正文
    items.set('paragraph', {
      id: 'paragraph',
      icon: icons.paragraph,
      command: (editor) => editor.chain().setParagraph().run(),
      isActive: (editor) => editor.isActive('paragraph'),
      isDisabled: (editor) => !editor.can().setParagraph(),
    });

    // 加粗
    items.set('bold', {
      id: 'bold',
      icon: icons.bold,
      command: (editor) => editor.chain().toggleBold().run(),
      isActive: (editor) => editor.isActive('bold'),
      isDisabled: (editor) => !editor.can().toggleBold(),
    });

    // 斜体
    items.set('italic', {
      id: 'italic',
      icon: icons.italic,
      command: (editor) => editor.chain().toggleItalic().run(),
      isActive: (editor) => editor.isActive('italic'),
      isDisabled: (editor) => !editor.can().toggleItalic(),
    });

    // 下划线
    items.set('underline', {
      id: 'underline',
      icon: icons.underline,
      command: (editor) => editor.chain().toggleUnderline().run(),
      isActive: (editor) => editor.isActive('underline'),
      isDisabled: (editor) => !editor.can().toggleUnderline(),
    });

    // 删除线
    items.set('strike', {
      id: 'strike',
      icon: icons.strikethrough,
      command: (editor) => editor.chain().toggleStrike().run(),
      isActive: (editor) => editor.isActive('strike'),
      isDisabled: (editor) => !editor.can().toggleStrike(),
    });

    // 行内代码
    items.set('code', {
      id: 'code',
      icon: icons.code,
      command: (editor) => editor.chain().toggleCode().run(),
      isActive: (editor) => editor.isActive('code'),
      isDisabled: (editor) => !editor.can().toggleCode(),
    });

    // 无序列表
    items.set('bulletList', {
      id: 'bulletList',
      icon: icons.list,
      command: (editor) => editor.chain().toggleBulletList().run(),
      isActive: (editor) => editor.isActive('bulletList'),
      isDisabled: (editor) => !editor.can().toggleBulletList(),
    });

    // 有序列表
    items.set('orderedList', {
      id: 'orderedList',
      icon: icons.listOrdered,
      command: (editor) => editor.chain().toggleOrderedList().run(),
      isActive: (editor) => editor.isActive('orderedList'),
      isDisabled: (editor) => !editor.can().toggleOrderedList(),
    });

    // 任务列表
    items.set('taskList', {
      id: 'taskList',
      icon: icons.listChecks,
      command: (editor) => editor.chain().toggleTaskList().run(),
      isActive: (editor) => editor.isActive('taskList'),
      isDisabled: (editor) => !editor.can().toggleTaskList(),
    });

    // 引用
    items.set('blockquote', {
      id: 'blockquote',
      icon: icons.quote,
      command: (editor) => editor.chain().toggleBlockquote().run(),
      isActive: (editor) => editor.isActive('blockquote'),
      isDisabled: (editor) => !editor.can().toggleBlockquote(),
    });

    // 代码块。节点不在就不注册这一项：codeBlock:false 且接入方没给替代实现时，
    // toggleCodeBlock 这个命令根本不存在，而 isDisabled 会在每次状态刷新里调它——
    // 不注册的话编辑器直接抛（实测 editor.can(...).toggleCodeBlock is not a function，
    // 每次事务都抛一遍）。与表格、媒体同一套做法：能力不在，项就不在
    if (this.editor.schema.nodes.codeBlock) {
      items.set('codeBlock', {
        id: 'codeBlock',
        icon: icons.codeBlock,
        command: (editor) => editor.chain().toggleCodeBlock().run(),
        isActive: (editor) => editor.isActive('codeBlock'),
        isDisabled: (editor) => !editor.can().toggleCodeBlock(),
      });
    }

    // 分割线：插入型操作，没有"激活"态可言
    items.set('horizontalRule', {
      id: 'horizontalRule',
      icon: icons.horizontalRule,
      command: (editor) => editor.chain().setHorizontalRule().run(),
      isActive: () => false,
      isDisabled: (editor) => !editor.can().setHorizontalRule(),
    });

    // 左对齐
    items.set('alignLeft', {
      id: 'alignLeft',
      icon: icons.alignLeft,
      command: (editor) => editor.chain().setTextAlign('left').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'left' }),
      isDisabled: (editor) => !editor.can().setTextAlign('left'),
    });

    // 居中
    items.set('alignCenter', {
      id: 'alignCenter',
      icon: icons.alignCenter,
      command: (editor) => editor.chain().setTextAlign('center').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'center' }),
      isDisabled: (editor) => !editor.can().setTextAlign('center'),
    });

    // 右对齐
    items.set('alignRight', {
      id: 'alignRight',
      icon: icons.alignRight,
      command: (editor) => editor.chain().setTextAlign('right').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'right' }),
      isDisabled: (editor) => !editor.can().setTextAlign('right'),
    });

    // 两端对齐：命令与词条早就有，缺的只是这个按钮
    items.set('alignJustify', {
      id: 'alignJustify',
      icon: icons.alignJustify,
      command: (editor) => editor.chain().setTextAlign('justify').run(),
      isActive: (editor) => editor.isActive({ textAlign: 'justify' }),
      isDisabled: (editor) => !editor.can().setTextAlign('justify'),
    });

    // 两个内置下拉。之所以收成菜单而不是平铺：标题本来就有六级、对齐四种，
    // 平铺在顶栏上要占十个格子，而用户一次只关心"现在改成哪一级"。
    // children 走同一张 itemDefs，所以能力门控自动生效（段落在 schema 里没有时不会出现在菜单）
    items.set(
      'heading',
      this.menuItem('heading', icons.heading, [
        'heading1',
        'heading2',
        'heading3',
        'heading4',
        'heading5',
        'heading6',
        'paragraph',
      ])
    );

    items.set(
      'align',
      this.menuItem('align', icons.align, [
        'alignLeft',
        'alignCenter',
        'alignRight',
        'alignJustify',
      ])
    );

    return items;
  }

  /**
   * 绑定编辑器事件，更新按钮状态
   */
  private bindEditorEvents(): void {
    const refresh = () => this.updateButtonStates();

    this.editor.on('transaction', refresh);
    this.editor.on('selectionUpdate', refresh);

    // 工具栏是公开导出的类：宿主单独用它、只销毁工具栏而留着编辑器时，
    // 这两条订阅会常驻到编辑器结束，每次事务空跑一遍按钮刷新
    this.unsubscribeEditor = () => {
      this.editor.off('transaction', refresh);
      this.editor.off('selectionUpdate', refresh);
    };

    // 初始状态
    this.updateButtonStates();
  }

  /**
   * 更新所有按钮状态
   *
   * 公开是因为浮层开合不改文档，等不到 transaction：挂在门面上的浮层（链接）
   * 由门面在开合时叫一次，挂在这里的浮层则在 onOpenChange 里叫
   */
  updateButtonStates(): void {
    this.buttons.forEach((buttons, itemId) => {
      const itemDef = this.itemDefs.get(itemId);
      if (!itemDef) return;

      // 更新 active 状态
      const active = itemDef.isActive(this.editor);
      const disabled = itemDef.isDisabled(this.editor);

      buttons.forEach((button) => {
        button.classList.toggle('active', active);
        if (itemDef.popup) button.setAttribute('aria-expanded', String(active));

        // 更新 disabled 状态
        button.disabled = disabled;

        if (itemDef.popup === 'menu') this.refreshMenuTrigger(itemDef, button);
      });
    });
  }

  /**
   * 一项当前该显示的文字。下拉触发器跟着命中的子项走（现在是三级标题就写「标题 3」），
   * 宿主显式写的 tooltip 优先级最高。
   * 抽出来是因为图标与提示必须由同一份判定得出：只换其中一个就会出现
   * "按钮画着 H3、悬停写标题"这种一半新一半旧的界面
   */
  private itemTitle(itemId: string, def: ToolbarItemDef): string {
    const custom = this.customTooltips.get(itemId);
    if (custom) return custom;

    let key = TOOLTIP_KEYS[itemId];
    if (def.popup === 'menu') {
      const activeKey = TOOLTIP_KEYS[this.activeChild(def)?.id ?? ''];
      if (activeKey) key = activeKey;
    }

    const fallback = key ? zhText(key) : (def.tooltip ?? '');
    return key ? this.tOr(key, fallback) : fallback;
  }

  /**
   * 下拉触发器的图标与提示跟着当前值走：现在是二级标题就显示 H2，
   * 一个都不匹配才退回通用图标。只有菜单项会走到这里，不是每次刷新对所有按钮都做一遍
   */
  private refreshMenuTrigger(def: ToolbarItemDef, button: HTMLButtonElement): void {
    const base = button.dataset.menuIcon ?? def.icon;
    const next = `${this.activeChild(def)?.icon ?? base}${icons.chevronDown}`;
    if (button.innerHTML !== next) button.innerHTML = next;

    const title = this.itemTitle(def.id, def);
    if (button.title !== title) button.title = title;
  }

  /**
   * 销毁工具栏
   */
  destroy(): void {
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = undefined;
    this.unsubscribeEditor?.();
    this.unsubscribeEditor = undefined;
    // 面板挂在 document.body 上，不跟着工具栏一起收就会留在页面上
    this.panel?.destroy();
    this.panel = null;
    this.tablePanel?.destroy();
    this.tablePanel = null;
    this.stylePanel?.destroy();
    this.stylePanel = null;
    this.menuPanel?.destroy();
    this.menuPanel = null;
    this.buttons.clear();
    this.customTooltips.clear();
    // 浮层元素归门面所有，要活过重建编辑器，所以这里既不 remove 也不清空它
    this.createdElements.forEach((el) => el.remove());
    this.createdElements = [];
  }
}
