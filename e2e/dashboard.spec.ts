import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  // Skip auth-required tests for now - would need auth fixtures
  test.skip('dashboard loads for authenticated user', async ({ page }) => {
    // This would require auth setup
    await page.goto('/dashboard')
    await expect(page.locator('text=Welcome back')).toBeVisible()
  })
})
