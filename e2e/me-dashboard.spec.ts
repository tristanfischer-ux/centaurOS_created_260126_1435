import { test, expect } from '@playwright/test'

const TEST_URL = process.env.TEST_URL || 'http://localhost:3000'
const EMAIL = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
const PASSWORD = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

test.describe('Me Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto(`${TEST_URL}/login`)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await page.click('button:has-text("Access Foundry")')

    // Wait for auth redirect to complete
    await page.waitForURL(/\/(today|updates|dashboard|me|workspace)/, {
      timeout: 15000,
    })

    // Set onboarding flags to skip any onboarding modals
    await page.evaluate(() => {
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })
  })

  test('renders personal dashboard with all sections', async ({ page }) => {
    // Set onboarding flag BEFORE navigating to /me
    await page.goto(`${TEST_URL}/me`)
    await page.evaluate(() => {
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })
    // Reload to apply localStorage flags before the modal renders
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Dismiss onboarding modal (has 1s delay before it appears)
    await page.waitForTimeout(1500)
    const dialog = page.locator('[role="dialog"]')
    if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
      // Press Escape to close the dialog
      await page.keyboard.press('Escape')
      await expect(dialog).not.toBeVisible({ timeout: 2000 })
    }

    // 1. Greeting section should exist
    const greeting = page.locator('text=/Good (morning|afternoon|evening)/i')
    await expect(greeting).toBeVisible({ timeout: 10000 })
    console.log('✅ Greeting visible')

    // 2. Focus metric cards — use .first() since text may appear in labels + helpers
    await expect(page.locator('text=DUE TODAY').first()).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=OVERDUE').first()).toBeVisible()
    await expect(page.locator('text=UNREAD UPDATES').first()).toBeVisible()
    await expect(page.locator('text=COMPLETED THIS WEEK').first()).toBeVisible()
    console.log('✅ All 4 focus cards visible')

    // 3. My Week section
    await expect(page.locator('text=My Week').first()).toBeVisible()
    console.log('✅ My Week section visible')

    // Scroll down to see remaining sections
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)

    // 4. Objectives card title
    await expect(page.locator('text=Objectives').first()).toBeVisible({ timeout: 5000 })
    console.log('✅ Objectives section visible')

    // 5. Activity card title
    await expect(page.locator('text=Activity').first()).toBeVisible()
    console.log('✅ Activity section visible')

    // 6. Quick actions
    await expect(page.locator('text=Quick actions').first()).toBeVisible()
    console.log('✅ Quick actions visible')

    // 7. No error alert banners on page
    const errorAlert = page.locator('[role="alert"][class*="destructive"]')
    expect(await errorAlert.count()).toBe(0)
    console.log('✅ No error alerts on page')

    // Take above-fold screenshot
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.screenshot({
      path: 'e2e/screenshots/me-dashboard-top.png',
    })

    // Scroll to bottom and take below-fold screenshot
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)
    await page.screenshot({
      path: 'e2e/screenshots/me-dashboard-bottom.png',
    })

    // Full page screenshot
    await page.screenshot({
      path: 'e2e/screenshots/me-dashboard-verified.png',
      fullPage: true,
    })
    console.log('✅ All dashboard sections verified — screenshots saved')
  })
})
