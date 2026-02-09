import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Phase 1 Mobile Navigation Tests
 *
 * Tests the mobile bottom navigation and "More" dropdown Person/Company split
 * on a Pixel 5 viewport. Uses Founder persona.
 *
 * NOTE: The sidebar (hidden md:flex) remains in the DOM at mobile viewport.
 * We scope locators to the fixed bottom nav bar container.
 */

test.describe('Phase 1: Mobile Navigation', () => {
  test.use({
    storageState: FOUNDER_STORAGE,
    viewport: { width: 393, height: 851 }, // Pixel 5
  })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // The mobile bottom nav is a fixed-position container
  // Use .last() to select the mobile nav links (they come after sidebar links in DOM)
  function mobileBottomNav(page: any) {
    return page.locator('div.fixed')
  }

  test('mobile bottom nav shows Home tab', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const homeLink = mobileBottomNav(page).getByRole('link', { name: 'Home' })
    await expect(homeLink).toBeVisible({ timeout: 10_000 })
  })

  test('mobile bottom nav shows Work tab', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const dashLink = mobileBottomNav(page).getByRole('link', { name: 'Work' })
    await expect(dashLink).toBeVisible({ timeout: 10_000 })
  })

  test('mobile bottom nav shows Tasks tab', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const tasksLink = mobileBottomNav(page).getByRole('link', { name: 'Tasks' })
    await expect(tasksLink).toBeVisible({ timeout: 10_000 })
  })

  test('tapping Home navigates to /home', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Verify the Home link exists in mobile nav before clicking
    const homeLink = mobileBottomNav(page).getByRole('link', { name: 'Home' })
    await expect(homeLink).toBeVisible()

    // Use JS click to bypass Next.js dev overlay portal intercepting pointer events
    await homeLink.evaluate((el: HTMLElement) => el.click())
    await page.waitForURL('**/home', { timeout: 15_000 })
  })

  test('/home page renders on mobile', async ({ page }) => {
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    // Welcome heading should be visible
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText('Welcome back', { timeout: 10_000 })

    // Company tiles should be visible
    await expect(page.getByText('Your Companies')).toBeVisible()
  })

  test('More dropdown opens and shows Me/Company sections', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    // Open "More" dropdown from the mobile bottom nav
    const moreBtn = mobileBottomNav(page).getByRole('button', { name: 'More' })
    await moreBtn.click()
    await page.waitForTimeout(500)

    // Should see person items (Marketplace, Guild, Apprenticeship)
    await expect(page.getByRole('menuitem', { name: 'Marketplace' })).toBeVisible({ timeout: 5_000 })
    await expect(page.getByRole('menuitem', { name: 'Guild' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('menuitem', { name: 'Apprenticeship' })).toBeVisible({ timeout: 3_000 })
  })

  test('More dropdown has company navigation items', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const moreBtn = mobileBottomNav(page).getByRole('button', { name: 'More' })
    await moreBtn.click()
    await page.waitForTimeout(500)

    // Should see company items
    await expect(page.getByRole('menuitem', { name: 'Updates' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('menuitem', { name: 'Objectives' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('menuitem', { name: 'Team' })).toBeVisible({ timeout: 3_000 })
    await expect(page.getByRole('menuitem', { name: 'Agents' })).toBeVisible({ timeout: 3_000 })
  })

  test('More dropdown has Sign Out', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForLoadState('networkidle')

    const moreBtn = mobileBottomNav(page).getByRole('button', { name: 'More' })
    await moreBtn.click()
    await page.waitForTimeout(500)

    await expect(page.getByText('Sign Out')).toBeVisible({ timeout: 3_000 })
  })

  test('context indicator shows on mobile', async ({ page }) => {
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Personal Space')).toBeVisible({ timeout: 10_000 })
  })

  test('all person routes load on mobile without error', async ({ page }) => {
    for (const route of ['/home', '/marketplace', '/guild']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
      const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
      expect(hasError, `${route} shows error on mobile`).toBe(false)
    }
  })

  test('all company routes load on mobile without error', async ({ page }) => {
    for (const route of ['/dashboard', '/updates', '/new-tasks', '/team']) {
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
      const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
      expect(hasError, `${route} shows error on mobile`).toBe(false)
    }
  })
})
