import { test as setup, expect } from '@playwright/test'
import {
  EXECUTIVE_STORAGE,
  FOUNDER_STORAGE,
  APPRENTICE_STORAGE,
  SUPPLIER_STORAGE,
} from './auth-storage'

// Test credentials from environment variables
const TEST_URL = process.env.TEST_URL || 'http://localhost:3000'
const EXECUTIVE_EMAIL = process.env.TEST_EXECUTIVE_EMAIL
const EXECUTIVE_PASSWORD = process.env.TEST_EXECUTIVE_PASSWORD
const FOUNDER_EMAIL = process.env.TEST_FOUNDER_EMAIL
const FOUNDER_PASSWORD = process.env.TEST_FOUNDER_PASSWORD
const APPRENTICE_EMAIL = process.env.TEST_APPRENTICE_EMAIL
const APPRENTICE_PASSWORD = process.env.TEST_APPRENTICE_PASSWORD
const SUPPLIER_EMAIL = process.env.TEST_SUPPLIER_EMAIL
const SUPPLIER_PASSWORD = process.env.TEST_SUPPLIER_PASSWORD

/**
 * Logs in as a platform user (Founder, Executive, Apprentice).
 * Expects redirect to /today after login.
 */
async function loginAsPlatformUser(
  page: any,
  email: string | undefined,
  password: string | undefined,
  storagePath: string,
  role: string
): Promise<void> {
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
  await page.click('button:has-text("Access Foundry")')
  
  // Wait for redirect to a platform page (today or dashboard)
  await page.waitForURL(/\/(today|dashboard)/, { timeout: 30000 })
  
  // Verify we're logged in
  await expect(page.locator('text=Good')).toBeVisible({ timeout: 10000 })
  
  // Save auth state
  await page.context().storageState({ path: storagePath })
  
  console.log(`✓ ${role} authentication saved to ${storagePath}`)
}

/**
 * Logs in as a supplier user.
 * Expects redirect to /supplier-portal after login.
 */
async function loginAsSupplier(
  page: any,
  email: string | undefined,
  password: string | undefined,
  storagePath: string
): Promise<void> {
  if (!email || !password) {
    console.warn('Skipping Supplier auth setup - credentials not provided')
    return
  }

  await page.goto(`${TEST_URL}/login`)
  
  // Wait for login form to be ready
  await page.waitForSelector('input[type="email"]', { timeout: 10000 })
  
  // Fill credentials
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  
  // Submit form
  await page.click('button:has-text("Access Foundry")')
  
  // Supplier accounts redirect to supplier-portal
  await page.waitForURL('**/supplier-portal**', { timeout: 30000 })
  
  // Save auth state
  await page.context().storageState({ path: storagePath })
  
  console.log(`✓ Supplier authentication saved to ${storagePath}`)
}

setup('authenticate executive', async ({ page }) => {
  await loginAsPlatformUser(page, EXECUTIVE_EMAIL, EXECUTIVE_PASSWORD, EXECUTIVE_STORAGE, 'Executive')
})

setup('authenticate founder', async ({ page }) => {
  await loginAsPlatformUser(page, FOUNDER_EMAIL, FOUNDER_PASSWORD, FOUNDER_STORAGE, 'Founder')
})

setup('authenticate apprentice', async ({ page }) => {
  await loginAsPlatformUser(page, APPRENTICE_EMAIL, APPRENTICE_PASSWORD, APPRENTICE_STORAGE, 'Apprentice')
})

setup('authenticate supplier', async ({ page }) => {
  await loginAsSupplier(page, SUPPLIER_EMAIL, SUPPLIER_PASSWORD, SUPPLIER_STORAGE)
})
