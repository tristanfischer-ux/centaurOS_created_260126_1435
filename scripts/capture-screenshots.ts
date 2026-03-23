/**
 * @file capture-screenshots.ts
 *
 * @description Captures POLISHED marketing screenshots from the live ForgeOS
 * app. Dismisses all tooltips, modals, and onboarding artifacts before
 * capturing. Each page is carefully waited for and cleaned up.
 *
 * Usage: npx tsx scripts/capture-screenshots.ts
 */

import { chromium, type Page } from 'playwright'
import path from 'path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const BASE_URL = process.env.E2E_BASE_URL || 'https://fractionalforge.app'
const EMAIL = process.env.E2E_EMAIL || 'mktg-demo@fractionalforge.app'
const PASSWORD = process.env.E2E_PASSWORD || 'ForgeScreenshots2026!'
const SCREENSHOT_DIR = path.join(__dirname, '..', 'public', 'images', 'screenshots')

/**
 * Dismiss ALL onboarding artifacts: tooltips, checklists, banners, modals.
 * Runs in the browser context.
 */
async function dismissAllOnboarding(page: Page) {
  await page.evaluate(() => {
    // Mark all FeatureTips as seen (localStorage)
    const tipIds = [
      'forge-home', 'today-dashboard', 'marketplace-browse', 'marketplace-saved',
      'investors-browse', 'team-members', 'team-workload', 'team-orbit',
      'strategy-dashboard', 'strategy-river', 'strategy-link',
      'objectives-board', 'tasks-command', 'agents-specialists',
      'guild-events', 'guild-network', 'cash-burn', 'settings',
      'knowledge', 'reports', 'forge-concept', 'forge-build',
      'forge-specify', 'forge-source', 'forge-cad', 'forge-review',
    ]
    tipIds.forEach(id => localStorage.setItem(`forgeos:tip:${id}`, 'true'))

    // Mark onboarding checklist as dismissed
    localStorage.setItem('forgeos_onboarding_completed', 'true')

    // Mark desktop banner as dismissed
    localStorage.setItem('forgeos_desktop_banner_dismissed', new Date().toISOString())
  })

  // Close any visible modals/dialogs by pressing Escape
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Click away any remaining tooltips
  try {
    // Click "Skip" or "Next" on any tour tooltips
    const skipBtns = page.locator('button:has-text("Skip"), button:has-text("Got it"), button:has-text("Dismiss")')
    const count = await skipBtns.count()
    for (let i = 0; i < count; i++) {
      try { await skipBtns.nth(i).click({ timeout: 500 }) } catch { /* */ }
      await page.waitForTimeout(200)
    }
  } catch { /* */ }

  // Dismiss sonner toasts
  try {
    const toasts = page.locator('[data-sonner-toast]')
    const toastCount = await toasts.count()
    for (let i = 0; i < toastCount; i++) {
      try { await toasts.nth(i).click({ timeout: 500 }) } catch { /* */ }
    }
  } catch { /* */ }
}

/**
 * Hide UI elements that clutter screenshots.
 */
async function cleanupUI(page: Page) {
  await page.evaluate(() => {
    // Hide mobile nav, FAB, floating specialist, zoom controls
    const selectors = [
      '[data-testid="mobile-nav"]',
      '[data-testid="mobile-fab"]',
      '.sm\\:hidden', // mobile-only elements
    ]
    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        (el as HTMLElement).style.display = 'none'
      })
    })

    // Hide Getting Started checklist in sidebar
    const checklist = document.querySelector('[data-testid="getting-started-checklist"]')
    if (checklist) (checklist as HTMLElement).style.display = 'none'

    // Also hide by text content match
    document.querySelectorAll('div, section').forEach(el => {
      const text = (el as HTMLElement).innerText
      if (text?.startsWith('Getting Started') && (el as HTMLElement).offsetHeight < 200) {
        (el as HTMLElement).style.display = 'none'
      }
    })

    // Hide any remaining tooltip/popover overlays
    document.querySelectorAll('[role="tooltip"], [data-radix-popper-content-wrapper]').forEach(el => {
      (el as HTMLElement).style.display = 'none'
    })

    // Hide the "Get the most from ForgeOS" onboarding banner
    document.querySelectorAll('div').forEach(el => {
      const text = (el as HTMLElement).innerText
      if (text?.includes('Get the most from ForgeOS') && (el as HTMLElement).offsetHeight < 150) {
        (el as HTMLElement).style.display = 'none'
      }
    })
  })
}

