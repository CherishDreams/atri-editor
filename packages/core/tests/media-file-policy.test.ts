import { describe, expect, it } from 'vitest';
import { formatFileSize, parseFileSize } from '../src/media/file-policy';

describe('formatFileSize', () => {
  it('B 取整，更大的单位保留一位小数并去掉多余的 .0', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(1024)).toBe('1 KB');
    expect(formatFileSize(1258291)).toBe('1.2 MB');
    expect(formatFileSize(1024 ** 3)).toBe('1 GB');
  });

  it('非法输入返回空串，让调用方决定怎么显示', () => {
    expect(formatFileSize(-1)).toBe('');
    expect(formatFileSize(Number.NaN)).toBe('');
  });
});

describe('parseFileSize', () => {
  it('识别单位并还原字节数', () => {
    expect(parseFileSize('1.2 MB')).toBe(1258291);
    expect(parseFileSize('1 KB')).toBe(1024);
    expect(parseFileSize('512 B')).toBe(512);
    expect(parseFileSize('2gb')).toBe(2 * 1024 ** 3);
  });

  it('读不懂的写法返回 undefined，不猜', () => {
    expect(parseFileSize(undefined)).toBeUndefined();
    expect(parseFileSize('')).toBeUndefined();
    expect(parseFileSize('很大')).toBeUndefined();
    expect(parseFileSize('1.2 MB/s')).toBeUndefined();
  });

  it('展示标签可以稳定往返：格式化后的标签再解析回来，重新格式化结果不变', () => {
    for (const bytes of [0, 512, 1024, 1536, 1258291, 1024 ** 3]) {
      const label = formatFileSize(bytes);
      expect(formatFileSize(parseFileSize(label)!)).toBe(label);
    }
  });
});
