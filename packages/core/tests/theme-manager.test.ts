import { describe, expect, it } from 'vitest';
import { ThemeManager, type ThemeType } from '../src/core/ThemeManager';

describe('ThemeManager', () => {
  function setup(theme?: ThemeType) {
    const container = document.createElement('div');
    const manager = new ThemeManager(container, theme);
    return { container, manager };
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
    expect(container.classList.contains('atri-theme-light')).toBe(false);
    expect(container.getAttribute('data-atri-theme')).toBe('dark');
  });

  it('自定义主题名与内置主题走同一套 class 规则', () => {
    const { container, manager } = setup();
    manager.setTheme('sepia');
    expect(container.classList.contains('atri-theme-sepia')).toBe(true);
    expect(container.getAttribute('data-atri-theme')).toBe('sepia');
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
