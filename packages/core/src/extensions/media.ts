/**
 * 媒体扩展装配
 * 图片与附件是一等 Tiptap 扩展：需要 addCommands / addProseMirrorPlugins / markdown 三件套，
 * 而 ExtensionManager.registerNodeView 合成的节点声明不了这些，所以不走那条路
 */
import type { EditorOptions } from '@tiptap/core';
import type { AtriMediaConfig } from '../types';
import type { MediaRuntime } from '../media/MediaRuntime';
import { AtriImage } from './AtriImage';
import { Attachment } from './Attachment';
import { MediaFiles } from './MediaFiles';

/** 缩放下限：再小手柄就点不中了 */
const MIN_RESIZE_SIZE = 60;

export function createMediaExtensions(
  media?: AtriMediaConfig | false,
  runtime?: MediaRuntime | null
): NonNullable<EditorOptions['extensions']> {
  if (media === false) return [];

  const image = media?.image;
  const resizable = image?.resize ?? true;

  // 附件的 !file[...]() 语法由 Markdown 扩展注册到 marked 后才生效；
  // Markdown 未启用时该节点仍可正常插入与序列化 HTML，只是读不到这行字面语法
  return [
    AtriImage.configure({
      inline: image?.inline ?? false,
      // base64 既决定能不能插 data URL，也决定 data URL 还解不解得回来
      allowBase64: image?.allowBase64 ?? false,
      resize: resizable
        ? {
            enabled: true,
            minWidth: MIN_RESIZE_SIZE,
            minHeight: MIN_RESIZE_SIZE,
            alwaysPreserveAspectRatio: true,
          }
        : false,
    }),
    Attachment,
    // 拖放与剪贴板投放都汇到 runtime.handleFiles，与面板选文件同一条路
    MediaFiles.configure({ runtime: runtime ?? null }),
  ];
}
