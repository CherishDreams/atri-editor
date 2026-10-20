/**
 * Markdown 丢失报告
 *
 * Tiptap 的序列化器对"没有 renderMarkdown 钩子的类型"是静默丢弃：不抛错、不降级成 HTML、
 * 不留任何痕迹（MarkdownManager 的 renderNodeToMarkdown 在查不到 handler 时 return ""，
 * getMarkOpening 同理）。所以接入方只看 getMarkdown() 的返回值，是看不出这一趟导出丢了东西的。
 * 这里做的事就是把这件事变成一次可查询的内省。
 *
 * 判据是"能力"而不是"内容 diff"：diff 会被良性的归一化骗到——空段落在导出时被补成
 * `&nbsp;`（序列化器自己就有 isEmptyOutput 来认这种占位），markdown 转义又会改写文本字节，
 * 任何一条都能凭空报出丢失。能力判据是确定的：类型有没有 renderer，正是序列化器自己要做的
 * 判断，我们只是替它先算一遍。
 */
import { getExtensionField, type Editor } from '@tiptap/core';
import type { MarkdownLoss } from '../types';

/**
 * 由父节点的 renderer 亲手渲染的子类型。
 *
 * 它们自己确实没有 renderMarkdown，但内容不丢：table 的 renderer 直接遍历行与单元格拼出
 * pipe table，根本不经过"按类型查 handler"那条路。照着 handler 注册表报，每一张表格都会被
 * 误报成丢失——而这是这个 API 最容易踩、也最不该踩的一条。
 */
const RENDERED_BY_PARENT: readonly string[] = ['tableRow', 'tableHeader', 'tableCell'];

/**
 * 类型有 renderer、但 renderer 不读的属性。
 *
 * 只能显式列——没有别的办法从外部知道某个 renderer 读了哪些属性。这张表要随能力增减一起维护：
 * 新增带 markdown 钩子的类型时，顺手确认它的属性是否都进了输出。
 *
 * 表格单元格在这里，而不是跟着 RENDERED_BY_PARENT 一起豁免掉：pipe table 拼得出内容和对齐，
 * 拼不出跨列跨行（合并出来的单元格会退化成一格带内容一格空着），也拼不出列宽。
 */
const LOSSY_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  paragraph: ['textAlign'],
  heading: ['textAlign'],
  tableCell: ['colspan', 'rowspan', 'colwidth'],
  tableHeader: ['colspan', 'rowspan', 'colwidth'],
};

/**
 * 仅当 `markdown.inlineStyles: 'drop'` 才算丢失的属性。
 *
 * 同一模式下 textStyle / subscript / superscript 会退回上游那版（没有 renderMarkdown），
 * 它们整个消失，由 kind='mark' 那条通道报出来，不用写在这里；highlight 不一样——上游
 * 有 `==x==`，正文回得来，只有颜色回不来，所以这是一条属性丢失而不是标记丢失。
 */
const LOSSY_ATTRIBUTES_WHEN_STYLES_DROPPED: Readonly<Record<string, readonly string[]>> = {
  highlight: ['color'],
};

/**
 * 这些属性的这些取值，导出不带等于没导出：文档的默认对齐本来就是左对齐，`left` 与不设
 * 在读者眼里一模一样。不豁免它的话，从 Word / Google Docs 粘贴进来的每一段都带着显式
 * `text-align: left`，报告就会段段报警——误报响一次的代价是这份报告从此没人看。
 * （`inherit` 不用列：实测 TextAlign 直接把它解析成 null，走默认值那条豁免。）
 */
const RENDERING_NEUTRAL_VALUES: Readonly<Record<string, readonly string[]>> = {
  textAlign: ['left'],
};

/** 属性值等于 schema 默认值时不算丢失：值没进过 HTML，Markdown 里也就没有对应的东西 */
function isSignificant(value: unknown, defaultValue: unknown, attribute: string): boolean {
  if (value === defaultValue || value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    // colwidth 是每列一个数字的数组，没拖过的列留 null；整列都没设过就不算丢了列宽
    return value.some((item) => typeof item === 'number' && item > 0);
  }
  if (typeof value === 'string') {
    if (value.trim() === '') return false;
    if (RENDERING_NEUTRAL_VALUES[attribute]?.includes(value)) return false;
  }
  return true;
}

/**
 * "这个类型有 renderer 吗"的判据取自 extensionManager 这个公开入口，用 MarkdownManager
 * 自己用的同一个 getExtensionField 算，而不是去读它的私有注册表——踩在私有字段上，
 * 上游一次重构就会把报告变成静默失灵。
 */
