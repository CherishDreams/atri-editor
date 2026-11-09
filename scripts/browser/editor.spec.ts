import { expect, test, type Locator, type Page } from '@playwright/test';
import type { AtriEditor } from '../../packages/core/src/AtriEditor';

declare global {
  interface Window {
    editor: AtriEditor;
    aiCalls: number;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.editor?.editor);
  await page.evaluate(() => window.scrollTo(0, 360));
});

async function nearAnchor(page: Page, panel: Locator, anchor: Locator) {
  await expect(panel).toBeVisible();
  await expect
    .poll(async () => {
      const a = await anchor.boundingBox();
      const p = await panel.boundingBox();
      if (!a || !p) return false;
      const gap = Math.min(Math.abs(p.y - a.y - a.height), Math.abs(a.y - p.y - p.height));
      return gap < 10 && p.x >= 0 && p.x + p.width <= page.viewportSize()!.width + 1
        ? 'anchored'
        : JSON.stringify({ a, p, gap });
    })
    .toBe('anchored');
  await expect(panel).toHaveCSS('position', 'fixed');
}

test('toolbar panels follow page and internal scrolling and close in readonly', async ({
  page,
}, info) => {
  const trigger = page.locator('[data-toolbar-item="insertImage"]').first();
  await trigger.click();
  const panel = page.locator('.atri-media-panel');
  await nearAnchor(page, panel, trigger);
  await page.evaluate(() => window.scrollBy(0, 25));
  await nearAnchor(page, panel, trigger);
  await page.locator('.scroll-shell').evaluate((el) => {
    el.scrollTop += 20;
  });
  await nearAnchor(page, panel, trigger);
  await page.screenshot({ path: info.outputPath('floating-panel.png') });
  await page.evaluate(() => window.editor.setEditable(false));
  await expect(panel).toHaveCount(0);
  for (const button of await page.locator('.atri-editor-toolbar-btn').all()) {
    await expect(button).toBeDisabled();
  }
  await expect(page.locator('.tiptap')).toHaveAttribute('contenteditable', 'false');
});

test('table menu stays by its cell after scrolling', async ({ page }) => {
  await page.evaluate(() => {
    window.editor.setContent(
      '<table><tr><td><p>cell</p></td><td><p>next</p></td></tr></table><p>tail</p>'
    );
  });
  const cell = page.locator('.tiptap td').first();
  await cell.click();
  const panel = page.locator('.atri-table-menu');
  await nearAnchor(page, panel, cell);
  await page.evaluate(() => window.scrollBy(0, 20));
  await nearAnchor(page, panel, cell);
  await page.locator('.scroll-shell').evaluate((el) => {
    el.scrollTop += 15;
  });
  await nearAnchor(page, panel, cell);
});

test('AI menu follows cursor and deleting slash restores normal Enter', async ({ page }, info) => {
  await page.evaluate(() => window.editor.setContent('<p></p>'));
  const content = page.locator('.tiptap');
  await content.click();
  await page.keyboard.type('/');
  const menu = page.locator('.atri-ai-command-menu');
  const cursorAnchor = content.locator('p').first();
  await nearAnchor(page, menu, cursorAnchor);
  await page.evaluate(() => window.scrollBy(0, 20));
  await nearAnchor(page, menu, cursorAnchor);
  await page.locator('.scroll-shell').evaluate((el) => {
    el.scrollTop += 10;
  });
  await nearAnchor(page, menu, cursorAnchor);
  await page.screenshot({ path: info.outputPath('ai-menu.png') });
  await page.keyboard.press('Backspace');
  await expect(menu).toHaveCount(0);
  await page.keyboard.press('Enter');
  await expect(content.locator('p')).toHaveCount(2);
  expect(await page.evaluate(() => window.aiCalls)).toBe(0);
  await page.keyboard.type('/');
  await expect(menu).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(content).toContainText('AI result');
  expect(await page.evaluate(() => window.aiCalls)).toBe(1);
});
