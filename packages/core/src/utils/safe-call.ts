/**
 * 宿主回调隔离
 *
 * 编辑器在 Tiptap 的事件里同步调用宿主传入的 onCreate/onChange/onError/…，
 * 一个抛错的回调会把整条 dispatch 链打断——症状是"敲了键但文档没变"，
 * 排查方向还会被带到编辑器身上。回调是外部输入，边界处就得自己兜住。
 */

/** 同一个回调引用只报一次：坏掉的 onUpdate 每敲一键触发一次，不去重就是刷屏 */
const reported = new WeakSet<object>();

/**
 * 调用宿主回调，异常降级成一条日志。
 *
 * 非函数（宿主没配这个钩子）静默返回，不占用去重名额。
 * 只用于包宿主的函数，库内部逻辑不要经这里——那会把真正的 bug 也吞成日志。
 */
export function runSafely(callback: unknown, label: string, args: unknown[] = []): void {
  if (typeof callback !== 'function') return;

  try {
    callback(...args);
  } catch (error) {
    if (reported.has(callback)) return;
    reported.add(callback);
    console.error(`[Atri Editor] The "${label}" callback threw and was skipped:`, error);
  }
}
