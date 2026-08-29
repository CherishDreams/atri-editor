/**
 * 文件策略：大小展示与类型白名单
 */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
const UNIT_FACTOR = 1024;

/**
 * 字节数 → 人类可读标签，1024 进制
 * B 之外的单位保留一位小数，整数值去掉多余的 .0
 */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < UNIT_FACTOR) return `${Math.round(bytes)} B`;

  let value = bytes;
  let unit = 0;
  while (value >= UNIT_FACTOR && unit < UNITS.length - 1) {
    value /= UNIT_FACTOR;
    unit += 1;
  }

  const label = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${label} ${UNITS[unit]}`;
}

/**
 * 人类可读标签 → 字节数
 * 与 formatFileSize 成对使用；标签只有一位小数精度，因此还原值是近似值
 */
export function parseFileSize(label?: string | null): number | undefined {
  if (!label) return undefined;
  const match = /^\s*([\d.]+)\s*(B|KB|MB|GB|TB)\s*$/i.exec(label);
  if (!match) return undefined;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return undefined;

  const unit = UNITS.indexOf(match[2].toUpperCase() as (typeof UNITS)[number]);
  return Math.round(value * UNIT_FACTOR ** unit);
}

/** 单个文件默认上限：10MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * UNIT_FACTOR ** 2;

/** 一次投放/选择的默认文件数上限 */
export const DEFAULT_MAX_FILES = 10;

/** accept 支持的三种写法：`.pdf`、`image/*`、`image/png` */
export function matchesAccept(file: File, accept?: string | string[]): boolean {
  if (!accept) return true;

  const patterns = (Array.isArray(accept) ? accept : accept.split(','))
    .map((pattern) => pattern.trim().toLowerCase())
    .filter(Boolean);

  if (!patterns.length) return true;

  const name = file.name.toLowerCase();
  const type = (file.type || '').toLowerCase();

  return patterns.some((pattern) => {
    if (pattern.startsWith('.')) return name.endsWith(pattern);
    if (pattern.endsWith('/*')) return type.startsWith(pattern.slice(0, -1));
    return type === pattern;
  });
}

/** 把配置的 accept 归一成 <input accept> 需要的逗号串：选择器与校验得是同一份白名单 */
export function acceptAttribute(accept?: string | string[]): string | undefined {
  if (!accept) return undefined;
  const patterns = (Array.isArray(accept) ? accept : accept.split(','))
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  return patterns.length ? patterns.join(',') : undefined;
}

export type FileValidation = { ok: true } | { ok: false; reason: 'too-large' | 'unsupported-type' };

export function validateFile(
  file: File,
  options: { accept?: string | string[]; maxFileSize?: number }
): FileValidation {
  const maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

  if (file.size > maxFileSize) return { ok: false, reason: 'too-large' };
  if (!matchesAccept(file, options.accept)) return { ok: false, reason: 'unsupported-type' };

  return { ok: true };
}

/** 拖放与粘贴进来的文件按 MIME 分流到图片还是附件 */
export function isImageFile(file: File): boolean {
  return (file.type || '').toLowerCase().startsWith('image/');
}
