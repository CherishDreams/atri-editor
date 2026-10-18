import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      // 与 core 一样常开：CI 的 pnpm test 直接带上闸门。
      // 新包代码量小，分母小意味着一条没测的分支就能把百分比拉下去，
      // 所以阈值不比 core 松
      enabled: true,
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 90,
        lines: 90,
        functions: 85,
        branches: 75,
      },
    },
  },
});
