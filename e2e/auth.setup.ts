import { test as setup, expect } from '@playwright/test'
import path from 'path'

// Storage state paths for each persona
export const EXECUTIVE_STORAGE = path.join(__dirname, '../.playwright/auth/executive.json')
export const FOUNDER_STORAGE = path.join(__dirname, '../.playwright/auth/founder.json')
export const APPRENTICE_STORAGE = path.join(__dirname, '../.playwright/auth/apprentice.json')

// Test credentials from environment variables
const TEST_URL = process.env.TEST_URL || 'http://localhost:3000'
const EXECUTIVE_EMAIL = process.env.TEST_EXECUTIVE_EMAIL
const EXECUTIVE_PASSWORD = process.env.TEST_EXECUTIVE_PASSWORD
const FOUNDER_EMAIL = process.env.TEST_FOUNDER_EMAIL
const FOUNDER_PASSWORD = process.env.TEST_FOUNDER_PASSWORD
const APPRENTICE_EMAIL = process.env.TEST_APPRENTICE_EMAIL
const APPRENTICE_PASSWORD = process.env.TEST_APPRENTICE_PASSWORD

async function loginAs(
  page: any,
  email: string | undefined,
  password: string | undefined,
  storagePath: string,
  role: string
) {
  if (!email || !password) {
    console.warn(`Skipping ${role} auth setup - credentials not provided`)
    return
  }

  await page.goto(`${TEST_URL}/login`)
  
  // Wait for login form to be ready
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })
  
  // Fill credentials
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  
  // Submit form
  await page.click('button[type="submit"]')
  
  // Wait for redirect to /today
  await page.waitForURL('**/today', { timeout: 30000 })
  
  // Verify we're logged in
  await expect(page.locator('text=Good')).toBeVisible({ timeout: 10000 })
  
  // Save auth state
  await page.context().storageState({ path: storagePath })
  
  console.log(`✓ ${role} authentication saved to ${storagePath}`)
}

setup('authenticate executive', async ({ page }) => {
  await loginAs(page, EXECUTIVE_EMAIL, EXECUTIVE_PASSWORD, EXECUTIVE_STORAGE, 'Executive')
})

setup('authenticate founder', async ({ page }) => {
  await loginAs(page, FOUNDER_EMAIL, FOUNDER_PASSWORD, FOUNDER_STORAGE, 'Founder')
})

setup('authenticate apprentice', async ({ page }) => {
  await loginAs(page, APPRENTICE_EMAIL, APPRENTICE_PASSWORD, APPRENTICE_STORAGE, 'Apprentice')
})
