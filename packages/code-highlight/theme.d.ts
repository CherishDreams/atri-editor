/**
 * 样式子路径的类型声明：运行时由打包器加载 dist/theme.css，
 * 这里只用于让 `import '@atri-editor/code-highlight/theme'` 通过类型检查。
 * 与 @atri-editor/core/styles 同一套做法。
 */
declare const styles: string;
export default styles;
