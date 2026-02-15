import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

test.describe('Forge navigation route', () => {
  test.describe.configure({ mode: 'serial' })

  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  async function loginIfNeeded(page: Page) {
    await page.addInitScript(() => {
      window.localStorage.setItem('forgeos_onboarding_completed', 'true')
      window.localStorage.setItem('forgeos_intent_selected', 'team_builder')
    })

    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', founderEmail)
      await page.fill('input[type="password"]', founderPassword)
      await page.getByRole('button', { name: /enter the forge|access foundry/i }).click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30000 })
    }
  }

  test('Forge discovery links route to /the-forge entrypoint', async ({ page }) => {
    await loginIfNeeded(page)

    const forgeLink = page.getByRole('link', { name: 'The Forge' }).first()
    await expect(forgeLink).toBeVisible()
    await expect(forgeLink).toHaveAttribute('href', '/the-forge')
    await forgeLink.click()
    await page.waitForURL('**/the-forge', { timeout: 15000 })
    await expect(page).toHaveURL(/\/the-forge$/)

    await page.goto('/plan')
    await page.waitForLoadState('networkidle')
    const planForgeSpotlightLink = page.getByRole('link', {
      name: /Design physical products\? Try The Forge/i,
    })
    await expect(planForgeSpotlightLink).toHaveAttribute('href', '/the-forge')
    await planForgeSpotlightLink.click()
    await page.waitForURL('**/the-forge', { timeout: 15000 })
    await expect(page).toHaveURL(/\/the-forge$/)

    await page.goto('/workshop')
    await page.waitForLoadState('networkidle')
    const workshopForgeSpotlightLink = page.getByRole('link', {
      name: /Design physical products\? Try The Forge/i,
    })
    await expect(workshopForgeSpotlightLink).toHaveAttribute('href', '/the-forge')
    await workshopForgeSpotlightLink.click()
    await page.waitForURL('**/the-forge', { timeout: 15000 })
    await expect(page).toHaveURL(/\/the-forge$/)
  })

  test('mobile More menu routes Forge to /the-forge', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await loginIfNeeded(page)

    const moreButton = page.getByRole('button', { name: /^More$/i })
    await expect(moreButton).toBeVisible()
    await moreButton.click()

    const forgeMenuItem = page.getByRole('menuitem', { name: /^The Forge$/i })
    await expect(forgeMenuItem).toBeVisible()
    await forgeMenuItem.click()

    await page.waitForURL('**/the-forge', { timeout: 15000 })
    await expect(page).toHaveURL(/\/the-forge$/)
  })
})
