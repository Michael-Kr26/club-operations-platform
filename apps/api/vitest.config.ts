import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 1,
    testTimeout: 30000,
    hookTimeout: 60000,
    coverage: {
      reporter: ['text', 'html'],
    },
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
});
