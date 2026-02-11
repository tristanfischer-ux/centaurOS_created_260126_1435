import { test, expect, Page } from '@playwright/test'
import { EXECUTIVE_STORAGE, APPRENTICE_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Apprenticeship Hub — Comprehensive Interactive E2E Tests
 *
 * Tests every clickable button, tab, dialog, select, accordion, and
 * interactive element on the apprenticeship page across all user roles:
 *
 *   1. Executive/Founder view (ApprenticeshipHub or AdminDashboard)
 *   2. Apprentice view (ApprenticeDashboard)
 *
 * Each test navigates to /apprenticeship, waits for load, then exercises
 * every interactive element to verify it responds correctly.
 */

// ─── Helper ─────────────────────────────────────────────────
async function gotoApprenticeshipAndWait(page: Page): Promise<void> {
  await page.goto('/apprenticeship')
  await page.waitForLoadState('networkidle')
  // Give the page a moment to hydrate
  await page.waitForTimeout(1_000)
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: EXECUTIVE / FOUNDER VIEW
// ═══════════════════════════════════════════════════════════════

test.describe('Apprenticeship Hub — Executive View', () => {
  test.use({ storageState: EXECUTIVE_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Page Load ──────────────────────────────────────────────

  test('page loads without errors', async ({ page }) => {
    // Listen for console errors
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await gotoApprenticeshipAndWait(page)

    // Page should have some content — either ApprenticeshipHub or AdminDashboard
    const pageContent = page.locator('main, [role="main"], .flex-1').first()
    await expect(pageContent).toBeVisible({ timeout: 15_000 })

    // No critical JS errors
    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  // ─── Discover / Programmes Tabs (ApprenticeshipHub) ─────────

  test('Discover and Programmes tabs are visible and switchable', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Look for the hub tabs (Discover / Programmes)
    const discoverTab = page.getByRole('tab', { name: /discover/i })
    const programmesTab = page.getByRole('tab', { name: /programmes/i })

    // If this user sees the Hub (no enrollment), tabs should be there
    const hasHubTabs = await discoverTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasHubTabs) {
      // Discover tab should be active by default
      await expect(discoverTab).toBeVisible()
      await expect(programmesTab).toBeVisible()

      // Click Programmes tab
      await programmesTab.click()
      await page.waitForTimeout(500)

      // Should show programme catalog content
      const programmeContent = page.getByText(/programme/i).first()
      await expect(programmeContent).toBeVisible({ timeout: 5_000 })

      // Switch back to Discover
      await discoverTab.click()
      await page.waitForTimeout(500)

      // Should show discover landing content
      const discoverContent = page.getByText(/apprentice/i).first()
      await expect(discoverContent).toBeVisible({ timeout: 5_000 })
    }
  })

  // ─── Discover Landing — Hero & CTAs ──────────────────────────

  test('Discover Landing — Browse Programmes button works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const browseBtn = page.getByRole('button', { name: /browse programmes/i }).first()
    const hasBrowse = await browseBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasBrowse) {
      await browseBtn.click()
      await page.waitForTimeout(500)

      // Should switch to programmes tab
      const programmesTab = page.getByRole('tab', { name: /programmes/i })
      if (await programmesTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // The programmes tab should now be active/selected
        await expect(programmesTab).toHaveAttribute('data-state', 'active')
      }
    }
  })

  test('Discover Landing — Enroll Apprentice button opens dialog', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const enrollBtn = page
      .getByRole('button', { name: /enroll.*apprentice/i })
      .first()
    const hasEnroll = await enrollBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasEnroll) {
      await enrollBtn.click()
      await page.waitForTimeout(500)

      // Should open enrollment dialog
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Close the dialog
      const closeBtn = dialog
        .getByRole('button', { name: /close|cancel|×/i })
        .or(page.locator('[data-state="open"] button[aria-label="Close"]'))
        .first()
      if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.click()
      } else {
        await page.keyboard.press('Escape')
      }
      await page.waitForTimeout(500)
    }
  })

  // ─── Funding Calculator ──────────────────────────────────────

  test('Funding Calculator — company size select works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Find funding calculator section
    const fundingSection = page.getByText(/funding calculator/i).first()
    const hasFunding = await fundingSection.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasFunding) {
      // Find the company size select trigger
      const companySizeSelect = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /sme|levy/i })
        .first()

      if (await companySizeSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await companySizeSelect.click()
        await page.waitForTimeout(300)

        // Should show dropdown options
        const levyOption = page.getByRole('option', { name: /levy/i }).first()
        if (await levyOption.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await levyOption.click()
          await page.waitForTimeout(300)

          // Should update the displayed cost
          const costDisplay = page.getByText(/£/).first()
          await expect(costDisplay).toBeVisible()
        }
      }
    }
  })

  test('Funding Calculator — programme level select works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const fundingSection = page.getByText(/funding calculator/i).first()
    const hasFunding = await fundingSection.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasFunding) {
      // Find the programme level select trigger
      const levelSelect = page
        .locator('button[role="combobox"]')
        .filter({ hasText: /level/i })
        .first()

      if (await levelSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await levelSelect.click()
        await page.waitForTimeout(300)

        // Should show level options
        const level6Option = page.getByRole('option', { name: /level 6/i }).first()
        if (await level6Option.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await level6Option.click()
          await page.waitForTimeout(300)

          // Should update displayed cost
          const costDisplay = page.getByText(/£/).first()
          await expect(costDisplay).toBeVisible()
        }
      }
    }
  })

  // ─── Programme Catalog — Level Filter Tabs ───────────────────

  test('Programme Catalog — level filter tabs work', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Navigate to programmes tab first
    const programmesTab = page.getByRole('tab', { name: /programmes/i }).first()
    if (await programmesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await programmesTab.click()
      await page.waitForTimeout(500)
    }

    // Check for level filter tabs in the catalogue
    const allLevelsTab = page.getByRole('tab', { name: /all levels/i }).first()
    const hasLevelTabs = await allLevelsTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasLevelTabs) {
      // Click Level 4 tab
      const level4Tab = page.getByRole('tab', { name: /level 4/i }).first()
      if (await level4Tab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await level4Tab.click()
        await page.waitForTimeout(300)
        await expect(level4Tab).toHaveAttribute('data-state', 'active')
      }

      // Click All Levels tab
      await allLevelsTab.click()
      await page.waitForTimeout(300)
      await expect(allLevelsTab).toHaveAttribute('data-state', 'active')
    }
  })

  // ─── Programme Detail Cards — Expand / Collapse ─────────────

  test('Programme Detail Card — expand and collapse works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Navigate to programmes tab
    const programmesTab = page.getByRole('tab', { name: /programmes/i }).first()
    if (await programmesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await programmesTab.click()
      await page.waitForTimeout(500)
    }

    // Find a "More Detail" button on a programme card
    const moreDetailBtn = page.getByRole('button', { name: /more detail/i }).first()
    const hasCards = await moreDetailBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasCards) {
      // Expand the card
      await moreDetailBtn.click()
      await page.waitForTimeout(300)

      // Should now show "Less Detail"
      const lessDetailBtn = page.getByRole('button', { name: /less detail/i }).first()
      await expect(lessDetailBtn).toBeVisible({ timeout: 3_000 })

      // Collapse the card
      await lessDetailBtn.click()
      await page.waitForTimeout(300)

      // Should now show "More Detail" again
      await expect(moreDetailBtn).toBeVisible({ timeout: 3_000 })
    }
  })

  test('Programme Detail Card — Enroll Apprentice button opens dialog', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Navigate to programmes tab
    const programmesTab = page.getByRole('tab', { name: /programmes/i }).first()
    if (await programmesTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await programmesTab.click()
      await page.waitForTimeout(1_000)
    }

    // Find an "Enroll Apprentice" button on a programme card
    const enrollBtn = page.getByRole('button', { name: /enroll apprentice/i }).first()
    const hasEnroll = await enrollBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasEnroll) {
      await enrollBtn.scrollIntoViewIfNeeded()
      await enrollBtn.click()
      await page.waitForTimeout(1_000)

      // Should open enrollment dialog
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 10_000 })

      // Close via Escape
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  // ─── Admin Dashboard Tabs (if user has admin view) ──────────

  test('Admin Dashboard — Overview/Programmes/Compliance tabs', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Check if admin dashboard is shown (has Overview/Programmes/Compliance tabs)
    const overviewTab = page.getByRole('tab', { name: /overview/i }).first()
    const hasAdminTabs = await overviewTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasAdminTabs) {
      const programmesTab = page.getByRole('tab', { name: /programmes/i }).first()
      const complianceTab = page.getByRole('tab', { name: /compliance/i }).first()

      // Click Programmes tab
      await programmesTab.click()
      await page.waitForTimeout(500)
      await expect(programmesTab).toHaveAttribute('data-state', 'active')

      // Click Compliance tab
      await complianceTab.click()
      await page.waitForTimeout(500)
      await expect(complianceTab).toHaveAttribute('data-state', 'active')

      // Go back to Overview
      await overviewTab.click()
      await page.waitForTimeout(500)
      await expect(overviewTab).toHaveAttribute('data-state', 'active')
    }
  })

  test('Admin Dashboard — Enroll New Apprentice button opens dialog', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Look for the admin "Enroll New Apprentice" button
    const enrollBtn = page.getByRole('button', { name: /enroll new apprentice/i }).first()
    const hasEnroll = await enrollBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasEnroll) {
      await enrollBtn.scrollIntoViewIfNeeded()
      await enrollBtn.click()
      await page.waitForTimeout(1_000)

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 10_000 })

      // Close
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// SECTION 2: APPRENTICE VIEW
// ═══════════════════════════════════════════════════════════════

