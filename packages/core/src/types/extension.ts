import type { Extension } from '@tiptap/core';

/**
 * 扩展类别
 */
export type ExtensionCategory = 'basic' | 'media' | 'block' | 'enhanced' | 'ai';

/**
 * 扩展元数据
 */
export interface AtriExtensionMeta {
  name: string;
  version: string;
  description?: string;
  category: ExtensionCategory;
}

/**
 * Atri 扩展（基于 Tiptap Extension）
 */
export interface AtriExtension extends Extension {
  meta?: AtriExtensionMeta;
}
