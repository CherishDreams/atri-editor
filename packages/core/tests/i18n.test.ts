import { describe, expect, it } from 'vitest';
import { I18nManager } from '../src/index';
// zhText 是内置默认文案的单源、但不进公开 barrel，所以按内部路径引
import { zhText } from '../src/core/I18nManager';
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

describe('语言包注册', () => {
  it('未注册的语言只有回退，没有词条：hasLanguage 是唯一能问出来的地方', () => {
    const i18n = new I18nManager('zh');

    expect(i18n.hasLanguage('zh')).toBe(true);
    expect(i18n.hasLanguage('en')).toBe(true);
    expect(i18n.hasLanguage('ja')).toBe(false);
    // 回退不是失败，是不出声：t() 照样给中文，接入方无从察觉
    i18n.addResources('ja', { editor: { bold: '太字' } });
    expect(i18n.hasLanguage('ja')).toBe(true);
  });

  it('注册后可切到该语言，词条真的生效', async () => {
    const i18n = new I18nManager('zh');
    i18n.addResources('ja', { editor: { bold: '太字', italic: '斜体 ja' } });

    await i18n.changeLanguage('ja');

    expect(i18n.t('editor.bold')).toBe('太字');
    expect(i18n.t('editor.italic')).toBe('斜体 ja');
    // 没在新语言包里补的 key 仍按 fallbackLng 回退中文，不是回显 key 本身
    expect(i18n.t('editor.underline')).toBe('下划线');
  });

  it('同名 key 以先注册的一方为准，后加载的包盖不掉内置文案', () => {
    const i18n = new I18nManager('zh');
    i18n.addResources('zh', { editor: { bold: '不该生效', code: '代码块 zh' } });

    expect(i18n.t('editor.bold')).toBe('加粗');
    expect(i18n.t('editor.code')).toBe('行内代码');
  });

  it('补的 key 直接生效，不受同名前缀影响', () => {
    const i18n = new I18nManager('zh');
    i18n.addResources('zh', { editor: { customThing: '自定义词条' } });

    expect(i18n.t('editor.customThing')).toBe('自定义词条');
  });

  it('注册当前语言会重刷已挂载界面的文案；lang 本身没变所以这一步此前根本无从发生', async () => {
    // 用一门尚未注册的语言开局：i18next 认这个 lng 值（language 就是它），但没有词条，
    // 于是界面全部回退中文——正是"想扩展却没有入口"的那个状态
    const editor = await mount({
      lang: 'nl',
      content: '<p>x</p>',
      toolbar: { items: ['bold', 'italic'] },
    });
    expect(editor.i18n.getLanguage()).toBe('nl');
    expect(toolbarTitles(editor)).toEqual(['加粗', '斜体']);

    editor.i18n.addResources('nl', { editor: { bold: 'Vet', italic: 'Cursief' } });

    expect(toolbarTitles(editor)).toEqual(['Vet', 'Cursief']);
  });

  it('注册的不是当前语言时不去惊动界面', async () => {
    const editor = await mount({
      lang: 'zh',
      content: '<p>x</p>',
      toolbar: { items: ['bold'] },
    });

    editor.i18n.addResources('de', { editor: { bold: 'Fett' } });

    expect(toolbarTitles(editor)).toEqual(['加粗']);
    await editor.setLanguage('de');
    expect(toolbarTitles(editor)).toEqual(['Fett']);
  });

  it('注册语言包只影响这一个实例，不漏给别的实例、后来的实例，也不漏给 zhText', async () => {
    const first = await mount({ lang: 'zh', content: '<p>1</p>' });
    const second = await mount({ lang: 'zh', content: '<p>2</p>' });

    // 用一个新 key 当探针：deepMerge 是就地合并，而 init 曾把模块字面量按引用交出去，
    // 于是这一步一度会永久改掉 zhResources 本身
    first.i18n.addResources('zh', { editor: { customThing: '只有第一个有' } });

    expect(first.i18n.t('editor.customThing')).toBe('只有第一个有');
    // 已存在的另一个实例不受影响：缺词条时 t() 原样回显 key
    expect(second.i18n.t('editor.customThing')).toBe('editor.customThing');
    // 之后新建的实例也不受影响——污染源是模块级字面量，不是实例间共享
    expect(new I18nManager('zh').t('editor.customThing')).toBe('editor.customThing');
    // zhText() 读的就是那个字面量，它是工具栏默认文案的单源；这里必须是空串
    expect(zhText('editor.customThing')).toBe('');
    expect(zhText('editor.bold')).toBe('加粗');
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
