/**
 * @file playwright.finance-phase2.config.ts
 *
 * Dedicated Playwright config for the Finance Phase 2 CRUD suite.
 * Runs against production (fractionalforge.app) with no local dev server.
 *
 * Usage:
 *   npx playwright test --config=playwright.finance-phase2.config.ts
 *
 * The globalSetup automatically refreshes Elena's auth token and seeds
 * fresh test data before the suite starts. No manual steps required.
 */

import { defineConfig, devices } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  testMatch: /finance-phase2-crud\.spec\.ts$/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 120_000,

  // Runs auth refresh + data seed before the suite starts
  globalSetup: './e2e/finance-phase2.setup.ts',

  reporter: [
    ['html'],
    ['line'],
  ],

  use: {
    ...devices['Desktop Chrome'],
    storageState: path.join(__dirname, '.playwright/auth/elena.json'),
    video: 'off',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },

  // No webServer — tests hit production directly
  webServer: undefined,
})
