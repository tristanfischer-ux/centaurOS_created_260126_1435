/**
 * @file mobile-authenticated.spec.ts
 *
 * @description Authenticated mobile E2E tests for the full-screen Drawer menu
 * on iPhone 14 Pro (390x844). Verifies navigation structure, touch targets,
 * active state highlighting, drawer close-on-navigate, and safe-area classes.
 *
 * @related
 * - MobileNav: src/components/MobileNav.tsx
 * - Mobile delight audit: e2e/mobile-delight-audit.spec.ts
 */

import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

test.use({
  storageState: FOUNDER_STORAGE,
})

test.beforeEach(async ({ page }) => {
  await dismissOnboarding(page)
})

test.describe('Mobile Navigation Drawer', () => {
  test('bottom bar renders Today, Comms, Tasks', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const nav = page.getByTestId('mobile-nav-items')
    await expect(nav.getByText('Today')).toBeVisible()
    await expect(nav.getByText('Comms')).toBeVisible()
    await expect(nav.getByText('Tasks')).toBeVisible()
  })

  test('FAB is visible', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await expect(page.getByTestId('mobile-fab')).toBeVisible()
  })

  test('"More" button opens Drawer', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()
    await expect(page.getByTestId('drawer-nav')).toBeVisible()
  })

  test('all 5 section headers present in drawer', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()

    await expect(page.getByTestId('section-me')).toBeVisible()
    await expect(page.getByTestId('section-plan')).toBeVisible()
    await expect(page.getByTestId('section-cash-burn')).toBeVisible()
    await expect(page.getByTestId('section-workshop')).toBeVisible()
    await expect(page.getByTestId('section-marketplace')).toBeVisible()
  })

  test('touch targets are at least 44px tall', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()

    const sampleItems = [
      'drawer-item-the-forge',
      'drawer-item-strategy',
      'drawer-item-marketplace',
      'drawer-item-settings',
    ]

    for (const testId of sampleItems) {
      const box = await page.getByTestId(testId).boundingBox()
      expect(box, `${testId} should be visible`).not.toBeNull()
      expect(box!.height, `${testId} should be >= 44px tall`).toBeGreaterThanOrEqual(44)
    }
  })

  test('active route is highlighted with international-orange', async ({ page }) => {
    await page.goto('/strategy')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()

    const strategyItem = page.getByTestId('drawer-item-strategy')
    await expect(strategyItem).toBeVisible()
    await expect(strategyItem).toHaveClass(/text-international-orange/)
  })

  test('drawer closes on navigation', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()
    await expect(page.getByTestId('drawer-nav')).toBeVisible()

    await page.getByTestId('drawer-item-the-forge').click()
    await page.waitForURL('**/the-forge')

    // Drawer nav should no longer be visible after navigation
    await expect(page.getByTestId('drawer-nav')).not.toBeVisible()
  })

  test('no horizontal overflow with drawer open', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()
    await expect(page.getByTestId('drawer-nav')).toBeVisible()

    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = page.viewportSize()?.width ?? 390
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 2)
  })

  test('Sign Out and Settings are present', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()

    await expect(page.getByTestId('drawer-item-settings')).toBeVisible()
    await expect(page.getByTestId('drawer-item-sign-out')).toBeVisible()
  })

  test('nav has safe-area classes', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('mobile-more-button').click()

    const nav = page.getByTestId('drawer-nav')
    await expect(nav).toHaveClass(/pb-safe/)
    await expect(nav).toHaveClass(/px-safe/)
  })
})
