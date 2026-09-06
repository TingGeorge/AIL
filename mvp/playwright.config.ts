import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';
const useExternalServer = process.env.PLAYWRIGHT_EXTERNAL_SERVER === '1';
const isCI = Boolean(process.env.CI);
const browserChannel =
  process.env.PLAYWRIGHT_BROWSER_CHANNEL ?? (isCI ? undefined : 'chrome');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    ...devices['Desktop Chrome'],
    channel: browserChannel,
    viewport: { width: 390, height: 844 },
  },
  webServer: useExternalServer
    ? undefined
    : {
        command: 'npm run dev',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
