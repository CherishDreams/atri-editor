/**
 * @atri-editor/code-highlight — 代码块语法高亮
 *
 * 单独成包而不是进主包：语法高亮的实际成本是 highlight.js，整包未压缩约 5.5 MB。
 * lowlight 提供 createLowlight(grammars) 让你只注册用到的语言，所以这个开销该由宿主
 * 按页面决定，而不是让每个装了 @atri-editor/core 的人都背一份 default。
 * 本包自己的产物只有几百字节，语法库一个字节都不进来（见 vite.config.ts 的 external 规则）。
 */
import type { AnyExtension } from '@tiptap/core';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
// lowlight 不导出叫 Lowlight 的类型：createLowlight 的返回值是内联匿名类型。
// 从函数本身派生，比 import 一个不存在（或只在某个小版本里有）的名字稳
import type { createLowlight } from 'lowlight';

type LowlightInstance = ReturnType<typeof createLowlight>;

export interface AtriCodeHighlightConfig {
  /**
   * 一个 lowlight 实例。自己建、只注册用到的语言：
   * `createLowlight()` 只出核心，`createLowlight(common)` 出约 35 个常用语言，
   * 把 `all` 传进来就是整包 highlight.js
   */
  lowlight: LowlightInstance;
  /** 语言缺失时是否原样显示（true，默认）而不是报错 */
  defaultLanguage?: string | null;
  /** 没标语言时猜一遍 */
  languageClassPrefix?: string;
}

/**
 * 构造语法高亮扩展，交给 `new AtriEditor({ extensions: [...] })`。
 *
 * 它替换的是正文里的 codeBlock 节点实现，节点名与 Markdown 的围栏语法都不变
 * （CodeBlockLowlight 是 CodeBlock.extend 出来的，不带自己的 markdown 字段，
 * 因此继承 fence + language 的双向钩子），所以换上来不会动往返能力。
 */
export function createCodeHighlightExtensions(config: AtriCodeHighlightConfig): AnyExtension[] {
  if (!config.lowlight) {
    throw new Error(
      '[Atri Editor] code-highlight needs a lowlight instance. ' +
        "Create one with `createLowlight()` from 'lowlight' and register the languages you use."
    );
  }

  return [
    CodeBlockLowlight.configure({
      lowlight: config.lowlight,
      defaultLanguage: config.defaultLanguage ?? null,
      languageClassPrefix: config.languageClassPrefix ?? 'language-',
    }),
  ];
}

/**
 * 一次摊开就配好：关掉内置代码块 + 换上 lowlight 版。
 *
 * 分成两个旋钮（`codeBlock: false` 与 `extensions: [...]`）必须成对设置，
 * 少设一个的结果是"两个同名 codeBlock 并存、高亮静默不生效且不报错"——
 * 这种配置就该由一个函数一次给全，而不是写在文档里指望人别漏
 */
export function withCodeHighlight(config: AtriCodeHighlightConfig): {
  codeBlock: false;
  extensions: AnyExtension[];
} {
  return { codeBlock: false, extensions: createCodeHighlightExtensions(config) };
}
