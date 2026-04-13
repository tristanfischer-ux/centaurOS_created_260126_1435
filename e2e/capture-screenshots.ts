/**
 * @file capture-screenshots.ts
 *
 * @description Playwright script to auto-capture marketing screenshots from
 * the live ForgeOS app. Logs in, navigates to 5 key pages, and saves
 * 1920x1080 screenshots to public/images/screenshots/.
 *
 * Usage: npx playwright test e2e/capture-screenshots.ts
 *
 * Requires: E2E_EMAIL and E2E_PASSWORD environment variables set.
 * These should be credentials for a test account that has demo data.
 */

import { test } from '@playwright/test'
import path from 'path'

const BASE_URL = process.env.E2E_BASE_URL || 'https://fractionalforge.app'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'images', 'screenshots')

const PAGES = [
  { route: '/the-forge', filename: 'forge-cad-lab.png', waitFor: '[data-testid="forge-project-list"], h1' },
  { route: '/today', filename: 'dashboard-today.png', waitFor: 'h1, [data-testid="today-view"]' },
  { route: '/marketplace', filename: 'marketplace.png', waitFor: '[data-testid="marketplace-grid"], h1' },
  { route: '/investors', filename: 'investors.png', waitFor: '[data-testid="investor-browser"], h1' },
  { route: '/team', filename: 'team-orbit.png', waitFor: '[data-testid="team-page"], h1' },
]

test.describe('Marketing screenshot capture', () => {
  test.beforeEach(async ({ page }) => {
    // Set viewport to desktop HD
    await page.setViewportSize({ width: 1920, height: 1080 })

    // Log in
    const email = process.env.E2E_EMAIL
    const password = process.env.E2E_PASSWORD
    if (!email || !password) {
      throw new Error('E2E_EMAIL and E2E_PASSWORD must be set')
    }

    await page.goto(`${BASE_URL}/login`)
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', password)
    await page.click('button[type="submit"], button:has-text("Enter the Forge")')
    await page.waitForURL('**/today**', { timeout: 15000 })
  })

  for (const { route, filename, waitFor } of PAGES) {
    test(`Capture ${route}`, async ({ page }) => {
      await page.goto(`${BASE_URL}${route}`)

      // Wait for page content to load
      try {
        await page.waitForSelector(waitFor, { timeout: 10000 })
      } catch {
        // Page may not have the exact selector — wait for network idle instead
        await page.waitForLoadState('networkidle')
      }

      // Extra wait for animations to settle
      await page.waitForTimeout(2000)

      // Dismiss any toast notifications
      const toasts = page.locator('[data-sonner-toast]')
      const toastCount = await toasts.count()
      for (let i = 0; i < toastCount; i++) {
        try {
          await toasts.nth(i).click({ timeout: 1000 })
        } catch {
          // Toast may have auto-dismissed
        }
      }

      // Hide mobile nav and floating elements for clean screenshot
      await page.evaluate(() => {
        document.querySelectorAll('[data-testid="mobile-nav"], [data-testid="mobile-fab"]').forEach(el => {
          (el as HTMLElement).style.display = 'none'
        })
      })

      // Capture screenshot
      await page.screenshot({
        path: path.join(SCREENSHOT_DIR, filename),
        clip: { x: 0, y: 0, width: 1920, height: 1080 },
      })
    })
  }
})
