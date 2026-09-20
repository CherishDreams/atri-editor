/**
 * TableMenu - 光标落在表格里时浮出的上下文操作菜单
 *
 * 与工具栏浮层（InsertPanel / TableGridPanel）同一套外观，但触发方式不同：它没有锚点按钮，
 * 靠选区进入表格自动浮出，所以定位锚是「当前单元格的 DOM 盒子」，量不到再退回光标坐标
 * （AICommandMenu 的虚拟锚点写法）。
 *
 * 行列增删合并这些命令由 prosemirror-tables 提供，此前只有命令没有入口，
 * 表格因此是"插得出来、改不动"的半成品。
 */
import type { Editor } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
import { computePosition, flip, offset, shift } from '@floating-ui/dom';
import { copyThemeClasses } from './floating-panel';
import { tOrFallback, type I18nManager } from './I18nManager';
import { icons } from './icons';

export interface TableMenuOptions {
  editor: Editor;
  /**
   * 编辑器根容器（.atri-editor）：只用来复制主题类
   *
   * 不取 editor.view.dom：那个视图是迟到且会被销毁的，而这个容器由门面创建，生命周期一致
   */
  root: HTMLElement;
  i18n?: I18nManager;
}

/** 单元格对齐取值：与单元格 align 属性的取值域一致 */
type CellAlignment = 'left' | 'center' | 'right';

interface TableMenuItemDef {
  id: string;
  icon: string;
  labelKey: string;
  /** i18n 缺失时的中文兜底 */
  label: string;
  /** 组序号，组与组之间画一条竖线 */
  group: number;
  command: (editor: Editor) => void;
  isDisabled?: (editor: Editor) => boolean;
  isActive?: (editor: Editor) => boolean;
}

/** 选区所在的单元格（或表头）节点位置；不在表格里返回 null */
function cellPos(state: EditorState): number | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name;
    if (name === 'tableCell' || name === 'tableHeader') return $from.before(depth);
  }
  return null;
}

function cellAlignmentActive(align: CellAlignment) {
  return (editor: Editor): boolean =>
    editor.isActive('tableCell', { align }) || editor.isActive('tableHeader', { align });
}

function buildItems(): TableMenuItemDef[] {
  const items: TableMenuItemDef[] = [
    {
      id: 'addRowBefore',
      icon: icons.tableRowBefore,
      labelKey: 'table.rowBefore',
      label: '上方插入行',
      group: 0,
      command: (editor) => editor.chain().focus().addRowBefore().run(),
    },
    {
      id: 'addRowAfter',
      icon: icons.tableRowAfter,
      labelKey: 'table.rowAfter',
      label: '下方插入行',
      group: 0,
      command: (editor) => editor.chain().focus().addRowAfter().run(),
    },
    {
      id: 'deleteRow',
      icon: icons.tableRowDelete,
      labelKey: 'table.deleteRow',
      label: '删除行',
      group: 0,
      command: (editor) => editor.chain().focus().deleteRow().run(),
    },
    {
      id: 'addColumnBefore',
      icon: icons.tableColumnBefore,
      labelKey: 'table.columnBefore',
      label: '左侧插入列',
      group: 1,
      command: (editor) => editor.chain().focus().addColumnBefore().run(),
    },
    {
      id: 'addColumnAfter',
      icon: icons.tableColumnAfter,
      labelKey: 'table.columnAfter',
      label: '右侧插入列',
      group: 1,
      command: (editor) => editor.chain().focus().addColumnAfter().run(),
    },
    {
      id: 'deleteColumn',
      icon: icons.tableColumnDelete,
      labelKey: 'table.deleteColumn',
      label: '删除列',
      group: 1,
      command: (editor) => editor.chain().focus().deleteColumn().run(),
    },
    {
      // 合并要有两个以上单元格被框住，单选一个时按不动——禁用而不是隐藏，位置别跳
      id: 'mergeCells',
      icon: icons.tableMergeCells,
      labelKey: 'table.mergeCells',
      label: '合并单元格',
      group: 2,
      command: (editor) => editor.chain().focus().mergeCells().run(),
      isDisabled: (editor) => !editor.can().mergeCells(),
    },
    {
      id: 'splitCell',
      icon: icons.tableSplitCell,
      labelKey: 'table.splitCell',
      label: '拆分单元格',
      group: 2,
      command: (editor) => editor.chain().focus().splitCell().run(),
      isDisabled: (editor) => !editor.can().splitCell(),
    },
    {
      id: 'toggleHeaderRow',
      icon: icons.tableHeaderRow,
      labelKey: 'table.toggleHeaderRow',
      label: '切换表头行',
      group: 2,
      command: (editor) => editor.chain().focus().toggleHeaderRow().run(),
      isActive: (editor) => editor.isActive('tableHeader'),
    },
  ];

  // 对齐写在单元格自带的 align 属性上：Markdown 的 pipe table 分隔行（:---）也读它，
  // 于是这一下对齐在导出 Markdown 后仍然成立
  const alignments: [CellAlignment, string, string][] = [
    ['left', 'table.alignLeft', '单元格左对齐'],
    ['center', 'table.alignCenter', '单元格居中'],
    ['right', 'table.alignRight', '单元格右对齐'],
  ];
  alignments.forEach(([align, labelKey, label]) => {
    const suffix = `${align[0].toUpperCase()}${align.slice(1)}`;
    items.push({
      id: `cellAlign${suffix}`,
      icon: icons[`align${suffix}`],
      labelKey,
      label,
      group: 3,
      command: (editor) => editor.chain().focus().setCellAttribute('align', align).run(),
      isActive: cellAlignmentActive(align),
    });
  });

  items.push({
    id: 'deleteTable',
    icon: icons.trash,
    labelKey: 'table.deleteTable',
    label: '删除表格',
    group: 4,
    command: (editor) => editor.chain().focus().deleteTable().run(),
  });

  return items;
}

