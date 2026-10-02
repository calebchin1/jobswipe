import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/candidate',
  workers: 2,
  reporter: 'list',
  outputDir: 'test-results/candidate',
  use: {
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    baseURL: 'http://127.0.0.1:3101',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 3101 --bind 127.0.0.1 --directory apps/mobile/dist',
    url: 'http://127.0.0.1:3101',
    reuseExistingServer: !process.env.CI,
  },
});
