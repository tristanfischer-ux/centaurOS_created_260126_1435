import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Phase 1 Navigation Restructure — Comprehensive E2E Tests
 *
 * Tests the Person/Company navigation split, Person Hub, context indicator,
 * sidebar zones, and mobile navigation. Uses Founder persona for full access.
 */

test.describe('Phase 1: Person/Company Navigation', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  // ─── Sidebar Structure ──────────────────────────────────────

  test.describe('Sidebar — Zone Structure', () => {
    test('sidebar has "Me" section label', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const meLabel = page.locator('nav').getByText('Me', { exact: true })
      await expect(meLabel).toBeVisible({ timeout: 10_000 })
    })

    test('Person zone has Home link pointing to /home', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const homeLink = page.locator('nav a[href="/home"]')
      await expect(homeLink).toBeVisible({ timeout: 10_000 })
      await expect(homeLink).toContainText('Home')
    })

    test('Person zone has Marketplace link', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const link = page.locator('nav a[href="/marketplace"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
    })

    test('Person zone has Guild link', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const link = page.locator('nav a[href="/guild"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
    })

    test('Person zone has Apprenticeship link', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const link = page.locator('nav a[href="/apprenticeship"]')
      await expect(link).toBeVisible({ timeout: 10_000 })
    })

    test('Company zone has Dashboard link pointing to /dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const dashLink = page.locator('nav a[href="/dashboard"]')
      await expect(dashLink).toBeVisible({ timeout: 10_000 })
      await expect(dashLink).toContainText('Dashboard')
    })

    test('Company zone has all core work items', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      for (const route of ['/updates', '/new-objectives', '/new-tasks', '/team', '/agents', '/canvas', '/strategic-planner']) {
        const link = page.locator(`nav a[href="${route}"]`)
        await expect(link).toBeVisible({ timeout: 5_000 })
      }
    })

    test('ForgeOS logo links to /home', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const logo = page.locator('a:has-text("ForgeOS")').first()
      await expect(logo).toHaveAttribute('href', '/home')
    })
  })

  // ─── Person Hub Page ────────────────────────────────────────

  test.describe('Person Hub (/home)', () => {
    test('page loads without errors', async ({ page }) => {
      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })

      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      // Filter non-critical errors
      const critical = errors.filter(
        (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('Sentry')
      )
      expect(critical).toHaveLength(0)
    })

    test('shows welcome heading with user name', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      const heading = page.getByRole('heading', { level: 1 })
      await expect(heading).toContainText('Welcome back', { timeout: 10_000 })
    })

    test('shows "Your Companies" section', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Your Companies')).toBeVisible({ timeout: 10_000 })
    })

    test('shows at least one company tile', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      // Company tiles are Cards with role badges
      const tiles = page.locator('[class*="cursor-pointer"]').filter({ hasText: /Founder|Executive|Apprentice/ })
      const count = await tiles.count()
      expect(count).toBeGreaterThanOrEqual(1)
    })

    test('company tile shows role badge', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      // Should see at least one role badge
      const roleBadge = page.getByText(/^(Founder|Executive|Apprentice)$/i).first()
      await expect(roleBadge).toBeVisible({ timeout: 10_000 })
    })

    test('shows Quick Links section with Marketplace, Guild, My Profile', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Quick Links')).toBeVisible({ timeout: 10_000 })
      await expect(page.locator('a[href="/marketplace"]').last()).toBeVisible()
      await expect(page.locator('a[href="/guild"]').last()).toBeVisible()
      await expect(page.locator('a[href="/my-profile"]').last()).toBeVisible()
    })

    test('clicking company tile navigates to dashboard', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      // Click the first company tile
      const tile = page.locator('[class*="cursor-pointer"]').filter({ hasText: /Founder|Executive|Apprentice/ }).first()
      await tile.click()

      // Should navigate to dashboard
      await page.waitForURL('**/dashboard', { timeout: 15_000 })
    })
  })

  // ─── Context Indicator ──────────────────────────────────────

  test.describe('Context Indicator', () => {
    test('shows "Personal Space" on /home', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Personal Space')).toBeVisible({ timeout: 10_000 })
    })

    test('shows company name on /dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // The context indicator should NOT show "Personal Space" on company pages
      const personalLabel = page.getByText('Personal Space')
      await expect(personalLabel).not.toBeVisible({ timeout: 5_000 })
    })

    test('shows "Personal Space" on /marketplace', async ({ page }) => {
      await page.goto('/marketplace')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Personal Space')).toBeVisible({ timeout: 10_000 })
    })

    test('shows "Personal Space" on /guild', async ({ page }) => {
      await page.goto('/guild')
      await page.waitForLoadState('networkidle')

      await expect(page.getByText('Personal Space')).toBeVisible({ timeout: 10_000 })
    })
  })

  // ─── Navigation Click-Through ───────────────────────────────

  test.describe('Full Navigation Click-Through', () => {
    test('Person zone links all load without error', async ({ page }) => {
      const personRoutes = ['/home', '/marketplace', '/my-orders', '/guild', '/apprenticeship']

      for (const route of personRoutes) {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        // Check for crash — page should not show error boundary
        const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
        const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
        expect(hasError, `${route} shows error boundary`).toBe(false)
      }
    })

    test('Company zone links all load without error', async ({ page }) => {
      const companyRoutes = [
        '/dashboard', '/updates', '/new-objectives', '/new-tasks',
        '/team', '/agents', '/canvas', '/strategic-planner',
        '/inspiration', '/tools/financial',
      ]

      for (const route of companyRoutes) {
        await page.goto(route)
        await page.waitForLoadState('networkidle')
        const errorBoundary = page.getByText(/something went wrong|unexpected error/i)
        const hasError = await errorBoundary.isVisible({ timeout: 2_000 }).catch(() => false)
        expect(hasError, `${route} shows error boundary`).toBe(false)
      }
    })

    test('sidebar Home link active state on /home', async ({ page }) => {
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      const homeLink = page.locator('nav a[href="/home"]')
      // Active state should have international-orange color class
      const classes = await homeLink.getAttribute('class')
      expect(classes).toContain('text-international-orange')
    })

    test('sidebar Dashboard link active state on /dashboard', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      const dashLink = page.locator('nav a[href="/dashboard"]')
      const classes = await dashLink.getAttribute('class')
      expect(classes).toContain('text-international-orange')
    })
  })

  // ─── Command Palette ────────────────────────────────────────

  test.describe('Command Palette', () => {
    test('Cmd+K shows Home in navigation commands', async ({ page }) => {
      await page.goto('/dashboard')
      await page.waitForLoadState('networkidle')

      // Open command palette
      await page.keyboard.press('Meta+k')
      await page.waitForTimeout(500)

      // Type "home" to search
      await page.keyboard.type('home')
      await page.waitForTimeout(300)

      // Should see Home command
      const homeCmd = page.getByText('Home').first()
      await expect(homeCmd).toBeVisible({ timeout: 5_000 })
    })
  })
})
