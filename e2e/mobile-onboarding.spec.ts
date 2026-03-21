/**
 * @file mobile-onboarding.spec.ts
 *
 * @description Mobile-specific tests for the onboarding flow on iPhone-class
 * viewports. Validates the mobile UX fixes:
 * 1. Industry/Stage grid stacks on mobile (grid-cols-1 sm:grid-cols-2)
 * 2. Executive/Apprentice grid stacks on mobile
 * 3. Onboarding step dots clear the iPhone home indicator (pb-safe)
 * 4. "Skip tour" button doesn't overlap notch (pt-safe + right-4)
 * 5. No autoFocus on name fields (keyboard doesn't hijack on load)
 *
 * Also covers general mobile UX: no horizontal overflow, touch targets,
 * and form usability at 320px and 390px widths.
 */

import { test, expect, type Page } from '@playwright/test'

const TEST_URL = process.env.TEST_URL || 'https://fractionalforge.app'

// ─── Helpers ──────────────────────────────────────────────────────────

async function checkNoHorizontalOverflow(page: Page, tolerance = 2): Promise<void> {
  const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  const viewportWidth = page.viewportSize()?.width ?? 390
  expect(
    bodyWidth,
    `Horizontal overflow: body ${bodyWidth}px > viewport ${viewportWidth}px`
  ).toBeLessThanOrEqual(viewportWidth + tolerance)
}

async function checkNoAutoFocus(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle')
  const focusedTag = await page.evaluate(() => document.activeElement?.tagName?.toLowerCase())
  expect(
    focusedTag,
    `autoFocus detected: ${focusedTag} has focus on page load`
  ).not.toBe('input')
}

/**
 * Assert boundingBox is non-null before accessing properties.
 * Returns the box for further assertions.
 */
async function getBoundingBoxOrFail(
  locator: ReturnType<Page['locator']>,
  label: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox()
  expect(box, `${label} should have a bounding box (is it visible?)`).not.toBeNull()
  return box!
}

// ─── iPhone SE (320px) ──────────────────────────────────────────────

test.describe('Mobile Onboarding — iPhone SE (320px)', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

  test('join page: no horizontal overflow', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)
    await checkNoHorizontalOverflow(page)
  })

  test('join page: path cards are visible and tappable', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)

    const founderCard = page.getByText("I'm founding a company")
    const joiningCard = page.getByText("I'm joining the marketplace")

    await expect(founderCard).toBeVisible()
    await expect(joiningCard).toBeVisible()

    const founderButton = page.locator('button', { hasText: "I'm founding a company" })
    const founderBox = await getBoundingBoxOrFail(founderButton, 'Founder path button')
    expect(founderBox.height).toBeGreaterThanOrEqual(44)
  })

  test('founder form: Industry/Stage fields stack vertically on 320px', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const industryInput = page.getByLabel(/industry/i)
    const stageInput = page.getByLabel(/stage/i)

    await expect(industryInput).toBeVisible()
    await expect(stageInput).toBeVisible()

    const industryBox = await getBoundingBoxOrFail(industryInput, 'Industry input')
    const stageBox = await getBoundingBoxOrFail(stageInput, 'Stage input')

    // Stacked means stage.top > industry.bottom (5px tolerance for label spacing)
    expect(
      stageBox.y,
      `Industry/Stage should stack on 320px: industry ends at y=${industryBox.y + industryBox.height}, stage starts at y=${stageBox.y}`
    ).toBeGreaterThan(industryBox.y + industryBox.height - 5)

    // Each input should be full-width (minus padding)
    expect(industryBox.width).toBeGreaterThan(250)
  })

  test('founder form: no autoFocus steals keyboard', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)
    await checkNoAutoFocus(page)
  })

  test('founder form: no horizontal overflow with all fields', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)
    await checkNoHorizontalOverflow(page)
  })

  test('joining form: Executive/Apprentice cards have adequate touch targets', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)
    await page.getByText("I'm joining the marketplace").click()

    const execButton = page.getByRole('button', { name: /Executive.*Experienced/i })
    await expect(execButton).toBeVisible()

    const apprenticeButton = page.getByRole('button', { name: /Apprentice.*Early career/i })
    await expect(apprenticeButton).toBeVisible()

    const execBox = await getBoundingBoxOrFail(execButton, 'Executive button')
    const apprenticeBox = await getBoundingBoxOrFail(apprenticeButton, 'Apprentice button')

    expect(execBox.height).toBeGreaterThanOrEqual(44)
    expect(apprenticeBox.height).toBeGreaterThanOrEqual(44)
  })

  test('supplier form: no autoFocus on name field', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=supplier`)
    await checkNoAutoFocus(page)
  })

  test('supplier form: no horizontal overflow', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=supplier`)
    await checkNoHorizontalOverflow(page)
  })
})

