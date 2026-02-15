import { test, expect } from '@playwright/test'

test.describe('Forge navigation route', () => {
  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  test('sidebar Forge link routes to /the-forge', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', founderEmail)
      await page.fill('input[type="password"]', founderPassword)
      await page.getByRole('button', { name: /enter the forge|access foundry/i }).click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30000 })
    }

    const forgeLink = page.getByRole('link', { name: 'The Forge' }).first()
    await expect(forgeLink).toBeVisible()
    await expect(forgeLink).toHaveAttribute('href', '/the-forge')
  })
})
