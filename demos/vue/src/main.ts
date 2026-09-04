import { createApp } from 'vue';
import { AtriEditor } from '@atri-editor/core';
import App from './App.vue';

// 暴露类，方便浏览器控制台与自动化脚本复现/调试
(window as any).AtriEditorClass = AtriEditor;

createApp(App).mount('#app');
