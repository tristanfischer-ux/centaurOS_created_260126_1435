/**
 * @file capture-screenshots.ts
 *
 * @description Captures marketing screenshots from the live ForgeOS app
 * using Playwright. Logs in with the demo account, navigates to 5 key
 * pages, and saves 1920x1080 screenshots.
 *
 * Usage: npx tsx scripts/capture-screenshots.ts
 */

import { chromium } from 'playwright'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const BASE_URL = process.env.E2E_BASE_URL || 'https://fractionalforge.app'
const EMAIL = process.env.E2E_EMAIL || 'mktg-demo@fractionalforge.app'
const PASSWORD = process.env.E2E_PASSWORD || 'ForgeScreenshots2026!'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'images', 'screenshots')

const PAGES = [
  { route: '/the-forge', filename: 'forge-cad-lab.png' },
  { route: '/today', filename: 'dashboard-today.png' },
  { route: '/marketplace', filename: 'marketplace.png' },
  { route: '/investors', filename: 'investors.png' },
  { route: '/team', filename: 'team-orbit.png' },
]

async function main() {
  console.log('Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // Retina screenshots
  })
  const page = await context.newPage()

  // Log in
  console.log(`Logging in as ${EMAIL}...`)
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button:has-text("Enter the Forge"), button[type="submit"]')

  try {
    await page.waitForURL('**/today**', { timeout: 20000 })
    console.log('Login successful!')
  } catch {
    console.error('Login failed or redirect timed out. Current URL:', page.url())
    await browser.close()
    process.exit(1)
  }

  // Dismiss any onboarding modals/banners
  await page.waitForTimeout(2000)
  try {
    const skipButton = page.locator('text=Skip tour, text=Skip, button:has-text("Dismiss")')
    if (await skipButton.first().isVisible({ timeout: 2000 })) {
      await skipButton.first().click()
      await page.waitForTimeout(500)
    }
  } catch {
    // No modal to dismiss
  }

  // Capture each page
  for (const { route, filename } of PAGES) {
    console.log(`Capturing ${route}...`)
    await page.goto(`${BASE_URL}${route}`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(3000) // Wait for animations + data loading

    // Dismiss any toasts
    try {
      const toasts = page.locator('[data-sonner-toast]')
      const count = await toasts.count()
      for (let i = 0; i < count; i++) {
        await toasts.nth(i).click({ timeout: 500 }).catch(() => {})
      }
    } catch {
      // No toasts
    }

    // Hide mobile-only elements
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="mobile-nav"], [data-testid="mobile-fab"]').forEach(el => {
        (el as HTMLElement).style.display = 'none'
      })
      // Also hide desktop banner if visible
      document.querySelectorAll('.sm\\:hidden').forEach(el => {
        (el as HTMLElement).style.display = 'none'
      })
    })

    const filepath = path.join(SCREENSHOT_DIR, filename)
    await page.screenshot({
      path: filepath,
      clip: { x: 0, y: 0, width: 1920, height: 1080 },
    })
    console.log(`  Saved: ${filepath}`)
  }

  await browser.close()
  console.log('\nAll screenshots captured!')
}

main().catch(err => {
  console.error('Screenshot capture failed:', err)
  process.exit(1)
})
