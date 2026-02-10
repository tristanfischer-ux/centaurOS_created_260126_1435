import { defineConfig, devices } from '@playwright/test'
import path from 'path'
import { config } from 'dotenv'

// Load .env.local so test credentials are available
config({ path: path.join(__dirname, '.env.local') })

// Auth storage paths
const authDir = path.join(__dirname, '.playwright/auth')

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Walkthrough tests navigate many pages — give them room
  timeout: 120_000,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.TEST_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Always record video so every run produces a walkthrough
    video: 'on',
  },
  projects: [
    // Auth setup projects - run first
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
    },
    // QA Tests - Day in the Life (one per persona)
    {
      name: 'qa-executive',
      testMatch: /qa-executive\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: { 
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'executive.json'),
      },
    },
    {
      name: 'qa-founder',
      testMatch: /qa-founder\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: { 
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'founder.json'),
      },
    },
    {
      name: 'qa-apprentice',
      testMatch: /qa-apprentice\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: { 
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'apprentice.json'),
      },
    },
    {
      name: 'qa-supplier',
      testMatch: /qa-supplier\.spec\.ts/,
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: path.join(authDir, 'supplier.json'),
      },
    },
    // Updates page tests (authenticated, uses inline storageState)
    {
      name: 'updates',
      testMatch: /updates\.spec\.ts$/,
      dependencies: ['auth-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    // General tests (unauthenticated)
    {
      name: 'chromium',
      testMatch: /(?<!qa-.*|auth\.setup|updates)\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'Mobile Chrome',
      testMatch: /(?<!qa-.*|auth\.setup|updates)\.spec\.ts$/,
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120 * 1000,
  },
})
