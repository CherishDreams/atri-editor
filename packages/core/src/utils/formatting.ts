/**
 * 基础格式能力探测：工具栏决定"这个按钮摆不摆"的唯一依据
 *
 * 内部使用，不进 utils barrel、不随包出口——判据（mark 的 spec.attrs 上有没有那一项）
 * 是 extension-text-style 的实现细节，公共面只承诺"这一下真能生效"。
 *
 * 为什么不看配置而看 schema：CoreEditor 把内置扩展放在用户扩展之前，就是为了让宿主能用
 * 同名扩展顶掉内置 mark。顶掉之后配置里写着 formatting: true，但那四类属性可能一个都不剩，
 * 于是按钮摆出来、点了没反应——正是本包反复在消除的那类"命令返回成功、什么都没发生"。
 */
import type { Editor } from '@tiptap/core';

/** textStyle 这一个 mark 承载的四个属性，颜色类与字号字体共用同一个 mark */
export type TextStyleAttr = 'color' | 'backgroundColor' | 'fontSize' | 'fontFamily';

/**
 * 属性 → 设置它的命令名。
 * 上游这几个是 addGlobalAttributes 挂上去的 Extension，命令名与属性名并不同形
 * （backgroundColor → setBackgroundColor，但首字母大写规则一致，这里仍列死而不做字符串拼接：
 * 拼出来的命令名读不出错，列成表才能一眼看出漏了谁）
 */
const SET_COMMAND: Record<TextStyleAttr, string> = {
  color: 'setColor',
  backgroundColor: 'setBackgroundColor',
  fontSize: 'setFontSize',
  fontFamily: 'setFontFamily',
};

/** 这个属性是否既设得了也存得住 */
export function canUseTextStyle(editor: Editor, attr: TextStyleAttr): boolean {
  const command = (editor.commands as Record<string, unknown>)[SET_COMMAND[attr]];
  if (typeof command !== 'function') return false;
  return !!editor.schema.marks.textStyle?.spec.attrs?.[attr];
}

/** 独立 mark（高亮 / 下标 / 上标）是否在册 */
export function hasMark(editor: Editor, name: string): boolean {
  return !!editor.schema.marks[name];
}
