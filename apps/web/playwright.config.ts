import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  workers: 2,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:3110', trace: 'retain-on-failure' },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1050 } },
    },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
  webServer: {
    command:
      'node scripts/run.mjs web build && node scripts/run.mjs web start --hostname 127.0.0.1 --port 3110',
    cwd: resolve(__dirname, '../..'),
    url: 'http://127.0.0.1:3110/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
