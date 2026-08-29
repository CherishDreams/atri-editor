/**
 * Uploader - 上传通道
 *
 * 两条路：用户给 handler 就完全接管；给 endpoint 就走内置 XHR。
 * 选 XHR 而不是 fetch，是因为 fetch 没有可移植的上传进度事件（xhr.upload.onprogress）。
 */
import type { AtriUploadConfig, UploadContext, UploadHandler, UploadResult } from '../types';

export interface Uploader {
  upload(file: File, context: UploadContext): Promise<UploadResult>;
}

/** 从五花八门的响应体里挑出可用的地址 */
function pickUrl(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;

  const record = body as Record<string, any>;
  const candidates = [record.url, record.location, (record.data as any)?.url];
  const url = candidates.find((value) => typeof value === 'string' && value !== '');

  return url;
}

function uploadViaEndpoint(
  config: AtriUploadConfig,
  file: File,
  context: UploadContext
): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', config.endpoint, true);
    xhr.withCredentials = config.withCredentials ?? false;

    Object.entries(config.headers ?? {}).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || !event.total) return;
      context.onProgress({
        percent: Math.round((event.loaded / event.total) * 100),
        loaded: event.loaded,
        total: event.total,
      });
    };

    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(`上传失败：HTTP ${xhr.status}`));
        return;
      }

      let body: unknown = null;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // 有些接口直接返回地址字符串
        body = xhr.responseText;
      }

      if (config.transformResult) {
        resolve(config.transformResult(body, file));
        return;
      }

      // 响应本身就是地址字符串时也认，省掉一个必填配置
      const url = typeof body === 'string' ? body : pickUrl(body);

      if (!url) {
        reject(new Error('上传失败：响应里找不到文件地址，请用 upload.transformResult 指定'));
        return;
      }

      resolve({ url });
    };

    xhr.onerror = () => reject(new Error('上传失败：网络错误'));
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

    if (context.signal.aborted) {
      xhr.abort();
      return;
    }
    context.signal.addEventListener('abort', () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append(config.fieldName ?? 'file', file, config.requestName?.(file) ?? file.name);
    xhr.send(form);
  });
}

export function createUploader(upload?: AtriUploadConfig | UploadHandler): Uploader | null {
  if (!upload) return null;

  if (typeof upload === 'function') {
    return { upload: (file, context) => upload(file, context) };
  }

  if (!upload.endpoint) return null;

  return { upload: (file, context) => uploadViaEndpoint(upload, file, context) };
}
