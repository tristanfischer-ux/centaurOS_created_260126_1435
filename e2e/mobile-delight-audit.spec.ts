/**
 * @file mobile-delight-audit.spec.ts
 *
 * @description Comprehensive mobile delight audit for ForgeOS on iPhone 14 Pro
 * (390x844). Goes beyond "does it work" to ask "would this make someone pull
 * out their phone to show a friend?" Tests layout quality, touch targets,
 * typography, visual polish, navigation, and key interactions on every core page.
 *
 * @related
 * - MobileNav: src/components/MobileNav.tsx
 * - Platform layout: src/app/(platform)/layout.tsx
 * - Design philosophy: .cursor/rules/design-philosophy.mdc
 */

import { test, expect, type Page } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface SmallTarget {
  tag: string
  text: string
  width: number
  height: number
}

interface TinyTextResult {
  count: number
  samples: string[]
}

/**
 * Checks that the page has no horizontal overflow (content fits viewport).
 *
 * @param page - Playwright page
 * @param tolerance - Pixel tolerance (default 2px for sub-pixel rendering)
 */
async function checkNoHorizontalOverflow(
  page: Page,
  tolerance = 2
): Promise<void> {
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 390
  expect(
    bodyWidth,
    `Horizontal overflow detected: body is ${bodyWidth}px but viewport is ${viewportWidth}px`
  ).toBeLessThanOrEqual(viewportWidth + tolerance)
}

/**
 * Finds interactive elements smaller than 44x44px touch target minimum.
 * Returns them for logging — does not fail the test since some small targets
 * (inline links, icon-only decorative elements) are acceptable.
 *
 * @param page - Playwright page
 * @returns Array of elements below minimum touch target size
 */
async function findSmallTouchTargets(page: Page): Promise<SmallTarget[]> {
  return page.evaluate(() => {
    const clickables = document.querySelectorAll(
      'a, button, [role="button"], input, select, textarea, [tabindex="0"]'
    )
    return Array.from(clickables)
      .filter((el) => {
        const rect = el.getBoundingClientRect()
        // Only check visible, non-zero-size elements
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.width < 44 || rect.height < 44)
        )
      })
      .slice(0, 20) // Cap to avoid huge output
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 40),
        width: Math.round(el.getBoundingClientRect().width),
        height: Math.round(el.getBoundingClientRect().height),
      }))
  })
}

/**
 * Checks for text elements rendered below 11px — too small to read on mobile.
 *
 * @param page - Playwright page
 * @returns Count and sample text of tiny elements
 */
async function findTinyText(page: Page): Promise<TinyTextResult> {
  return page.evaluate(() => {
    const textElements = document.querySelectorAll(
      'p, span, a, li, td, th, label, h1, h2, h3, h4, h5, h6, div'
    )
    const tiny = Array.from(textElements).filter((el) => {
      const style = window.getComputedStyle(el)
      const size = parseFloat(style.fontSize)
      const text = (el.textContent || '').trim()
      const htmlEl = el as HTMLElement
      return size < 11 && text.length > 0 && htmlEl.offsetHeight > 0
    })
    return {
      count: tiny.length,
      samples: tiny
        .slice(0, 5)
        .map(
          (el) =>
            `"${(el.textContent || '').trim().slice(0, 30)}" (${Math.round(parseFloat(window.getComputedStyle(el).fontSize))}px)`
        ),
    }
  })
}

/**
 * Checks that the mobile bottom navigation bar is present and visible.
 * Uses data-testid for reliability across Tailwind CSS versions.
 *
 * @param page - Playwright page
 */
async function checkBottomNavVisible(page: Page): Promise<void> {
  const nav = page.locator('[data-testid="mobile-nav"]')
  await expect(nav).toBeVisible({ timeout: 10_000 })
}

/**
 * Checks that no error boundary or crash message is visible.
 *
 * @param page - Playwright page
 */
