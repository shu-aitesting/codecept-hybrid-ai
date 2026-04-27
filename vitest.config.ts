import * as path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@api': path.resolve(__dirname, 'src/api'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@ai': path.resolve(__dirname, 'src/ai'),
      '@visual': path.resolve(__dirname, 'src/visual'),
      '@fixtures': path.resolve(__dirname, 'src/fixtures'),
      '@hooks': path.resolve(__dirname, 'src/hooks'),
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
});
