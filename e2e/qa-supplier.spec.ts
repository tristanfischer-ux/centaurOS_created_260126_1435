import { test, expect } from '@playwright/test'
import { SUPPLIER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Supplier Persona — Full Day-in-the-Life Video Walkthrough
 *
 * Covers every page in the Supplier Portal, which is a separate
 * layout from the main platform. Supplier accounts have
 * account_type = 'supplier' and are redirected to /supplier-portal
 * after login.
 *
 * Sidebar routes (from SupplierSidebar):
 *   Main:    Dashboard, My Listing, Orders, RFQs, Analytics
 *   Support: Settings
 *
 * Sections:
 *   1. Supplier Portal Navigation (all portal pages)
 *   2. Permission Restrictions (cannot access platform routes)
 */

test.describe('Supplier — Day in the Life', () => {
  test.use({ storageState: SUPPLIER_STORAGE })

  // Dismiss all onboarding modals before every test so videos show the real app
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Helpers ────────────────────────────────────────────────
  async function navigateViaSidebar(page: any, linkText: string, urlFragment: string): Promise<void> {
    const link = page.locator(`nav a:has-text("${linkText}")`).first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await page.waitForURL(`**${urlFragment}`, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
  }

  // ─── 1. Supplier Portal Navigation ─────────────────────────

  test.describe('Supplier Portal Pages', () => {
    test('Dashboard — portal loads with supplier indicator', async ({ page }) => {
      await page.goto('/supplier-portal')
      await page.waitForLoadState('networkidle')

      // Should see "Supplier Portal" badge in sidebar
      await expect(
        page.getByText('Supplier Portal', { exact: true })
      ).toBeVisible({ timeout: 10_000 })

      // Dashboard content should load
      await page.waitForTimeout(2_000)
    })

    test('My Listing — view and manage marketplace listing', async ({ page }) => {
      await page.goto('/supplier-portal')
      await navigateViaSidebar(page, 'My Listing', '/supplier-portal/listing')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)

      // Interact with listing elements if available (edit button, tabs, etc.)
      const editBtn = page.getByRole('button', { name: /edit|update|manage/i }).first()
      if (await editBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await editBtn.click()
        await page.waitForTimeout(1_500)

        // Close dialog if one opened
        if (await page.getByRole('dialog').isVisible({ timeout: 2_000 }).catch(() => false)) {
          await page.keyboard.press('Escape')
        }
      }
    })

    test('Orders — view order list', async ({ page }) => {
      await page.goto('/supplier-portal')
      await navigateViaSidebar(page, 'Orders', '/supplier-portal/orders')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)

      // Click into an order detail if available
      const orderRow = page.locator('tr, [data-testid="order-row"], [data-testid="order-card"]').first()
      if (await orderRow.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await orderRow.click()
        await page.waitForTimeout(2_000)
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    })

    test('RFQs — view quote requests', async ({ page }) => {
      await page.goto('/supplier-portal')
      await navigateViaSidebar(page, 'RFQs', '/supplier-portal/rfqs')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)
    })

    test('Analytics — view performance metrics', async ({ page }) => {
      await page.goto('/supplier-portal')
      await navigateViaSidebar(page, 'Analytics', '/supplier-portal/analytics')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)
    })

    test('Settings — view portal settings', async ({ page }) => {
      await page.goto('/supplier-portal')
      await navigateViaSidebar(page, 'Settings', '/supplier-portal/settings')

      await page.waitForLoadState('networkidle')
      expect(page.url()).toContain('/supplier-portal/settings')
      await page.waitForTimeout(1_500)
    })
  })

  // ─── 2. Permission Restrictions ────────────────────────────

  test.describe('Permission Restrictions', () => {
    test('/dashboard — supplier views platform dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')
      // Record what suppliers see when accessing the platform dashboard
      await page.waitForTimeout(3_000)
    })

    test('Platform sidebar is NOT visible', async ({ page }) => {
      await page.goto('/supplier-portal')
      await page.waitForLoadState('networkidle')

      // Supplier sidebar should NOT have platform-specific links
      const tasksLink = page.locator('nav').getByText(/^Tasks$/i)
      const isVisible = await tasksLink.isVisible({ timeout: 3_000 }).catch(() => false)
      expect(isVisible).toBeFalsy()
    })
  })
})
