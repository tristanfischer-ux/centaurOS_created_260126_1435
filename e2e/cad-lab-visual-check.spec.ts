import { test, expect } from '@playwright/test'

test.describe('CAD Lab Visual Check', () => {
  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  test('should display CAD Lab page correctly after login', async ({ page }) => {
    // Step 1: Navigate to CAD Lab (will redirect to login)
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      // Take screenshot of login page
      await page.screenshot({ path: 'test-results/cad-lab-1-login.png', fullPage: true })
      console.log('✓ Screenshot 1: Login page')

      // Step 2: Fill in credentials
      await page.fill('input[type="email"]', founderEmail)
      await page.fill('input[type="password"]', founderPassword)
      await page.screenshot({ path: 'test-results/cad-lab-2-credentials.png', fullPage: true })
      console.log('✓ Screenshot 2: Credentials filled')

      // Step 3: Click login button
      await page.getByRole('button', { name: /enter the forge|access foundry/i }).click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30000 })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      await page.screenshot({ path: 'test-results/cad-lab-3-after-login.png', fullPage: true })
      console.log('✓ Screenshot 3: After login')
    }

    // Step 4: Navigate to CAD Lab if not already there
    if (!page.url().includes('/the-forge/cad-lab')) {
      await page.goto('/the-forge/cad-lab')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
    }

    // Step 5: Take final screenshot
    await page.screenshot({ path: 'test-results/cad-lab-4-final.png', fullPage: true })
    console.log('✓ Screenshot 4: CAD Lab page')

    // Verify hero heading
    await expect(page.getByText('What do you want to build?')).toBeVisible()

    // Verify description paragraph
    await expect(page.getByText('Describe any physical product or sub-assembly')).toBeVisible()

    // Verify Research button (disabled when empty, or Re-Research / Researching if active)
    await expect(page.getByRole('button', { name: /Research|Re-Research|Researching/ })).toBeVisible()

    // Verify input field with correct placeholder
    await expect(page.locator('input[placeholder*="1U CubeSat bus structure"]')).toBeVisible()

    // Verify example chips are visible (only when input is empty and no research)
    await expect(page.getByText('CubeSat frame')).toBeVisible()
    await expect(page.getByText('Drone arm bracket')).toBeVisible()

    console.log('\n=== Page Analysis ===')
    console.log('✓ Hero heading and description present')
    console.log('✓ Research button visible')
    console.log('✓ Input field with placeholder visible')
    console.log('✓ Example prompt chips visible')
  })
})