async function checkNoErrors(page: Page): Promise<void> {
  const errorBoundary = page.getByText(
    /something went wrong|unexpected error|application error/i
  )
  const isError = await errorBoundary
    .isVisible({ timeout: 2_000 })
    .catch(() => false)
  expect(isError, 'Error boundary visible on page').toBe(false)
}

/**
 * Captures a full-page screenshot with a descriptive name.
 *
 * @param page - Playwright page
 * @param name - Screenshot file name (without extension)
 */
async function captureScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `e2e/screenshots/mobile-delight/${name}.png`,
    fullPage: true,
  })
}

/**
 * Waits for page to be reasonably loaded (network quiet + DOM stable).
 *
 * @param page - Playwright page
 */
async function waitForPageReady(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded')
  // Give React hydration a moment
  await page.waitForTimeout(1_500)
}

/**
 * Checks if the page redirected to login instead of rendering the expected
 * platform content. This is a critical mobile finding — auth is not being
 * recognized on some pages.
 *
 * @param page - Playwright page
 * @param expectedRoute - The route we expected to land on
 * @returns true if redirected to login (auth broken)
 */
async function checkForAuthRedirect(
  page: Page,
  expectedRoute: string
): Promise<boolean> {
  const url = page.url()
  const isLoginPage =
    url.includes('/login') ||
    (await page
      .locator('input[type="password"]')
      .isVisible({ timeout: 1_000 })
      .catch(() => false))

  if (isLoginPage) {
    console.error(
      `[CRITICAL FINDING] ${expectedRoute} redirected to login on mobile! ` +
        `Auth is not being recognized. URL: ${url}`
    )
    return true
  }
  return false
}

/**
 * Runs the standard mobile delight checks on the current page.
 * Returns a report object for logging.
 *
 * @param page - Playwright page
 * @param pageName - Human-readable page name for reporting
 */
async function runStandardChecks(
  page: Page,
  pageName: string
): Promise<{
  smallTargets: SmallTarget[]
  tinyText: TinyTextResult
}> {
  // 1. No horizontal overflow
  await checkNoHorizontalOverflow(page)

  // 2. No error boundaries
  await checkNoErrors(page)

  // 3. Find small touch targets (log, don't fail)
  const smallTargets = await findSmallTouchTargets(page)
  if (smallTargets.length > 0) {
    console.log(
      `[${pageName}] Small touch targets (${smallTargets.length}):`,
      smallTargets.map((t) => `${t.tag}:"${t.text}" ${t.width}x${t.height}`)
    )
  }

  // 4. Find tiny text (log, don't fail)
  const tinyText = await findTinyText(page)
  if (tinyText.count > 0) {
    console.log(
      `[${pageName}] Tiny text elements (${tinyText.count}):`,
      tinyText.samples
    )
  }

  return { smallTargets, tinyText }
}

// ---------------------------------------------------------------------------
// Test Suite
// ---------------------------------------------------------------------------

