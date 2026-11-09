import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4175', browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 900 } } },
    {
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
    },
  ],
  webServer: {
    command:
      'pnpm -C demos/vanilla exec vite ../../scripts/browser --config ../../scripts/browser/vite.config.ts --port 4175 --host 127.0.0.1 --strictPort',
    cwd: '../..',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: !process.env.CI,
  },
});
