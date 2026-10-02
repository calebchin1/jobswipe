import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  workers: 1,
  reporter: 'list',
  outputDir: './test-results',
  use: {
    ...devices['iPhone 13'],
    defaultBrowserType: 'chromium',
    baseURL: 'http://127.0.0.1:3111',
  },
  webServer: {
    command: 'python3 -m http.server 3111 --bind 127.0.0.1 --directory apps/mobile/dist-live',
    cwd: '../..',
    url: 'http://127.0.0.1:3111',
    reuseExistingServer: !process.env.CI,
  },
});
