/**
 * CoreEditor - Tiptap v3 编辑器封装
 */
import { Editor, type Content, type EditorOptions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import TextAlign from '@tiptap/extension-text-align';
import type { AtriMarkdownConfig } from '../types';

export interface CoreEditorConfig {
  element: HTMLElement;
  content?: string | object;
  contentFormat?: 'html' | 'json' | 'markdown';
  editable?: boolean;
  placeholder?: string;
  extensions?: EditorOptions['extensions'];
  markdown?: AtriMarkdownConfig;
  onCreate?: () => void;
  onUpdate?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onDestroy?: () => void;
}

export class CoreEditor {
  private editor: Editor;
  private config: CoreEditorConfig;

  constructor(config: CoreEditorConfig) {
    this.config = config;
    this.editor = this.createEditor();
  }

  private createEditor(): Editor {
    const { element, content, contentFormat, editable, placeholder, extensions } = this.config;

    const editorExtensions: EditorOptions['extensions'] = [
      StarterKit.configure({
        // StarterKit v3 默认包含 Underline, Link, TrailingNode
      }),
    ];

    // 添加 Placeholder 扩展（当编辑器为空时添加 is-editor-empty class）
    if (placeholder) {
      editorExtensions.push(
        Placeholder.configure({
          placeholder,
        })
      );
    }

    // 添加 TextAlign 扩展
    editorExtensions.push(
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      })
    );

    // 添加 Markdown 扩展
    const markdownEnabled = this.config.markdown?.enabled !== false;
    if (markdownEnabled) {
      editorExtensions.push(
        Markdown.configure({
          indentation: this.config.markdown?.indentation,
          markedOptions: this.config.markdown?.markedOptions,
        })
      );
    }

    // markdown 内容依赖 Markdown 扩展解析，扩展未启用时不声明该格式
    const contentType =
      contentFormat === 'markdown' && !markdownEnabled ? undefined : contentFormat;

    // 添加用户自定义扩展
    if (extensions) {
      editorExtensions.push(...extensions);
    }

    const editor = new Editor({
      element,
      content,
      contentType,
      editable: editable ?? true,
      extensions: editorExtensions,
      editorProps: {
        attributes: {
          class: 'atri-editor-content',
        },
      },
      onCreate: () => {
        this.config.onCreate?.();
      },
      onUpdate: () => {
        this.config.onUpdate?.();
      },
      onFocus: () => {
        this.config.onFocus?.();
      },
      onBlur: () => {
        this.config.onBlur?.();
      },
      onDestroy: () => {
        this.config.onDestroy?.();
      },
    });

    return editor;
  }

  /**
   * 获取 Tiptap Editor 实例
   */
  getEditor(): Editor {
    return this.editor;
  }

  /**
   * 获取 HTML 内容
   */
  getHTML(): string {
    try {
      return this.editor.getHTML();
    } catch (err) {
      console.error('[CoreEditor] getHTML() failed:', err);
      // 输出 schema 中所有 node 和 mark 类型，帮助定位缺少 toDOM 的类型
      console.error('[CoreEditor] Schema nodes:', Object.keys(this.editor.schema.nodes));
      console.error('[CoreEditor] Schema marks:', Object.keys(this.editor.schema.marks));
      throw err;
    }
  }

  /**
   * 获取 JSON 内容
   */
  getJSON(): object {
    return this.editor.getJSON();
  }

  /**
   * 设置内容
   */
  setContent(content: string | object, emitUpdate = true): void {
    this.editor.commands.setContent(content as Content, { emitUpdate });
  }

  /**
   * 清空内容
   */
  clearContent(): void {
    this.editor.commands.clearContent(true);
  }

  /**
   * 是否为空
   */
  isEmpty(): boolean {
    return this.editor.isEmpty;
  }

  /**
   * 设置可编辑状态
   */
  setEditable(editable: boolean): void {
    this.editor.setEditable(editable);
  }

  /**
   * 是否可编辑
   */
  isEditable(): boolean {
    return this.editor.isEditable;
  }

  /**
   * 聚焦
   */
  focus(): void {
    this.editor.commands.focus();
  }

  /**
   * 失焦
   */
  blur(): void {
    this.editor.commands.blur();
  }

  /**
   * 插入内容
   */
  insertContent(content: string): void {
    this.editor.commands.insertContent(content);
  }

  /**
   * 销毁编辑器
   */
  destroy(): void {
    this.editor.destroy();
  }
}
