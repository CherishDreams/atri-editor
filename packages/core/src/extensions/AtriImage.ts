/**
 * AtriImage - 图片节点
 *
 * 只往 stock Image 上加"上传中"这类临时态：命令、输入规则、markdown 双向 hook
 * 与缩放的 ResizableNodeView 全部沿用原实现，不去 fork 它的 NodeView。
 *
 * 图片没有 progress 属性——逐文件百分比画在附件卡片上，图片的整体进度由
 * MediaRuntime 的队列快照（subscribe）表达，状态条一处说清一批文件。
 */
import Image from '@tiptap/extension-image';
import { mediaInsertTarget } from '../media/insert-position';

export const AtriImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // 只写不读：保存下来的 HTML 里不该留着一个永远不会完成的"上传中"
      status: {
        default: null,
        parseHTML: () => null,
        renderHTML: (attributes) =>
          attributes.status ? { 'data-atri-upload-status': attributes.status } : {},
      },
      uploadId: {
        default: null,
        parseHTML: () => null,
        rendered: false,
      },
    };
  },

  addCommands() {
    return {
      ...this.parent?.(),
      // stock 版走 insertContent，替换的是整个选区；而插入一张图之后选区正好盖住这张图，
      // 于是空文档里连插两张只剩一张。落点交给 mediaInsertTarget 判断
      setImage:
        (options) =>
        ({ state, commands }) =>
          commands.insertContentAt(mediaInsertTarget(state.selection), {
            type: this.name,
            attrs: options,
          }),
    };
  },
});
