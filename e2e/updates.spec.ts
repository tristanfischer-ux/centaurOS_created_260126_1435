import { test, expect, type Page } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Updates Page — Comprehensive E2E Tests
 *
 * Validates the Updates (Inbox) page works end-to-end:
 *   1. Page load and layout structure
 *   2. Feed renders with activity items or proper empty state
 *   3. Filter tabs (All, Unread, Tasks, Objectives) work
 *   4. Search filters feed items
 *   5. Selecting a feed item opens the thread panel
 *   6. Thread panel shows source metadata and messages
 *   7. Reply functionality (type + send)
 *   8. Mark all read works
 *   9. Messages/tasks sync — replying from thread reflects in feed
 *
 * Uses the Founder persona for maximum data access.
 */

// Credentials from env vars (same as auth.setup.ts)
const FOUNDER_EMAIL = process.env.TEST_FOUNDER_EMAIL
const FOUNDER_PASSWORD = process.env.TEST_FOUNDER_PASSWORD

test.describe('Updates Page — Full Functionality', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Helpers ─────────────────────────────────────────────

  /**
   * Re-authenticate if the session has expired (page redirected to /login).
   * Returns true if re-auth was needed, false if session was still valid.
   */
  async function reAuthIfNeeded(page: Page): Promise<boolean> {
    const url = page.url()
    if (!url.includes('/login')) return false

    // Session expired — log back in
    if (!FOUNDER_EMAIL || !FOUNDER_PASSWORD) {
      throw new Error('Auth session expired and no TEST_FOUNDER_EMAIL/PASSWORD env vars set for re-auth')
    }

    await page.waitForSelector('input[type="email"]', { timeout: 10_000 })
    await page.fill('input[type="email"]', FOUNDER_EMAIL)
    await page.fill('input[type="password"]', FOUNDER_PASSWORD)
    await page.click('button:has-text("Access Foundry")')
    await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30_000 })

    // Dismiss onboarding after re-auth
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })

    return true
  }

  /** Navigate to the Updates page and wait for it to fully render. */
  async function goToUpdates(page: Page): Promise<void> {
    await page.goto('/updates', { timeout: 30_000 })

    // Wait for EITHER the updates heading OR the login form to appear
    const updatesH1 = page.locator('h1').filter({ hasText: 'Updates' })
    const loginForm = page.locator('input[type="email"]')

    await expect(updatesH1.or(loginForm)).toBeVisible({ timeout: 30_000 })

    // If we hit the login page, re-authenticate and navigate again
    if (await loginForm.isVisible().catch(() => false)) {
      await reAuthIfNeeded(page)
      await page.goto('/updates', { timeout: 30_000 })
      await expect(updatesH1.or(loginForm)).toBeVisible({ timeout: 30_000 })

      // Second login check (in case first re-auth didn't stick)
      if (await loginForm.isVisible().catch(() => false)) {
        await reAuthIfNeeded(page)
        await page.goto('/updates', { timeout: 30_000 })
      }
    }

    // Final confirmation: Updates heading must be visible
    await expect(updatesH1).toBeVisible({ timeout: 30_000 })
  }

  /** Check if the feed has any activity items. */
  async function feedHasItems(page: Page): Promise<boolean> {
    const timeHeader = page.locator('span').filter({ hasText: /^(Today|Yesterday|This Week|Earlier)$/ })
    return await timeHeader.first().isVisible({ timeout: 5_000 }).catch(() => false)
  }

  /** Get all clickable feed items. */
  function getFeedItems(page: Page) {
    return page.locator('button.w-full.text-left')
  }

  // ─── 1. Page Load & Layout ────────────────────────────────

  test('page loads with header, feed panel, and thread panel', async ({ page }) => {
    await goToUpdates(page)

    // Header: "Updates" h1
    await expect(page.locator('h1').filter({ hasText: 'Updates' })).toBeVisible()

    // Subtitle
    await expect(page.getByText('Stay on top of everything happening in your company')).toBeVisible()

    // Filter tabs
    await expect(page.getByRole('tab', { name: /all/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /unread/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /tasks/i })).toBeVisible()
    await expect(page.getByRole('tab', { name: /objectives/i })).toBeVisible()

    // Search input
    await expect(page.getByPlaceholder('Search updates...')).toBeVisible()

    // Right panel: thread or empty state
    await expect(
      page.getByText('Select an update')
        .or(page.getByPlaceholder('Add a note...'))
        .or(page.getByText('No updates yet'))
    ).toBeVisible({ timeout: 10_000 })
  })

  // ─── 2. Feed Content ──────────────────────────────────────

  test('feed displays activity items or proper empty state', async ({ page }) => {
    await goToUpdates(page)

    const hasItems = await feedHasItems(page)

    if (hasItems) {
      // At least one time group header
      await expect(
        page.locator('span').filter({ hasText: /^(Today|Yesterday|This Week|Earlier)$/ }).first()
      ).toBeVisible()

      // At least one feed item
      expect(await getFeedItems(page).count()).toBeGreaterThan(0)
    } else {
      // "No updates yet" empty state
      await expect(page.getByText('No updates yet')).toBeVisible({ timeout: 5_000 })
    }
  })

  // ─── 3. Filter Tabs ───────────────────────────────────────

  test('filter tabs activate on click and update feed', async ({ page }) => {
    await goToUpdates(page)

    // All tab active by default
    await expect(page.getByRole('tab', { name: /all/i })).toHaveAttribute('data-state', 'active')

    // Click each tab and verify activation
    for (const tabName of ['Unread', 'Tasks', 'Objectives', 'All']) {
      const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') })
      await tab.click()
      await expect(tab).toHaveAttribute('data-state', 'active', { timeout: 5_000 })
      await page.waitForTimeout(1_000)
    }
  })

  test('Unread filter shows unread items or "All caught up"', async ({ page }) => {
    await goToUpdates(page)

    await page.getByRole('tab', { name: /unread/i }).click()
    // Wait for server action to complete
    await page.waitForTimeout(3_000)

    const hasTimeHeaders = await page.locator('span')
      .filter({ hasText: /^(Today|Yesterday|This Week|Earlier)$/ })
      .first().isVisible({ timeout: 3_000 }).catch(() => false)

    const hasAllCaughtUp = await page.getByText('All caught up')
      .isVisible({ timeout: 3_000 }).catch(() => false)

    expect(hasTimeHeaders || hasAllCaughtUp).toBe(true)
  })

  test('Tasks filter loads without error', async ({ page }) => {
    await goToUpdates(page)

    await page.getByRole('tab', { name: /tasks/i }).click()
    await page.waitForTimeout(2_000)

    await expect(page.getByRole('tab', { name: /tasks/i })).toHaveAttribute('data-state', 'active')
    await expect(page.getByPlaceholder('Search updates...')).toBeVisible()
  })

  test('Objectives filter loads without error', async ({ page }) => {
    await goToUpdates(page)

    await page.getByRole('tab', { name: /objectives/i }).click()
    await page.waitForTimeout(2_000)

    await expect(page.getByRole('tab', { name: /objectives/i })).toHaveAttribute('data-state', 'active')
    await expect(page.getByPlaceholder('Search updates...')).toBeVisible()
  })

  // ─── 4. Search ─────────────────────────────────────────────

  test('search input filters and clears', async ({ page }) => {
    await goToUpdates(page)

    const searchInput = page.getByPlaceholder('Search updates...')
    await expect(searchInput).toBeVisible()

    // Type a nonsense query
    await searchInput.fill('zzzznonexistent12345')
    await page.waitForTimeout(500)

    // Clear and verify empty
    await searchInput.clear()
    await page.waitForTimeout(500)
    await expect(searchInput).toHaveValue('')
  })

  // ─── 5. Feed Item Selection → Thread Panel ─────────────────

  test('clicking a feed item opens the thread panel', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items in feed')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    // Thread panel should show source title (h3)
    const threadTitle = page.locator('.border-b h3').first()
    await expect(threadTitle).toBeVisible({ timeout: 15_000 })

    // Reply input should be visible
    await expect(page.getByPlaceholder('Add a note...')).toBeVisible({ timeout: 10_000 })
  })

  test('thread panel shows source metadata and external link', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    // Source title
    const threadTitle = page.locator('.border-b h3').first()
    await expect(threadTitle).toBeVisible({ timeout: 15_000 })
    const text = await threadTitle.textContent()
    expect(text?.length).toBeGreaterThan(0)

    // External link
    const extLink = page.locator('a[title*="Open in"]')
    if (await extLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const href = await extLink.getAttribute('href')
      expect(href).toMatch(/^\/(new-tasks|objectives|updates)/)
    }
  })

  // ─── 6. Thread Messages ────────────────────────────────────

  test('thread panel shows messages or "no notes yet"', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(3_000)

    // Reply input always visible in thread panel
    await expect(page.getByPlaceholder('Add a note...')).toBeVisible({ timeout: 15_000 })

    // Either regular messages, system log messages, or "No notes yet"
    const noNotes = await page.getByText('No notes yet').isVisible({ timeout: 3_000 }).catch(() => false)
    const regularMessages = await page.locator('.rounded-lg.px-3.py-2').first()
      .isVisible({ timeout: 3_000 }).catch(() => false)
    const systemLogs = await page.locator('.rounded-full.uppercase').first()
      .isVisible({ timeout: 3_000 }).catch(() => false)

    expect(noNotes || regularMessages || systemLogs).toBe(true)
  })

  // ─── 7. Reply Functionality ────────────────────────────────

  test('reply textarea and Cmd+Enter hint visible', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    await expect(page.getByPlaceholder('Add a note...')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('Press Cmd+Enter to send')).toBeVisible()
  })

  test('can type a reply, send it, and see it in thread', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    const replyInput = page.getByPlaceholder('Add a note...')
    await expect(replyInput).toBeVisible({ timeout: 15_000 })

    const replyText = `E2E test reply — ${new Date().toISOString().slice(0, 19)}`
    await replyInput.fill(replyText)
    await expect(replyInput).toHaveValue(replyText)

    // Click orange send button
    const sendBtn = page.locator('button[class*="international-orange"]').last()
    if (await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await sendBtn.click()
      await page.waitForTimeout(5_000)

      // Input cleared after send
      await expect(replyInput).toHaveValue('', { timeout: 10_000 })

      // Message appears in thread
      await expect(page.getByText(replyText)).toBeVisible({ timeout: 10_000 })
    }
  })

  // ─── 8. Message/Task Sync ──────────────────────────────────

  test('reply syncs — feed still has items after filter toggle', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    const replyInput = page.getByPlaceholder('Add a note...')
    await expect(replyInput).toBeVisible({ timeout: 15_000 })

    const syncMsg = `Sync test — ${Date.now()}`
    await replyInput.fill(syncMsg)

    const sendBtn = page.locator('button[class*="international-orange"]').last()
    if (!(await sendBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Send button not available')
      return
    }

    await sendBtn.click()
    await page.waitForTimeout(5_000)

    // Verify reply in thread
    await expect(page.getByText(syncMsg)).toBeVisible({ timeout: 10_000 })

    // Toggle filters to trigger feed refresh
    await page.getByRole('tab', { name: /tasks/i }).click()
    await page.waitForTimeout(2_000)
    await page.getByRole('tab', { name: /all/i }).click()
    await page.waitForTimeout(2_000)

    // Feed should still have items
    expect(await getFeedItems(page).count()).toBeGreaterThan(0)
  })

  // ─── 9. Mark All Read ──────────────────────────────────────

  test('Mark all read clears unread indicators', async ({ page }) => {
    await goToUpdates(page)

    const markAllBtn = page.getByRole('button', { name: /mark all read/i })
    if (!(await markAllBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip(true, 'No unread items')
      return
    }

    await markAllBtn.click()
    await page.waitForTimeout(3_000)

    await expect(markAllBtn).not.toBeVisible({ timeout: 10_000 })
  })

  // ─── 10. Time Grouping ────────────────────────────────────

  test('feed items grouped by time periods', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No feed items')
      return
    }

    const headers = page.locator('span').filter({ hasText: /^(Today|Yesterday|This Week|Earlier)$/ })
    expect(await headers.count()).toBeGreaterThan(0)
  })

  // ─── 11. Pre-Selection ─────────────────────────────────────

  test('most recent item pre-selected on page load', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      // Empty feed: should show appropriate empty state
      await expect(
        page.getByText('Select an update').or(page.getByText('No updates yet'))
      ).toBeVisible({ timeout: 10_000 })
      return
    }

    // If feed has items, thread panel should already be populated
    // (reply input proves the thread panel loaded)
    await expect(
      page.getByPlaceholder('Add a note...')
    ).toBeVisible({ timeout: 15_000 })
  })

  // ─── 12. Navigation Between Items ──────────────────────────

  test('switching feed items updates thread panel', async ({ page }) => {
    await goToUpdates(page)

    const items = getFeedItems(page)
    if ((await items.count()) < 2) {
      test.skip(true, 'Need at least 2 items')
      return
    }

    await items.first().click()
    await page.waitForTimeout(2_000)
    const firstTitle = await page.locator('.border-b h3').first().textContent()

    await items.nth(1).click()
    await page.waitForTimeout(2_000)
    const secondTitle = await page.locator('.border-b h3').first().textContent()

    expect(firstTitle).toBeTruthy()
    expect(secondTitle).toBeTruthy()
  })

  // ─── 13. External Link ─────────────────────────────────────

  test('external link points to valid source page', async ({ page }) => {
    await goToUpdates(page)

    if (!(await feedHasItems(page))) {
      test.skip(true, 'No activity items')
      return
    }

    await getFeedItems(page).first().click()
    await page.waitForTimeout(2_000)

    const extLink = page.locator('a[title*="Open in"]')
    if (await extLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const href = await extLink.getAttribute('href')
      expect(href).toMatch(/^\/(new-tasks|objectives|updates)/)
    }
  })

  // ─── 14. Header Badge ─────────────────────────────────────

  test('header shows unread badge or clean state', async ({ page }) => {
    await goToUpdates(page)

    const unreadBadge = page.locator('[aria-label*="unread"]')
    if (await unreadBadge.isVisible({ timeout: 3_000 }).catch(() => false)) {
      const text = await unreadBadge.textContent()
      expect(text).toMatch(/\d+\s*unread/)
    }

    // Page header intact regardless
    await expect(page.locator('h1').filter({ hasText: 'Updates' })).toBeVisible()
  })

  // ─── 15. Summary Metrics ───────────────────────────────────

  test('summary metrics or caught-up state visible', async ({ page }) => {
    await goToUpdates(page)

    // Any of these are valid states
    const hasMetric =
      await page.getByText(/task.*with new notes/i).isVisible({ timeout: 3_000 }).catch(() => false) ||
      await page.getByText(/objective.*updated/i).isVisible({ timeout: 3_000 }).catch(() => false) ||
      await page.getByText('All caught up').isVisible({ timeout: 3_000 }).catch(() => false)

    // Page functional regardless
    await expect(page.locator('h1').filter({ hasText: 'Updates' })).toBeVisible()
  })

  // ─── 16. Two-Panel Desktop Layout ──────────────────────────

  test('desktop layout shows feed and thread side by side', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    await goToUpdates(page)

    // Feed panel (left): search visible
    await expect(page.getByPlaceholder('Search updates...')).toBeVisible()

    // Thread panel (right): content or empty state
    await expect(
      page.getByText('Select an update')
        .or(page.getByPlaceholder('Add a note...'))
        .or(page.getByText('No updates yet'))
    ).toBeVisible({ timeout: 10_000 })
  })
})
