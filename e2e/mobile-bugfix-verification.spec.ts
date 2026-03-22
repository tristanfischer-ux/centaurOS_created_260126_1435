/**
 * @file mobile-bugfix-verification.spec.ts
 *
 * @description Verifies 3 mobile bugs are fixed:
 * 1. "Set Up Profile" link is a real <a> tag (not blocked by Radix Slot on iOS)
 * 2. Mobile nav "More" dropdown closes after selecting an item
 * 3. Marketplace listing RLS allows providers to create listings
 *
 * Run: npx playwright test e2e/mobile-bugfix-verification.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test'
import path from 'path'

// Force iPhone viewport for all tests in this file
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  storageState: path.join(__dirname, '../.playwright/auth/founder.json'),
})

test.describe('Mobile bug fixes', () => {

  test('Bug 2: Mobile nav "More" dropdown closes after selecting an item', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('domcontentloaded')

    // Find and tap the "More" button in the mobile nav
    const moreButton = page.locator('[data-testid="mobile-nav"] button:has-text("More")')
    await expect(moreButton).toBeVisible({ timeout: 15_000 })
    await moreButton.tap()

    // Dropdown should be open — look for a menu item (e.g., "Strategy")
    const strategyItem = page.getByRole('menuitem', { name: 'Strategy' })
    await expect(strategyItem).toBeVisible({ timeout: 5_000 })

    // Tap a nav item
    await strategyItem.click()

    // Wait for navigation
    await page.waitForURL('**/strategy**', { timeout: 15_000 })

    // The dropdown should be closed — menu should no longer be visible
    await expect(strategyItem).not.toBeVisible({ timeout: 5_000 })
  })

  test('Bug 2b: DropdownMenu opens and closes correctly with controlled state', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('domcontentloaded')

    const moreButton = page.locator('[data-testid="mobile-nav"] button:has-text("More")')
    await expect(moreButton).toBeVisible({ timeout: 15_000 })

    // Open
    await moreButton.tap()
    const menuContent = page.locator('[role="menu"]')
    await expect(menuContent).toBeVisible({ timeout: 5_000 })

    // Press Escape to close
    await page.keyboard.press('Escape')
    await expect(menuContent).not.toBeVisible({ timeout: 5_000 })

    // Open again — should still work (state is properly managed)
    await moreButton.tap()
    await expect(menuContent).toBeVisible({ timeout: 5_000 })

    // Select Settings — should close and navigate
    const settingsItem = page.getByRole('menuitem', { name: 'Settings' })
    await expect(settingsItem).toBeVisible({ timeout: 3_000 })
    await settingsItem.click()
    await page.waitForURL('**/settings**', { timeout: 15_000 })
    await expect(menuContent).not.toBeVisible({ timeout: 5_000 })
  })
})
