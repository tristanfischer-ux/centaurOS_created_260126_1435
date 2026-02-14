import { test, expect, type Page } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Mobile Navigation Regression Tests
 *
 * Validates the platform mobile bottom navigation and the "More" menu
 * on a Pixel 5 viewport using the Founder persona.
 */

test.describe('Mobile bottom navigation', () => {
  test.use({
    storageState: FOUNDER_STORAGE,
    viewport: { width: 393, height: 851 },
  })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  function mobileBottomNav(page: Page) {
    return page
      .locator('div.fixed.bottom-0.left-0.right-0')
      .filter({ has: page.getByRole('link', { name: 'Today' }) })
      .first()
  }

  test('shows Today, Updates, Tasks, and More actions', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const nav = mobileBottomNav(page)
    await expect(nav.getByRole('link', { name: 'Today' })).toBeVisible({ timeout: 10_000 })
    await expect(nav.getByRole('link', { name: 'Updates' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Tasks' })).toBeVisible()
    await expect(nav.getByRole('button', { name: 'More' })).toBeVisible()
  })

  test('tapping Tasks navigates to /new-tasks', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await mobileBottomNav(page).getByRole('link', { name: 'Tasks' }).click()
    await page.waitForURL('**/new-tasks**', { timeout: 15_000 })
  })

  test('tapping Updates navigates to /updates', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    await mobileBottomNav(page).getByRole('link', { name: 'Updates' }).click()
    await page.waitForURL('**/updates', { timeout: 15_000 })
  })

  test('More menu exposes grouped routes and account actions', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const nav = mobileBottomNav(page)
    const moreBtn = nav.getByRole('button', { name: 'More' })
    await moreBtn.click()
    const moreMenu = page.getByRole('menu', { name: 'More' })
    await expect(moreMenu).toContainText('Plan', { timeout: 5_000 })
    await expect(moreMenu).toContainText('Workshop')
    await expect(moreMenu).toContainText('Marketplace')

    await expect(moreMenu.getByRole('menuitem', { name: 'Strategy' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Objectives' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Team' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Specialists' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Marketplace' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Settings' })).toBeVisible()
    await expect(moreMenu.getByRole('menuitem', { name: 'Sign Out' })).toBeVisible()
  })

  test('More menu route navigation works (Team)', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    const nav = mobileBottomNav(page)
    await nav.getByRole('button', { name: 'More' }).click()
    await page.getByRole('menuitem', { name: 'Team' }).click()
    await page.waitForURL('**/team', { timeout: 15_000 })
  })

  test('core mobile routes render without runtime errors', async ({ page }) => {
    const routes = ['/today', '/updates', '/new-tasks', '/new-objectives', '/team', '/marketplace']
    for (const route of routes) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
      const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
      expect(hasError, `${route} shows error on mobile`).toBe(false)
    }
  })
})
