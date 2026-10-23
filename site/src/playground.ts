import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';
import '@atri-editor/code-highlight/theme';
import { withCodeHighlight } from '@atri-editor/code-highlight';
import { createLowlight } from 'lowlight';
import bash from 'highlight.js/lib/languages/bash';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import sample from './sample.md?raw';

// 只注册这一页用到的语法：落地页的第一屏不该背着 5.5 MB 的语法库
const lowlight = createLowlight({ bash, javascript, typescript });

const host = document.getElementById('playground-editor');
if (!host) throw new Error('#playground-editor is missing');
// 占位块的高度只负责加载期间不抖动，真正挂载前清掉，避免它留在编辑器上方
host.replaceChildren();

const editor = new AtriEditor({
  element: host,
  content: sample,
  contentFormat: 'markdown',
  theme: 'light',
  ...withCodeHighlight({ lowlight }),
});

const output = document.getElementById('playground-output') as HTMLElement;
const themeButton = document.getElementById('btn-theme') as HTMLButtonElement;

function show(title: string, body: string): void {
  output.hidden = false;
  output.textContent = `— ${title} —\n\n${body}`;
}

themeButton.addEventListener('click', () => {
  const next = themeButton.dataset.theme === 'dark' ? 'light' : 'dark';
  themeButton.dataset.theme = next;
  themeButton.textContent = next === 'dark' ? '亮色' : '暗色';
  document.documentElement.dataset.theme = next;
  editor.setTheme(next);
});

document.getElementById('btn-markdown')?.addEventListener('click', () => {
  show('导出的 Markdown', editor.getMarkdown());
});

document.getElementById('btn-losses')?.addEventListener('click', () => {
  const losses = editor.getMarkdownLosses();
  show(
    losses.length ? '这次导出会丢这些' : '这次导出没有丢失',
    losses.length
      ? `${JSON.stringify(losses, null, 2)}\n\n导出结果：\n${editor.getMarkdown()}`
      : 'Markdown 未启用时这个报告恒为空；段落对齐、合并单元格、列宽这类 Markdown 表达不了的东西会出现在这里。'
  );
});
