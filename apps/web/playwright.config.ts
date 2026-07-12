import { defineConfig, devices } from '@playwright/test';

// E2E config for the MMS web app.
//
// Prerequisite: the app must already be running (`pnpm dev` from the repo root),
// serving the web app on http://localhost:5173 and the API on http://localhost:3001.
// The suite drives the real, running app — it does not start servers itself.
export default defineConfig({
  testDir: './e2e',
  // The lifecycle spec hands one trip ticket between roles, so tests must not
  // race each other against the shared database.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'off'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }]
});
