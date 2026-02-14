import { test, expect, type Page } from '@playwright/test'
import { SUPPLIER_STORAGE, dismissOnboarding } from './auth-storage'

test.describe('Supplier mobile navigation', () => {
  test.use({
    storageState: SUPPLIER_STORAGE,
    viewport: { width: 393, height: 851 },
  })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  function supplierMobileNav(page: Page) {
    return page
      .locator('div.fixed.bottom-0.left-0.right-0')
      .filter({ has: page.getByRole('link', { name: 'Home' }) })
      .first()
  }

  test('shows core supplier tabs', async ({ page }) => {
    await page.goto('/supplier-portal')
    await page.waitForLoadState('networkidle')

    const nav = supplierMobileNav(page)
    await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
    await expect(nav.getByRole('link', { name: 'Listing' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Orders' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'RFQs' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'More' })).toBeVisible()
  })

  test('More menu shows supplier utility routes', async ({ page }) => {
    await page.goto('/supplier-portal')
    await page.waitForLoadState('networkidle')

    const nav = supplierMobileNav(page)
    await nav.getByRole('button', { name: 'More' }).click()

    await expect(page.getByRole('menuitem', { name: 'Analytics' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('menuitem', { name: 'Marketplace' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Help' })).toBeVisible()
  })
})