function buildRenderableTypes(editor: Editor): Set<string> {
  const schemaTypes = new Set([
    ...Object.keys(editor.schema.nodes),
    ...Object.keys(editor.schema.marks),
  ]);
  const renderable = new Set<string>();
  for (const extension of editor.extensionManager.extensions) {
    if (!schemaTypes.has(extension.name)) continue;
    if (getExtensionField(extension, 'renderMarkdown')) renderable.add(extension.name);
  }
  return renderable;
}

export interface CollectLossesOptions {
  /** 与 markdown.inlineStyles 一致 */
  inlineStyles: 'html' | 'drop';
}

/**
 * 走一遍当前文档，报告 `getMarkdown()` 会丢掉什么。
 *
 * 只统计文档里真实出现的类型，所以空文档的返回值恒为 `[]`，与装了哪些扩展无关。
 */
export function collectMarkdownLosses(
  editor: Editor,
  options: CollectLossesOptions
): MarkdownLoss[] {
  const renderable = buildRenderableTypes(editor);
  const nodes = new Map<string, number>();
  const marks = new Map<string, number>();
  const attributes = new Map<string, { loss: MarkdownLoss; count: number }>();

  const countAttribute = (type: string, attribute: string, count: number): void => {
    const key = `${type}/${attribute}`;
    const entry = attributes.get(key);
    if (entry) entry.count += count;
    else attributes.set(key, { loss: { kind: 'attribute', type, attribute, count }, count });
  };

  /** 上一次访问的文本节点带着哪些标记，用来把跨多个文本节点的同一标记合成一处 */
  let previousMarkNames: Set<string> = new Set();

  const checkAttributes = (
    owner: string,
    attrs: Record<string, unknown>,
    specAttrs: unknown
  ): void => {
    const defaults = (specAttrs as Record<string, { default?: unknown }> | undefined) ?? {};
    const tables =
      options.inlineStyles === 'drop'
        ? [LOSSY_ATTRIBUTES, LOSSY_ATTRIBUTES_WHEN_STYLES_DROPPED]
        : [LOSSY_ATTRIBUTES];
    for (const table of tables) {
      for (const attribute of table[owner] ?? []) {
        if (isSignificant(attrs[attribute], defaults[attribute]?.default, attribute)) {
          countAttribute(owner, attribute, 1);
        }
      }
    }
  };

  editor.state.doc.descendants((node, _position, parent) => {
    const name = node.type.name;

    if (name === 'text') {
      // 标记写在每个被切出的文本节点上，一个红色短语可能占着三四个；只有新出现的才算一处
      const fresh = node.marks.filter((mark) => !previousMarkNames.has(mark.type.name));
      previousMarkNames = new Set(node.marks.map((mark) => mark.type.name));
      for (const mark of fresh) {
        if (!renderable.has(mark.type.name)) {
          marks.set(mark.type.name, (marks.get(mark.type.name) ?? 0) + 1);
        }
        checkAttributes(mark.type.name, mark.attrs, mark.type.spec.attrs);
      }
      return;
    }

    // 属性照查，包括 RENDERED_BY_PARENT 那几位——它们内容不丢，属性照样丢（见那张表的注释）
    checkAttributes(name, node.attrs, node.type.spec.attrs);

    // 定位不到 parent 就是 doc 自己，doc 没有"被谁渲染"的问题
    if (parent && !renderable.has(name) && !RENDERED_BY_PARENT.includes(name)) {
      nodes.set(name, (nodes.get(name) ?? 0) + 1);
      // 整个子树一起没了，别再把它里面的段落标记成一处处独立丢失——用户要的是"这块没了"
      previousMarkNames = new Set();
      return false;
    }
    previousMarkNames = new Set();
    return true;
  });

  const byCountThenName = (a: [string, number], b: [string, number]) =>
    b[1] - a[1] || a[0].localeCompare(b[0]);

  const ofKind =
    (kind: 'node' | 'mark') =>
    (entry: [string, number]): MarkdownLoss => ({ kind, type: entry[0], count: entry[1] });

  const losses: MarkdownLoss[] = [
    ...Array.from(nodes.entries()).sort(byCountThenName).map(ofKind('node')),
    ...Array.from(marks.entries()).sort(byCountThenName).map(ofKind('mark')),
  ];
  for (const entry of attributes.values()) {
    losses.push(entry.loss);
  }
  return losses;
}
