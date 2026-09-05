/**
 * Attachment - 文件附件节点
 *
 * 不能走 ExtensionManager.registerNodeView：那条路合成的节点声明不了 addCommands 与
 * markdown 三件套（只有 renderMarkdown，导出得回来不去），附件要能往返。
 */
import { Node, mergeAttributes } from '@tiptap/core';
import type { DOMOutputSpec, Node as PmNode, NodeType } from '@tiptap/pm/model';
import {
  NodeSelection,
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from '@tiptap/pm/state';
import type { AtriAttachmentDisplay, InsertAttachmentOptions } from '../types';
import { formatFileSize } from '../media/file-policy';
import {
  attachmentAttributes,
  attachmentLabel,
  insertAttachmentContent,
  isAttachmentForm,
} from './attachment-attrs';
import { makeAttachmentMarkdown } from './attachment-markdown';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    attachment: {
      /** 在选区处插入一个附件卡片 */
      setAttachment: (options: InsertAttachmentOptions) => ReturnType;
      /** 把选中的附件换成指定显示形态（卡片 / 行内链接） */
      setAttachmentDisplay: (options: { display: AtriAttachmentDisplay }) => ReturnType;
      /** 在卡片与行内链接之间切换选中的附件 */
      toggleAttachmentDisplay: () => ReturnType;
    };
  }
}

const FORM_TYPES: Record<AtriAttachmentDisplay, 'attachment' | 'attachmentLink'> = {
  card: 'attachment',
  link: 'attachmentLink',
};

/** 选区指在哪枚附件节点上：NodeSelection、光标紧贴其前/其后都算 */
function locateAttachment(state: EditorState): { node: PmNode; pos: number } | null {
  const isForm = (type: NodeType) => isAttachmentForm(type.name);

  const { selection } = state;
  if (selection instanceof NodeSelection) {
    return isForm(selection.node.type) ? { node: selection.node, pos: selection.from } : null;
  }
  if (!('$from' in selection)) return null;

  const after = selection.$from.nodeAfter;
  if (after && isForm(after.type)) return { node: after, pos: selection.from };
  const before = selection.$from.nodeBefore;
  if (before && isForm(before.type)) return { node: before, pos: selection.from - before.nodeSize };
  return null;
}

function switchAttachmentDisplay(
  state: EditorState,
  dispatch: ((tr: Transaction) => void) | undefined,
  display: AtriAttachmentDisplay
): boolean {
  const located = locateAttachment(state);
  if (!located) return false;

  const wantName = FORM_TYPES[display];
  if (located.node.type.name === wantName) return false;

  const target = state.schema.nodes[wantName];
  if (!target) return false;
  if (!dispatch) return true;

  // 不能 setNodeMarkup：block↔inline 换的是父结构（卡片进段落要 wrap，
  // 句中链接转卡片要劈段），replaceRangeWith 会按 schema 把这两件事都做对
  const next = target.create(located.node.attrs);
  const tr = state.tr.replaceRangeWith(located.pos, located.pos + located.node.nodeSize, next);

  // 换形态动了结构，映射后的位置不保证还指着节点本身；对不上就按属性找回来，
  // 让选区跟着落到新形态上，连着切换或继续输入都不用再点一次
  let newPos = tr.mapping.map(located.pos, 1);
  if (tr.doc.nodeAt(newPos)?.type.name !== wantName) {
    newPos = -1;
    tr.doc.descendants((n, pos) => {
      if (
        newPos < 0 &&
        n.type.name === wantName &&
        n.attrs.src === located.node.attrs.src &&
        n.attrs.uploadId === located.node.attrs.uploadId
      ) {
        newPos = pos;
      }
    });
  }
  if (newPos >= 0 && target.spec.selectable !== false) {
    const nodeSelection = NodeSelection.create(tr.doc, newPos);
    tr.setSelection(nodeSelection);
  }

  dispatch(tr);
  return true;
}

