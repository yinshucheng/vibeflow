import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  globalTimeout: 300000, // 5 minutes for all tests
  retries: 0,
  workers: 1, // Electron tests must run serially
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // Reduce worker teardown timeout
  expect: {
    timeout: 10000,
  },
});
