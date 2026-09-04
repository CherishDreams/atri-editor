import type { DetailedHTMLProps, HTMLAttributes } from 'react';

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      /** <atri-editor> 自定义元素：React 19 原生支持，字符串属性走 attribute */
      'atri-editor': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        theme?: string;
        lang?: string;
        placeholder?: string;
        editable?: string;
        'data-content'?: string;
        'data-content-format'?: string;
      };
    }
  }
}
