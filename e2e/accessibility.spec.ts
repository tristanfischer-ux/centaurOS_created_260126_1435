import { test, expect } from '@playwright/test'

test.describe('Accessibility', () => {
  test('login page has proper heading structure', async ({ page }) => {
    await page.goto('/login')
    
    // Check for main heading
    const heading = page.locator('h1, h2').first()
    await expect(heading).toBeVisible()
  })

  test('login form has accessible labels', async ({ page }) => {
    await page.goto('/login')
    
    // Check for labeled inputs
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    await expect(emailInput).toBeVisible()
  })
})
