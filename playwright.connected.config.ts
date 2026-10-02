import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/connected',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.TEST_APP_ORIGIN ?? 'http://127.0.0.1:3102',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
});
