<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { AtriEditor } from '@atri-editor/core';
import sample from './sample.md?raw';

const host = ref<HTMLElement | null>(null);
const title = ref('');
const output = ref('');
const theme = ref<'light' | 'dark'>('light');

let editor: AtriEditor | null = null;

onMounted(async () => {
  // 编辑器与 Tiptap 是全站最大的一块，进这一页才加载；文档页不该为它付体积
  const [core, highlight, lowlightModule, javascript, typescript, bash] = await Promise.all([
    import('@atri-editor/core'),
    import('@atri-editor/code-highlight'),
    import('lowlight'),
    import('highlight.js/lib/languages/javascript'),
    import('highlight.js/lib/languages/typescript'),
    import('highlight.js/lib/languages/bash'),
  ]);
  await Promise.all([
    import('@atri-editor/core/styles'),
    import('@atri-editor/code-highlight/theme'),
  ]);

  if (!host.value) return;

  const lowlight = lowlightModule.createLowlight({
    javascript: javascript.default,
    typescript: typescript.default,
    bash: bash.default,
  });

  editor = new core.AtriEditor({
    element: host.value,
    content: sample,
    contentFormat: 'markdown',
    theme: 'light',
    ...highlight.withCodeHighlight({ lowlight }),
  });
});

onBeforeUnmount(() => {
  editor?.destroy();
  editor = null;
});

function show(nextTitle: string, body: string): void {
  title.value = nextTitle;
  output.value = body;
}

function showMarkdown(): void {
  if (editor) show('导出的 Markdown', editor.getMarkdown());
}

function showLosses(): void {
  if (!editor) return;
  const losses = editor.getMarkdownLosses();
  show(
    losses.length ? '这次导出会丢这些' : '这次导出没有丢失',
    losses.length
      ? `${JSON.stringify(losses, null, 2)}\n\n导出结果：\n${editor.getMarkdown()}`
      : 'Markdown 未启用时这个报告恒为空。段落对齐、合并单元格、列宽这类 Markdown 表达不了的东西会出现在这里。'
  );
}

function toggleTheme(): void {
  const next = theme.value === 'dark' ? 'light' : 'dark';
  theme.value = next;
  editor?.setTheme(next);
}
</script>

<template>
  <div class="playground">
    <div class="playground-bar">
      <span>下面就是真组件，可以直接改</span>
      <div class="playground-actions">
        <button type="button" @click="toggleTheme">{{ theme === 'dark' ? '亮色' : '暗色' }}</button>
        <button type="button" @click="showMarkdown">看 Markdown</button>
        <button type="button" @click="showLosses">丢失报告</button>
      </div>
    </div>
    <div ref="host" class="playground-editor"></div>
    <pre v-if="output" class="playground-output">
— {{ title }} —

{{ output }}</pre>
    <p class="playground-hint">
      选中一段文字 → 点顶栏的「居中」→ 再点「丢失报告」：导出会丢掉对齐，编辑器提前告诉你。
    </p>
  </div>
</template>
