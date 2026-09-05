import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      // 常开：CI 的 pnpm test 直接带上覆盖率闸门，本地开发也多一层即时反馈
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        // 基线 95.9% / 86.5% / 91.2%，留出余地防止小改动把 CI 打红
        statements: 90,
        lines: 90,
        functions: 85,
        branches: 75,
      },
    },
  },
});
