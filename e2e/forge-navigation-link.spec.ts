import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

test.describe('Forge navigation route', () => {
  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  async function loginIfNeeded(page: Page) {
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

    await page.goto('/plan')
    await page.waitForLoadState('networkidle')
    const planForgeSpotlightLink = page.getByRole('link', {
      name: /Design physical products\? Try The Forge/i,
    })
    await expect(planForgeSpotlightLink).toHaveAttribute('href', '/the-forge')

    await page.goto('/workshop')
    await page.waitForLoadState('networkidle')
    const workshopForgeSpotlightLink = page.getByRole('link', {
      name: /Design physical products\? Try The Forge/i,
    })
    await expect(workshopForgeSpotlightLink).toHaveAttribute('href', '/the-forge')
  })
})
