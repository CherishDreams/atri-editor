<script setup lang="ts">
import { nextTick, onMounted, onBeforeUnmount, ref, shallowRef } from 'vue';
import { AtriEditor } from '@atri-editor/core';
import '@atri-editor/core/styles';
import { createSimulateUpload } from './upload';

const simulateUpload = createSimulateUpload(() => forceFail.value);

/** 类用法：挂在普通 div 上，手动 new / destroy */
const showClassEditor = ref(true);
const classHost = ref<HTMLElement | null>(null);
const editor = shallowRef<AtriEditor | null>(null);

/** 元素用法：模板里直接写 <atri-editor> */
const elHost = ref<HTMLElement | null>(null);
const elementEditor = shallowRef<AtriEditor | null>(null);
const elTheme = ref('light');
const elLang = ref('zh');

const output = ref('');
const forceFail = ref(false);
const pending = ref('');

function log(...parts: unknown[]) {
  output.value = parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n');
}

const MD_FIXTURE = [
  '# Vue 往返测试',
  '',
  '**加粗** 与 `代码`，行内附件：!filelink[说明.txt](https://cdn.example.com/a.txt "1024")',
  '',
  '!file[报告.pdf](https://cdn.example.com/r.pdf "20480")',
].join('\n');

function buildOptions(element: HTMLElement) {
  return {
    element,
    content:
      '<h2>Vue × Atri Editor</h2><p>通过 <strong>workspace 构建产物 dist</strong> 接入。</p>',
    placeholder: '输入 / 唤起 AI 命令菜单…',
    theme: 'light' as const,
    lang: 'zh',
    toolbar: { bubble: true },
    media: {
      upload: simulateUpload,
      maxFileSize: 2 * 1024 * 1024,
      image: { resize: true, fallbackToBase64: true, accept: 'image/*' },
      attachment: { display: 'card' as const },
      onError: (rejection: { reason: string; file: File }) =>
        log('onError:', rejection.reason, rejection.file.name),
    },
    ai: {
      functions: [
        {
          id: 'continue',
          name: 'AI 续写',
          scope: 'cursor' as const,
          outputMode: 'insert' as const,
        },
        {
          id: 'translate',
          name: '翻译为英文',
          scope: 'selection' as const,
          outputMode: 'replace' as const,
        },
      ],
      requestEndpoint: async (ctx: any) => ({
        content: `**[stub ${ctx.functionId}]** 收到：${ctx.prompt ?? ctx.selection ?? ctx.cursorContext}`,
        contentType: 'markdown' as const,
      }),
      autoTranslateMarkdownToHTML: true,
    },
  };
}

function mountClassEditor() {
  if (!classHost.value || editor.value) return;
  editor.value = new AtriEditor(buildOptions(classHost.value));
  // 供浏览器自动化断言使用
  (window as any).editor = editor.value;
}

function destroyClassEditor() {
  editor.value?.destroy();
  editor.value = null;
}

onMounted(() => {
  mountClassEditor();

  // 自定义元素在 connectedCallback 里同步创建编辑器，事件早已派发，直接取实例
  const el = elHost.value as unknown as { getEditor?: () => AtriEditor | null } | null;
  elementEditor.value = el?.getEditor?.() ?? null;
  (window as any).elementEditor = elementEditor.value;
});

onBeforeUnmount(destroyClassEditor);

/** v-if 卸载/重挂载：切换显隐并同步销毁/重建实例 */
async function toggleClassEditor() {
  if (showClassEditor.value) {
    destroyClassEditor();
    showClassEditor.value = false;
  } else {
    showClassEditor.value = true;
    await nextTick();
    mountClassEditor();
  }
}

function withEditor(fn: (e: AtriEditor) => void) {
  if (!editor.value) {
    log('编辑器未挂载');
    return;
  }
  fn(editor.value);
}

function getHTML() {
  withEditor((e) => log('HTML:', e.getHTML()));
}
function getMarkdown() {
  withEditor((e) => log('Markdown:', e.getMarkdown()));
}
function setMarkdown() {
  withEditor((e) => {
    e.setMarkdown(MD_FIXTURE);
    log('setMarkdown 完成，再读回：\n' + e.getMarkdown());
  });
}
function getSelected() {
  withEditor((e) => log('选区文本:', e.getSelectedText()));
}

