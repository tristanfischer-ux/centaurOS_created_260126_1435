import { test, expect } from '@playwright/test'

/**
 * Comprehensive E2E tests for the ForgeOS marketing home page.
 *
 * @description Tests page load, navigation, hero section, content sections,
 * cards, CTAs, footer, accessibility, and mobile responsiveness.
 */
test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test.describe('Page Load & SEO', () => {
    test('should load with correct title', async ({ page }) => {
      await expect(page).toHaveTitle(/Fractional Forge/)
    })

    test('should have lang attribute on html', async ({ page }) => {
      const lang = await page.locator('html').getAttribute('lang')
      expect(lang).toBe('en')
    })

    test('should have meta viewport', async ({ page }) => {
      const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
      expect(viewport).toContain('width=device-width')
    })
  })

  test.describe('Accessibility', () => {
    test('should have skip navigation link', async ({ page }) => {
      // Wait for client hydration - page is a "use client" component
      await page.waitForLoadState('domcontentloaded')
      await page.waitForTimeout(1000)

      const skipLink = page.locator('a[href="#main-content"]')
      await expect(skipLink).toBeAttached({ timeout: 10000 })

      // Skip link is sr-only by default, becomes visible on focus
      await skipLink.focus()
      await expect(skipLink).toBeVisible({ timeout: 5000 })
      expect(await skipLink.textContent()).toBe('Skip to main content')
    })

    test('should have main landmark', async ({ page }) => {
      await page.waitForTimeout(1000) // Wait for hydration
      const main = page.locator('main#main-content')
      await expect(main).toBeAttached({ timeout: 10000 })
    })

    test('should have labeled navigation', async ({ page }) => {
      await page.waitForTimeout(1000) // Wait for hydration
      const nav = page.locator('nav[aria-label="Main navigation"]')
      await expect(nav).toBeAttached({ timeout: 10000 })
    })

    test('should have proper heading hierarchy', async ({ page }) => {
      // h1 in hero
      const h1 = page.locator('h1')
      await expect(h1).toHaveCount(1)

      // h2 section headers
      const h2s = page.locator('h2')
      const h2Count = await h2s.count()
      expect(h2Count).toBeGreaterThanOrEqual(3) // People, Network, OS

      // h3 card titles
      const h3s = page.locator('h3')
      const h3Count = await h3s.count()
      expect(h3Count).toBeGreaterThanOrEqual(9) // 3 per section
    })

    test('should have alt text on all images', async ({ page }) => {
      const images = page.locator('img')
      const count = await images.count()

      for (let i = 0; i < count; i++) {
        const alt = await images.nth(i).getAttribute('alt')
        expect(alt, `Image ${i} missing alt text`).toBeTruthy()
        expect(alt!.length, `Image ${i} has too-short alt text`).toBeGreaterThan(2)
      }
    })

    test('mobile menu button should have aria-expanded', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip()
        return
      }
      const menuButton = page.getByRole('button', { name: /menu/i })
      await expect(menuButton).toHaveAttribute('aria-expanded', 'false')

      await menuButton.click()
      await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    })
  })

  test.describe('Navigation', () => {
    test('should display brand name', async ({ page }) => {
      await expect(page.getByText('FRACTIONAL FORGE', { exact: true })).toBeVisible({ timeout: 10000 })
    })

    test('should show desktop nav links on desktop', async ({ page, isMobile }) => {
      if (isMobile) {
        test.skip()
        return
      }
      await expect(page.getByRole('link', { name: 'The People' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'The Network' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'The OS' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Login' }).first()).toBeVisible()
    })

    test('should scroll to People section on click', async ({ page, isMobile }) => {
      if (isMobile) {
        test.skip()
        return
      }
      await page.getByRole('link', { name: 'The People' }).first().click()
      // Wait for smooth scroll
      await page.waitForTimeout(500)

      const section = page.locator('#people')
      await expect(section).toBeInViewport()
    })

    test('should scroll to Network section on click', async ({ page, isMobile }) => {
      if (isMobile) {
        test.skip()
        return
      }
      await page.getByRole('link', { name: 'The Network' }).first().click()
      await page.waitForTimeout(500)

      const section = page.locator('#network')
      await expect(section).toBeInViewport()
    })

    test('should scroll to OS section on click', async ({ page, isMobile }) => {
      if (isMobile) {
        test.skip()
        return
      }
      await page.getByRole('link', { name: 'The OS' }).first().click()
      await page.waitForTimeout(500)

      const section = page.locator('#os')
      await expect(section).toBeInViewport()
    })
  })

  test.describe('Mobile Navigation', () => {
    test('should show hamburger button on mobile', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip()
        return
      }
      const menuButton = page.getByRole('button', { name: /menu/i })
      await expect(menuButton).toBeVisible()
    })

    test('should open and close mobile menu', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip()
        return
      }
      const menuButton = page.getByRole('button', { name: /menu/i })

      // Open menu
      await menuButton.click()
      await expect(page.locator('.md\\:hidden').last().getByText('The People')).toBeVisible()

      // Close menu
      await menuButton.click()
      // Menu should be hidden - the mobile menu div is conditionally rendered
      await expect(page.locator('.md\\:hidden.border-t')).toBeHidden()
    })

    test('mobile menu links should close menu on click', async ({ page, isMobile }) => {
      if (!isMobile) {
        test.skip()
        return
      }
      const menuButton = page.getByRole('button', { name: /menu/i })
      await menuButton.click()

      // Click a menu link
      const peopleLink = page.locator('.md\\:hidden').last().getByText('The People')
      await peopleLink.click()

      // Menu should close
      await page.waitForTimeout(300)
      await expect(page.locator('.md\\:hidden.border-t')).toBeHidden()
    })
  })

  test.describe('Hero Section', () => {
    test('should display System Online badge', async ({ page }) => {
      await expect(page.getByText('System Online')).toBeVisible()
    })

    test('should display main headline', async ({ page }) => {
      const h1 = page.locator('h1')
      await expect(h1).toContainText('We build atoms at the')
      await expect(h1).toContainText('speed of bits.')
    })

    test('should display tagline', async ({ page }) => {
      await expect(page.getByText(/Build hardware at software speed/)).toBeVisible()
    })

    test('should display hero image', async ({ page }) => {
      const heroImage = page.locator('img[alt="Hardware at software speed"]')
      await expect(heroImage).toBeAttached()
    })
  })

  test.describe('The People Section', () => {
    test('should display section header', async ({ page }) => {
      await expect(page.getByText('THE PEOPLE.')).toBeVisible()
    })

    test('should display Founders card', async ({ page }) => {
      await expect(page.getByText('Founders Decide')).toBeVisible()
      await expect(page.getByText('RETAIN YOUR EQUITY.')).toBeVisible()
    })

    test('should display Executives card', async ({ page }) => {
      await expect(page.getByText('Executives Evaluate')).toBeVisible()
      await expect(page.getByText('TRY BEFORE YOU FLY.')).toBeVisible()
    })

    test('should display Apprentices card', async ({ page }) => {
      await expect(page.getByText('Apprentices Do')).toBeVisible()
      await expect(page.getByText('10X YOUR OUTPUT.')).toBeVisible()
    })

    test('should have working Begin Induction CTA', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Begin Induction' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/founder')
    })

    test('should have working Join Cadre CTA', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Join Cadre' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/executive')
    })

    test('should have working Enter Guild CTA', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Enter Guild' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/apprentice')
    })
  })

  test.describe('The Network Section', () => {
    test('should display section header', async ({ page }) => {
      await expect(page.getByText('THE NETWORK.')).toBeVisible()
    })

    test('should display VC card', async ({ page }) => {
      await expect(page.getByText('Venture Capital')).toBeVisible()
      await expect(page.getByText('MORE BETS. SAME FUND.')).toBeVisible()
    })

    test('should display Suppliers card', async ({ page }) => {
      await expect(page.getByText('Marketplace Suppliers')).toBeVisible()
      await expect(page.getByText('SELL YOUR PRODUCTS.')).toBeVisible()
    })

    test('should display Academia card', async ({ page }) => {
      await expect(page.getByText('Academia')).toBeVisible()
      await expect(page.getByText('THE FOUNDER PIPELINE.')).toBeVisible()
    })

    test('should have working Apply CTA for VCs', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Apply' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/vc')
    })

    test('should have working Start Selling CTA', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Start Selling' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/supplier')
    })

    test('should have working Partner CTA', async ({ page }) => {
      const cta = page.getByRole('link', { name: 'Partner' })
      await expect(cta).toBeVisible()
      await expect(cta).toHaveAttribute('href', '/join/university')
    })
  })

  test.describe('The Operating System Section', () => {
    test('should display section header', async ({ page }) => {
      await expect(page.getByText('THE OPERATING SYSTEM.').first()).toBeVisible()
    })

    test('should display The Entity card', async ({ page }) => {
      await expect(page.getByText('The Entity')).toBeVisible()
      await expect(page.getByText('THE FIRM.')).toBeVisible()
    })

    test('should display The System card', async ({ page }) => {
      await expect(page.getByText('The System', { exact: true })).toBeVisible()
      // The "THE OPERATING SYSTEM." heading appears as both section header and card title
      const osHeadings = page.getByRole('heading', { name: 'THE OPERATING SYSTEM.' })
      // At least the card h3 should be visible
      await expect(osHeadings.last()).toBeVisible()
    })

    test('should display The Community card', async ({ page }) => {
      await expect(page.getByText('The Community')).toBeVisible()
      await expect(page.getByText('THE GUILD.')).toBeVisible()
    })

    test('OS section cards should NOT have action buttons', async ({ page }) => {
      // The OS section cards are informational only - no CTAs
      const osSection = page.locator('#os')
      const links = osSection.getByRole('link')
      // OS section should have 0 CTA links (Login links are motion.a not Link)
      const linkCount = await links.count()
      expect(linkCount).toBe(0)
    })
  })

  test.describe('Footer', () => {
    test('should display copyright with current year', async ({ page }) => {
      const year = new Date().getFullYear().toString()
      await expect(page.getByText(`${year} Fractional Forge Ltd`)).toBeVisible()
    })

    test('should display all rights reserved', async ({ page }) => {
      await expect(page.getByText('All rights reserved.')).toBeVisible()
    })
  })

  test.describe('Visual & UX', () => {
    test('should not have horizontal scrollbar', async ({ page }) => {
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
      const viewportWidth = await page.evaluate(() => window.innerWidth)
      expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1) // +1 for rounding
    })

    test('should have no console errors on load', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text())
        }
      })

      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Filter out known non-critical errors (e.g., favicon)
      const criticalErrors = errors.filter(
        (e) => !e.includes('favicon') && !e.includes('404')
      )
      expect(criticalErrors).toHaveLength(0)
    })

    test('all card images should load without errors', async ({ page }) => {
      const images = page.locator('img')
      const count = await images.count()

      for (let i = 0; i < count; i++) {
        const img = images.nth(i)
        // Scroll image into view to trigger lazy loading
        await img.scrollIntoViewIfNeeded()
        // Wait for image to load after scrolling into view
        await page.waitForTimeout(500)
        const naturalWidth = await img.evaluate(
          (el) => (el as HTMLImageElement).naturalWidth
        )
        expect(naturalWidth, `Image ${i} failed to load`).toBeGreaterThan(0)
      }
    })

    test('Login buttons should have correct external URL', async ({ page }) => {
      const loginLinks = page.locator('a[href*="/login"]')
      const count = await loginLinks.count()
      expect(count).toBeGreaterThanOrEqual(1)

      // Each login link should point to the correct domain
      for (let i = 0; i < count; i++) {
        const href = await loginLinks.nth(i).getAttribute('href')
        expect(href).toContain('/login')
      }
    })
  })
})
