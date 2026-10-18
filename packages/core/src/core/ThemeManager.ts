/**
 * ThemeManager - 主题管理
 */

/** 内置亮/暗两套，带字面量提示；仍需允许任意自定义主题名 */
export type ThemeType = 'light' | 'dark' | (string & {});

/** 主题类的统一前缀；换主题时要按前缀摘干净，而不是只摘那两个已知名字 */
const THEME_PREFIX = 'atri-theme-';

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
    // 按前缀摘，而不是写死 remove('atri-theme-light', 'atri-theme-dark')：
    // ThemeType 接受任意自定义主题名（README 就宣传 setTheme('sepia')），
    // 只摘那两个名字的话自定义主题永远留在容器上——
    // setTheme('sepia') 再 setTheme('light') 之后是
    // "atri-theme-sepia atri-theme-light"，两套变量同时生效，
    // 谁赢取决于样式里的声明顺序，而不是用户最后选了哪个
    Array.from(this.container.classList)
      .filter((name) => name.startsWith(THEME_PREFIX))
      .forEach((name) => this.container.classList.remove(name));

    this.container.classList.add(`${THEME_PREFIX}${this.currentTheme}`);

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
