import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  // Prevent WS interference between parallel tests
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['html', { open: 'never', outputFolder: 'playwright-report' }], ['list']],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    // Collect trace on first retry only (retries=0 here, but keep for future)
    trace: 'on-first-retry',
    // Video on failure
    video: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // Requires `npm run dev` (Vite) to be running.
  // The backend (uvicorn :8003) must be started separately.
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
