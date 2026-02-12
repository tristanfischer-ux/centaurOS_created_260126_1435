/**
 * @file smoke.spec.ts
 *
 * @description Page render smoke tests for ForgeOS platform pages.
 * Navigates to each route specified in the SMOKE_ROUTES env var and
 * verifies that the page loads without errors.
 *
 * This test is intentionally lightweight -- it checks that pages render,
 * not that they function correctly. For functional testing, use the
 * dedicated spec files per feature.
 *
 * @example
 *   # Test specific routes
 *   SMOKE_ROUTES="/new-tasks,/canvas,/team" npx playwright test e2e/smoke.spec.ts --project=smoke
 *
 *   # Used by the verify script (routes auto-detected from git diff)
 *   npm run verify
 */

import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE } from './auth-storage'
import { dismissOnboarding } from './auth-storage'

/** Maximum time to wait for a page to finish loading */
const PAGE_LOAD_TIMEOUT = 15_000

/** Routes that don't require authentication */
const PUBLIC_ROUTES = new Set(['/login', '/signup', '/'])

/**
 * Parses the SMOKE_ROUTES env var into an array of route strings.
 *
 * @returns Array of route paths like ["/new-tasks", "/canvas"]
 */
function getRoutesToTest(): string[] {
  const raw = process.env.SMOKE_ROUTES
  if (!raw || raw.trim().length === 0) {
    console.warn('[SmokeTest] No SMOKE_ROUTES env var set, skipping')
    return []
  }

  return raw
    .split(',')
    .map((r) => r.trim())
    .filter((r) => r.length > 0 && r.startsWith('/'))
}

const routes = getRoutesToTest()

test.describe('Page Smoke Tests', () => {
  // Use founder auth for all platform pages
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    // Dismiss onboarding modals before each test
    await dismissOnboarding(page)
  })

  if (routes.length === 0) {
    test('no routes to test', () => {
      test.skip(true, 'SMOKE_ROUTES env var not set or empty')
    })
  }

  for (const route of routes) {
    test(`page renders: ${route}`, async ({ page }) => {
      const consoleErrors: string[] = []

      // Collect console errors during page load
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          const text = msg.text()
          // Ignore known noisy console errors that don't indicate page breakage
          if (
            text.includes('favicon.ico') ||
            text.includes('hydration') ||
            text.includes('ResizeObserver')
          ) {
            return
          }
          consoleErrors.push(text)
        }
      })

      // Collect uncaught page errors
      const pageErrors: string[] = []
      page.on('pageerror', (error) => {
        pageErrors.push(error.message)
      })

      // Navigate to the route
      const response = await page.goto(route, {
        waitUntil: 'domcontentloaded',
        timeout: PAGE_LOAD_TIMEOUT,
      })

      // Check 1: HTTP response is not a server error
      const status = response?.status() ?? 0
      expect(
        status,
        `Expected HTTP 2xx/3xx for ${route}, got ${status}`
      ).toBeLessThan(500)

      // Check 2: Page is not completely blank
      // Wait for at least one meaningful element to appear
      // (not just the html/body shell)
      await expect(page.locator('body')).not.toBeEmpty({ timeout: PAGE_LOAD_TIMEOUT })

      // Check 3: No "Unhandled Runtime Error" overlay (Next.js error boundary)
      const errorOverlay = page.locator('text=Unhandled Runtime Error')
      const hasErrorOverlay = await errorOverlay.isVisible({ timeout: 2000 }).catch(() => false)
      expect(
        hasErrorOverlay,
        `Page ${route} shows "Unhandled Runtime Error" overlay`
      ).toBe(false)

      // Check 4: No "Application error" (Next.js production error page)
      const appError = page.locator('text=Application error: a client-side exception has occurred')
      const hasAppError = await appError.isVisible({ timeout: 1000 }).catch(() => false)
      expect(
        hasAppError,
        `Page ${route} shows "Application error" page`
      ).toBe(false)

      // Check 5: No uncaught page errors
      expect(
        pageErrors,
        `Page ${route} had uncaught errors: ${pageErrors.join('; ')}`
      ).toHaveLength(0)

      // Check 6: Log console errors as warnings (don't fail, but report)
      if (consoleErrors.length > 0) {
        console.warn(
          `[SmokeTest] ${route} had ${consoleErrors.length} console error(s):\n` +
            consoleErrors.map((e) => `  - ${e.slice(0, 200)}`).join('\n')
        )
      }
    })
  }
})
