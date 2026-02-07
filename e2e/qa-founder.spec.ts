import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Founder Persona — Full Day-in-the-Life Video Walkthrough
 *
 * Covers every sidebar route plus founder-only admin pages.
 * Designed to produce a meaningful video recording of the entire app
 * as experienced by a Founder user.
 *
 * The tests are grouped into three sections:
 *   1. Core Work Flow (Home, Updates, Objectives, Tasks, Team, Agents)
 *   2. Discovery Flow (Inspiration, Marketplace, My Orders)
 *   3. Profile, Settings & Admin
 *   4. Permissions verification
 */

test.describe('Founder — Day in the Life', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  // Dismiss all onboarding modals before every test so videos show the real app
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Helpers ────────────────────────────────────────────────
  /** Navigate via sidebar link text and wait for URL. */
  async function navigateViaSidebar(page: any, linkText: string, urlFragment: string): Promise<void> {
    const link = page.locator(`nav a:has-text("${linkText}")`).first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await page.waitForURL(`**${urlFragment}`, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
  }

  // ─── 1. Core Work Flow ─────────────────────────────────────

  test.describe('Core Work Flow', () => {
    test('Home — dashboard loads with greeting and widgets', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Greeting banner should be visible
      await expect(
        page.getByText(/Good (morning|afternoon|evening)/)
      ).toBeVisible({ timeout: 10_000 })
    })

    test('Updates — activity feed loads', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Updates', '/updates')

      // Page should have some content — heading or empty state
      const heading = page.getByRole('heading').first()
      await expect(heading).toBeVisible({ timeout: 10_000 })
    })

    test('Objectives — view list and interact', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Objectives', '/new-objectives')

      // Should see objectives heading or empty state
      await expect(
        page.getByText(/objective/i).first()
      ).toBeVisible({ timeout: 10_000 })

      // If there are objective cards, click the first one to open detail
      const firstCard = page.locator('[data-testid="objective-card"], .cursor-pointer').first()
      if (await firstCard.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await firstCard.click()
        await page.waitForTimeout(1_500)
        // Go back
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    })

    test('Tasks — view list, open create dialog', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Tasks', '/new-tasks')

      await page.waitForLoadState('networkidle')

      // Try to open the create-task dialog
      const newTaskBtn = page.getByRole('button', { name: /new task|create task|\+/i }).first()
      if (await newTaskBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await newTaskBtn.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })

        // Fill title so the video shows real interaction
        const titleInput = page
          .getByLabel(/title/i)
          .or(page.locator('input[name="title"]'))
          .first()
        if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await titleInput.fill(`Founder walkthrough task — ${new Date().toISOString().slice(0, 16)}`)
        }

        // Close without saving
        await page.keyboard.press('Escape')
      }
    })

    test('Team — view members, open invite dialog', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Team', '/team')

      await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10_000 })

      // Try invite member dialog
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

      // Page should load without error
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
      // Should see inspiration content or empty state
      await page.waitForTimeout(1_500)
    })

    test('Marketplace — browse listings', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Marketplace', '/marketplace')

      await page.waitForLoadState('networkidle')

      // Try clicking a listing card for the video
      const listingCard = page.locator('[data-testid="listing-card"], [data-testid="product-card"]').first()
      if (await listingCard.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await listingCard.click()
        await page.waitForTimeout(2_000)
        await page.goBack()
        await page.waitForLoadState('networkidle')
      }
    })

    test('My Orders — view orders', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'My Orders', '/my-orders')

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

  test.describe('Company Admin — Founder Only', () => {
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
})