async function main() {
  console.log('Launching browser...')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  // Log in
  console.log(`Logging in as ${EMAIL}...`)
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle')
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  await page.click('button:has-text("Enter the Forge")')

  try {
    await page.waitForURL('**/today**', { timeout: 20000 })
    console.log('Login successful!')
  } catch {
    console.error('Login failed. URL:', page.url())
    await browser.close()
    process.exit(1)
  }

  // Wait for initial page load and dismiss all onboarding
  await page.waitForTimeout(3000)
  await dismissAllOnboarding(page)
  await page.waitForTimeout(1000)

  // ──────────────────────────────────────────────────
  // 1. THE FORGE — Show a project with modules visible
  // The CAD Lab is context-driven (no URL params for project ID).
  // We need to: go to /the-forge → click project card → wait for cad-lab
  // ──────────────────────────────────────────────────
  console.log('Capturing The Forge (CAD Lab with designs)...')
  await page.goto(`${BASE_URL}/the-forge`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)

  // Dismiss "Start a Design" modal and any tooltips
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await dismissAllOnboarding(page)

  // Try to click the first project card to show actual designs
  try {
    const projectCard = page.locator('[data-testid="project-card"], .cursor-pointer').first()
    if (await projectCard.isVisible({ timeout: 3000 })) {
      await projectCard.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(4000)
      await dismissAllOnboarding(page)
    }
  } catch { /* Fall back to the forge home page */ }

  await cleanupUI(page)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'forge-cad-lab.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved forge-cad-lab.png')

  // ──────────────────────────────────────────────────
  // 2. DASHBOARD — /today with content
  // ──────────────────────────────────────────────────
  console.log('Capturing Dashboard...')
  await page.goto(`${BASE_URL}/today`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
  await dismissAllOnboarding(page)
  await cleanupUI(page)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'dashboard-today.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved dashboard-today.png')

  // ──────────────────────────────────────────────────
  // 3. MARKETPLACE
  // ──────────────────────────────────────────────────
  console.log('Capturing Marketplace...')
  await page.goto(`${BASE_URL}/marketplace`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
  await dismissAllOnboarding(page)
  await cleanupUI(page)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'marketplace.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved marketplace.png')

  // ──────────────────────────────────────────────────
  // 4. STRATEGY — river flow of objectives
  // ──────────────────────────────────────────────────
  console.log('Capturing Strategy (objectives river flow)...')
  await page.goto(`${BASE_URL}/strategy`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
  await dismissAllOnboarding(page)

  // Click "River" tab if available
  try {
    const riverTab = page.locator('button:has-text("River"), [role="tab"]:has-text("River")')
    if (await riverTab.isVisible({ timeout: 2000 })) {
      await riverTab.click()
      await page.waitForTimeout(2000)
    }
  } catch { /* */ }

  await cleanupUI(page)
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'strategy-river.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved strategy-river.png')

  // ──────────────────────────────────────────────────
  // 5. INVESTORS
  // ──────────────────────────────────────────────────
  console.log('Capturing Investors...')
  await page.goto(`${BASE_URL}/investors`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(4000)
  await dismissAllOnboarding(page)
  await cleanupUI(page)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'investors.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved investors.png')

  // ──────────────────────────────────────────────────
  // 6. TEAM (orbital view)
  // ──────────────────────────────────────────────────
  console.log('Capturing Team...')
  await page.goto(`${BASE_URL}/team`)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(5000) // Extra time for SVG orbit to render
  await dismissAllOnboarding(page)
  await cleanupUI(page)

  // Click "Orbital" or third view tab if available
  try {
    const orbitalTab = page.locator('button:has-text("Orbital"), [role="tab"]:has-text("Orbital")')
    if (await orbitalTab.isVisible({ timeout: 2000 })) {
      await orbitalTab.click()
      await page.waitForTimeout(2000)
    }
  } catch { /* */ }

  await dismissAllOnboarding(page)
  await cleanupUI(page)

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, 'team-orbit.png'),
    clip: { x: 0, y: 0, width: 1920, height: 1080 },
  })
  console.log('  Saved team-orbit.png')

  await browser.close()
  console.log('\nAll screenshots captured!')
}

main().catch(err => {
  console.error('Failed:', err)
  process.exit(1)
})
