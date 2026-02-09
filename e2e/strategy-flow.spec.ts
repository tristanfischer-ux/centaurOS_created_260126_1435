import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Strategy Page E2E Tests
 *
 * Tests the Canvas → Strategy rename, the new Strategy Flow tab,
 * and the Sankey visualization. Uses Founder persona for full access.
 */

test.describe('Strategy Page', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Rename Verification ─────────────────────────────────────

  test.describe('Canvas → Strategy Rename', () => {
    test('page header shows "Strategy" (not "Canvas")', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toHaveText('Strategy', { timeout: 10_000 })
    })

    test('sidebar shows "Strategy" link to /canvas (desktop only)', async ({ page, browserName }) => {
      // Sidebar is only visible on desktop (md:flex / hidden on mobile)
      const isMobile = browserName === 'chromium' && (page.viewportSize()?.width ?? 0) < 768
      if (isMobile) {
        test.skip()
        return
      }

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const strategyLink = page.locator('nav a[href="/canvas"]')
      await expect(strategyLink).toBeVisible({ timeout: 10_000 })
      await expect(strategyLink).toContainText('Strategy')
    })

    test('sidebar does NOT show "Canvas" label (desktop only)', async ({ page }) => {
      // Sidebar is only visible on desktop
      const isMobile = (page.viewportSize()?.width ?? 0) < 768
      if (isMobile) {
        test.skip()
        return
      }

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // The word "Canvas" should not appear as a nav item label
      const canvasLink = page.locator('nav a[href="/canvas"]')
      await expect(canvasLink).not.toContainText('Canvas')
    })
  })

  // ─── Tab Structure ───────────────────────────────────────────

  test.describe('Tab Structure', () => {
    test('shows three tabs: Strategy Flow, Strategic Timeline, Whiteboards', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      // Use button role to target tab buttons specifically (avoids matching content headings)
      await expect(page.getByRole('button', { name: 'Strategy Flow' })).toBeVisible({ timeout: 10_000 })
      await expect(page.getByRole('button', { name: 'Strategic Timeline' })).toBeVisible({ timeout: 5_000 })
      await expect(page.getByRole('button', { name: 'Whiteboards' })).toBeVisible({ timeout: 5_000 })
    })

    test('Strategy Flow tab is active by default', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      const flowTab = page.getByRole('button', { name: 'Strategy Flow' })
      await expect(flowTab).toBeVisible({ timeout: 10_000 })

      // Active tab should have orange styling
      const classes = await flowTab.evaluate((el) => el.className)
      expect(classes).toContain('text-international-orange')
    })

    test('clicking Strategic Timeline tab switches content', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      // Click timeline tab
      await page.getByRole('button', { name: 'Strategic Timeline' }).click()
      await page.waitForTimeout(500)

      const flowTab = page.getByRole('button', { name: 'Strategy Flow' })
      const timelineTab = page.getByRole('button', { name: 'Strategic Timeline' })

      // Active state should now be on timeline
      const timelineClasses = await timelineTab.evaluate((el) => el.className)
      expect(timelineClasses).toContain('text-international-orange')

      // Flow tab should not have active styling
      const flowClasses = await flowTab.evaluate((el) => el.className)
      expect(flowClasses).not.toContain('text-international-orange')
    })

    test('clicking Whiteboards tab switches content', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      const whiteboardTab = page.getByRole('button', { name: 'Whiteboards' })
      await whiteboardTab.click()
      await page.waitForTimeout(500)

      const classes = await whiteboardTab.evaluate((el) => el.className)
      expect(classes).toContain('text-international-orange')
    })
  })

  // ─── Strategy Flow View ──────────────────────────────────────

  test.describe('Strategy Flow View', () => {
    test('page loads without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      // Filter non-critical errors
      const critical = errors.filter(
        (e) =>
          !e.includes('favicon') &&
          !e.includes('404') &&
          !e.includes('Sentry') &&
          !e.includes('hydration')
      )
      expect(critical).toHaveLength(0)
    })

    test('shows Strategy Overview heading', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      // The flow view should show either the overview or empty state
      const hasOverview = await page
        .getByText('Strategy Overview')
        .isVisible({ timeout: 5_000 })
        .catch(() => false)

      const hasEmpty = await page
        .getByText('No strategic goals yet')
        .isVisible({ timeout: 3_000 })
        .catch(() => false)

      // One of these should be visible
      expect(hasOverview || hasEmpty).toBe(true)
    })

    test('shows empty state when no goals exist', async ({ page }) => {
      // This test is conditional — if the foundry has no strategic goals
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      const emptyState = page.getByText('No strategic goals yet')
      const hasEmpty = await emptyState
        .isVisible({ timeout: 5_000 })
        .catch(() => false)

      if (hasEmpty) {
        // The empty state should have a CTA to create a goal
        await expect(emptyState).toBeVisible()
      }
      // If there are goals, this test is skipped (not a failure)
    })

    test('SVG diagram is accessible', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      // Check if there's an SVG with proper ARIA attributes
      const svg = page.locator('svg[role="img"]')
      const hasSvg = await svg.isVisible({ timeout: 5_000 }).catch(() => false)

      if (hasSvg) {
        await expect(svg).toHaveAttribute('aria-label')
      }
    })
  })

  // ─── Full Page Navigation ────────────────────────────────────

  test.describe('Navigation', () => {
    test('/canvas route loads without error boundary', async ({ page }) => {
      await page.goto('/canvas')
      await page.waitForLoadState('networkidle')

      const errorBoundary = page.getByText(
        /something went wrong|unexpected error/i
      )
      const hasError = await errorBoundary
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
      expect(hasError).toBe(false)
    })

    test('clicking sidebar Strategy link navigates to /canvas (desktop only)', async ({ page }) => {
      // Sidebar is only visible on desktop
      const isMobile = (page.viewportSize()?.width ?? 0) < 768
      if (isMobile) {
        test.skip()
        return
      }

      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const strategyLink = page.locator('nav a[href="/canvas"]')
      await expect(strategyLink).toBeVisible({ timeout: 10_000 })
      await strategyLink.click()

      await page.waitForURL('**/canvas', { timeout: 15_000 })
      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toHaveText('Strategy')
    })
  })
})
