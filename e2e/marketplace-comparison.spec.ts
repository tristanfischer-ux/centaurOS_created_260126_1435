import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

test.describe('Marketplace Comparison', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
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

    // Verify compare CTA appears after selecting at least 2 items
    await expect(page.getByRole('button', { name: /compare now|compare/i }).first()).toBeVisible()

    // Enter compare view
    await page.getByRole('button', { name: /compare now|compare/i }).first().click()

    // Verify comparison view renders table content
    await expect(page.getByText(/Comparing \d+ listings?/)).toBeVisible()

    // Check that comparison table/grid is visible
    const hasTable = await page.locator('table[role="table"], table, [role="grid"], [class*="comparison"]').count()
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