function toggleTheme() {
  withEditor((e) => e.toggleTheme());
}
function toggleLang() {
  withEditor((e) => e.setLanguage(e.i18n.getLanguage() === 'zh' ? 'en' : 'zh'));
}

function insertImage() {
  withEditor((e) =>
    e.insertImage({ src: 'https://picsum.photos/seed/vue/480/270', alt: 'picsum' })
  );
}
function insertAttachment() {
  withEditor((e) =>
    e.insertAttachment({
      src: 'https://cdn.example.com/vue-report.pdf',
      name: 'vue-report.pdf',
      size: 20480,
    })
  );
}
async function uploadFakeFile() {
  const file = new File(['a'.repeat(2048)], '模拟上传.txt', { type: 'text/plain' });
  await withEditor(async (e) => e.uploadFiles([file], 'attachment'));
}
async function retry() {
  await withEditor((e) => e.retryFailedUploads());
}
function checkPending() {
  withEditor((e) => (pending.value = String(e.hasPendingUploads())));
}

/** 元素用法：改响应式属性立即生效 */
function cycleElTheme() {
  elTheme.value = elTheme.value === 'light' ? 'dark' : 'light';
}
function cycleElLang() {
  elLang.value = elLang.value === 'zh' ? 'en' : 'zh';
}
function elGetHTML() {
  log('element HTML:', elementEditor.value?.getHTML());
}
</script>

<template>
  <main class="page">
    <h1>Atri Editor × Vue 3（消费构建产物）</h1>

    <section>
      <h2>① 自定义元素用法 &lt;atri-editor&gt;</h2>
      <div class="btns">
        <button data-test="el-theme" @click="cycleElTheme">切换主题（当前 {{ elTheme }}）</button>
        <button data-test="el-lang" @click="cycleElLang">切换语言（当前 {{ elLang }}）</button>
        <button data-test="el-html" @click="elGetHTML">读取 HTML</button>
      </div>
      <atri-editor
        ref="elHost"
        :theme="elTheme"
        :lang="elLang"
        placeholder="元素用法：这里打字"
        data-content="<p>来自 <code>data-content</code> 的初始内容</p>"
      />
    </section>

    <section>
      <h2>② 类用法 new AtriEditor()（含图片 / 附件 / AI / 浮动工具栏）</h2>
      <div class="btns">
        <button data-test="toggle-mount" @click="toggleClassEditor">
          {{ showClassEditor ? '卸载编辑器' : '重新挂载' }}
        </button>
        <button data-test="get-html" @click="getHTML">getHTML</button>
        <button data-test="get-md" @click="getMarkdown">getMarkdown</button>
        <button data-test="set-md" @click="setMarkdown">setMarkdown 往返</button>
        <button data-test="get-sel" @click="getSelected">getSelectedText</button>
        <button data-test="theme" @click="toggleTheme">toggleTheme</button>
        <button data-test="lang" @click="toggleLang">切换语言</button>
        <button data-test="insert-image" @click="insertImage">插入图片</button>
        <button data-test="insert-att" @click="insertAttachment">插入附件卡片</button>
        <button data-test="upload" @click="uploadFakeFile">模拟上传文件</button>
        <button data-test="retry" @click="retry">重试失败上传</button>
        <button data-test="pending" @click="checkPending">hasPendingUploads</button>
        <label><input type="checkbox" v-model="forceFail" /> 让上传失败</label>
        <span data-test="pending-out">待处理: {{ pending || '-' }}</span>
      </div>
      <div v-if="showClassEditor" ref="classHost" data-test="class-host"></div>
      <p v-else class="hint">编辑器已卸载（destroy 已调用）</p>
    </section>

    <section>
      <h2>输出</h2>
      <textarea data-test="output" class="out" rows="10" readonly :value="output"></textarea>
    </section>
  </main>
</template>

<style>
body {
  font-family: system-ui, sans-serif;
  margin: 0;
  background: #f5f6f8;
}
.page {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}
section {
  margin-bottom: 28px;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-bottom: 8px;
}
.btns button {
  padding: 4px 10px;
  cursor: pointer;
}
.out {
  width: 100%;
  font-family: monospace;
  font-size: 12px;
}
.hint {
  color: #888;
}
</style>
