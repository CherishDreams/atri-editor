/**
 * DOM 工具函数
 */

/**
 * 解析元素选择器，返回 HTMLElement
 */
export function resolveElement(element: string | HTMLElement): HTMLElement {
  if (typeof element === 'string') {
    const el = document.querySelector(element);
    if (!el) {
      throw new Error(`Element not found: ${element}`);
    }
    return el as HTMLElement;
  }
  return element;
}

/**
 * 创建带 class 的 div 元素
 */
export function createContainer(className?: string): HTMLDivElement {
  const div = document.createElement('div');
  if (className) {
    div.className = className;
  }
  return div;
}

/**
 * 从拖放/剪贴板事件里取文件列表
 * 剪贴板里的截图与文件都在 files 上，text 为空不代表没有可投的东西
 */
export function filesOf(transfer: DataTransfer | null | undefined): File[] {
  if (!transfer) return [];
  return Array.from(transfer.files);
}