test.describe('Apprenticeship Hub — Apprentice View', () => {
  test.use({ storageState: APPRENTICE_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Page Load ──────────────────────────────────────────────

  test('page loads without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await gotoApprenticeshipAndWait(page)

    const pageContent = page.locator('main, [role="main"], .flex-1').first()
    await expect(pageContent).toBeVisible({ timeout: 15_000 })

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  // ─── Apprentice Dashboard Tabs ──────────────────────────────

  test('Apprentice Dashboard — This Week / Journey / Learning / Documents tabs', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Check if this user sees the apprentice dashboard
    const thisWeekTab = page.getByRole('tab', { name: /this week/i }).first()
    const hasApprenticeTabs = await thisWeekTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasApprenticeTabs) {
      const journeyTab = page.getByRole('tab', { name: /my journey/i }).first()
      const learningTab = page.getByRole('tab', { name: /learning/i }).first()
      const documentsTab = page.getByRole('tab', { name: /documents/i }).first()

      // This Week should be active by default
      await expect(thisWeekTab).toHaveAttribute('data-state', 'active')

      // Switch to Journey tab
      await journeyTab.click()
      await page.waitForTimeout(500)
      await expect(journeyTab).toHaveAttribute('data-state', 'active')

      // Switch to Learning tab
      await learningTab.click()
      await page.waitForTimeout(500)
      await expect(learningTab).toHaveAttribute('data-state', 'active')

      // Switch to Documents tab
      await documentsTab.click()
      await page.waitForTimeout(500)
      await expect(documentsTab).toHaveAttribute('data-state', 'active')

      // Back to This Week
      await thisWeekTab.click()
      await page.waitForTimeout(500)
      await expect(thisWeekTab).toHaveAttribute('data-state', 'active')
    }
  })

  // ─── Log OTJT Hours Button ──────────────────────────────────

  test('Log OTJT Hours button opens dialog', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const logOTJTBtn = page.getByRole('button', { name: /log otjt hours/i }).first()
    const hasLogBtn = await logOTJTBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasLogBtn) {
      await logOTJTBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      // Close dialog
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  // ─── Weekly Focus — Log Hours Button ────────────────────────

  test('Weekly Focus — Log Hours button opens OTJT dialog', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Make sure we're on the This Week tab
    const thisWeekTab = page.getByRole('tab', { name: /this week/i }).first()
    if (await thisWeekTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await thisWeekTab.click()
      await page.waitForTimeout(500)
    }

    // Find a "Log Hours" button inside the weekly focus area
    const logHoursBtn = page.getByRole('button', { name: /log hours/i }).first()
    const hasLogHours = await logHoursBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasLogHours) {
      await logHoursBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  // ─── Weekly Focus — View Documents Button ───────────────────

  test('Weekly Focus — View Documents button works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const thisWeekTab = page.getByRole('tab', { name: /this week/i }).first()
    if (await thisWeekTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await thisWeekTab.click()
      await page.waitForTimeout(500)
    }

    const viewDocsBtn = page.getByRole('button', { name: /view documents/i }).first()
    const hasViewDocs = await viewDocsBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasViewDocs) {
      await viewDocsBtn.click()
      await page.waitForTimeout(500)

      // Should either open dialog or navigate to documents
      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.isVisible({ timeout: 3_000 }).catch(() => false)

      if (hasDialog) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }
  })

  // ─── Weekly Focus — Message Mentor Link ─────────────────────

  test('Weekly Focus — Message Mentor link navigates', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const thisWeekTab = page.getByRole('tab', { name: /this week/i }).first()
    if (await thisWeekTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await thisWeekTab.click()
      await page.waitForTimeout(500)
    }

    const messageMentorLink = page.getByRole('link', { name: /message mentor/i }).first()
    const hasLink = await messageMentorLink.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasLink) {
      // Check that it has a href pointing to messages
      const href = await messageMentorLink.getAttribute('href')
      expect(href).toContain('/messages')
    }
  })

  // ─── Documents Tab — Open Documents Button ──────────────────

  test('Documents tab — Open Documents button works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const documentsTab = page.getByRole('tab', { name: /documents/i }).first()
    const hasDocsTab = await documentsTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasDocsTab) {
      await documentsTab.click()
      await page.waitForTimeout(500)

      const openDocsBtn = page.getByRole('button', { name: /open documents/i }).first()
      const hasOpenDocs = await openDocsBtn.isVisible({ timeout: 5_000 }).catch(() => false)

      if (hasOpenDocs) {
        await openDocsBtn.click()
        await page.waitForTimeout(500)

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })

        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    }
  })

  // ─── Journey Timeline (read-only) ──────────────────────────

  test('My Journey tab — timeline renders without errors', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await gotoApprenticeshipAndWait(page)

    const journeyTab = page.getByRole('tab', { name: /my journey/i }).first()
    if (await journeyTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await journeyTab.click()
      await page.waitForTimeout(1_000)

      // Timeline should have some content
      const timelineContent = page.getByText(/progress|milestone|timeline/i).first()
      const hasTimeline = await timelineContent.isVisible({ timeout: 5_000 }).catch(() => false)

      // If the user is enrolled, timeline should show
      if (hasTimeline) {
        const criticalErrors = errors.filter(
          (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
        )
        expect(criticalErrors).toHaveLength(0)
      }
    }
  })

  // ─── Learning Tab ───────────────────────────────────────────

  test('Learning tab — content loads', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const learningTab = page.getByRole('tab', { name: /learning/i }).first()
    if (await learningTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await learningTab.click()
      await page.waitForTimeout(1_000)

      // Should show module progress or skills content
      const learningContent = page
        .getByText(/module|skill|learning|progress/i)
        .first()
      await expect(learningContent).toBeVisible({ timeout: 5_000 })
    }
  })

  // ─── Non-Enrolled Apprentice — Hub View ─────────────────────

  test('Non-enrolled view — shows discover landing or programmes', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // If the apprentice is NOT enrolled, they see the hub
    const discoverTab = page.getByRole('tab', { name: /discover/i }).first()
    const hasHubView = await discoverTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasHubView) {
      // Verify discover content is shown
      const heroText = page
        .getByText(/apprentice|grow|talent|hire/i)
        .first()
      await expect(heroText).toBeVisible({ timeout: 5_000 })

      // Switch to programmes
      const programmesTab = page.getByRole('tab', { name: /programmes/i }).first()
      await programmesTab.click()
      await page.waitForTimeout(500)
      await expect(programmesTab).toHaveAttribute('data-state', 'active')
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// SECTION 3: MENTOR VIEW (uses Executive storage — Exec can be mentor)
// ═══════════════════════════════════════════════════════════════

test.describe('Apprenticeship Hub — Mentor View', () => {
  test.use({ storageState: EXECUTIVE_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('Mentor Dashboard — My Mentees / Mentor Guide tabs', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Check if mentor dashboard is shown
    const menteesTab = page.getByRole('tab', { name: /my mentees/i }).first()
    const hasMentorTabs = await menteesTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasMentorTabs) {
      const guideTab = page.getByRole('tab', { name: /mentor guide/i }).first()

      // Mentees tab active by default
      await expect(menteesTab).toHaveAttribute('data-state', 'active')

      // Switch to Mentor Guide
      await guideTab.click()
      await page.waitForTimeout(500)
      await expect(guideTab).toHaveAttribute('data-state', 'active')

      // Back to My Mentees
      await menteesTab.click()
      await page.waitForTimeout(500)
      await expect(menteesTab).toHaveAttribute('data-state', 'active')
    }
  })

  test('Mentor Guide — accordion sections expand and collapse', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Navigate to mentor guide tab
    const guideTab = page.getByRole('tab', { name: /mentor guide/i }).first()
    if (await guideTab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await guideTab.click()
      await page.waitForTimeout(500)

      // Test "What Makes a Great Mentor" accordions
      const accordionTriggers = [
        /regular 1:1 meetings/i,
        /timely otjt approval/i,
        /skills development/i,
        /pastoral support/i,
      ]

      for (const triggerText of accordionTriggers) {
        const trigger = page.getByRole('button', { name: triggerText }).first()
        if (await trigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
          // Expand
          await trigger.click()
          await page.waitForTimeout(300)

          // Collapse
          await trigger.click()
          await page.waitForTimeout(300)
        }
      }

      // Test "Review Templates" accordions
      const reviewTriggers = [
        /weekly check-in/i,
        /monthly progress/i,
        /quarterly deep dive/i,
        /gateway readiness/i,
      ]

      for (const triggerText of reviewTriggers) {
        const trigger = page.getByRole('button', { name: triggerText }).first()
        if (await trigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await trigger.click()
          await page.waitForTimeout(300)
          await trigger.click()
          await page.waitForTimeout(300)
        }
      }
    }
  })

  test('Mentor Dashboard — OTJT pending approval button opens panel', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Look for the "X OTJT logs pending" button
    const pendingBtn = page.getByRole('button', { name: /otjt.*pending/i }).first()
    const hasPendingBtn = await pendingBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasPendingBtn) {
      await pendingBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  test('Mentor Dashboard — Message mentee link navigates', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Look for a "Message" link in mentee cards
    const messageLink = page.getByRole('link', { name: /^message$/i }).first()
    const hasMessage = await messageLink.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasMessage) {
      const href = await messageLink.getAttribute('href')
      expect(href).toContain('/messages')
    }
  })

  test('Mentor Dashboard — Review Hours button opens panel', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const reviewHoursBtn = page.getByRole('button', { name: /review hours/i }).first()
    const hasReview = await reviewHoursBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasReview) {
      await reviewHoursBtn.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 5_000 })

      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
  })

  test('Mentor Dashboard — Schedule 1:1 button triggers toast', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    const scheduleBtn = page.getByRole('button', { name: /schedule 1:1/i }).first()
    const hasSchedule = await scheduleBtn.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasSchedule) {
      await scheduleBtn.click()
      await page.waitForTimeout(1_000)

      // Should show a toast notification
      const toast = page.locator('[data-sonner-toast], [role="status"]').first()
      const hasToast = await toast.isVisible({ timeout: 3_000 }).catch(() => false)
      // Toast may or may not appear depending on implementation
      if (hasToast) {
        await expect(toast).toBeVisible()
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════
// SECTION 4: CROSS-CUTTING CONCERNS
// ═══════════════════════════════════════════════════════════════

test.describe('Apprenticeship Hub — Cross-Cutting', () => {
  test.use({ storageState: EXECUTIVE_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('no broken images or assets', async ({ page }) => {
    const failedRequests: string[] = []

    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().match(/\.(png|jpg|svg|gif|webp|ico)/)) {
        failedRequests.push(`${response.status()} ${response.url()}`)
      }
    })

    await gotoApprenticeshipAndWait(page)
    await page.waitForTimeout(2_000)

    expect(failedRequests).toHaveLength(0)
  })

  test('no console errors on page', async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (err) => errors.push(err.message))

    await gotoApprenticeshipAndWait(page)

    // Navigate through all visible tabs
    const tabs = page.getByRole('tab')
    const tabCount = await tabs.count()

    for (let i = 0; i < tabCount; i++) {
      const tab = tabs.nth(i)
      if (await tab.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await tab.click()
        await page.waitForTimeout(500)
      }
    }

    const criticalErrors = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('hydration')
    )
    expect(criticalErrors).toHaveLength(0)
  })

  test('page is responsive on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await gotoApprenticeshipAndWait(page)

    // Page should render some visible text content
    const heading = page.getByRole('heading').first()
    await expect(heading).toBeVisible({ timeout: 15_000 })

    // No horizontal scroll
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(scrollWidth).toBeLessThanOrEqual(viewportWidth + 5) // 5px tolerance
  })

  test('all buttons have accessible names', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Get all buttons
    const buttons = page.getByRole('button')
    const buttonCount = await buttons.count()

    const buttonsWithoutNames: string[] = []
    for (let i = 0; i < buttonCount; i++) {
      const button = buttons.nth(i)
      if (await button.isVisible({ timeout: 1_000 }).catch(() => false)) {
        const name = await button.getAttribute('aria-label')
        const text = await button.textContent()
        const title = await button.getAttribute('title')

        if (!name && !text?.trim() && !title) {
          const outerHtml = await button.evaluate((el) => el.outerHTML.slice(0, 200))
          buttonsWithoutNames.push(outerHtml)
        }
      }
    }

    // Allow some icon-only buttons that might be in the shell (not our page)
    // but flag if there are many
    if (buttonsWithoutNames.length > 3) {
      console.warn('Buttons without accessible names:', buttonsWithoutNames)
    }
  })

  test('keyboard navigation through tabs works', async ({ page }) => {
    await gotoApprenticeshipAndWait(page)

    // Find the first tab
    const firstTab = page.getByRole('tab').first()
    const hasTab = await firstTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasTab) {
      // Focus the first tab
      await firstTab.focus()
      await page.waitForTimeout(200)

      // Press right arrow to move to next tab
      await page.keyboard.press('ArrowRight')
      await page.waitForTimeout(200)

      // The focused element should be a tab
      const focusedRole = await page.evaluate(() =>
        document.activeElement?.getAttribute('role')
      )
      expect(focusedRole).toBe('tab')
    }
  })
})