export class TableMenu {
  private editor: Editor;
  private root: HTMLElement;
  private i18n?: I18nManager;
  private items: TableMenuItemDef[];
  private unsubscribeLanguage?: () => void;

  private element: HTMLDivElement | null = null;
  private detachEscape: (() => void) | undefined;
  /** Escape 收起后不再自动浮出，直到光标离开表格（否则下一次状态更新立刻又把它拉出来） */
  private dismissed = false;

  constructor(options: TableMenuOptions) {
    this.editor = options.editor;
    this.root = options.root;
    this.i18n = options.i18n;
    this.items = buildItems();

    this.editor.on('update', this.sync);
    this.editor.on('selectionUpdate', this.sync);
    this.editor.on('focus', this.sync);
    this.editor.on('blur', this.onBlur);
    // 浮层是 fixed 定位，滚动不会带着它走：滚的是哪一层不确定，捕获阶段挂在 document 上
    document.addEventListener('scroll', this.onScroll, true);
    this.unsubscribeLanguage = this.i18n?.onLanguageChanged(() => this.applyLabels());

    this.sync();
  }

  get isOpen(): boolean {
    return this.element !== null;
  }

  destroy(): void {
    this.editor.off('update', this.sync);
    this.editor.off('selectionUpdate', this.sync);
    this.editor.off('focus', this.sync);
    this.editor.off('blur', this.onBlur);
    document.removeEventListener('scroll', this.onScroll, true);
    this.unsubscribeLanguage?.();
    this.unsubscribeLanguage = undefined;
    this.hide();
  }

  private t(key: string, fallback: string): string {
    return tOrFallback(this.i18n, key, fallback);
  }

  /**
   * 按当前选区决定浮出还是收起。光标在表格里是唯一条件——
   * 空选区、单元格内选一段字、框选多个单元格都算
   *
   * 听的是 update 而不是 transaction：setEditable 只发 update（造一个空事务），
   * 切只读时若不跟着重判，菜单会留在只读的表格上
   */
  private sync = (): void => {
    const inTable = cellPos(this.editor.state) !== null;
    if (!inTable) {
      // 离开表格，Escape 那一次收起到此为止
      this.dismissed = false;
      this.hide();
      return;
    }

    if (this.dismissed || !this.editor.isEditable) {
      this.hide();
      return;
    }

    this.show();
  };

  /** 点到编辑器外面就收起来：菜单没有"关了还要在"的理由，焦点回来时 sync 会重新浮出 */
  private onBlur = (): void => {
    this.hide();
  };

  private onScroll = (): void => {
    if (this.element) void this.position();
  };

  private dismiss = (): void => {
    this.dismissed = true;
    this.hide();
  };

