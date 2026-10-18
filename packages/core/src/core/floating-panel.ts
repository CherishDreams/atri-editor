/**
 * floating-panel - 工具栏浮层的公共底盘
 *
 * 浮层统一挂 document.body + fixed 定位：工具栏链路任何一处 overflow 都会裁掉子元素。
 * InsertPanel / TableGridPanel / LinkPanel / TableMenu / 格式选择面板共用这里的
 * 定位、外点与 Escape 关闭、主题类跟随三段。
 */
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';

export interface FloatingPanel {
  /** 停止位置跟随；重复调用无副作用 */
  stop: () => void;
}

/** 浮层与锚点之间的间隙 */
const PANEL_OFFSET = 6;
/** 贴到视口边缘时留出的安全内边距 */
const PANEL_SHIFT_PADDING = 8;

/**
 * 浮层共用的三段中间件：溢出翻转 + 贴边收拢。
 *
 * 各处只有 placement 不同（工具栏向下、表格菜单贴着单元格向上），
 * 这三个参数此前被抄成 offset(6)/offset(6)/offset(8)、shift(8)/shift(8)/shift()，
 * 差的那 2px 没人说得清是有意还是漏改
 */
export function panelMiddleware(): ReturnType<typeof offset | typeof flip | typeof shift>[] {
  return [offset(PANEL_OFFSET), flip(), shift({ padding: PANEL_SHIFT_PADDING })];
}

/** 落位：浮层统一 fixed，坐标是 computePosition 给的视口值 */
export function placePanel(panel: HTMLElement, x: number, y: number): void {
  panel.style.position = 'fixed';
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
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
        middleware: panelMiddleware(),
      });
      // 算位置的这几微秒里面板可能已经关了
      if (!isCurrent()) return;
      placePanel(panel, x, y);
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

const THEME_PREFIX = 'atri-theme-';

/** 把 target 上的主题类换成 source 当前那一套；先摘后加，所以重复调用不会攒出两套主题 */
function syncThemeClasses(target: HTMLElement, root: Element): void {
  Array.from(target.classList)
    .filter((name) => name.startsWith(THEME_PREFIX))
    .forEach((name) => target.classList.remove(name));

  const themes = Array.from(root.classList).filter((name) => name.startsWith(THEME_PREFIX));
  target.classList.add(...themes);
}

/**
 * 主题变量写在 .atri-editor 上，浮层挂在 body 上够不着，只能把主题类复制一份。
 * 面板此刻往往还没入 DOM，closest 搜不到编辑器根，所以源元素必须由编辑器侧给（如 view.dom）
 *
 * 只复制一次是不够的：ThemeManager 换主题只动容器上的 class，已经打开的浮层无从得知，
 * 于是"开着面板切主题"会得到一个浅色面板配深色正文。这里改成持续跟随：
 * 观察者盯的是容器自己的 class（面板自己的改动不会触发它，没有回环），
 * 返回的 disposer 由面板在关闭与销毁时调用。
 */
export function followThemeClasses(source: Element | null, panel: HTMLElement): () => void {
  const root = source?.closest('.atri-editor') ?? null;
  if (root) syncThemeClasses(panel, root);
  if (!root || typeof MutationObserver === 'undefined') return () => {};

  const observer = new MutationObserver(() => syncThemeClasses(panel, root));
  observer.observe(root, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
