/**
 * ExtensionManager - 扩展注册管理
 */
import type { AnyExtension } from '@tiptap/core';
import type { AtriExtensionMeta } from '../types';

export class ExtensionManager {
  private extensions: Map<string, AnyExtension> = new Map();

  /**
   * 注册扩展
   */
  register(extension: AnyExtension, _meta?: AtriExtensionMeta): void {
    const name = extension.name;
    if (this.extensions.has(name)) {
      console.warn(`Extension "${name}" already registered, overwriting.`);
    }
    this.extensions.set(name, extension);
  }

  /**
   * 批量注册扩展
   */
  registerAll(extensions: AnyExtension[]): void {
    extensions.forEach((ext) => this.register(ext));
  }

  /**
   * 获取扩展
   */
  get(name: string): AnyExtension | undefined {
    return this.extensions.get(name);
  }

  /**
   * 卸载扩展
   */
  unregister(name: string): boolean {
    return this.extensions.delete(name);
  }

  /**
   * 获取所有扩展
   */
  getAll(): AnyExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 是否已注册
   */
  has(name: string): boolean {
    return this.extensions.has(name);
  }

  /**
   * 清空所有扩展
   */
  clear(): void {
    this.extensions.clear();
  }
}
