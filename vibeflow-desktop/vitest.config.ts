import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './electron'),
    },
  },
});