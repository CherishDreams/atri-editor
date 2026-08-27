/**
 * ExtensionManager - 扩展注册管理
 */
import { Node, mergeAttributes } from '@tiptap/core';
import type { AnyExtension } from '@tiptap/core';
import type { AtriExtensionMeta, AtriNodeViewConfig } from '../types';

export class ExtensionManager {
  private extensions: Map<string, AnyExtension> = new Map();
  private nodeViews: Map<string, AtriNodeViewConfig> = new Map();
  private markdownSerializers: Map<string, (node: any) => string> = new Map();

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
   * 注册自定义 NodeView
   */
  registerNodeView(config: AtriNodeViewConfig): void {
    if (this.nodeViews.has(config.name)) {
      console.warn(`NodeView "${config.name}" already registered, overwriting.`);
    }

    this.nodeViews.set(config.name, config);

    // 动态创建 Tiptap Node 扩展
    const nodeExtension = Node.create({
      name: config.name,
      group: config.group || (config.inline ? 'inline' : 'block'),
      atom: config.atom ?? true,

      addAttributes() {
        return config.attributes || {};
      },

      parseHTML() {
        return config.parseHTML?.() || [{ tag: config.name }];
      },

      renderHTML({ HTMLAttributes }) {
        if (config.renderHTML) {
          return config.renderHTML({ HTMLAttributes, node: this });
        }
        return [config.name, mergeAttributes(HTMLAttributes)];
      },

      addNodeView() {
        return config.nodeView;
      },
    });

    // 注册到扩展管理器
    this.register(nodeExtension, {
      name: config.name,
      version: '1.0.0',
      category: 'custom',
      description: config.description,
    });

    // 注册 Markdown 序列化规则
    if (config.markdownSerialize) {
      this.markdownSerializers.set(config.name, config.markdownSerialize);
    }
  }

  /**
   * 批量注册 NodeView
   */
  registerNodeViews(configs: AtriNodeViewConfig[]): void {
    configs.forEach((config) => this.registerNodeView(config));
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
    this.nodeViews.delete(name);
    return this.extensions.delete(name);
  }

  /**
   * 获取所有扩展
   */
  getAll(): AnyExtension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * 获取所有已注册的 NodeView
   */
  getNodeViews(): Map<string, AtriNodeViewConfig> {
    return this.nodeViews;
  }

  /**
   * 获取所有 Markdown 序列化规则
   */
  getMarkdownSerializers(): Map<string, (node: any) => string> {
    return this.markdownSerializers;
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
    this.nodeViews.clear();
    this.markdownSerializers.clear();
  }
}
