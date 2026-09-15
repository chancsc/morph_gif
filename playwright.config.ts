import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: '/opt/pw-browsers/chromium',
        },
      },
    },
  ],
  webServer: {
    command: 'npm run dev -- --port 4319 --strictPort',
    url: 'http://localhost:4319',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
