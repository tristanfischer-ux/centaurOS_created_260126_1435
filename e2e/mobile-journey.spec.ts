/**
 * @file mobile-journey.spec.ts
 *
 * @description Full mobile user journey tests — landing page through to
 * authenticated platform. Tests the complete flow a phone user experiences:
 * marketing site → join/login → platform layout → mobile nav.
 *
 * Covers: horizontal overflow, touch targets, safe-area classes, viewport
 * behavior, and navigation on iPhone SE (320px) and iPhone 14 Pro (390px).
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

async function getBoundingBoxOrFail(
  locator: ReturnType<Page['locator']>,
  label: string,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox()
  expect(box, `${label} should have a bounding box (is it visible?)`).not.toBeNull()
  return box!
}

// ─── Landing Page ───────────────────────────────────────────────────

test.describe('Mobile Journey — Landing Page', () => {
  test.describe('iPhone SE (320px)', () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

    test('landing page: no horizontal overflow', async ({ page }) => {
      await page.goto(TEST_URL)
      await page.waitForLoadState('networkidle')
      await checkNoHorizontalOverflow(page)
    })

    test('landing page: hamburger menu is visible', async ({ page }) => {
      await page.goto(TEST_URL)
      const hamburger = page.locator('[aria-label="Open menu"], [aria-label="Close menu"]')
      await expect(hamburger).toBeVisible()

      const box = await getBoundingBoxOrFail(hamburger, 'Hamburger button')
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    })

    test('landing page: mobile menu opens and has tappable links', async ({ page }) => {
      await page.goto(TEST_URL)
      const hamburger = page.locator('[aria-label="Open menu"]')
      await hamburger.click()

      // Menu should appear
      const joinLink = page.getByRole('link', { name: /join the forge/i })
      await expect(joinLink).toBeVisible()

      const joinBox = await getBoundingBoxOrFail(joinLink, 'Join the Forge link')
      expect(joinBox.height).toBeGreaterThanOrEqual(44)
    })

    test('landing page: mobile menu has pb-safe class', async ({ page }) => {
      await page.goto(TEST_URL)
      const hamburger = page.locator('[aria-label="Open menu"]')
      await hamburger.click()

      // The menu container should have pb-safe for iPhone notch
      const menuContainer = page.locator('.pb-safe').filter({ hasText: /join the forge/i })
      await expect(menuContainer).toBeVisible()
    })

    test('landing page: hero CTA is tappable', async ({ page }) => {
      await page.goto(TEST_URL)

      // Find the primary CTA in the hero
      const cta = page.getByRole('link', { name: /join/i }).first()
      await expect(cta).toBeVisible()
    })
  })

  test.describe('iPhone 14 Pro (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('landing page: no horizontal overflow', async ({ page }) => {
      await page.goto(TEST_URL)
      await page.waitForLoadState('networkidle')
      await checkNoHorizontalOverflow(page)
    })

    test('landing page: scroll to footer without overflow', async ({ page }) => {
      await page.goto(TEST_URL)

      // Scroll to bottom
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      await page.waitForTimeout(500)

      await checkNoHorizontalOverflow(page)
    })
  })
})

// ─── Login Page ─────────────────────────────────────────────────────

test.describe('Mobile Journey — Login Page', () => {
  test.describe('iPhone SE (320px)', () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

    test('login page: no horizontal overflow', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)
      await checkNoHorizontalOverflow(page)
    })

    test('login page: form fields visible', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)

      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
    })

    test('login page: submit button meets touch target', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)

      const submitButton = page.getByRole('button', { name: /sign in|log in/i })
      await expect(submitButton).toBeVisible()

      const box = await getBoundingBoxOrFail(submitButton, 'Login submit button')
      expect(box.height).toBeGreaterThanOrEqual(44)
    })

    test('login page: Google OAuth button meets touch target', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)

      const googleButton = page.getByRole('button', { name: /google/i })
      if (await googleButton.isVisible()) {
        const box = await getBoundingBoxOrFail(googleButton, 'Google OAuth button')
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    })
  })

  test.describe('iPhone 14 Pro (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('login page: no horizontal overflow', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)
      await checkNoHorizontalOverflow(page)
    })

    test('login page: sign up link is visible', async ({ page }) => {
      await page.goto(`${TEST_URL}/login`)

      const signUpLink = page.getByRole('link', { name: /sign up|join|create.*account/i })
      await expect(signUpLink).toBeVisible()
    })
  })
})

// ─── Join Page (quick checks — detailed tests in mobile-onboarding.spec.ts) ──

test.describe('Mobile Journey — Join Page', () => {
  test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

  test('join page: accessible from landing', async ({ page }) => {
    await page.goto(TEST_URL)
    const joinLink = page.getByRole('link', { name: /join/i }).first()
    await joinLink.click()

    await expect(page).toHaveURL(/\/join/)
    await expect(page.getByLabel(/full name/i)).toBeVisible()
  })

  test('supplier claim page: no overflow', async ({ page }) => {
    await page.goto(`${TEST_URL}/join?role=supplier`)
    await checkNoHorizontalOverflow(page)

    await expect(page.getByRole('heading', { name: /claim/i })).toBeVisible()
  })
})

// ─── Platform Layout (authenticated pages — use deployed URL checks) ──

test.describe('Mobile Journey — Platform Layout Structure', () => {
  test.describe('iPhone SE (320px)', () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

    test('platform pages redirect to login on mobile (auth required)', async ({ page }) => {
      // Unauthenticated — should redirect to login
      await page.goto(`${TEST_URL}/today`)
      await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
    })
  })
})

// ─── Supplier Portal ───────────────────────────────────────────────

test.describe('Mobile Journey — Supplier Portal', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('supplier portal redirects unauthenticated users', async ({ page }) => {
    await page.goto(`${TEST_URL}/supplier-portal`)
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})

// ─── Marketplace (public browse) ────────────────────────────────────

test.describe('Mobile Journey — Marketplace', () => {
  test.describe('iPhone SE (320px)', () => {
    test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true })

    test('marketplace: no horizontal overflow', async ({ page }) => {
      await page.goto(`${TEST_URL}/marketplace`)
      await page.waitForLoadState('networkidle')
      // May redirect to login — check overflow on whatever page loads
      await checkNoHorizontalOverflow(page)
    })
  })

  test.describe('iPhone 14 Pro (390px)', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

    test('marketplace: no horizontal overflow', async ({ page }) => {
      await page.goto(`${TEST_URL}/marketplace`)
      await page.waitForLoadState('networkidle')
      await checkNoHorizontalOverflow(page)
    })
  })
})

// ─── Claim Flow ─────────────────────────────────────────────────────

test.describe('Mobile Journey — Claim Flow', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('invalid claim token shows error gracefully', async ({ page }) => {
    await page.goto(`${TEST_URL}/claim/invalid-token-12345678`)
    await page.waitForLoadState('networkidle')

    // Should not crash — either shows error or redirects
    await checkNoHorizontalOverflow(page)
  })
})

// ─── Landscape Mode ────────────────────────────────────────────────

test.describe('Mobile Journey — Landscape', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true })

  test('landing page: no overflow in landscape', async ({ page }) => {
    await page.goto(TEST_URL)
    await page.waitForLoadState('networkidle')
    await checkNoHorizontalOverflow(page)
  })

  test('login page: form accessible in landscape', async ({ page }) => {
    await page.goto(`${TEST_URL}/login`)

    await expect(page.getByLabel(/email/i)).toBeVisible()

    const submitButton = page.getByRole('button', { name: /sign in|log in/i })
    await submitButton.scrollIntoViewIfNeeded()
    await expect(submitButton).toBeVisible()
  })

  test('join page: no overflow in landscape', async ({ page }) => {
    await page.goto(`${TEST_URL}/join`)
    await checkNoHorizontalOverflow(page)
  })
})
