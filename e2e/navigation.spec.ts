import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/ForgeOS/)
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=Sign in')).toBeVisible()
  })
})
