import './styles.css';

document.getElementById('btn-copy')?.addEventListener('click', () => {
  const button = document.getElementById('btn-copy') as HTMLButtonElement;
  void navigator.clipboard?.writeText('npm install @atri-editor/core').then(() => {
    button.textContent = '已复制';
    setTimeout(() => {
      button.textContent = '复制';
    }, 1500);
  });
});

// 编辑器 + Tiptap + highlight.js 是首屏最大的一块，动态加载：标题与文案先渲染，
// 这个 chunk 随后到位。站点与 demo 都是静态托管，没有服务端渲染可依赖
void import('./playground');
