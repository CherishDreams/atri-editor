import type { UploadContext, UploadResult } from '@atri-editor/core';

/**
 * 假上传通道：与 demos/vanilla 的 simulateUpload 同构。
 * 每 120ms 涨 10%；shouldFail() 为真时在终点注入失败；
 * 编辑器销毁或节点被删时 signal 中止定时器。
 */
export function createSimulateUpload(shouldFail: () => boolean) {
  return (file: File, context: UploadContext): Promise<UploadResult> =>
    new Promise<UploadResult>((resolve, reject) => {
      let percent = 0;

      const settle = () => {
        if (shouldFail()) {
          reject(new Error('模拟上传失败'));
          return;
        }
        const isImage = file.type.indexOf('image/') === 0;
        const url = isImage
          ? `https://picsum.photos/seed/${encodeURIComponent(file.name)}/480/270`
          : `https://cdn.example.com/uploads/${encodeURIComponent(file.name)}`;
        resolve({ url, name: file.name });
      };

      const timer = setInterval(() => {
        percent = Math.min(100, percent + 10);
        context.onProgress({
          percent,
          loaded: Math.round((file.size * percent) / 100),
          total: file.size,
        });
        if (percent >= 100) {
          clearInterval(timer);
          settle();
        }
      }, 120);

      context.signal.addEventListener('abort', () => {
        clearInterval(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
}