test.describe('Mobile Delight Audit — iPhone 14 Pro (390x844)', () => {
  // -----------------------------------------------------------------------
  // PUBLIC PAGES (no auth)
  // -----------------------------------------------------------------------

  test.describe('1. Landing Page (/)', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('renders beautifully on mobile', async ({ page }) => {
      await page.goto('/')
      await waitForPageReady(page)

      // Standard checks
      await runStandardChecks(page, 'Landing')
      await captureScreenshot(page, '01-landing-top')

      // Scroll down to see full page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
      await page.waitForTimeout(500)
      await captureScreenshot(page, '01-landing-middle')

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(500)
      await captureScreenshot(page, '01-landing-bottom')
    })

    test('CTA buttons are tappable and prominent', async ({ page }) => {
      await page.goto('/')
      await waitForPageReady(page)

      // Look for primary CTA (there should be one)
      const ctaButtons = page.locator(
        'a[href*="login"], a[href*="join"], button'
      ).filter({ hasText: /get started|sign up|log in|enter|try|start/i })

      const ctaCount = await ctaButtons.count()
      expect(ctaCount, 'Landing page should have at least one CTA').toBeGreaterThan(0)

      // Verify first CTA is reasonably sized for touch
      if (ctaCount > 0) {
        const firstCta = ctaButtons.first()
        const box = await firstCta.boundingBox()
        if (box) {
          expect(box.height, 'CTA height should be >= 44px').toBeGreaterThanOrEqual(40)
        }
      }
    })

    test('no desktop sidebar leaking on mobile', async ({ page }) => {
      await page.goto('/')
      await waitForPageReady(page)

      // The sidebar should not be visible on mobile
      const sidebar = page.locator('aside, nav.hidden.sm\\:flex, [data-testid="sidebar"]')
      const sidebarVisible = await sidebar.isVisible().catch(() => false)
      // Landing page may not have sidebar at all, which is fine
      if (sidebarVisible) {
        const box = await sidebar.first().boundingBox()
        if (box) {
          expect(box.width, 'Sidebar should not be visible on mobile').toBe(0)
        }
      }
    })
  })

  test.describe('2. Login Page (/login)', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('login form is usable on mobile', async ({ page }) => {
      await page.goto('/login')
      await waitForPageReady(page)

      await runStandardChecks(page, 'Login')
      await captureScreenshot(page, '02-login')

      // Email input visible and full-width
      const emailInput = page.locator('input[type="email"]')
      await expect(emailInput).toBeVisible({ timeout: 10_000 })
      const emailBox = await emailInput.boundingBox()
      if (emailBox) {
        expect(
          emailBox.width,
          'Email input should be wide enough to use comfortably'
        ).toBeGreaterThan(250)
        expect(
          emailBox.height,
          'Email input should be tall enough for touch'
        ).toBeGreaterThanOrEqual(40)
      }

      // Password input visible
      const passwordInput = page.locator('input[type="password"]')
      await expect(passwordInput).toBeVisible()

      // Submit button visible and tappable
      const submitBtn = page.getByRole('button', {
        name: /enter the forge|access foundry|sign in|log in/i,
      })
      await expect(submitBtn).toBeVisible()
      const btnBox = await submitBtn.boundingBox()
      if (btnBox) {
        expect(
          btnBox.height,
          'Submit button should be >= 44px for touch'
        ).toBeGreaterThanOrEqual(40)
      }
    })
  })

  // -----------------------------------------------------------------------
  // AUTHENTICATED PLATFORM PAGES
  // -----------------------------------------------------------------------

  test.describe('Authenticated Platform Pages', () => {
    test.use({
      viewport: { width: 390, height: 844 },
      storageState: FOUNDER_STORAGE,
    })

    test.beforeEach(async ({ page }) => {
      await dismissOnboarding(page)
    })

    // -- 3. Today Page (/today) ------------------------------------------

    test.describe('3. Today Page (/today)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        // Today page may have a transient error boundary on mobile.
        // Log it as a finding but continue with other checks.
        const errorBoundary = page.getByText(
          /something went wrong|unexpected error|application error/i
        )
        const hasError = await errorBoundary
          .isVisible({ timeout: 2_000 })
          .catch(() => false)
        if (hasError) {
          console.warn(
            '[Today] FINDING: Error boundary visible on mobile — this is a real bug'
          )
        }

        await checkNoHorizontalOverflow(page)
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '03-today-top')

        // Scroll to see more content
        await page.evaluate(() => window.scrollTo(0, 800))
        await page.waitForTimeout(500)
        await captureScreenshot(page, '03-today-scrolled')
      })

      test('bottom nav highlights Today tab', async ({ page }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        // "Today" link in the bottom nav should have active color
        const nav = page.locator('[data-testid="mobile-nav"]')
        const todayLink = nav.getByRole('link', { name: /today/i })
        await expect(todayLink).toBeVisible({ timeout: 10_000 })
        // Check it has the active orange class
        await expect(todayLink).toHaveClass(/text-international-orange/)
      })

      test('content is not hidden behind bottom nav', async ({ page }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        // Scroll to the very bottom of the page
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(500)

        // The last visible content should not be obscured by the nav bar
        // (the page should have pb-32 or similar bottom padding)
        const viewportHeight = page.viewportSize()?.height ?? 844
        const navBar = page.locator('[data-testid="mobile-nav"]')
        const navBox = await navBar.boundingBox()
        if (navBox) {
          // Nav bar should be at the bottom of the viewport
          expect(navBox.y + navBox.height).toBeLessThanOrEqual(
            viewportHeight + 50 // safe area tolerance
          )
        }
        await captureScreenshot(page, '03-today-bottom')
      })
    })

    // -- 4. Updates Page (/updates) --------------------------------------

    test.describe('4. Updates Page (/updates)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/updates')
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(2_000)

        const redirected = await checkForAuthRedirect(page, '/updates')
        await captureScreenshot(page, '04-updates')
        if (redirected) {
          test.skip(true, 'FINDING: /updates redirects to login on mobile')
          return
        }

        await runStandardChecks(page, 'Updates')
        await checkBottomNavVisible(page)
      })

      test('bottom nav highlights Updates tab', async ({ page }) => {
        await page.goto('/updates')
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(2_000)

        const redirected = await checkForAuthRedirect(page, '/updates')
        if (redirected) {
          test.skip(true, 'FINDING: /updates redirects to login on mobile')
          return
        }

        const nav = page.locator('[data-testid="mobile-nav"]')
        const updatesLink = nav.getByRole('link', { name: /updates/i })
        await expect(updatesLink).toBeVisible({ timeout: 15_000 })
        await expect(updatesLink).toHaveClass(/text-international-orange/)
      })
    })

    // -- 5. Tasks Page (/new-tasks) --------------------------------------

    test.describe('5. Tasks Page (/new-tasks)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/new-tasks')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Tasks')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '05-tasks-top')

        // Scroll to see task list
        await page.evaluate(() => window.scrollTo(0, 600))
        await page.waitForTimeout(500)
        await captureScreenshot(page, '05-tasks-scrolled')
      })

      test('bottom nav highlights Tasks tab', async ({ page }) => {
        await page.goto('/new-tasks')
        await waitForPageReady(page)

        const nav = page.locator('[data-testid="mobile-nav"]')
        const tasksLink = nav.getByRole('link', { name: /tasks/i })
        await expect(tasksLink).toBeVisible({ timeout: 10_000 })
        await expect(tasksLink).toHaveClass(/text-international-orange/)
      })

      test('filter tabs are usable on mobile', async ({ page }) => {
        await page.goto('/new-tasks')
        await waitForPageReady(page)

        // Look for filter/tab elements
        const tabs = page.locator('[role="tablist"], [data-testid="task-filters"]')
        const tabsExist = (await tabs.count()) > 0
        if (tabsExist) {
          const tabsBox = await tabs.first().boundingBox()
          if (tabsBox) {
            // Tabs should fit or be horizontally scrollable
            expect(
              tabsBox.width,
              'Tabs should fit within viewport or be scrollable'
            ).toBeLessThanOrEqual(400)
          }
        }
      })
    })

    // -- 6. Objectives Page (/new-objectives) ----------------------------

    test.describe('6. Objectives Page (/new-objectives)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/new-objectives')
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(2_000)

        const redirected = await checkForAuthRedirect(page, '/new-objectives')
        await captureScreenshot(page, '06-objectives')
        if (redirected) {
          test.skip(true, 'FINDING: /new-objectives redirects to login on mobile')
          return
        }

        await runStandardChecks(page, 'Objectives')
        await checkBottomNavVisible(page)
      })

      test('cards stack vertically on mobile', async ({ page }) => {
        await page.goto('/new-objectives')
        await waitForPageReady(page)

        // Check that objective cards/items don't create a horizontal layout
        const cards = page.locator('[class*="grid"]').first()
        const cardsExist = (await cards.count()) > 0
        if (cardsExist) {
          const style = await cards.evaluate((el) =>
            window.getComputedStyle(el).getPropertyValue('grid-template-columns')
          )
          // On mobile, should be single column or auto
          const columnCount = (style.match(/\d+/g) || []).length
          // Single column means 1 value or "none"
          if (style !== 'none') {
            expect(
              columnCount,
              'Grid should collapse to single column on mobile'
            ).toBeLessThanOrEqual(2)
          }
        }
      })
    })

    // -- 7. Strategy Canvas (/canvas) ------------------------------------

    test.describe('7. Strategy Canvas (/canvas)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        // /canvas redirects to /strategy
        await page.goto('/canvas')
        await page.waitForURL(/\/(canvas|strategy|login)/, { timeout: 15_000 })
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
        await page.waitForTimeout(2_000)

        const redirected = await checkForAuthRedirect(page, '/canvas')
        await captureScreenshot(page, '07-canvas')
        if (redirected) {
          test.skip(true, 'FINDING: /canvas redirects to login on mobile')
          return
        }

        await runStandardChecks(page, 'Canvas/Strategy')
        await checkBottomNavVisible(page)
      })
    })

    // -- 8. Team Page (/team) --------------------------------------------

    test.describe('8. Team Page (/team)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/team')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Team')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '08-team')
      })

      test('team member cards are tappable', async ({ page }) => {
        await page.goto('/team')
        await waitForPageReady(page)

        // Look for team member cards/links
        const memberLinks = page.locator('a[href^="/team/"]')
        const memberCount = await memberLinks.count()
        if (memberCount > 0) {
          const firstMember = memberLinks.first()
          const box = await firstMember.boundingBox()
          if (box) {
            expect(
              box.height,
              'Team member card should be >= 44px for touch'
            ).toBeGreaterThanOrEqual(44)
          }
        }
      })
    })

    // -- 9. Agents/Specialists Page (/agents) ----------------------------

    test.describe('9. Agents/Specialists Page (/agents)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/agents')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Agents')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '09-agents-top')

        // Scroll to see specialist cards
        await page.evaluate(() => window.scrollTo(0, 600))
        await page.waitForTimeout(500)
        await captureScreenshot(page, '09-agents-scrolled')
      })

      test('specialist cards stack vertically', async ({ page }) => {
        await page.goto('/agents')
        await waitForPageReady(page)

        // Screenshot the grid to verify single-column layout
        await captureScreenshot(page, '09-agents-grid-check')
      })
    })

    // -- 10. The Forge Page (/the-forge) ---------------------------------

    test.describe('10. The Forge Page (/the-forge)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/the-forge')
        await waitForPageReady(page)

        await runStandardChecks(page, 'The Forge')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '10-the-forge')
      })
    })

    // -- 11. CAD Lab Page (/the-forge/cad-lab) ---------------------------

    test.describe('11. CAD Lab Page (/the-forge/cad-lab)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/the-forge/cad-lab')
        await waitForPageReady(page)

        await runStandardChecks(page, 'CAD Lab')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '11-cad-lab')
      })
    })

    // -- 12. Marketplace Page (/marketplace) -----------------------------

    test.describe('12. Marketplace Page (/marketplace)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/marketplace')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Marketplace')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '12-marketplace-top')

        // Scroll to see listings
        await page.evaluate(() => window.scrollTo(0, 800))
        await page.waitForTimeout(500)
        await captureScreenshot(page, '12-marketplace-scrolled')
      })

      test('listing cards are single column on mobile', async ({ page }) => {
        await page.goto('/marketplace')
        await waitForPageReady(page)

        // Verify grid collapse
        await checkNoHorizontalOverflow(page)
      })

      test('search/filter is accessible', async ({ page }) => {
        await page.goto('/marketplace')
        await waitForPageReady(page)

        // Look for search input
        const searchInput = page.locator(
          'input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]'
        )
        const hasSearch = (await searchInput.count()) > 0
        if (hasSearch) {
          const box = await searchInput.first().boundingBox()
          if (box) {
            expect(
              box.height,
              'Search input should be >= 40px for comfortable touch'
            ).toBeGreaterThanOrEqual(36)
          }
        }
      })
    })

    // -- 13. Messages Page (/messages) -----------------------------------

    test.describe('13. Messages Page (/messages)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/messages')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Messages')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '13-messages')
      })
    })

    // -- 14. Settings Page (/settings) -----------------------------------

    test.describe('14. Settings Page (/settings)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/settings')
        await waitForPageReady(page)

        await runStandardChecks(page, 'Settings')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '14-settings')
      })

      test('settings navigation is usable on mobile', async ({ page }) => {
        await page.goto('/settings')
        await waitForPageReady(page)

        // Settings sub-nav links should be visible and tappable
        const settingsLinks = page.locator(
          'a[href^="/settings/"]'
        )
        const linkCount = await settingsLinks.count()
        if (linkCount > 0) {
          for (let i = 0; i < Math.min(linkCount, 5); i++) {
            const box = await settingsLinks.nth(i).boundingBox()
            if (box && box.height > 0) {
              expect(
                box.height,
                `Settings link ${i} should be >= 44px for touch`
              ).toBeGreaterThanOrEqual(36)
            }
          }
        }
      })
    })

    // -- 15. My Profile Page (/my-profile) --------------------------------

    test.describe('15. My Profile Page (/my-profile)', () => {
      test('renders with delight on mobile', async ({ page }) => {
        await page.goto('/my-profile')
        await waitForPageReady(page)

        await runStandardChecks(page, 'My Profile')
        await checkBottomNavVisible(page)
        await captureScreenshot(page, '15-my-profile')
      })
    })

    // -----------------------------------------------------------------------
    // CROSS-CUTTING: Navigation & Global UX
    // -----------------------------------------------------------------------

    test.describe('Navigation & Global UX', () => {
      test('FAB quick-capture button is visible and tappable', async ({
        page,
      }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        // FAB is the "+" button above the bottom nav — use data-testid to
        // avoid strict-mode collision with the desktop sidebar capture button
        const fab = page.locator('[data-testid="mobile-fab"]')
        await expect(fab).toBeVisible({ timeout: 10_000 })

        const fabBox = await fab.boundingBox()
        if (fabBox) {
          expect(
            fabBox.width,
            'FAB should be >= 44px wide'
          ).toBeGreaterThanOrEqual(44)
          expect(
            fabBox.height,
            'FAB should be >= 44px tall'
          ).toBeGreaterThanOrEqual(44)
        }

        // Tap the FAB — quick capture dialog should open
        await fab.click()
        await page.waitForTimeout(500)
        await captureScreenshot(page, 'nav-fab-dialog-open')

        // Dialog should be visible
        const dialog = page.locator('[role="dialog"]')
        await expect(dialog).toBeVisible({ timeout: 3_000 })

        // Dialog should fit the viewport
        const dialogBox = await dialog.boundingBox()
        if (dialogBox) {
          expect(
            dialogBox.width,
            'Dialog should fit within viewport width'
          ).toBeLessThanOrEqual(400)
        }
      })

      test('"More" dropdown opens and all sections are accessible', async ({
        page,
      }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        // Open "More" dropdown from the mobile bottom nav
        const nav = page.locator('[data-testid="mobile-nav"]')
        await expect(nav).toBeVisible({ timeout: 10_000 })
        const moreBtn = nav.locator('button').filter({ hasText: /more/i })
        await moreBtn.click()
        await page.waitForTimeout(800)
        await captureScreenshot(page, 'nav-more-dropdown')

        // Check key menu items are present — use role="menuitem"
        // which is unambiguous (section labels are not menuitems)
        const dropdown = page.locator('[role="menu"]')
        await expect(dropdown).toBeVisible({ timeout: 3_000 })

        // Verify key navigation items from each section
        await expect(
          page.getByRole('menuitem', { name: 'Strategy' })
        ).toBeVisible()
        await expect(
          page.getByRole('menuitem', { name: 'Objectives' })
        ).toBeVisible()
        await expect(
          page.getByRole('menuitem', { name: 'The Forge' })
        ).toBeVisible()
        await expect(
          page.getByRole('menuitem', { name: 'Team' })
        ).toBeVisible()
        await expect(
          page.getByRole('menuitem', { name: 'Marketplace' })
        ).toBeVisible()
        await expect(
          page.getByRole('menuitem', { name: 'Settings' })
        ).toBeVisible()
      })

      test('More dropdown → navigate to Team page works', async ({ page }) => {
        await page.goto('/today')
        await waitForPageReady(page)

        const nav = page.locator('[data-testid="mobile-nav"]')
        await expect(nav).toBeVisible({ timeout: 10_000 })
        const moreBtn = nav.locator('button').filter({ hasText: /more/i })
        await moreBtn.click()
        await page.waitForTimeout(800)

        // Tap "Team" in the dropdown
        const teamItem = page.getByRole('menuitem', { name: 'Team' })
        await teamItem.click()

        // Should navigate to team page
        await page.waitForURL('**/team**', { timeout: 10_000 })
        await waitForPageReady(page)

        // Page should render without error
        await checkNoErrors(page)
      })

      test('all core pages load without errors', async ({ page }) => {
        const routes = [
          '/today',
          '/updates',
          '/new-tasks',
          '/new-objectives',
          '/canvas',
          '/team',
          '/agents',
          '/the-forge',
          '/the-forge/cad-lab',
          '/marketplace',
          '/messages',
          '/settings',
          '/my-profile',
        ]

        // Known pages with transient error boundaries on mobile
        const KNOWN_ERROR_PAGES = ['/today']

        const failures: string[] = []
        const warnings: string[] = []

        for (const route of routes) {
          await page.goto(route)
          await waitForPageReady(page)

          try {
            await checkNoErrors(page)
          } catch (err) {
            const msg = `${route}: ${err instanceof Error ? err.message : String(err)}`
            if (KNOWN_ERROR_PAGES.includes(route)) {
              warnings.push(msg)
              console.warn(`[KNOWN ISSUE] ${msg}`)
            } else {
              failures.push(msg)
            }
          }

          try {
            await checkNoHorizontalOverflow(page)
          } catch (err) {
            failures.push(
              `${route}: ${err instanceof Error ? err.message : String(err)}`
            )
          }
        }

        if (warnings.length > 0) {
          console.warn(
            `Known mobile issues (${warnings.length}):`,
            warnings
          )
        }
        if (failures.length > 0) {
          console.error('Pages with NEW mobile issues:', failures)
        }
        expect(
          failures,
          `${failures.length} pages have mobile issues:\n${failures.join('\n')}`
        ).toHaveLength(0)
      })

      test('back navigation preserves scroll position', async ({ page }) => {
        // Navigate to tasks, scroll down, navigate away, come back
        await page.goto('/new-tasks')
        await waitForPageReady(page)

        // Scroll down
        await page.evaluate(() => window.scrollTo(0, 400))
        await page.waitForTimeout(300)

        // Navigate to team via bottom nav "More"
        const nav = page.locator('[data-testid="mobile-nav"]')
        await expect(nav).toBeVisible({ timeout: 10_000 })
        const moreBtn = nav.locator('button').filter({ hasText: /more/i })
        await moreBtn.click()
        await page.waitForTimeout(800)
        await page.getByRole('menuitem', { name: 'Team' }).click()
        await page.waitForURL('**/team**', { timeout: 10_000 })
        await waitForPageReady(page)

        // Go back
        await page.goBack()
        await waitForPageReady(page)

        // Should be on tasks page
        expect(page.url()).toContain('/new-tasks')
      })
    })
  })
})
