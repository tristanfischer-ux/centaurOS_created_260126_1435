import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('home page loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/CentaurOS/)
  })

  test('login page is accessible', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('text=Sign in')).toBeVisible()
  })
})
