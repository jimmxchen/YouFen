import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'app/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['contracts/**', 'node_modules/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['lib/**', 'app/**'],
    },
  },
});