export const Attachment = Node.create({
  name: 'attachment',

  group: 'block',

  atom: true,

  selectable: true,

  draggable: true,

  addAttributes() {
    return attachmentAttributes();
  },

  parseHTML() {
    return [{ tag: 'div[data-atri-attachment]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const { src, name, size, status } = node.attrs;
    const label = attachmentLabel(name, src);

    const children: DOMOutputSpec[] = [
      ['span', { class: 'atri-attachment-icon', 'aria-hidden': 'true' }],
    ];

    const body: DOMOutputSpec[] = [
      ['a', { class: 'atri-attachment-name', href: src, rel: 'noopener noreferrer' }, label],
    ];
    if (size) {
      body.push(['span', { class: 'atri-attachment-size' }, formatFileSize(size)]);
    }
    // 名字与大小各占一行：单行挤不下长文件名，省略号又藏掉了最关键的信息
    children.push(['div', { class: 'atri-attachment-body' }, ...body]);

    // 卡片上没有一处硬编码文案：状态只靠进度条与配色表达，
    // "上传中 2/3"、"重试"这类带文字的信息在本地化的状态条里
    if (status) {
      children.push([
        'span',
        { class: 'atri-attachment-progress' },
        ['span', { class: 'atri-attachment-progress-bar' }],
      ]);
    }

    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-atri-attachment': '', class: 'atri-attachment' }),
      ...children,
    ];
  },

  addCommands() {
    return {
      setAttachment: (options) => (props) => insertAttachmentContent(props, this.name, options),

      setAttachmentDisplay:
        (options) =>
        ({ state, dispatch }) =>
          switchAttachmentDisplay(state, dispatch, options.display),

      toggleAttachmentDisplay:
        () =>
        ({ state, dispatch }) => {
          const located = locateAttachment(state);
          if (!located) return false;
          return switchAttachmentDisplay(
            state,
            dispatch,
            located.node.type.name === 'attachment' ? 'link' : 'card'
          );
        },
    };
  },

  addProseMirrorPlugins() {
    const findForm = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const dom = target?.closest('[data-atri-attachment], [data-atri-attachment-link]');
      if (!dom) return null;

      const view = this.editor.view;
      const pos = view.posAtDOM(dom as HTMLElement, 0);
      const node = view.state.doc.nodeAt(pos);
      return node && isAttachmentForm(node.type.name) ? { dom, pos, node } : null;
    };

    // 一次物理点击 = mousedown 紧跟 click，判定只能在 mousedown 里做、交给 click 兑现：
    // click 时刻的选区分不清"这次选中的"与"上次就选中的"
    let pendingClick: { pos: number; navigate: boolean } | null = null;

    return [
      new Plugin({
        key: new PluginKey('atriAttachmentSelection'),
        props: {
          handleDOMEvents: {
            // 这两种 atom 没有 NodeView，鼠标点了不会自己变成 NodeSelection——
            // 而切形态、删除都以"选中的附件"为作用对象；点了却切不动比多一次点击更糟
            mousedown: (view, event) => {
              const hit = findForm(event);
              if (!hit) {
                pendingClick = null;
                return false;
              }

              const sel = view.state.selection;
              if (sel instanceof NodeSelection && sel.from === hit.pos) {
                // 已选中：这一笔是"打开文件"，两个事件都原样放行——
                // 连 mousedown 的默认行为一起拦掉，浏览器就不跳了
                pendingClick = { pos: hit.pos, navigate: true };
                return false;
              }

              event.preventDefault();
              pendingClick = { pos: hit.pos, navigate: false };
              view.dispatch(
                view.state.tr.setSelection(NodeSelection.create(view.state.doc, hit.pos))
              );
              return true;
            },
            // 附件里的 <a>（卡片的名字链接、行内链接本体）：第一次点击只选中附件，
            // 已选中再点才真的打开文件——否则"点一下选中去切换"与"点开文件"互相打架。
            // 判据取 mousedown 记下的那一笔而不是 click 时刻的选区：
            // 放行的 mousedown 会被 PM 改写成 TextSelection，选区就当不得证据
            click: (_view, event) => {
              const hit = findForm(event);
              const pending = pendingClick;
              pendingClick = null;
              if (!hit || !pending || pending.pos !== hit.pos) return false;

              const inAnchor = event.target instanceof Element && !!event.target.closest('a[href]');
              if (pending.navigate && (inAnchor || hit.node.type.name === 'attachmentLink')) {
                return false;
              }

              event.preventDefault();
              return true;
            },
          },
        },
      }),
    ];
  },

  ...makeAttachmentMarkdown({
    name: 'file',
    level: 'block',
    nodeName: 'attachment',
  }),
});