  private show(): void {
    if (!this.element) this.build();
    this.updateStates();
    void this.position();
  }

  private hide(): void {
    this.detachEscape?.();
    this.detachEscape = undefined;
    if (!this.element) return;
    this.element.remove();
    this.element = null;
  }

  /**
   * Escape 收起菜单。这里不用 floating-panel 的 listenPanelDismiss：那一套还管外点关闭，
   * 而点外面多半仍落在同一个单元格里，关了立刻被下一次状态更新重新浮出，只会闪
   */
  private listenEscape(): () => void {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      this.dismiss();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }

  private build(): void {
    const panel = document.createElement('div');
    panel.className = 'atri-table-menu';
    panel.setAttribute('role', 'toolbar');
    panel.setAttribute('aria-label', this.t('table.menuLabel', '表格操作'));

    // 按钮不抢焦点：抢走会让编辑器 blur，而 blur 正是收起菜单的条件，
    // 于是 mousedown 一按菜单就没了、click 根本派发不到按钮上
    panel.addEventListener('mousedown', (event) => event.preventDefault());

    let lastGroup: number | null = null;
    this.items.forEach((item) => {
      if (lastGroup !== null && item.group !== lastGroup) {
        const separator = document.createElement('div');
        separator.className = 'atri-table-menu-separator';
        panel.appendChild(separator);
      }
      lastGroup = item.group;

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'atri-editor-toolbar-btn';
      button.setAttribute('data-table-item', item.id);
      button.title = this.t(item.labelKey, item.label);
      button.innerHTML = item.icon;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        item.command(this.editor);
      });
      panel.appendChild(button);
    });

    document.body.appendChild(panel);
    this.element = panel;
    copyThemeClasses(this.root, panel);
    this.detachEscape = this.listenEscape();
  }

  private applyLabels(): void {
    const panel = this.element;
    if (!panel) return;
    panel.setAttribute('aria-label', this.t('table.menuLabel', '表格操作'));
    this.items.forEach((item) => {
      const button = panel.querySelector<HTMLButtonElement>(`[data-table-item="${item.id}"]`);
      if (button) button.title = this.t(item.labelKey, item.label);
    });
  }

  private updateStates(): void {
    const panel = this.element;
    if (!panel) return;

    this.items.forEach((item) => {
      const button = panel.querySelector<HTMLButtonElement>(`[data-table-item="${item.id}"]`);
      if (!button) return;
      button.disabled = item.isDisabled?.(this.editor) ?? false;
      button.classList.toggle('active', item.isActive?.(this.editor) ?? false);
    });
  }

  /**
   * 当前单元格的虚拟锚点；量不到返回 null，调用方保持面板可见但不改坐标
   *
   * 优先锚在单元格盒子上（菜单跟着格子走，比跟着光标稳），拿不到盒子才退回光标坐标
   */
  private anchor(): { getBoundingClientRect(): DOMRect } | null {
    const { view, state } = this.editor;
    const pos = cellPos(state);

    if (pos !== null) {
      try {
        const dom = view.nodeDOM(pos);
        if (dom instanceof HTMLElement) {
          const rect = dom.getBoundingClientRect();
          // jsdom 里所有盒子都是 0×0，靠这个判据自觉退回光标坐标
          if (rect.width || rect.height) return { getBoundingClientRect: () => rect };
        }
      } catch {
        // 量不到就往下走，别让定位问题变成"菜单不出现"
      }
    }

    try {
      const coords = view.coordsAtPos(state.selection.from);
      return {
        getBoundingClientRect: () =>
          new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top),
      };
    } catch {
      return null;
    }
  }

  private async position(): Promise<void> {
    const panel = this.element;
    if (!panel) return;

    const reference = this.anchor();
    if (!reference) return;

    let x: number;
    let y: number;
    try {
      ({ x, y } = await computePosition(reference, panel, {
        // 贴在单元格上沿：菜单跟着当前格走，长表格里也不会跑到视口外
        placement: 'top-start',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }));
    } catch {
      // 定位失败也要让菜单可见：宁可位置不理想，也不能点了没反应
      return;
    }

    // 异步算位置的间隙里菜单可能已经收起或被重建
    if (this.element !== panel) return;
    panel.style.position = 'fixed';
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
  }
}
