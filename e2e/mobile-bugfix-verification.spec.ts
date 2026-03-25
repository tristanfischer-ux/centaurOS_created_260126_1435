/**
 * @file mobile-bugfix-verification.spec.ts
 *
 * @description Verifies mobile nav bugs are fixed:
 * 1. Mobile nav "More" Drawer closes after selecting an item
 * 2. Drawer opens and closes correctly with controlled state
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

  test('Bug 2: Mobile nav "More" Drawer closes after selecting an item', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('domcontentloaded')

    // Find and tap the "More" button in the mobile nav
    const moreButton = page.getByTestId('mobile-more-button')
    await expect(moreButton).toBeVisible({ timeout: 15_000 })
    await moreButton.tap()

    // Drawer should be open — look for Strategy link
    const strategyItem = page.getByTestId('drawer-item-strategy')
    await expect(strategyItem).toBeVisible({ timeout: 5_000 })

    // Tap a nav item
    await strategyItem.click()

    // Wait for navigation
    await page.waitForURL('**/strategy**', { timeout: 15_000 })

    // The drawer should be closed — nav should no longer be visible
    await expect(page.getByTestId('drawer-nav')).not.toBeVisible({ timeout: 5_000 })
  })

  test('Bug 2b: Drawer opens and closes correctly with controlled state', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('domcontentloaded')

    const moreButton = page.getByTestId('mobile-more-button')
    await expect(moreButton).toBeVisible({ timeout: 15_000 })

    // Open
    await moreButton.tap()
    const drawerNav = page.getByTestId('drawer-nav')
    await expect(drawerNav).toBeVisible({ timeout: 5_000 })

    // Press Escape to close
    await page.keyboard.press('Escape')
    await expect(drawerNav).not.toBeVisible({ timeout: 5_000 })

    // Open again — should still work (state is properly managed)
    await moreButton.tap()
    await expect(drawerNav).toBeVisible({ timeout: 5_000 })

    // Select Settings — should close and navigate
    const settingsItem = page.getByTestId('drawer-item-settings')
    await expect(settingsItem).toBeVisible({ timeout: 3_000 })
    await settingsItem.click()
    await page.waitForURL('**/settings**', { timeout: 15_000 })
    await expect(drawerNav).not.toBeVisible({ timeout: 5_000 })
  })
})
