import { test, expect } from '@playwright/test'

test.describe('Forge entrypoint routing', () => {
  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  test('shows Design-to-RFQ lab as recommended path', async ({ page }) => {
    await page.goto('/the-forge')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', founderEmail)
      await page.fill('input[type="password"]', founderPassword)
      await page.getByRole('button', { name: /enter the forge|access foundry/i }).click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30000 })
      await page.goto('/the-forge')
      await page.waitForLoadState('networkidle')
    }

    await expect(page.getByRole('heading', { name: 'Design-to-RFQ Lab' })).toBeVisible()
    await expect(page.getByText('Recommended path')).toBeVisible()
    await expect(
      page.getByRole('link', { name: /Open Design-to-RFQ Lab/i }),
    ).toBeVisible()
  })
})
