import { test, expect } from '@playwright/test'
import { APPRENTICE_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Apprentice Persona — Full Day-in-the-Life Video Walkthrough
 *
 * Covers every route an Apprentice can access, plus negative tests
 * verifying they CANNOT access admin or approval features.
 *
 * Sections:
 *   1. Core Work Flow (Home, Updates, Objectives, Tasks, Team, Agents)
 *   2. Discovery Flow (Inspiration, Marketplace, Marketplace Orders)
 *   3. Profile & Settings
 *   4. Apprentice-specific pages (Apprenticeship, Guild, OTJT)
 *   5. Permission restrictions (no admin, no approvals)
 */

test.describe('Apprentice — Day in the Life', () => {
  test.use({ storageState: APPRENTICE_STORAGE })

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

    test('Objectives — view list', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Objectives', '/new-objectives')

      await expect(
        page.getByText(/objective/i).first()
      ).toBeVisible({ timeout: 10_000 })
    })

    test('Tasks — view list, create own task', async ({ page }) => {
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
          await titleInput.fill(`Apprentice walkthrough task — ${new Date().toISOString().slice(0, 16)}`)
        }

        await page.keyboard.press('Escape')
      }
    })

    test('Team — view members (read-only)', async ({ page }) => {
      await page.goto('/dashboard')
      await navigateViaSidebar(page, 'Team', '/team')

      await expect(page.getByText(/team/i).first()).toBeVisible({ timeout: 10_000 })
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

  // ─── 3. Profile & Settings ─────────────────────────────────

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

  // ─── 4. Apprentice-Specific Pages ──────────────────────────

  test.describe('Apprentice-Specific Pages', () => {
    test('Apprenticeship — view enrollment/progress', async ({ page }) => {
      await page.goto('/apprenticeship')
      await page.waitForLoadState('networkidle')

      // Should load — may show enrollment or "not enrolled" state
      await page.waitForTimeout(1_500)
    })

    test('Guild — view learning content', async ({ page }) => {
      await page.goto('/guild')
      await page.waitForLoadState('networkidle')

      expect(page.url()).toContain('/guild')
      await page.waitForTimeout(1_500)
    })

    test('OTJT logging UI accessible if enrolled', async ({ page }) => {
      await page.goto('/apprenticeship')
      await page.waitForLoadState('networkidle')

      // Look for OTJT logging button (only visible if enrolled)
      const otjtBtn = page.getByRole('button', { name: /log.*otjt|log.*hours/i })
      const isVisible = await otjtBtn.isVisible({ timeout: 3_000 }).catch(() => false)

      if (isVisible) {
        await otjtBtn.click()
        await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 })
        await page.keyboard.press('Escape')
      }
    })

    test('Messages — page loads', async ({ page }) => {
      await page.goto('/messages')
      await page.waitForLoadState('networkidle')

      await page.waitForTimeout(1_500)
    })
  })

  // ─── 5. Permission Restrictions ────────────────────────────

  test.describe('Permission Restrictions', () => {
    test('Company Admin link is NOT visible in sidebar', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const adminLink = page.locator('nav').getByText(/company admin/i)
      const isVisible = await adminLink.isVisible({ timeout: 3_000 }).catch(() => false)

      // Apprentice should NOT see Company Admin link
      expect(isVisible).toBeFalsy()
    })

    test('/admin redirects or shows access denied', async ({ page }) => {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')

      const url = page.url()
      const content = await page.content()

      // Should either redirect away from /admin or show access denied
      const isBlocked =
        !url.includes('/admin') ||
        content.includes('Access Denied') ||
        content.includes('permission') ||
        content.includes('Unauthorized')

      expect(isBlocked).toBeTruthy()
    })

    test('Task approval button is not visible', async ({ page }) => {
      await page.goto('/new-tasks')
      await page.waitForLoadState('networkidle')

      // Apprentice should NOT see an approve button
      const approveBtn = page.getByRole('button', { name: /^approve$/i })
      const isVisible = await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false)

      expect(isVisible).toBeFalsy()
    })
  })
})
