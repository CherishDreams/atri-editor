import { describe, expect, it } from 'vitest';
import { ThemeManager, type ThemeType } from '../src/core/ThemeManager';

describe('ThemeManager', () => {
  function setup(theme?: ThemeType) {
    const container = document.createElement('div');
    const manager = new ThemeManager(container, theme);
    return { container, manager };
  }

  /** 容器上当前的主题类，按前缀取而不是只挑那两个已知名字 */
  function themeClassesOf(container: HTMLElement): string[] {
    return Array.from(container.classList).filter((name) => name.startsWith('atri-theme-'));
  }

  it('默认亮色：挂上主题类并同步 data 属性', () => {
    const { container } = setup();
    expect(container.classList.contains('atri-theme-light')).toBe(true);
    expect(container.getAttribute('data-atri-theme')).toBe('light');
  });

  it('setTheme 在亮暗之间换类，旧类被移除', () => {
    const { container, manager } = setup('light');
    manager.setTheme('dark');
    expect(container.classList.contains('atri-theme-dark')).toBe(true);
    // 只查"旧的不在"不够：真正的判据是同时只有一个主题类
    expect(themeClassesOf(container)).toEqual(['atri-theme-dark']);
    expect(container.getAttribute('data-atri-theme')).toBe('dark');
  });

  it('自定义主题名与内置主题走同一套 class 规则', () => {
    const { container, manager } = setup();
    manager.setTheme('sepia');
    expect(container.classList.contains('atri-theme-sepia')).toBe(true);
    expect(container.getAttribute('data-atri-theme')).toBe('sepia');
    expect(themeClassesOf(container)).toEqual(['atri-theme-sepia']);
  });

  // 这条是补的洞：旧实现只 remove('atri-theme-light','atri-theme-dark') 两个写死的名字，
  // 自定义主题名永远摘不掉，而上面那几条断言查的都是"新类加上了"，一条都抓不到
  it('自定义主题切回内置主题不留残类', () => {
    const { container, manager } = setup();
    manager.setTheme('sepia');
    manager.setTheme('light');
    expect(themeClassesOf(container)).toEqual(['atri-theme-light']);

    // 自定义主题之间来回换也一样：从亮色进 sepia，亮色也不该留下
    manager.setTheme('navy');
    expect(themeClassesOf(container)).toEqual(['atri-theme-navy']);
  });

  it('任意时刻容器上只有一个主题类——两套同时生效时谁赢只看声明顺序', () => {
    const { container, manager } = setup('light');
    const path: ThemeType[] = ['dark', 'sepia', 'light', 'navy', 'dark', 'sepia'];

    path.forEach((theme) => {
      manager.setTheme(theme);
      expect(themeClassesOf(container), theme).toEqual([`atri-theme-${theme}`]);
      expect(container.getAttribute('data-atri-theme'), theme).toBe(theme);
    });
  });

  it('toggleTheme 在亮暗之间往返，自定义主题切回亮色', () => {
    const { manager, container } = setup('light');
    manager.toggleTheme();
    expect(container.getAttribute('data-atri-theme')).toBe('dark');
    manager.toggleTheme();
    expect(container.getAttribute('data-atri-theme')).toBe('light');

    manager.setTheme('sepia');
    manager.toggleTheme();
    expect(container.getAttribute('data-atri-theme')).toBe('light');
  });

  it('门面 setTheme 支持自定义主题并写入容器', async () => {
    const { AtriEditor } = await import('../src/index');
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new AtriEditor({ element, toolbar: false });
    try {
      editor.setTheme('sepia');
      const root = element.querySelector('.atri-editor') as HTMLElement;
      expect(root.classList.contains('atri-theme-sepia')).toBe(true);
    } finally {
      editor.destroy();
      element.remove();
    }
  });
});
