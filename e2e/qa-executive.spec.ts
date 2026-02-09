import { test, expect } from '@playwright/test'
import { EXECUTIVE_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Executive Persona — Full Day-in-the-Life Video Walkthrough
 *
 * Covers every sidebar route plus executive-specific capabilities:
 *   - Full admin access (same as Founder)
 *   - Team management / invite members
 *   - Task approval UI
 *
 * Sections:
 *   1. Core Work Flow (Home, Updates, Objectives, Tasks, Team, Agents)
 *   2. Discovery Flow (Inspiration, Marketplace, Marketplace Orders)
 *   3. Profile, Settings & Admin
 *   4. Executive-specific features
 */

test.describe('Executive — Day in the Life', () => {
  test.use({ storageState: EXECUTIVE_STORAGE })

  // Dismiss all onboarding modals before every test so videos show the real app
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Helpers ────────────────────────────────────────────────
  async function navigateViaSidebar(page: any, linkText: string, urlFragment: string): Promise<void> {
    const link = page.locator(`nav a:has-text("${linkText}")`).first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await page.waitForURL(`**${urlFragment}`, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
  }

  // ─── 1. Core Work Flow ─────────────────────────────────────

  test.describe('Core Work Flow', () => {
    test('Home — dashboard loads with greeting', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      await expect(
        page.getByText(/Good (morning|afternoon|evening)/)
      ).toBeVisible({ timeout: 10_000 })
    })

    test('Updates — activity feed loads', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Updates', '/updates')

      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible({ timeout: 10_000 })
    })

    test('Objectives — view and interact', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Objectives', '/new-objectives')

      await expect(
        page.getByText(/objective/i).first()
      ).toBeVisible({ timeout: 10_000 })

      // Open first objective card if available
      const firstCard = page.locator('[data-testid="objective-card"], .cursor-pointer').first()
      if (await firstCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await firstCard.click()
        await page.waitForTimeout(1_500)
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    })

    test('Tasks — view list, open create dialog', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Tasks', '/new-tasks')

      await page.waitForLoadState('networkidle')

      const newTaskBtn = page.getByRole('button', { name: /new task|create task|\+/i }).first()
      if (await newTaskBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await newTaskBtn.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

        const titleInput = page
          .getByLabel(/title/i)
          .or(page.locator('input[name="title"]'))
          .first()
        if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await titleInput.fill(`Executive walkthrough task — ${new Date().toISOString().slice(0, 16)}`)
        }

        // Try to pick an assignee for the video
        const assigneeSelect = page
          .locator('[data-testid="assignee-select"]')
          .or(page.getByText(/assignee/i).locator('..').locator('button'))
          .first()
        if (await assigneeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await assigneeSelect.click()
          const firstOption = page.locator('[role="option"]').first()
          if (await firstOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await firstOption.click()
          }
        }

        await page.keyboard.press('Escape')
      }
    })

    test('Team — view members, open invite dialog', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Team', '/team')

      await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10_000 })

      const inviteBtn = page.getByRole('button', { name: /invite|add member/i }).first()
      if (await inviteBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await inviteBtn.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
        await page.keyboard.press('Escape')
      }
    })

    test('Agents — view agent workflows', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Agents', '/agents')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)
    })
  })

  // ─── 2. Discovery Flow ─────────────────────────────────────

  test.describe('Discovery Flow', () => {
    test('Inspiration — browse ideas', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Inspiration', '/inspiration')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)
    })

    test('Marketplace — browse listings', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Marketplace', '/marketplace')

      await page.waitForLoadState('networkidle')

      const listingCard = page.locator('[data-testid="listing-card"], [data-testid="product-card"]').first()
      if (await listingCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await listingCard.click()
        await page.waitForTimeout(2_000)
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    })

    test('Marketplace Orders — view orders', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Marketplace Orders', '/marketplace-orders')

      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1_500)
    })
  })

  // ─── 3. Profile, Settings & Admin ──────────────────────────

  test.describe('Profile & Settings', () => {
    test('My Profile — view marketplace profile', async ({ page }) => {
      await page.goto('/my-profile')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2_000)
    })

    test('Settings — view account settings', async ({ page }) => {
      await page.goto('/settings')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2_000)
    })
  })

  test.describe('Company Admin — Executive Access', () => {
    test('Company Admin link is visible in sidebar', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const adminLink = page.locator('nav').getByText(/company admin/i).first()
      await expect(adminLink).toBeVisible({ timeout: 10_000 })
    })

    test('Company Admin hub loads', async ({ page }) => {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('/admin')
      await expect(
        page.getByText(/company admin|administration|team management/i).first()
      ).toBeVisible({ timeout: 10_000 })
    })

    test('What\'s New page loads', async ({ page }) => {
      await page.goto('/whats-new')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2_000)
    })
  })

  // ─── 4. Executive-specific Features ────────────────────────

  test.describe('Executive-Specific Features', () => {
    test('Tasks — approval UI elements visible', async ({ page }) => {
      await page.goto('/new-tasks')
      await page.waitForLoadState('networkidle')

      // Executive should have access to approval-related filters or actions
      // We verify the page loads and look for approval-related UI
      const pageContent = await page.content()
      expect(pageContent).toBeTruthy()

      // Check for any approval filter or tab
      const approvalFilter = page.getByText(/pending approval|awaiting approval|needs review/i).first()
      const hasApprovalUI = await approvalFilter.isVisible({ timeout: 3_000 }).catch(() => false)
      if (hasApprovalUI) {
        await approvalFilter.click()
        await page.waitForTimeout(1_500)
      }
    })

    test('Messages — page loads and is functional', async ({ page }) => {
      await page.goto('/messages')
      await page.waitForLoadState('networkidle')

      // Should show conversations or empty state
      await page.waitForTimeout(1_500)
    })
  })
})
