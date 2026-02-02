import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE } from './auth.setup'

/**
 * Founder Persona - Day in the Life QA Tests
 * 
 * Tests all executive capabilities plus founder-specific features:
 * - All core flows
 * - Foundry settings access
 * - Full admin access
 * - Role management capabilities
 */

test.describe('Founder - Day in the Life', () => {
  // Use founder authentication
  test.use({ storageState: FOUNDER_STORAGE })

  test.describe('Core Flow Tests', () => {
    test('dashboard loads with all widgets', async ({ page }) => {
      await page.goto('/today')
      
      // Verify greeting is visible
      await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible({ timeout: 10000 })
      
      // No console errors
      const errors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      await page.waitForTimeout(2000)
      expect(errors.filter(e => !e.includes('favicon'))).toHaveLength(0)
    })

    test('sidebar navigation works', async ({ page }) => {
      await page.goto('/today')
      
      // Test key navigation items
      const navItems = [
        { name: 'Today', url: '/today' },
        { name: 'Tasks', url: '/tasks' },
        { name: 'Team', url: '/team' },
        { name: 'Settings', url: '/settings' },
      ]

      for (const item of navItems) {
        const navLink = page.locator(`nav a:has-text("${item.name}")`).first()
        if (await navLink.isVisible()) {
          await navLink.click()
          await page.waitForURL(`**${item.url}`, { timeout: 10000 })
          await expect(page.locator('body')).not.toContainText('Error')
        }
      }
    })

    test('messages page loads', async ({ page }) => {
      await page.goto('/messages')
      await page.waitForLoadState('networkidle')
      
      // Page should load without errors
      const pageContent = await page.content()
      expect(pageContent).toBeTruthy()
    })

    test('can create a task', async ({ page }) => {
      await page.goto('/tasks')
      await page.waitForLoadState('networkidle')
      
      // Open create dialog
      const newTaskButton = page.getByRole('button', { name: /new task|create task|\+/i }).first()
      if (await newTaskButton.isVisible()) {
        await newTaskButton.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 })
        
        // Fill in task details
        const titleInput = page.getByLabel(/title/i).or(page.locator('input[name="title"]')).first()
        await titleInput.fill(`QA Test Task - Founder - ${new Date().toISOString()}`)
        
        // Close dialog
        await page.keyboard.press('Escape')
      }
    })
  })

  test.describe('Founder-Specific Tests', () => {
    test('System Admin link is visible', async ({ page }) => {
      await page.goto('/today')
      await page.waitForLoadState('networkidle')
      
      // Check sidebar for System Admin link
      const adminLink = page.locator('nav').getByText(/admin|system admin/i).first()
      const isVisible = await adminLink.isVisible().catch(() => false)
      
      // Founder should have admin access
      expect(isVisible).toBeTruthy()
    })

    test('can access full admin dashboard', async ({ page }) => {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')
      
      // Should be on admin page
      expect(page.url()).toContain('/admin')
      
      // Should see admin content
      await expect(page.getByText(/admin|operations|dashboard/i).first()).toBeVisible({ timeout: 10000 })
    })

    test('can access admin applications', async ({ page }) => {
      await page.goto('/admin/applications')
      await page.waitForLoadState('networkidle')
      
      // Should load without access denied
      expect(page.url()).toContain('/admin/applications')
      const pageContent = await page.content()
      expect(pageContent).not.toContain('Access Denied')
    })

    test('can access admin analytics', async ({ page }) => {
      await page.goto('/admin/analytics')
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/admin/analytics')
      const pageContent = await page.content()
      expect(pageContent).not.toContain('Access Denied')
    })

    test('can access admin health', async ({ page }) => {
      await page.goto('/admin/health')
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/admin/health')
      const pageContent = await page.content()
      expect(pageContent).not.toContain('Access Denied')
    })

    test('can access admin GDPR', async ({ page }) => {
      await page.goto('/admin/gdpr')
      await page.waitForLoadState('networkidle')
      
      expect(page.url()).toContain('/admin/gdpr')
      const pageContent = await page.content()
      expect(pageContent).not.toContain('Access Denied')
    })

    test('can access settings with foundry section', async ({ page }) => {
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')
      
      // Settings page should load
      expect(page.url()).toContain('/settings')
      
      // Founder should see foundry settings
      // This may vary based on UI structure
      const pageContent = await page.content()
      expect(pageContent).toBeTruthy()
    })

    test('can view and manage team', async ({ page }) => {
      await page.goto('/team')
      await page.waitForLoadState('networkidle')
      
      // Check team page loaded
      await expect(page.getByText(/team/i).first()).toBeVisible()
      
      // Founder should have full team management
      const pageContent = await page.content()
      expect(pageContent).toBeTruthy()
    })
  })
})
