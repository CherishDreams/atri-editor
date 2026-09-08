/**
 * floating-panel - 工具栏浮层的公共底盘
 *
 * 浮层统一挂 document.body + fixed 定位：工具栏链路任何一处 overflow 都会裁掉子元素。
 * InsertPanel 与 TableGridPanel 共用这里的定位、外点/Escape 关闭与主题类复制三段。
 */
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

export interface FloatingPanel {
  /** 停止位置跟随；重复调用无副作用 */
  stop: () => void;
}

/**
 * 把面板锚定到 trigger 下方并持续跟随。
 * isCurrent 用于在异步计算间隙确认面板还没被关掉/换掉——关掉的实例不该再写样式
 */
export function positionPanel(
  trigger: HTMLElement,
  panel: HTMLElement,
  isCurrent: () => boolean
): FloatingPanel {
  let stopAutoUpdate: (() => void) | null = null;

  const update = async () => {
    if (!isCurrent()) return;
    try {
      const { x, y } = await computePosition(trigger, panel, {
        placement: 'bottom-start',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      });
      // 算位置的这几微秒里面板可能已经关了
      if (!isCurrent()) return;
      panel.style.position = 'fixed';
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
    } catch {
      // 量不到也要让面板看得见：宁可位置不理想，也不能点了没反应
    }
  };

  void update().then(() => {
    if (isCurrent()) {
      stopAutoUpdate = autoUpdate(trigger, panel, () => void update());
    }
  });

  return {
    stop: () => {
      stopAutoUpdate?.();
      stopAutoUpdate = null;
    },
  };
}

/**
 * 点外面与 Escape 关闭；trigger 本身交给调用方的 toggle，
 * 否则关了又立刻被这次点击重开
 */
export function listenPanelDismiss(
  trigger: HTMLElement,
  panel: HTMLElement,
  onClose: () => void
): () => void {
  const onPointerDown = (event: Event) => {
    const target = event.target as Node | null;
    if (!target || panel.contains(target) || trigger.contains(target)) return;
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    onClose();
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  };
}

/**
 * 主题变量写在 .atri-editor 上，浮层挂在 body 上够不着，只能把主题类复制一份。
 * 面板此刻往往还没入 DOM，closest 搜不到编辑器根，所以源元素必须由编辑器侧给（如 view.dom）
 */
export function copyThemeClasses(source: Element | null, panel: HTMLElement): void {
  const root = source?.closest('.atri-editor');
  const themes = Array.from(root?.classList ?? []).filter((name) => name.startsWith('atri-theme-'));
  panel.classList.add(...themes);
}
