import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtriEditor } from '@atri-editor/core';
import type { AtriEditorOptions } from '@atri-editor/core';
import '@atri-editor/core/styles';
import { createSimulateUpload } from './upload';

const MD_FIXTURE = [
  '# React 往返测试',
  '',
  '**加粗** 与 `代码`，行内附件：!filelink[说明.txt](https://cdn.example.com/a.txt "1024")',
  '',
  '!file[报告.pdf](https://cdn.example.com/r.pdf "20480")',
].join('\n');

/** 类用法子组件：卸载时（v-if 等价物 / StrictMode 双跑）必须干净地 destroy */
function ClassEditor({
  buildOptions,
  onInstance,
}: {
  buildOptions: (host: HTMLElement) => AtriEditorOptions;
  onInstance: (ed: AtriEditor | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ed = new AtriEditor(buildOptions(hostRef.current!));
    (window as any).editor = ed;
    onInstance(ed);
    return () => {
      ed.destroy();
      if ((window as any).editor === ed) (window as any).editor = null;
      onInstance(null);
    };
    // 只在挂载时建一次：StrictMode 下的 建→销→建 正是被测路径
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div data-test="class-host" ref={hostRef} />;
}

/** 元素用法：React 19 原生支持自定义元素，theme / lang 属性响应式 */
function ElementSection({ log }: { log: (...parts: unknown[]) => void }) {
  const ref = useRef<HTMLElement>(null);
  const [theme, setTheme] = useState('light');
  const [lang, setLang] = useState('zh');

  useEffect(() => {
    const el = ref.current as (HTMLElement & { getEditor?: () => AtriEditor | null }) | null;
    (window as any).elementEditor = el?.getEditor?.() ?? null;
  }, []);

  return (
    <section>
      <h2>① 自定义元素用法 &lt;atri-editor&gt;</h2>
      <div className="btns">
        <button
          data-test="el-theme"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
        >
          切换主题（当前 {theme}）
        </button>
        <button data-test="el-lang" onClick={() => setLang((l) => (l === 'zh' ? 'en' : 'zh'))}>
          切换语言（当前 {lang}）
        </button>
        <button
          data-test="el-html"
          onClick={() => log('element HTML:', (window as any).elementEditor?.getHTML())}
        >
          读取 HTML
        </button>
      </div>
      <atri-editor
        ref={ref}
        theme={theme}
        lang={lang}
        placeholder="元素用法：这里打字"
        data-content="<p>来自 <code>data-content</code> 的初始内容</p>"
      />
    </section>
  );
}

export default function App() {
  const [output, setOutput] = useState('');
  const [editor, setEditor] = useState<AtriEditor | null>(null);
  const [mounted, setMounted] = useState(true);
  const [forceFail, setForceFail] = useState(false);
  const [pending, setPending] = useState('');
  const failRef = useRef(false);

  const log = useCallback((...parts: unknown[]) => {
    setOutput(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n'));
  }, []);

  const simulateUpload = useMemo(() => createSimulateUpload(() => failRef.current), []);

  const buildOptions = useCallback(
    (host: HTMLElement): AtriEditorOptions => ({
      element: host,
      content:
        '<h2>React × Atri Editor</h2><p>通过 <strong>workspace 构建产物 dist</strong> 接入。</p>',
      placeholder: '输入 / 唤起 AI 命令菜单…',
      theme: 'light',
      lang: 'zh',
      toolbar: { bubble: true },
      media: {
        upload: simulateUpload,
        maxFileSize: 2 * 1024 * 1024,
        image: { resize: true, fallbackToBase64: true, accept: 'image/*' },
        attachment: { display: 'card' },
        onError: (rejection) => log('onError:', rejection.reason, rejection.file.name),
      },
      ai: {
        functions: [
          { id: 'continue', name: 'AI 续写', scope: 'cursor', outputMode: 'insert' },
          { id: 'translate', name: '翻译为英文', scope: 'selection', outputMode: 'replace' },
        ],
        requestEndpoint: async (ctx) => ({
          content: `**[stub ${ctx.functionId}]** 收到：${ctx.prompt ?? ctx.selection ?? ctx.cursorContext}`,
          contentType: 'markdown' as const,
        }),
        autoTranslateMarkdownToHTML: true,
      },
    }),
    [simulateUpload, log]
  );

  const withEditor = (fn: (e: AtriEditor) => void) => {
    if (!editor) {
      log('编辑器未挂载');
      return;
    }
    fn(editor);
  };

  return (
    <main className="page">
      <h1>Atri Editor × React 19（消费构建产物，StrictMode 开启）</h1>

      <ElementSection log={log} />

      <section>
        <h2>② 类用法 new AtriEditor()（含图片 / 附件 / AI / 浮动工具栏）</h2>
        <div className="btns">
          <button data-test="toggle-mount" onClick={() => setMounted((m) => !m)}>
            {mounted ? '卸载编辑器' : '重新挂载'}
          </button>
          <button data-test="get-html" onClick={() => withEditor((e) => log('HTML:', e.getHTML()))}>
            getHTML
          </button>
          <button
            data-test="get-md"
            onClick={() => withEditor((e) => log('Markdown:', e.getMarkdown()))}
          >
            getMarkdown
          </button>
          <button
            data-test="set-md"
            onClick={() =>
              withEditor((e) => {
                e.setMarkdown(MD_FIXTURE);
                log('setMarkdown 完成，再读回：\n' + e.getMarkdown());
              })
            }
          >
            setMarkdown 往返
          </button>
          <button
            data-test="get-sel"
            onClick={() => withEditor((e) => log('选区文本:', e.getSelectedText()))}
          >
            getSelectedText
          </button>
          <button data-test="theme" onClick={() => withEditor((e) => e.toggleTheme())}>
            toggleTheme
          </button>
          <button
            data-test="lang"
            onClick={() =>
              withEditor((e) => e.setLanguage(e.i18n.getLanguage() === 'zh' ? 'en' : 'zh'))
            }
          >
            切换语言
          </button>
          <button
            data-test="insert-image"
            onClick={() =>
              withEditor((e) =>
                e.insertImage({ src: 'https://picsum.photos/seed/react/480/270', alt: 'picsum' })
              )
            }
          >
            插入图片
          </button>
          <button
            data-test="insert-att"
            onClick={() =>
              withEditor((e) =>
                e.insertAttachment({
                  src: 'https://cdn.example.com/react-report.pdf',
                  name: 'react-report.pdf',
                  size: 20480,
                })
              )
            }
          >
            插入附件卡片
          </button>
          <button
            data-test="upload"
            onClick={() =>
              withEditor((e) =>
                e
                  .uploadFiles(
                    [new File(['a'.repeat(2048)], '模拟上传.txt', { type: 'text/plain' })],
                    'attachment'
                  )
                  .catch((err) => log('upload 失败:', String(err)))
              )
            }
          >
            模拟上传文件
          </button>
          <button data-test="retry" onClick={() => withEditor((e) => e.retryFailedUploads())}>
            重试失败上传
          </button>
          <button
            data-test="pending"
            onClick={() => withEditor((e) => setPending(String(e.hasPendingUploads())))}
          >
            hasPendingUploads
          </button>
          <label>
            <input
              type="checkbox"
              checked={forceFail}
              onChange={(ev) => {
                setForceFail(ev.target.checked);
                failRef.current = ev.target.checked;
              }}
            />{' '}
            让上传失败
          </label>
          <span data-test="pending-out">待处理: {pending || '-'}</span>
        </div>
        {mounted ? (
          <ClassEditor buildOptions={buildOptions} onInstance={setEditor} />
        ) : (
          <p className="hint">编辑器已卸载（useEffect cleanup → destroy）</p>
        )}
      </section>

      <section>
        <h2>输出</h2>
        <textarea data-test="output" className="out" rows={10} readOnly value={output} />
      </section>
    </main>
  );
}
