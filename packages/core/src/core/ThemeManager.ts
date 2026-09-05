/**
 * ThemeManager - 主题管理
 */

/** 内置亮/暗两套，带字面量提示；仍需允许任意自定义主题名 */
export type ThemeType = 'light' | 'dark' | (string & {});

export class ThemeManager {
  private container: HTMLElement;
  private currentTheme: ThemeType;

  constructor(container: HTMLElement, theme: ThemeType = 'light') {
    this.container = container;
    this.currentTheme = theme;
    this.applyTheme();
  }

  /**
   * 应用当前主题：内置主题与自定义主题走同一条 class 规则，只是名字不同
   */
  private applyTheme(): void {
    // 移除旧主题类后添加新主题类
    this.container.classList.remove('atri-theme-light', 'atri-theme-dark');
    this.container.classList.add(`atri-theme-${this.currentTheme}`);

    // 设置 data 属性
    this.container.setAttribute('data-atri-theme', this.currentTheme);
  }

  /**
   * 设置主题
   */
  setTheme(theme: ThemeType): void {
    this.currentTheme = theme;
    this.applyTheme();
  }

  /**
   * 切换亮/暗主题
   */
  toggleTheme(): void {
    if (this.currentTheme === 'light') {
      this.setTheme('dark');
    } else if (this.currentTheme === 'dark') {
      this.setTheme('light');
    } else {
      // 自定义主题切换为 light
      this.setTheme('light');
    }
  }
}
