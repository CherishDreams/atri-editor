/**
 * MediaFiles - 拖放与剪贴板投放本地文件
 *
 * 只做事件到 MediaRuntime 的转接：校验、限流、插入与回写都在运行时里，
 * 面板选文件走的是同一条路。
 */
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import type { MediaRuntime } from '../media/MediaRuntime';
import { filesOf } from '../utils/dom';

export interface MediaFilesOptions {
  runtime: MediaRuntime | null;
}

/**
 * 投放点：坐标落在哪个块就插到哪儿，而不是永远跟着当前选区走。
 * 只算位置、不动选区——TextSelection.near 在找不到文本位置时会退化成
 * AllSelection，那次插入就会把整篇文档替换掉。
 */
function dropPos(view: EditorView, event: DragEvent): number | undefined {
  const result = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!result) return undefined;

  // inside 是坐标所在块的 content 起点，比外层边界位置更贴近用户看到的那个位置
  return result.inside > -1 ? result.inside : result.pos;
}

export const MediaFiles = Extension.create<MediaFilesOptions>({
  name: 'mediaFiles',

  addOptions() {
    return { runtime: null };
  },

  addProseMirrorPlugins() {
    const runtime = this.options.runtime;
    if (!runtime) return [];

    return [
      new Plugin({
        props: {
          /** 先于 PM 的剪贴板解析：带文件的粘贴（截图）交给上传管线，纯文本照常走默认链路 */
          handlePaste: (view, event) => {
            const files = filesOf(event.clipboardData);
            if (!files.length) return false;

            event.preventDefault();
            if (view.editable) void runtime.handleFiles(files);
            return true;
          },

          handleDrop: (view, event) => {
            const dragEvent = event as DragEvent;
            const files = filesOf(dragEvent.dataTransfer);
            if (!files.length) return false;

            // 不管能不能插，都要挡下浏览器默认的文件导航
            dragEvent.preventDefault();
            if (!view.editable) return true;

            void runtime.handleFiles(files, { pos: dropPos(view, dragEvent) });
            return true;
          },
        },
      }),
    ];
  },
});
