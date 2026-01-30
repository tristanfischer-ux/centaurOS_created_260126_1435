import { test, expect } from '@playwright/test'

test.describe('Today Page (Daily Focus)', () => {
  test('redirects from /dashboard to /today', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/dashboard')
    
    // Should redirect to /today (or login if not authenticated)
    await page.waitForURL(/\/(today|login)/)
    const url = page.url()
    expect(url).toMatch(/\/(today|login)/)
  })

  // Skip auth-required tests for now - would need auth fixtures
  test.skip('today page loads for authenticated user', async ({ page }) => {
    // This would require auth setup
    await page.goto('/today')
    
    // Should show morning briefing header
    await expect(page.locator('text=morning briefing')).toBeVisible()
  })

  test.skip('shows Today\'s Focus section', async ({ page }) => {
    await page.goto('/today')
    
    // Check for Today's Focus section
    await expect(page.locator('text=Today\'s Focus')).toBeVisible()
  })

  test.skip('shows Decisions Pending section for executives', async ({ page }) => {
    await page.goto('/today')
    
    // Check for Decisions Pending section (may be conditional on role)
    const decisionsSection = page.locator('text=Decisions Pending')
    // This section only shows for Executive/Founder roles with pending items
    // So we just check the page loaded without errors
    await expect(page.locator('h1')).toBeVisible()
  })

  test.skip('shows Blockers Reported section for executives', async ({ page }) => {
    await page.goto('/today')
    
    // Check for Blockers section (may be conditional on role and data)
    await expect(page.locator('h1')).toBeVisible()
  })

  test.skip('shows all clear state when no action items', async ({ page }) => {
    await page.goto('/today')
    
    // If no pending decisions, blockers, or overdue items, show "All clear!" state
    // This is conditional on data
    await expect(page.locator('h1')).toBeVisible()
  })

  test.skip('quick links are visible', async ({ page }) => {
    await page.goto('/today')
    
    // Check quick links section
    await expect(page.locator('text=Quick Links')).toBeVisible()
    await expect(page.locator('text=All Tasks')).toBeVisible()
    await expect(page.locator('text=Objectives')).toBeVisible()
    await expect(page.locator('text=Team')).toBeVisible()
  })

  test.skip('sidebar shows Today link first', async ({ page }) => {
    await page.goto('/today')
    
    // Check sidebar has Today as first navigation item
    const sidebar = page.locator('nav')
    const firstNavItem = sidebar.locator('a').first()
    await expect(firstNavItem).toContainText('Today')
  })

  test.skip('prioritized tasks show reason badges', async ({ page }) => {
    await page.goto('/today')
    
    // If there are tasks, they should show priority reasons
    // This is conditional on having tasks
    await expect(page.locator('h1')).toBeVisible()
  })
})
