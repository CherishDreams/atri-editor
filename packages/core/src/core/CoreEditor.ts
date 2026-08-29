/**
 * CoreEditor - Tiptap v3 编辑器封装
 */
import { Editor, type Content, type EditorOptions } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import { Placeholder } from '@tiptap/extensions';
import TextAlign from '@tiptap/extension-text-align';
import { createMediaExtensions } from '../extensions/media';
import { MediaRuntime } from '../media/MediaRuntime';
import type { AtriMarkdownConfig, AtriMediaConfig } from '../types';

export interface CoreEditorConfig {
  element: HTMLElement;
  content?: string | object;
  contentFormat?: 'html' | 'json' | 'markdown';
  editable?: boolean;
  placeholder?: string;
  extensions?: EditorOptions['extensions'];
  markdown?: AtriMarkdownConfig;
  /** 媒体（图片 / 附件）配置，false 时不注册任何媒体节点 */
  media?: AtriMediaConfig | false;
  /**
   * 复用外部的上传运行时
   * AtriEditor 重建编辑器时会把同一个实例传进来，进行中的上传才不会丢
   */
  mediaRuntime?: MediaRuntime;
  onCreate?: () => void;
  onUpdate?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onDestroy?: () => void;
}

export class CoreEditor {
  private editor: Editor;
  private config: CoreEditorConfig;
  /** 占位符文本：由 Placeholder 扩展以函数形式每次读取，改值即可生效 */
  private placeholderText: string;
  private mediaRuntime: MediaRuntime | null;

  constructor(config: CoreEditorConfig) {
    this.config = config;
    this.placeholderText = config.placeholder ?? '';
    this.mediaRuntime =
      config.media === false ? null : (config.mediaRuntime ?? new MediaRuntime(config.media));
    this.editor = this.createEditor();
  }

  private createEditor(): Editor {
    const { element, content, contentFormat, editable, extensions } = this.config;

    const editorExtensions: EditorOptions['extensions'] = [
      StarterKit.configure({
        // StarterKit v3 默认包含 Underline, Link, TrailingNode
      }),
    ];

    // 添加 Placeholder 扩展：空段带上 is-empty / is-editor-empty 类与 data-placeholder。
    // 无条件注册，且用函数取文本——插件创建时会快照 options 对象，
    // 之后再改 extension.options 是看不见的，函数则每次重算装饰都重新读取
    editorExtensions.push(
      Placeholder.configure({
        placeholder: () => this.placeholderText,
      })
    );

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

    // 图片 / 附件节点自带 markdown hook，注册时机不影响 Markdown 扩展的收集（它在构造时统一读取所有扩展），
    // 但放在用户扩展之前可以让用户用同名扩展顶掉内置节点
    editorExtensions.push(...createMediaExtensions(this.config.media, this.mediaRuntime));

    // 输入实时转换由 StarterKit 各扩展的 input rules 提供，与 Markdown 扩展启停无关
    const enableInputRules = this.config.markdown?.shortcuts !== false;

    // 添加用户自定义扩展
    if (extensions) {
      editorExtensions.push(...extensions);
    }

    const editor = new Editor({
      element,
      content,
      contentType,
      enableInputRules,
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

    // 上传运行时换绑到新的 Editor 实例，并把进行中的任务状态补回文档
    this.mediaRuntime?.bind(editor);

    return editor;
  }

  /**
   * 获取上传运行时；media 为 false 时为 null
   */
  getMediaRuntime(): MediaRuntime | null {
    return this.mediaRuntime;
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
   * 设置占位符
   * 占位符写在节点装饰上，只在状态重算时重新取值，因此派发一个空事务刷新视图；
   * 空事务不改动文档，Tiptap 不会据此触发 update
   */
  setPlaceholder(placeholder: string): void {
    this.placeholderText = placeholder;
    this.editor.view.dispatch(this.editor.state.tr);
  }

  /**
   * 销毁编辑器
   */
  destroy(): void {
    this.editor.destroy();
  }
}
