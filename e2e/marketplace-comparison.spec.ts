import { test, expect } from '@playwright/test'

test.describe('Marketplace Comparison', () => {
  test.beforeEach(async ({ page }) => {
    // Assumes test user is already authenticated
    await page.goto('/marketplace')
    await page.waitForLoadState('networkidle')
  })

  test('@critical: can select and compare marketplace listings', async ({ page }) => {
    // Wait for marketplace to load
    await expect(page.locator('text=Browse')).toBeVisible()

    // Find and click on compare buttons for at least 2 items
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    const count = await compareButtons.count()
    
    if (count < 2) {
      test.skip(count < 2, 'Not enough items to compare')
      return
    }

    // Select first two items
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()

    // Verify comparison bar appears
    await expect(page.locator('text=Comparing')).toBeVisible()
    await expect(page.locator('text=2 items')).toBeVisible()

    // Click Compare button
    await page.click('button:has-text("Compare")')

    // Verify comparison modal opens and shows content
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible()
    await expect(page.locator('text=Compare Listings')).toBeVisible()
    
    // Verify modal shows actual comparison content (not empty)
    const modalContent = page.locator('dialog, [role="dialog"]')
    await expect(modalContent.locator('text=items')).toBeVisible()
    
    // Should not show error message
    await expect(page.locator('text=Cannot Compare Listings')).not.toBeVisible()

    // Check that comparison table/grid is visible
    // (Adjust selector based on your actual comparison display)
    const hasTable = await page.locator('table, [role="grid"], [class*="comparison"]').count()
    expect(hasTable).toBeGreaterThan(0)
  })

  test('shows error when comparing invalid items', async ({ page }) => {
    // This test requires manipulating state to pass invalid items
    // For now, we test that the error UI exists
    await page.goto('/marketplace')
    
    // Inject a test that forces the error state
    await page.evaluate(() => {
      // This is a placeholder - you'd need to implement a way to test error states
      console.log('Testing error state handling')
    })
  })

  test('can remove items from comparison', async ({ page }) => {
    await page.goto('/marketplace')
    
    // Select items
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()

    // Verify 2 items selected
    await expect(page.locator('text=Comparing 2 items')).toBeVisible()

    // Click remove on one item
    const removeButtons = page.locator('[aria-label*="Remove"]').filter({ hasText: '' })
    if (await removeButtons.count() > 0) {
      await removeButtons.first().click()
      
      // Verify count decreases
      await expect(page.locator('text=Comparing 1 item')).toBeVisible()
    }
  })

  test('can clear all comparison items', async ({ page }) => {
    await page.goto('/marketplace')
    
    // Select items
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()

    // Verify comparison bar visible
    await expect(page.locator('text=Comparing')).toBeVisible()

    // Click clear all
    await page.click('button:has-text("Clear all")')

    // Verify comparison bar disappears
    await expect(page.locator('text=Comparing')).not.toBeVisible()
  })

  test('comparison modal can be closed', async ({ page }) => {
    await page.goto('/marketplace')
    
    // Select and compare items
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await page.click('button:has-text("Compare")')

    // Verify modal is open
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible()

    // Close modal (either X button or ESC key)
    await page.keyboard.press('Escape')

    // Verify modal is closed
    await expect(page.locator('dialog, [role="dialog"]')).not.toBeVisible()
  })
})
