/**
 * ThemeManager - 主题管理
 */

export type ThemeType = 'light' | 'dark' | string;

export class ThemeManager {
  private container: HTMLElement;
  private currentTheme: ThemeType;

  constructor(container: HTMLElement, theme: ThemeType = 'light') {
    this.container = container;
    this.currentTheme = theme;
    this.applyTheme();
  }

  /**
   * 应用当前主题
   */
  private applyTheme(): void {
    // 移除旧主题类
    this.container.classList.remove('atri-theme-light', 'atri-theme-dark');

    // 添加新主题类
    if (this.currentTheme === 'light' || this.currentTheme === 'dark') {
      this.container.classList.add(`atri-theme-${this.currentTheme}`);
    } else {
      // 自定义主题
      this.container.classList.add(`atri-theme-${this.currentTheme}`);
    }

    // 设置 data 属性
    this.container.setAttribute('data-atri-theme', this.currentTheme);
  }

  /**
   * 获取当前主题
   */
  getTheme(): ThemeType {
    return this.currentTheme;
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

  /**
   * 是否为暗色主题
   */
  isDark(): boolean {
    return this.currentTheme === 'dark';
  }
}
