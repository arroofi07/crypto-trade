import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['packages/**/*.test.ts', 'apps/server/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
