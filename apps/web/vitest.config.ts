import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
