import { test, expect } from '@playwright/test'

test.describe('CAD Lab Visual Check', () => {
  test('should display CAD Lab page correctly after login', async ({ page }) => {
    // Step 1: Navigate to CAD Lab (will redirect to login)
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot of login page
    await page.screenshot({ path: 'test-results/cad-lab-1-login.png', fullPage: true })
    console.log('✓ Screenshot 1: Login page')

    // Step 2: Fill in credentials
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[type="password"]', 'DemoFounder2026!')
    await page.screenshot({ path: 'test-results/cad-lab-2-credentials.png', fullPage: true })
    console.log('✓ Screenshot 2: Credentials filled')

    // Step 3: Click login button
    await page.click('button:has-text("ACCESS FOUNDRY")')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000) // Wait for any client-side redirects
    
    await page.screenshot({ path: 'test-results/cad-lab-3-after-login.png', fullPage: true })
    console.log('✓ Screenshot 3: After login')

    // Step 4: Navigate to CAD Lab if not already there
    if (!page.url().includes('/the-forge/cad-lab')) {
      await page.goto('/the-forge/cad-lab')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
    }

    // Step 5: Take final screenshot
    await page.screenshot({ path: 'test-results/cad-lab-4-final.png', fullPage: true })
    console.log('✓ Screenshot 4: CAD Lab page')

    // Verify page elements
    await expect(page.locator('h1')).toContainText('CAD Lab')
    
    // Check for the three workflow steps
    await expect(page.locator('text=Step 1: Research')).toBeVisible()
    await expect(page.locator('text=Step 2: Interface Definition')).toBeVisible()
    await expect(page.locator('text=Step 3: Generate')).toBeVisible()

    // Check for input field
    await expect(page.locator('input[placeholder*="model"]')).toBeVisible()

    // Check for model selector
    await expect(page.locator('select#model')).toBeVisible()

    console.log('\n=== Page Analysis ===')
    console.log('✓ Page title: CAD Lab')
    console.log('✓ All three workflow steps present')
    console.log('✓ Input field visible')
    console.log('✓ Model selector visible')
    console.log('\nNote: View tabs and download buttons appear only after generating a model')
  })
})
