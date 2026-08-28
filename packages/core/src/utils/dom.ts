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
 * 检查是否在浏览器环境
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}
