import { defineConfig, devices } from '@playwright/test';

// Only use system Chrome when explicitly configured.
// Otherwise prefer Playwright's managed Chromium (downloaded into ./node_modules cache or PLAYWRIGHT_BROWSERS_PATH).
const chromeExecutablePath = process.env.PW_CHROME_EXECUTABLE_PATH;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  outputDir: 'test-results/',
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: chromeExecutablePath
          ? { executablePath: chromeExecutablePath }
          : undefined,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 30000,
    reuseExistingServer: !process.env.CI,
  },
});
