import { describe, expect, it } from 'vitest';
import { I18nManager } from '../src/index';
import { mount, toolbarTitles } from './utils';

describe('I18nManager', () => {
  it('实例之间互不影响', () => {
    const zh = new I18nManager('zh');
    const en = new I18nManager('en');

    expect(zh.t('editor.bold')).toBe('加粗');
    expect(en.t('editor.bold')).toBe('Bold');
  });

  it('构造后即可读取词条，无需等待异步初始化', () => {
    expect(new I18nManager('en').getLanguage()).toBe('en');
    expect(new I18nManager('en').t('editor.heading1')).toBe('Heading 1');
  });
});

describe('编辑器语言隔离', () => {
  it('一个编辑器切换语言不影响另一个编辑器', async () => {
    const first = await mount({ lang: 'zh', content: '<p>one</p>' });
    const second = await mount({ lang: 'zh', content: '<p>two</p>' });

    await second.setLanguage('en');

    expect(first.i18n.t('editor.bold')).toBe('加粗');
    expect(second.i18n.t('editor.bold')).toBe('Bold');
    expect(first.i18n.getLanguage()).toBe('zh');
    expect(second.i18n.getLanguage()).toBe('en');
  });

  it('工具栏 tooltip 按各自语言渲染，并在切换后刷新', async () => {
    const zh = await mount({
      lang: 'zh',
      content: '<p>zh</p>',
      toolbar: { items: ['bold', 'italic'] },
    });
    const en = await mount({
      lang: 'en',
      content: '<p>en</p>',
      toolbar: { items: ['bold', 'italic'] },
    });

    expect(toolbarTitles(zh)).toEqual(['加粗', '斜体']);
    expect(toolbarTitles(en)).toEqual(['Bold', 'Italic']);

    await zh.setLanguage('en');
    expect(toolbarTitles(zh)).toEqual(['Bold', 'Italic']);
    expect(toolbarTitles(en)).toEqual(['Bold', 'Italic']);

    await en.setLanguage('zh');
    expect(toolbarTitles(en)).toEqual(['加粗', '斜体']);
    expect(toolbarTitles(zh)).toEqual(['Bold', 'Italic']);
  });

  it('用户显式指定的 tooltip 优先于语言词条', async () => {
    const editor = await mount({
      lang: 'en',
      content: '<p>x</p>',
      toolbar: { items: [{ id: 'bold', tooltip: '自定义' }, 'italic'] },
    });

    expect(toolbarTitles(editor)).toEqual(['自定义', 'Italic']);

    await editor.setLanguage('zh');
    expect(toolbarTitles(editor)).toEqual(['自定义', '斜体']);
  });
});
