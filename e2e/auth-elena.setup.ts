/**
 * @file auth-elena.setup.ts — One-time auth setup for elena.vasquez@perigee-labs.com
 *
 * Authenticates against production and saves cookies + onboarding-dismissed
 * localStorage flags to .playwright/auth/elena.json so the Finance Phase 2
 * tests can reuse the session without repeated logins.
 */

import { test as setup } from '@playwright/test'
import path from 'path'

const BASE = 'https://fractionalforge.app'
const EMAIL = 'elena.vasquez@perigee-labs.com'
const PASSWORD = 'PerigeeSpace2025!'

export const ELENA_STORAGE = path.join(__dirname, '../.playwright/auth/elena.json')

setup('authenticate elena (perigee-labs)', async ({ page }) => {
  // Pre-set onboarding flags before page renders
  await page.addInitScript(() => {
    localStorage.setItem('forgeos_onboarding_completed', 'true')
    localStorage.setItem('forgeos_intent_selected', 'true')
    localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
    localStorage.setItem('forgeos:onboarding:completed', 'true')
    localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
  })

  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASSWORD)
  await page.getByRole('button', { name: /enter the forge/i }).click()
  await page.waitForURL(/\/(dashboard|today|finance|the-forge|new-objectives|new-tasks)/, { timeout: 30000 })

  // Belt-and-suspenders: set flags post-navigation too
  await page.evaluate(() => {
    localStorage.setItem('forgeos_onboarding_completed', 'true')
    localStorage.setItem('forgeos_intent_selected', 'true')
    localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
    localStorage.setItem('forgeos:onboarding:completed', 'true')
    localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
  })

  // Reload so flags take effect, then save
  await page.reload()
  await page.waitForURL(/\/(dashboard|today|finance|the-forge|new-objectives|new-tasks)/, { timeout: 15000 })
  await page.context().storageState({ path: ELENA_STORAGE })

  console.log(`✓ Elena (perigee-labs) auth saved to ${ELENA_STORAGE}`)
})
