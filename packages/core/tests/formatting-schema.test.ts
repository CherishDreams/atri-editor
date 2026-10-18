import { describe, expect, it } from 'vitest';
import { TextStyle } from '@tiptap/extension-text-style';
import { mount } from './utils';

describe('基础格式的 schema', () => {
  it('默认注册四类 mark，且行高确实不在其中', async () => {
    const editor = await mount();
    const marks = editor.editor.schema.marks;

    expect(Object.keys(marks)).toEqual(
      expect.arrayContaining(['textStyle', 'highlight', 'subscript', 'superscript'])
    );
    // 行高是 span 级属性，挂在选中文字上几乎看不出变化，故意不给。
    // 走 spec.attrs：MarkType 上运行时确实挂着 attrs，但 prosemirror-model 的类型
    // 只在 MarkSpec 上声明它，别拿一个没类型背书的名字当契约
    expect(marks.textStyle?.spec.attrs).not.toHaveProperty('lineHeight');
    expect(Object.keys(marks.textStyle?.spec.attrs ?? {}).sort()).toEqual([
      'backgroundColor',
      'color',
      'fontFamily',
      'fontSize',
    ]);
  });

  it('高亮开着 multicolor，color 是它自己的属性', async () => {
    const editor = await mount();
    expect(Object.keys(editor.editor.schema.marks.highlight?.spec.attrs ?? {})).toEqual(['color']);
  });

  it('命令齐备——工具栏按这个判断该不该出按钮', async () => {
    const editor = await mount();
    const commands = editor.editor.commands as Record<string, unknown>;
    for (const name of [
      'setColor',
      'setBackgroundColor',
      'setFontFamily',
      'setFontSize',
      'toggleHighlight',
      'setSubscript',
      'setSuperscript',
      'unsetAllMarks',
    ]) {
      expect(typeof commands[name], name).toBe('function');
    }
  });

  it('formatting: false 时四类 mark 一个都不注册', async () => {
    const editor = await mount({ formatting: false });
    const marks = editor.editor.schema.marks;

    expect(marks.textStyle).toBeUndefined();
    expect(marks.highlight).toBeUndefined();
    expect(marks.subscript).toBeUndefined();
    expect(marks.superscript).toBeUndefined();
    // 内置的六个 mark 不受牵连
    expect(Object.keys(marks).sort()).toEqual([
      'bold',
      'code',
      'italic',
      'link',
      'strike',
      'underline',
    ]);
  });

  it('宿主用同名扩展顶掉内置 textStyle 时不炸，样式按宿主的语义走', async () => {
    // CoreEditor 把内置扩展放在用户扩展之前，就是为了留这个口子；
    // 顶掉之后我们的 Reader 仍会往里 applyMark，得确认不会撞出 schema 错误
    const editor = await mount({
      extensions: [TextStyle.extend({ addAttributes: () => ({}) }) as never],
    });

    expect(editor.editor.schema.marks.textStyle).toBeTruthy();
    expect(() => editor.setMarkdown('<span style="color: red">x</span>')).not.toThrow();
    expect(editor.getHTML()).toContain('x');
  });

  it('设置样式落成 <span style>，取消样式后 span 不留下空壳', async () => {
    const editor = await mount();
    editor.setContent('<p>hello world</p>');
    editor.editor.commands.setTextSelection({ from: 1, to: 6 });
    editor.editor.commands.setColor('#ff0000');
    expect(editor.getHTML()).toContain('<span style="color: rgb(255, 0, 0);"');

    editor.editor.commands.unsetColor();
    expect(editor.getHTML()).not.toContain('<span');
  });
});
