import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

test.describe('Team Member Comparison', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
    // Assumes test user is already authenticated
    await page.goto('/team')
    await page.waitForLoadState('networkidle')
  })

  test('@critical: can select and compare team members', async ({ page }) => {
    // Wait for team page to load
    await expect(page.getByRole('heading', { name: 'Team' }).first()).toBeVisible()

    // Find and click on compare buttons for at least 2 members
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"], [title*="compare"]')
    const count = await compareButtons.count()
    
    if (count < 2) {
      test.skip(count < 2, 'Not enough team members to compare')
      return
    }

    // Select first two members
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()

    // Verify comparison bar appears
    await expect(page.locator('text=Comparing')).toBeVisible()
    await expect(page.locator('text=2 items')).toBeVisible()

    // Click Compare button
    await page.click('button:has-text("Compare")')

    // Verify comparison modal opens and shows content
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible()
    await expect(page.locator('text=Compare Members')).toBeVisible()
    
    // Verify modal shows actual comparison content (not empty)
    const modalContent = page.locator('dialog, [role="dialog"]')
    await expect(modalContent.locator('text=items')).toBeVisible()
    
    // Should not show error message
    await expect(page.locator('text=Cannot Compare Members')).not.toBeVisible()

    // Check that comparison table is visible
    const hasTable = await page.locator('table, [role="grid"]').count()
    expect(hasTable).toBeGreaterThan(0)

    // Check for member headers/names in the table
    const memberHeaders = await page.locator('th').count()
    expect(memberHeaders).toBeGreaterThan(2) // At least attribute column + 2 members
  })

  test('shows member roles and stats', async ({ page }) => {
    await page.goto('/team')
    
    // Select members
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    if (await compareButtons.count() < 2) {
      test.skip(true, 'Not enough members')
      return
    }

    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await page.click('button:has-text("Compare")')

    // Verify modal content includes typical member attributes
    const modal = page.locator('dialog, [role="dialog"]')
    await expect(modal).toBeVisible()

    // Check for common attributes (some of these should be present)
    const attributes = ['Role', 'Bandwidth', 'Tasks', 'Availability']
    let foundCount = 0
    for (const attr of attributes) {
      if (await modal.locator(`text=${attr}`).count() > 0) {
        foundCount++
      }
    }
    expect(foundCount).toBeGreaterThan(0) // At least one attribute should be present
  })

  test('can remove members from comparison', async ({ page }) => {
    await page.goto('/team')
    
    // Select members
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()

    // Verify 2 items selected
    await expect(page.locator('text=Comparing 2 items')).toBeVisible()

    // Click remove on one member
    const removeButtons = page.locator('[aria-label*="Remove"]')
    if (await removeButtons.count() > 0) {
      await removeButtons.first().click()
      
      // Verify count decreases
      await expect(page.locator('text=Comparing 1 item')).toBeVisible()
    }
  })

  test('can clear all comparison members', async ({ page }) => {
    await page.goto('/team')
    
    // Select members
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
    await page.goto('/team')
    
    // Select and compare members
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await page.click('button:has-text("Compare")')

    // Verify modal is open
    await expect(page.locator('dialog, [role="dialog"]')).toBeVisible()

    // Close modal with ESC key
    await page.keyboard.press('Escape')

    // Verify modal is closed
    await expect(page.locator('dialog, [role="dialog"]')).not.toBeVisible()
  })

  test('AI analysis button is available', async ({ page }) => {
    await page.goto('/team')
    
    // Select members
    const compareButtons = page.locator('[title*="comparison"], [aria-label*="comparison"]')
    if (await compareButtons.count() < 2) {
      test.skip(true, 'Not enough members')
      return
    }

    await compareButtons.nth(0).click()
    await compareButtons.nth(1).click()
    await page.click('button:has-text("Compare")')

    // Verify AI analysis button is present
    const modal = page.locator('dialog, [role="dialog"]')
    await expect(modal).toBeVisible()
    await expect(modal.locator('button:has-text("Analyze with AI")')).toBeVisible()
  })
})
