import type { Extension, NodeViewRenderer } from '@tiptap/core';

/**
 * 扩展类别
 */
export type ExtensionCategory = 'basic' | 'media' | 'block' | 'enhanced' | 'ai' | 'custom';

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

/**
 * NodeView 属性定义
 */
export interface NodeViewAttribute {
  default?: any;
  keepOnSplit?: boolean;
  parseHTML?: (element: HTMLElement) => any;
  renderHTML?: (attributes: Record<string, any>) => Record<string, any> | null;
}

/**
 * NodeView 配置
 */
export interface AtriNodeViewConfig {
  /** 节点类型名称 */
  name: string;
  /** NodeView 渲染器 */
  nodeView: NodeViewRenderer;
  /** 节点属性定义 */
  attributes?: Record<string, NodeViewAttribute>;
  /** HTML 序列化配置 */
  renderHTML?: (props: { HTMLAttributes: Record<string, any>; node: any }) => any;
  /** HTML 解析配置 */
  parseHTML?: () => Array<{ tag: string; getAttrs?: (el: HTMLElement) => any }>;
  /** 是否为内联节点 */
  inline?: boolean;
  /** 是否为原子节点（不可编辑内容） */
  atom?: boolean;
  /** 节点分组 */
  group?: string;
  /** 节点描述 */
  description?: string;
  /** 自定义 Markdown 序列化回调 */
  markdownSerialize?: (node: any) => string;
}
