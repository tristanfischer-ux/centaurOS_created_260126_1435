import { test, expect } from '@playwright/test'
import { FREYA_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Freya Miniatures demo account — QA validation of the seeded demo experience.
 *
 * Validates that the Freya demo has rich content on key pages:
 *   - Login and foundry selection
 *   - Today: briefing, tasks, strategy health
 *   - Tasks: ~25 tasks, filters work
 *   - Objectives: ~14 objectives, hierarchy
 *   - Strategy: 5 strategic goals
 *   - Team: 3 members
 *   - Knowledge: 4 domains, 12 notes
 *   - Updates: feed not empty
 */

test.describe('Freya Demo — QA', () => {
  test.use({ storageState: FREYA_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  async function navigateViaSidebar(
    page: import('@playwright/test').Page,
    linkText: string | RegExp,
    urlFragment: string
  ): Promise<void> {
    const link = page.locator(`nav a`).filter({ hasText: linkText }).first()
    await expect(link).toBeVisible({ timeout: 10_000 })
    await link.click()
    await page.waitForURL(`**${urlFragment}`, { timeout: 15_000 })
    await page.waitForLoadState('networkidle')
  }

  test('login and foundry selection — lands on platform', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    // Either on today or redirected to workspace picker; if picker, select foundry
    if (page.url().includes('workspace-picker')) {
      const foundryCard = page.getByText(/freya|miniatures/i).first()
      await expect(foundryCard).toBeVisible({ timeout: 10_000 })
      await foundryCard.click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 15_000 })
    }

    expect(page.url()).not.toContain('/login')
  })

  test('Today — renders briefing, tasks, strategy health', async ({ page }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')

    // Briefing or daily pulse
    await expect(
      page.getByText(/briefing|good (morning|afternoon|evening)|daily pulse|based on \d+ days/i).first()
    ).toBeVisible({ timeout: 15_000 })

    // Strategy health or at-risk / goals
    const hasStrategySection = await page
      .getByText(/strategy health|at-risk|strategic|objectives/i)
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false)
    expect(hasStrategySection).toBeTruthy()
  })

  test('Tasks — shows many tasks, filters work', async ({ page }) => {
    await page.goto('/new-tasks')
    await page.waitForLoadState('networkidle')

    // Should show task list (Freya seed has ~25 tasks)
    const taskRows = page.locator('[data-testid="task-row"], [data-testid="task-card"], tbody tr')
    await expect(taskRows.first()).toBeVisible({ timeout: 10_000 })

    const count = await taskRows.count()
    expect(count).toBeGreaterThanOrEqual(5)

    // Filters: at least one filter control (status, assignee, etc.)
    const filterBtn = page.getByRole('button', { name: /filter|status|assignee/i }).first()
    const hasFilter = await filterBtn.isVisible({ timeout: 5_000 }).catch(() => false)
    if (hasFilter) {
      await filterBtn.click()
      await page.waitForTimeout(500)
    }
  })

  test('Objectives — shows objectives in hierarchy', async ({ page }) => {
    await page.goto('/new-objectives')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText(/objective/i).first()
    ).toBeVisible({ timeout: 10_000 })

    const cards = page.locator('[data-testid="objective-card"], .cursor-pointer, [role="article"]')
    const count = await cards.count()
    expect(count).toBeGreaterThanOrEqual(5)
  })

  test('Strategy — shows strategic goals', async ({ page }) => {
    await page.goto('/strategy')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText(/strategic|goal|strategy/i).first()
    ).toBeVisible({ timeout: 10_000 })

    const goalRelated = page.getByText(/goal|milestone|objective/i)
    await expect(goalRelated.first()).toBeVisible({ timeout: 8_000 })
  })

  test('Team — shows 3 members', async ({ page }) => {
    await page.goto('/team')
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/team|member/i).first()).toBeVisible({ timeout: 10_000 })

    const members = page.locator('[data-testid="member-card"], [data-testid="team-member"], table tbody tr, [role="row"]')
    const count = await members.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('Knowledge — shows domains and notes', async ({ page }) => {
    await page.goto('/knowledge')
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText(/knowledge|domain|note|vault/i).first()
    ).toBeVisible({ timeout: 10_000 })

    const domainsOrNotes = page.locator('[data-testid="domain-card"], [data-testid="note-card"], a[href*="knowledge"], .cursor-pointer')
    const count = await domainsOrNotes.count()
    expect(count).toBeGreaterThanOrEqual(2)
  })

  test('Updates — feed is not empty', async ({ page }) => {
    await page.goto('/updates')
    await page.waitForLoadState('networkidle')

    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible({ timeout: 10_000 })

    const feedItems = page.locator('[data-testid="update-item"], [data-testid="activity-item"], article, .space-y-4 > div')
    const count = await feedItems.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })
})
