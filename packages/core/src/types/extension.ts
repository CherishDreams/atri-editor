import type { JSONContent, NodeViewRenderer } from '@tiptap/core';
import type { DOMOutputSpec, Node as ProseMirrorNode, NodeSpec } from '@tiptap/pm/model';

/**
 * NodeView 属性定义
 * 结构对齐 Tiptap 的 Attribute：default 用泛型让接入方拿到属性值类型，无需 any
 */
export interface NodeViewAttribute<T = unknown> {
  /** 属性默认值，与 Tiptap Attribute.default 一致 */
  default?: T;
  keepOnSplit?: boolean;
  /** 属性值没有结构化约束，保留宽松返回 */
  parseHTML?: (element: HTMLElement) => unknown;
  renderHTML?: (attributes: Record<string, unknown>) => Record<string, unknown> | null;
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
  /** HTML 序列化配置，签名与 Tiptap NodeConfig.renderHTML 一致 */
  renderHTML?: (props: {
    HTMLAttributes: Record<string, any>;
    node: ProseMirrorNode;
  }) => DOMOutputSpec;
  /** 解析规则，与 Tiptap NodeConfig.parseHTML 一致 */
  parseHTML?: () => NonNullable<NodeSpec['parseDOM']>;
  /** 是否为内联节点 */
  inline?: boolean;
  /** 是否为原子节点（不可编辑内容） */
  atom?: boolean;
  /** 节点分组 */
  group?: string;
  /** 节点描述 */
  description?: string;
  /** 自定义 Markdown 序列化回调，由 Tiptap 的 MarkdownManager 按节点名调用 */
  markdownSerialize?: (node: JSONContent) => string;
}