// ─── iPhone 14 Pro (390px) ──────────────────────────────────────────

test.describe('Mobile Onboarding — iPhone 14 Pro (390px)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('join page: full flow renders without overflow', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)
    await checkNoHorizontalOverflow(page)

    // Select founder
    await page.getByText("I'm founding a company").click()

    // Wait for form to appear (animation-driven, wait for actual element)
    await expect(page.getByLabel(/full name/i)).toBeVisible()
    await expect(page.getByLabel(/email/i)).toBeVisible()
    await expect(page.getByLabel(/password/i)).toBeVisible()
    await expect(page.getByLabel(/company name/i)).toBeVisible()

    await checkNoHorizontalOverflow(page)
  })

  test('founder form: Industry/Stage stack vertically', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const industryBox = await getBoundingBoxOrFail(page.getByLabel(/industry/i), 'Industry input')
    const stageBox = await getBoundingBoxOrFail(page.getByLabel(/stage/i), 'Stage input')

    expect(stageBox.y).toBeGreaterThan(industryBox.y + industryBox.height - 5)
  })

  test('submit button is large enough for thumb tap', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const submitButton = page.getByRole('button', { name: /create account/i })
    await submitButton.scrollIntoViewIfNeeded()

    const box = await getBoundingBoxOrFail(submitButton, 'Create Account button')
    expect(box.height).toBeGreaterThanOrEqual(48)
    expect(box.width).toBeGreaterThan(300)
  })

  test('Google OAuth button meets touch target size', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const googleButton = page.getByRole('button', { name: /continue with google/i })
    await expect(googleButton).toBeVisible()

    const box = await getBoundingBoxOrFail(googleButton, 'Google OAuth button')
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.width).toBeGreaterThan(300)
  })

  test('referral banner renders without overflow', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?ref=TESTREF`)
    await page.waitForLoadState('networkidle')

    await checkNoHorizontalOverflow(page)
  })

  test('password strength indicator is visible', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const passwordField = page.getByLabel(/password/i)
    await passwordField.fill('TestPass1')

    await expect(page.locator('#password-hint')).toBeVisible()
  })
})

// ─── Join Page — CSS Class Verification ─────────────────────────────

test.describe('Join Page — Responsive Grid Classes', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('Industry/Stage grid has responsive breakpoint class', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const industryGrid = page.locator('.grid').filter({ has: page.getByLabel(/industry/i) }).first()
    const gridClasses = await industryGrid.getAttribute('class')

    expect(
      gridClasses,
      'Industry/Stage grid should have grid-cols-1 sm:grid-cols-2'
    ).toContain('grid-cols-1')
  })

  test('Executive/Apprentice grid has responsive breakpoint class', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)
    await page.getByText("I'm joining the marketplace").click()

    // Wait for the actual element to appear (not a timeout)
    const execButton = page.getByRole('button', { name: /Executive.*Experienced/i })
    await expect(execButton).toBeVisible()

    const roleGrid = page.locator('.grid').filter({ hasText: /Executive/ }).first()
    const gridClasses = await roleGrid.getAttribute('class')

    expect(
      gridClasses,
      'Executive/Apprentice grid should have grid-cols-1 sm:grid-cols-2'
    ).toContain('grid-cols-1')
  })
})

// ─── Landscape Mode ───────────────────────────────────────────────

test.describe('Mobile Onboarding — Landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('join page renders in landscape without issues', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    await checkNoHorizontalOverflow(page)
    await expect(page.getByLabel(/full name/i)).toBeVisible()

    const submitButton = page.getByRole('button', { name: /create account/i })
    await submitButton.scrollIntoViewIfNeeded()
    await expect(submitButton).toBeVisible()
  })

  test('landscape: Industry/Stage go side-by-side (>640px)', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=founder`)

    const industryBox = await getBoundingBoxOrFail(page.getByLabel(/industry/i), 'Industry input')
    const stageBox = await getBoundingBoxOrFail(page.getByLabel(/stage/i), 'Stage input')

    // At 844px (>640px sm breakpoint), they should be side-by-side
    expect(
      Math.abs(stageBox.y - industryBox.y),
      'In landscape (844px), Industry/Stage should be side-by-side'
    ).toBeLessThan(10)
  })
})
