import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode 会让 effect 开发期跑两遍（建→销→再建），正好压编辑器的 destroy 语义
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
