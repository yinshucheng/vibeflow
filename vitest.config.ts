import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import os from 'os';

const dbUser = os.userInfo().username;

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    globals: true,
    include: ['**/*.{test,spec}.{ts,tsx}', '**/tests/**/*.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/dist/**', '**/.claude/worktrees/**', '**/tests/helpers/**', '**/tests/global-setup.ts', '**/vibeflow-ios/**', '**/vibeflow-desktop/**', '**/vibeflow-extension/**', '**/packages/**'],
    globalSetup: ['./tests/global-setup.ts'],
    env: {
      DATABASE_URL: `postgresql://${dbUser}@localhost:5432/vibeflow_test?schema=public`,
      DEV_MODE: 'true',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
