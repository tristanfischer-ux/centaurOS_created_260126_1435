import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Navigation Restructure — 4-Section Sidebar E2E Tests
 *
 * Tests the restructured sidebar with Me / Plan / Workshop / Marketplace sections,
 * section intro pages, The Forge rename (from Product X-Ray), and mobile navigation.
 * Uses Founder persona for full access.
 */

test.describe('Navigation: 4-Section Sidebar', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Sidebar Section Headers ─────────────────────────────────────

  test.describe('Sidebar — Section Headers', () => {
    test('sidebar has all 4 section headers @critical', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      // All section header links should be visible in the nav
      await expect(page.locator('nav a[href="/me"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('nav a[href="/plan"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/workshop"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/marketplace-hub"]')).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── Sidebar Nav Items Per Section ─────────────────────────────────

  test.describe('Sidebar — Nav Items', () => {
    test('"Me" section has My Profile and Updates links', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('nav a[href="/my-profile"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('nav a[href="/updates"]')).toBeVisible({ timeout: 5_000 })
    })

    test('"Plan" section has Strategy, Objectives, Tasks links', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('nav a[href="/canvas"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('nav a[href="/new-objectives"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/new-tasks"]')).toBeVisible({ timeout: 5_000 })
    })

    test('"Workshop" section has The Forge, Team, Agents links', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('nav a[href="/the-forge"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('nav a[href="/team"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/agents"]')).toBeVisible({ timeout: 5_000 })
    })

    test('"Marketplace" section has all 5 links', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      await expect(page.locator('nav a[href="/guild"]')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('nav a[href="/apprenticeship"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/inspiration"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/marketplace"]')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('nav a[href="/marketplace-orders"]')).toBeVisible({ timeout: 5_000 })
    })

    test('Marketplace has "People" and "Supplies" sub-labels', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      const peopleLabel = page.locator('nav').getByText('People', { exact: true })
      await expect(peopleLabel).toBeVisible({ timeout: 10_000 })

      const suppliesLabel = page.locator('nav').getByText('Supplies', { exact: true })
      await expect(suppliesLabel).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── Settings in Footer ──────────────────────────────────────────

  test.describe('Sidebar — Footer', () => {
    test('Settings link is in sidebar footer @critical', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      const settingsLink = page.locator('a[href="/settings"]')
      await expect(settingsLink).toBeVisible({ timeout: 10_000 })
    })
  })

  // ─── Section Intro Pages ─────────────────────────────────────────
  // Scope assertions to `main` or the content area to avoid strict mode
  // violations from the sidebar also containing the same text.

  test.describe('Section Intro Pages', () => {
    // Use feature card links (a[href] h3) to avoid strict mode violations
    // from other h3 elements on the page (onboarding cards, tips, etc.)

    test('/me intro page loads with tagline and feature cards @critical', async ({ page }) => {
      await page.goto('/me')
      await page.waitForLoadState('networkidle')

      // Feature cards: scope to the link wrapper to avoid duplicates
      await expect(page.locator('a[href="/my-profile"] h3')).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/updates"] h3')).toBeVisible({ timeout: 5_000 })
    })

    test('/plan intro page loads with tagline and feature cards @critical', async ({ page }) => {
      await page.goto('/plan')
      await page.waitForLoadState('networkidle')

      // Feature cards scoped by their link href
      await expect(page.locator('a[href="/strategy"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/new-objectives"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/new-tasks"] h3').first()).toBeVisible({ timeout: 5_000 })
    })

    test('/workshop intro page loads with tagline and feature cards @critical', async ({ page }) => {
      await page.goto('/workshop')
      await page.waitForLoadState('networkidle')

      // Feature cards scoped by their link href
      await expect(page.locator('a[href="/the-forge"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/team"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/agents"] h3').first()).toBeVisible({ timeout: 5_000 })
    })

    test('/marketplace-hub intro page loads with tagline and feature cards @critical', async ({ page }) => {
      await page.goto('/marketplace-hub')
      await page.waitForLoadState('networkidle')

      // Feature cards scoped by their link href
      await expect(page.locator('a[href="/recruits"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/marketplace"] h3').first()).toBeVisible({ timeout: 5_000 })
      await expect(page.locator('a[href="/inspiration"] h3').first()).toBeVisible({ timeout: 5_000 })
    })
  })

  // ─── The Forge Rename ────────────────────────────────────────────

  test.describe('The Forge (Product X-Ray Rename)', () => {
    test('/the-forge page loads without error @critical', async ({ page }) => {
      await page.goto('/the-forge')
      await page.waitForLoadState('networkidle')

      // Page should not show error boundary
      const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
      const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
      expect(hasError, '/the-forge shows error boundary').toBe(false)
    })

    test('/product-xray redirects to /the-forge @critical', async ({ page }) => {
      // Navigate and wait for redirects to settle
      await page.goto('/product-xray', { waitUntil: 'networkidle' })

      // Wait for URL to include /the-forge (server redirect may go through auth first)
      await page.waitForURL('**/the-forge**', { timeout: 15_000 })
      expect(page.url()).toContain('/the-forge')
    })

    test('sidebar shows "The Forge" link (not "Product X-Ray")', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      const forgeLink = page.locator('nav a[href="/the-forge"]')
      await expect(forgeLink).toBeVisible({ timeout: 10_000 })
      await expect(forgeLink).toContainText('The Forge')
    })
  })

  // ─── Navigation Active States ────────────────────────────────────

  test.describe('Active States', () => {
    test('sidebar highlights active link on /updates', async ({ page }) => {
      await page.goto('/updates')
      await page.waitForLoadState('networkidle')

      const updatesLink = page.locator('nav a[href="/updates"]')
      await expect(updatesLink).toBeVisible({ timeout: 10_000 })
      const classes = await updatesLink.getAttribute('class')
      expect(classes).toContain('text-international-orange')
    })

    test('section header highlights when on intro page', async ({ page }) => {
      await page.goto('/me')
      await page.waitForLoadState('networkidle')

      const meHeader = page.locator('nav a[href="/me"]')
      await expect(meHeader).toBeVisible({ timeout: 10_000 })
      const classes = await meHeader.getAttribute('class')
      expect(classes).toContain('text-international-orange')
    })
  })

  // ─── All Routes Load Without Error ─────────────────────────────────

  test.describe('Full Route Click-Through', () => {
    test('all sidebar nav destinations load without error @critical', async ({ page }) => {
      const routes = [
        '/my-profile', '/updates',
        '/canvas', '/new-objectives', '/new-tasks',
        '/the-forge', '/team', '/agents',
        '/guild', '/apprenticeship', '/inspiration', '/marketplace', '/marketplace-orders',
        '/me', '/plan', '/workshop', '/marketplace-hub',
      ]

      for (const route of routes) {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
        const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
        expect(hasError, `${route} shows error boundary`).toBe(false)
      }
    })
  })
})
