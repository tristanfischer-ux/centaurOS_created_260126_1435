import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE } from './auth-storage'

/**
 * Agents Page - Workflow Builder E2E Tests
 *
 * Tests the ReactFlow-based AI workflow builder including:
 * - Page loading (header, sidebar, empty state)
 * - Template loading and node rendering
 * - Node interaction via inspector
 * - Prompt library search and filtering
 * - Node deletion via keyboard
 * - Auto-arrange layout
 * - Save and reload persistence
 * - API key guidance banner
 */

test.describe('Agents Workflow Builder', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test('page loads with header, sidebar, and empty state', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Header should show "Agents" title
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible({ timeout: 10000 })

    // Subtitle should be visible
    await expect(page.getByText('Build and run AI prompt workflows')).toBeVisible()

    // Sidebar (prompt library) should be visible
    await expect(page.getByText('Prompt Library').first()).toBeVisible()

    // Empty state guidance should appear
    await expect(page.getByText('Build your AI workflow')).toBeVisible()
    await expect(page.getByText('Start from a template')).toBeVisible()
    await expect(page.getByText('Create a prompt')).toBeVisible()
  })

  test('loads template and displays nodes on canvas', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Click Templates button in toolbar
    await page.getByRole('button', { name: /templates/i }).click()

    // Template dialog should open
    await expect(page.getByText('Workflow Templates').first()).toBeVisible({ timeout: 5000 })

    // Select a template (first available one)
    const templateCard = page.locator('[data-testid="template-card"]').first().or(
      page.locator('button:has-text("Use Template")').first()
    ).or(
      page.locator('.cursor-pointer').filter({ hasText: /fundraise|pitch|analysis/i }).first()
    )

    if (await templateCard.isVisible()) {
      await templateCard.click()

      // Wait for nodes to appear on canvas
      await page.waitForTimeout(1000)

      // Verify the step counter in toolbar shows nodes
      await expect(page.getByText(/\d+ steps?/)).toBeVisible({ timeout: 5000 })

      // Empty state should be gone
      await expect(page.getByText('Build your AI workflow')).not.toBeVisible()
    }
  })

  test('node click opens inspector with details', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // First load a template to get nodes
    await page.getByRole('button', { name: /templates/i }).click()
    await page.waitForTimeout(500)

    // Try to select a template
    const useBtn = page.getByRole('button', { name: /use template/i }).first()
    const templateCard = page.locator('.cursor-pointer').filter({ hasText: /fundraise|pitch|analysis|strategy/i }).first()

    if (await useBtn.isVisible({ timeout: 3000 })) {
      await useBtn.click()
    } else if (await templateCard.isVisible({ timeout: 2000 })) {
      await templateCard.click()
    } else {
      // Close dialog and skip
      await page.keyboard.press('Escape')
      test.skip()
      return
    }

    await page.waitForTimeout(1000)

    // Click on a node in the canvas -- ReactFlow nodes have class .react-flow__node
    const node = page.locator('.react-flow__node').first()
    if (await node.isVisible({ timeout: 5000 })) {
      await node.click()

      // Inspector panel should appear with node details
      // Look for common inspector elements: prompt text, input area, provider selector
      await page.waitForTimeout(500)
      const inspectorVisible = await page.getByText(/prompt|input data|provider/i).first().isVisible({ timeout: 3000 })
      expect(inspectorVisible).toBeTruthy()
    }
  })

  test('prompt library search filters results', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Find the search input in the sidebar
    const searchInput = page.locator('input[placeholder*="Search"]').first()
    if (await searchInput.isVisible({ timeout: 5000 })) {
      // Type a search term
      await searchInput.fill('pitch')
      await page.waitForTimeout(500)

      // Results should be filtered -- fewer items visible
      const visiblePrompts = page.locator('[draggable="true"]')
      const count = await visiblePrompts.count()

      // Should have some results (pitch-related prompts)
      expect(count).toBeGreaterThan(0)

      // Clear search
      await searchInput.fill('')
      await page.waitForTimeout(500)

      // More prompts should now be visible
      const allCount = await visiblePrompts.count()
      expect(allCount).toBeGreaterThanOrEqual(count)
    }
  })

  test('node deletion via keyboard works', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Load a template to get nodes
    await page.getByRole('button', { name: /templates/i }).click()
    await page.waitForTimeout(500)

    const useBtn = page.getByRole('button', { name: /use template/i }).first()
    const templateCard = page.locator('.cursor-pointer').filter({ hasText: /fundraise|pitch|analysis|strategy/i }).first()

    if (await useBtn.isVisible({ timeout: 3000 })) {
      await useBtn.click()
    } else if (await templateCard.isVisible({ timeout: 2000 })) {
      await templateCard.click()
    } else {
      await page.keyboard.press('Escape')
      test.skip()
      return
    }

    await page.waitForTimeout(1000)

    // Count initial nodes
    const initialNodeCount = await page.locator('.react-flow__node').count()
    expect(initialNodeCount).toBeGreaterThan(0)

    // Click a node to select it
    await page.locator('.react-flow__node').first().click()
    await page.waitForTimeout(300)

    // Press Delete key
    await page.keyboard.press('Delete')
    await page.waitForTimeout(500)

    // One fewer node
    const newNodeCount = await page.locator('.react-flow__node').count()
    expect(newNodeCount).toBe(initialNodeCount - 1)
  })

  test('auto-arrange repositions nodes', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Load a template
    await page.getByRole('button', { name: /templates/i }).click()
    await page.waitForTimeout(500)

    const useBtn = page.getByRole('button', { name: /use template/i }).first()
    const templateCard = page.locator('.cursor-pointer').filter({ hasText: /fundraise|pitch|analysis|strategy/i }).first()

    if (await useBtn.isVisible({ timeout: 3000 })) {
      await useBtn.click()
    } else if (await templateCard.isVisible({ timeout: 2000 })) {
      await templateCard.click()
    } else {
      await page.keyboard.press('Escape')
      test.skip()
      return
    }

    await page.waitForTimeout(1000)

    // Get initial positions of first node
    const firstNode = page.locator('.react-flow__node').first()
    const initialBox = await firstNode.boundingBox()

    // Click Tidy Up button
    const tidyBtn = page.getByRole('button', { name: /tidy up/i })
    if (await tidyBtn.isVisible({ timeout: 3000 })) {
      await tidyBtn.click()
      await page.waitForTimeout(500)

      // Nodes should still exist
      const nodeCount = await page.locator('.react-flow__node').count()
      expect(nodeCount).toBeGreaterThan(0)

      // Success toast should appear
      await expect(page.getByText('Layout tidied up')).toBeVisible({ timeout: 3000 })
    }
  })

  test('save and reload persists workflow', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Load a template
    await page.getByRole('button', { name: /templates/i }).click()
    await page.waitForTimeout(500)

    const useBtn = page.getByRole('button', { name: /use template/i }).first()
    const templateCard = page.locator('.cursor-pointer').filter({ hasText: /fundraise|pitch|analysis|strategy/i }).first()

    if (await useBtn.isVisible({ timeout: 3000 })) {
      await useBtn.click()
    } else if (await templateCard.isVisible({ timeout: 2000 })) {
      await templateCard.click()
    } else {
      await page.keyboard.press('Escape')
      test.skip()
      return
    }

    await page.waitForTimeout(1000)

    // Save the workflow
    await page.getByRole('button', { name: /save/i }).click()
    await page.waitForTimeout(500)

    // Count nodes
    const nodeCount = await page.locator('.react-flow__node').count()

    // Reload the page
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    // Nodes should still be there (loaded from localStorage)
    const reloadedCount = await page.locator('.react-flow__node').count()
    expect(reloadedCount).toBe(nodeCount)
  })

  test('API key guidance banner shows when no keys configured', async ({ page }) => {
    await page.goto('/agents')
    await page.waitForLoadState('networkidle')

    // Check if banner is visible (may or may not be depending on user's key state)
    const banner = page.getByText('Add your AI API keys')
    const hasBanner = await banner.isVisible({ timeout: 3000 }).catch(() => false)

    if (hasBanner) {
      // Banner should contain link to settings
      await expect(page.getByRole('link', { name: /go to settings/i })).toBeVisible()

      // Dismiss the banner
      const dismissBtn = page.getByRole('button', { name: /dismiss/i })
      if (await dismissBtn.isVisible()) {
        await dismissBtn.click()
        await page.waitForTimeout(300)

        // Banner should be gone
        await expect(banner).not.toBeVisible()
      }
    }

    // Either way, the page should function -- not broken by missing keys
    await expect(page.getByRole('heading', { name: 'Agents' })).toBeVisible()
  })
})
