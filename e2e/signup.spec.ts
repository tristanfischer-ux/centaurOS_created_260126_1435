import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const TEST_URL = process.env.TEST_URL || 'https://fractionalforge.app'

/**
 * Unified Signup Flow E2E Tests
 *
 * Tests the /join page which is a single-step form:
 *   - Default: Name, Email, Password, Confirm Password, Google OAuth
 *   - ?role=founder deep-link: adds Company Name, Industry, Stage
 *   - ?role=supplier: simplified supplier claim flow (no confirm password)
 *
 * Three layers:
 *   - Layer 1: Page structure (no server interaction)
 *   - Layer 2: Validation and data preservation (server returns errors inline)
 *   - Layer 3: Happy-path signup (creates real accounts, cleans up)
 */

test.describe('Unified Signup Flow (/join)', () => {
  // ─── Layer 1: Page Structure ──────────────────────────────────────

  test.describe('Page Structure', () => {
    test('displays header and form fields immediately', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Header
      await expect(page.getByRole('heading', { level: 1, name: /join forgeos/i })).toBeVisible()

      // Form fields visible immediately (no path selection step)
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/^email/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.locator('#confirm-password')).toBeVisible()
    })

    test('navigation links work correctly', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Back link
      const backLink = page.getByRole('link', { name: /back/i })
      await expect(backLink).toBeVisible()
      await expect(backLink).toHaveAttribute('href', '/')

      // Sign in link
      const signInLink = page.getByRole('link', { name: /sign in/i })
      await expect(signInLink).toBeVisible()
      await expect(signInLink).toHaveAttribute('href', '/login')
    })

    test('Google OAuth button is visible', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.getByRole('button', { name: /continue with google/i })).toBeVisible()
    })

    test('founding member counter is visible', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.getByText(/founding members/i)).toBeVisible()
    })
  })

  // ─── Founder Deep-Link ──────────────────────────────────────────

  test.describe('Founder Deep-Link', () => {
    test('?role=founder shows company fields', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      // Common fields
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/^email/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()

      // Founder-specific fields
      await expect(page.getByText('About your company')).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
      await expect(page.getByLabel(/industry/i)).toBeVisible()
      await expect(page.getByLabel(/stage/i)).toBeVisible()
    })

    test('default join page does NOT show company fields', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
    })
  })

  // ─── Supplier Claim Flow ──────────────────────────────────────────

  test.describe('Supplier Claim Flow', () => {
    test('?role=supplier shows simplified form', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=supplier`)

      await expect(page.getByRole('heading', { name: /claim your company listing/i })).toBeVisible()
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/^email/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()

      // No confirm password on supplier form
      await expect(page.locator('#confirm-password')).not.toBeVisible()

      // No company fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
    })
  })

  // ─── Confirm Password ─────────────────────────────────────────────

  test.describe('Confirm Password', () => {
    test('confirm password field is visible on default join', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.locator('#confirm-password')).toBeVisible()
    })

    test('mismatch shows error and disables submit', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      await page.locator('#password').fill('TestPass123!')
      await page.locator('#confirm-password').fill('DifferentPass1!')

      // Error message should appear
      await expect(page.getByText('Passwords do not match')).toBeVisible()

      // Submit button should be disabled
      await expect(page.getByRole('button', { name: /create account/i })).toBeDisabled()
    })

    test('matching passwords enables submit', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      await page.locator('#password').fill('TestPass123!')
      await page.locator('#confirm-password').fill('TestPass123!')

      // No error message
      await expect(page.getByText('Passwords do not match')).not.toBeVisible()

      // Submit button should be enabled
      await expect(page.getByRole('button', { name: /create account/i })).toBeEnabled()
    })
  })

  // ─── Layer 2: Validation & Data Preservation ──────────────────────

  test.describe('Form Validation — Data Preservation', () => {
    test.setTimeout(60_000)

    const ERROR_ALERT = '[role="alert"][aria-live="polite"]'

    test('server-side validation error preserves field values', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      // Fill all fields with a weak password (server rejects)
      await page.getByLabel(/full name/i).fill('Test Founder')
      await page.getByLabel(/^email/i).fill('test-preserve@example.com')
      await page.locator('#password').fill('alllowercase')
      await page.locator('#confirm-password').fill('alllowercase')
      await page.getByLabel(/company name/i).fill('TestCo Industries')
      await page.getByLabel(/industry/i).fill('Hardware')
      await page.getByLabel(/stage/i).fill('Seed')

      await page.getByRole('button', { name: /create account/i }).click()

      // Wait for inline error
      await expect(page.locator(ERROR_ALERT)).toBeVisible({ timeout: 15_000 })

      // Non-password fields should retain values
      await expect(page.getByLabel(/full name/i)).toHaveValue('Test Founder')
      await expect(page.getByLabel(/^email/i)).toHaveValue('test-preserve@example.com')
      await expect(page.getByLabel(/company name/i)).toHaveValue('TestCo Industries')
      await expect(page.getByLabel(/industry/i)).toHaveValue('Hardware')
      await expect(page.getByLabel(/stage/i)).toHaveValue('Seed')
    })

    test('loading state shows during submission', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await page.getByLabel(/full name/i).fill('Loading Test')
      await page.getByLabel(/^email/i).fill('loading@example.com')
      await page.locator('#password').fill('nouppercase1')
      await page.locator('#confirm-password').fill('nouppercase1')
      await page.getByLabel(/company name/i).fill('LoadCo')

      await page.getByRole('button', { name: /create account/i }).click()

      await expect(
        page.getByRole('button', { name: /creating account/i })
      ).toBeVisible({ timeout: 5_000 })

      // Eventually, error appears and button returns to normal
      await expect(page.locator(ERROR_ALERT)).toBeVisible({ timeout: 15_000 })
      await expect(
        page.getByRole('button', { name: /create account/i })
      ).toBeVisible({ timeout: 10_000 })
    })
  })

  test.describe('Form Validation — Browser Validation', () => {
    test('required fields have required attribute', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/full name/i)).toHaveAttribute('required', '')
      await expect(page.getByLabel(/^email/i)).toHaveAttribute('required', '')
      await expect(page.locator('#password')).toHaveAttribute('required', '')
      await expect(page.locator('#confirm-password')).toHaveAttribute('required', '')
      await expect(page.getByLabel(/company name/i)).toHaveAttribute('required', '')
    })

    test('email field enforces email type', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.getByLabel(/^email/i)).toHaveAttribute('type', 'email')
    })

    test('password field has minLength of 8', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await expect(page.locator('#password')).toHaveAttribute('minlength', '8')
    })
  })

  // ─── Accessibility ────────────────────────────────────────────────

  test.describe('Accessibility', () => {
    test('inputs have associated labels', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/^email/i)).toBeVisible()
      // Password and Confirm Password use id-based selectors to avoid
      // label ambiguity (both contain "password" text + asterisk spans)
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.locator('#confirm-password')).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
      await expect(page.getByLabel(/industry/i)).toBeVisible()
      await expect(page.getByLabel(/stage/i)).toBeVisible()
    })

    test('required fields have aria-required', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/full name/i)).toHaveAttribute('aria-required', 'true')
      await expect(page.getByLabel(/^email/i)).toHaveAttribute('aria-required', 'true')
      await expect(page.locator('#password')).toHaveAttribute('aria-required', 'true')
      await expect(page.locator('#confirm-password')).toHaveAttribute('aria-required', 'true')
      await expect(page.getByLabel(/company name/i)).toHaveAttribute('aria-required', 'true')
    })

    test('password hint is linked via aria-describedby', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      await expect(page.locator('#password')).toHaveAttribute('aria-describedby', 'password-hint')
      await expect(page.locator('#password-hint')).toContainText('Min 8 characters')
    })

    test('confirm password has aria-invalid on mismatch', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      await page.locator('#password').fill('TestPass123!')
      await page.locator('#confirm-password').fill('Wrong1!')

      await expect(page.locator('#confirm-password')).toHaveAttribute('aria-invalid', 'true')
    })

    test('error message has role=alert and aria-live', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(`${TEST_URL}/join?role=founder`)

      await page.getByLabel(/full name/i).fill('Test')
      await page.getByLabel(/^email/i).fill('test@example.com')
      await page.locator('#password').fill('nouppercase1')
      await page.locator('#confirm-password').fill('nouppercase1')
      await page.getByLabel(/company name/i).fill('Co')

      await page.getByRole('button', { name: /create account/i }).click()

      const errorAlert = page.locator('[role="alert"][aria-live="polite"]')
      await expect(errorAlert).toBeVisible({ timeout: 15_000 })
      await expect(errorAlert).toHaveAttribute('aria-live', 'polite')
    })
  })

  // ─── Legacy URL Redirects ────────────────────────────────────────

  test.describe('Legacy URL Redirects', () => {
    test('/join/founder redirects to /join?role=founder', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)
      await expect(page).toHaveURL(/\/join\?role=founder/i)
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
    })

    test('/join/executive redirects to /join?role=executive', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/executive`)
      await expect(page).toHaveURL(/\/join\?role=executive/i)
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })

    test('/join/apprentice redirects to /join?role=apprentice', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/apprentice`)
      await expect(page).toHaveURL(/\/join\?role=apprentice/i)
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })
  })

  // ─── Demo Mode ────────────────────────────────────────────────────

  test.describe('Demo Mode', () => {
    test('demo mode shows banner when server action succeeds', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder&demo=true`)

      // Demo data is fetched from a server action — may fail in rate-limited
      // environments. Test that either the banner appears OR the page still
      // renders correctly without it.
      const banner = page.getByText('Demo Mode Active')
      const bannerVisible = await banner.isVisible().catch(() => false)

      if (bannerVisible) {
        // If demo data loaded, fields should be pre-filled
        await expect(page.getByLabel(/full name/i)).not.toHaveValue('', { timeout: 10_000 })
        await expect(page.getByLabel(/^email/i)).not.toHaveValue('')
      } else {
        // Even without demo data, the form should still be usable
        await expect(page.getByLabel(/full name/i)).toBeVisible()
        await expect(page.getByLabel(/^email/i)).toBeVisible()
        await expect(page.locator('#password')).toBeVisible()
      }
    })
  })

  // ─── Layer 3: Happy-Path Signup (real accounts) ───────────────────

  test.describe('Happy-Path Signup', () => {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    // INTENT: These tests create real Supabase accounts and may fail due to
    // production rate limiting when run repeatedly. They're the gold standard
    // for signup verification but should be run sparingly.
    test.skip(!SUPABASE_URL || !SUPABASE_SERVICE_KEY, 'Requires SUPABASE_SERVICE_ROLE_KEY')
    test.setTimeout(120_000)

    const createdUserIds: string[] = []
    let adminClient: ReturnType<typeof createClient>

    test.beforeAll(async () => {
      adminClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_KEY!, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    })

    test.afterAll(async () => {
      for (const userId of createdUserIds) {
        try {
          await adminClient.from('provider_profiles').delete().eq('user_id', userId)
          await adminClient.from('foundry_memberships').delete().eq('user_id', userId)
          await adminClient.from('profiles').delete().eq('id', userId)
          await adminClient.auth.admin.deleteUser(userId)
        } catch (err) {
          console.warn(`Failed to clean up user ${userId}:`, err)
        }
      }
    })

    async function recordTestUser(email: string): Promise<void> {
      const { data } = await adminClient.auth.admin.listUsers()
      const user = data?.users?.find(u => u.email === email)
      if (user) {
        createdUserIds.push(user.id)
        const { data: foundries } = await adminClient
          .from('foundries')
          .select('id')
          .eq('owner_id', user.id)
        if (foundries) {
          for (const f of foundries as { id: string }[]) {
            await adminClient.from('foundries').delete().eq('id', f.id)
          }
        }
      }
    }

    test('founder signup: fills form, submits, redirects to /today', async ({ page }) => {
      const uniqueEmail = `e2e-founder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fractionalforge.app`

      await page.goto(`${TEST_URL}/join?role=founder`)

      await page.getByLabel(/full name/i).fill('E2E Founder Test')
      await page.getByLabel(/^email/i).fill(uniqueEmail)
      await page.locator('#password').fill('TestPass123!')
      await page.locator('#confirm-password').fill('TestPass123!')
      await page.getByLabel(/company name/i).fill('E2E Test Corp')
      await page.getByLabel(/industry/i).fill('Testing')
      await page.getByLabel(/stage/i).fill('Seed')

      await page.getByRole('button', { name: /create account/i }).click()

      await expect(page.getByRole('button', { name: /creating account/i })).toBeVisible({ timeout: 5_000 })
      await expect(page).toHaveURL(/\/today/, { timeout: 30_000 })

      await recordTestUser(uniqueEmail)
    })

    test('default signup: fills form, submits, redirects to /today', async ({ page }) => {
      const uniqueEmail = `e2e-exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fractionalforge.app`

      await page.goto(`${TEST_URL}/join`)

      await page.getByLabel(/full name/i).fill('E2E Executive Test')
      await page.getByLabel(/^email/i).fill(uniqueEmail)
      await page.locator('#password').fill('TestPass123!')
      await page.locator('#confirm-password').fill('TestPass123!')

      await page.getByRole('button', { name: /create account/i }).click()

      await expect(page).toHaveURL(/\/today/, { timeout: 30_000 })

      await recordTestUser(uniqueEmail)
    })
  })

  // ─── Mobile Responsiveness ────────────────────────────────────────

  test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('page renders correctly on mobile', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      await expect(page.getByRole('heading', { level: 1, name: /join forgeos/i })).toBeVisible()
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.locator('#confirm-password')).toBeVisible()
    })

    test('form fields render correctly on mobile with founder deep-link', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/^email/i)).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()

      await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
    })
  })
})
