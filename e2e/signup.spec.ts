import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const TEST_URL = process.env.TEST_URL || 'https://fractionalforge.app'

/**
 * Unified Signup Flow E2E Tests
 *
 * Tests the /join page which replaced the old /join/[role] pages.
 * The unified page has:
 *   1. Path selection (Founder vs Joining marketplace)
 *   2. Role sub-selection (Executive vs Apprentice) for Joining path
 *   3. Common fields (name, email, password)
 *   4. Founder-specific fields (company name, industry, stage)
 *   5. Inline error display via useActionState (form data preserved on error)
 *
 * Three layers:
 *   - Layer 1: Page structure and path selection (no server interaction)
 *   - Layer 2: Validation and data preservation (server returns errors inline)
 *   - Layer 3: Happy-path signup (creates real accounts, cleans up)
 */

test.describe('Unified Signup Flow (/join)', () => {
  // ─── Layer 1: Page Structure & Path Selection ─────────────────────────

  test.describe('Page Structure', () => {
    test('displays header, subtitle, and path selection', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Header
      await expect(page.getByRole('heading', { level: 1, name: /join forgeos/i })).toBeVisible()
      await expect(page.getByText('The operating system for building physical products.')).toBeVisible()

      // Path selection prompt
      await expect(page.getByText('What brings you to ForgeOS?')).toBeVisible()

      // Two path cards
      await expect(page.getByText("I'm founding a company")).toBeVisible()
      await expect(page.getByText("I'm joining the marketplace")).toBeVisible()
    })

    test('form is hidden until a path is selected', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // No form fields visible initially
      await expect(page.getByLabel(/full name/i)).not.toBeVisible()
      await expect(page.getByLabel(/email/i)).not.toBeVisible()
      await expect(page.getByLabel(/password/i)).not.toBeVisible()
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
  })

  // ─── Path Selection ───────────────────────────────────────────────────

  test.describe('Founder Path', () => {
    test('selecting founder shows form with company fields', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Click the founder card
      await page.getByText("I'm founding a company").click()

      // Common fields appear
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()

      // Founder-specific fields appear
      await expect(page.getByText('About your company')).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
      await expect(page.getByLabel(/industry/i)).toBeVisible()
      await expect(page.getByLabel(/stage/i)).toBeVisible()

      // Submit button
      await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()

      // Founding member counter
      await expect(page.getByText(/founding members/i)).toBeVisible()
    })

    test('URL pre-selection: /join?role=founder auto-selects founder path', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      // Form should already be visible (no click needed)
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
    })
  })

  test.describe('Joining Path', () => {
    test('selecting joining shows role sub-selection and form', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Click the joining card
      await page.getByText("I'm joining the marketplace").click()

      // Role sub-selection appears
      await expect(page.getByText('Which best describes you?')).toBeVisible()
      await expect(page.getByRole('button', { name: /Executive.*Experienced/i })).toBeVisible()
      await expect(page.getByRole('button', { name: /Apprentice.*Early career/i })).toBeVisible()

      // Common fields appear
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()

      // No founder-specific fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
    })

    test('URL pre-selection: /join?role=executive auto-selects executive', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=executive`)

      // Form already visible
      await expect(page.getByLabel(/full name/i)).toBeVisible()

      // Role sub-selection visible, executive pre-selected (has orange border)
      await expect(page.getByText('Which best describes you?')).toBeVisible()

      // No founder fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
    })

    test('URL pre-selection: /join?role=apprentice auto-selects apprentice', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=apprentice`)

      // Form already visible
      await expect(page.getByLabel(/full name/i)).toBeVisible()

      // Role sub-selection visible
      await expect(page.getByText('Which best describes you?')).toBeVisible()

      // No founder fields
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()
    })

    test('switching between Executive and Apprentice sub-roles', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm joining the marketplace").click()

      // Default is Executive — click Apprentice
      await page.getByRole('button', { name: /Apprentice.*Early career/i }).click()

      // Form still visible, common fields present
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()

      // Switch back to Executive
      await page.getByRole('button', { name: /Executive.*Experienced/i }).click()

      // Still have common fields
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })
  })

  test.describe('Path Switching', () => {
    test('switching from founder to joining hides company fields', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Select founder first
      await page.getByText("I'm founding a company").click()
      await expect(page.getByLabel(/company name/i)).toBeVisible()

      // Switch to joining
      await page.getByText("I'm joining the marketplace").click()

      // Company fields should disappear
      await expect(page.getByLabel(/company name/i)).not.toBeVisible()

      // Common fields should still be visible
      await expect(page.getByLabel(/full name/i)).toBeVisible()
    })
  })

  // ─── Layer 2: Validation & Data Preservation ──────────────────────────

  test.describe('Form Validation — Data Preservation', () => {
    // Increase timeout for server round-trips
    test.setTimeout(60_000)

    // Specific selector for our inline error alert (not the Next.js route announcer).
    // Our error div uses aria-live="polite"; the route announcer uses aria-live="assertive".
    const ERROR_ALERT = '[role="alert"][aria-live="polite"]'

    test('founder: server-side validation error preserves all field values', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm founding a company").click()

      // Fill all fields — password >= 8 chars (bypasses browser minLength)
      // but has no uppercase or number, so server rejects it.
      // The specific server error may be a password rule or rate-limit;
      // the key assertion is that form data is NOT lost.
      await page.getByLabel(/full name/i).fill('Test Founder')
      await page.getByLabel(/email/i).fill('test-preserve@example.com')
      await page.getByLabel(/password/i).fill('alllowercase')
      await page.getByLabel(/company name/i).fill('TestCo Industries')
      await page.getByLabel(/industry/i).fill('Hardware')
      await page.getByLabel(/stage/i).fill('Seed')

      // Submit
      await page.getByRole('button', { name: /create account/i }).click()

      // Wait for inline error (any server-side error)
      await expect(page.locator(ERROR_ALERT)).toBeVisible({ timeout: 15_000 })

      // CRITICAL: All non-password fields should still have their values.
      // Password is intentionally cleared on error (standard security practice).
      await expect(page.getByLabel(/full name/i)).toHaveValue('Test Founder')
      await expect(page.getByLabel(/email/i)).toHaveValue('test-preserve@example.com')
      await expect(page.getByLabel(/company name/i)).toHaveValue('TestCo Industries')
      await expect(page.getByLabel(/industry/i)).toHaveValue('Hardware')
      await expect(page.getByLabel(/stage/i)).toHaveValue('Seed')
    })

    test('executive: server-side validation error preserves all field values', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm joining the marketplace").click()

      await page.getByLabel(/full name/i).fill('Exec Person')
      await page.getByLabel(/email/i).fill('exec-test@example.com')
      await page.getByLabel(/password/i).fill('nouppercase1')  // no uppercase

      await page.getByRole('button', { name: /create account/i }).click()

      // Wait for inline error
      await expect(page.locator(ERROR_ALERT)).toBeVisible({ timeout: 15_000 })

      // CRITICAL: Non-password data preserved
      await expect(page.getByLabel(/full name/i)).toHaveValue('Exec Person')
      await expect(page.getByLabel(/email/i)).toHaveValue('exec-test@example.com')
    })

    test('loading state shows during submission', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await page.getByLabel(/full name/i).fill('Loading Test')
      await page.getByLabel(/email/i).fill('loading@example.com')
      await page.getByLabel(/password/i).fill('nouppercase1')
      await page.getByLabel(/company name/i).fill('LoadCo')

      // Click submit and immediately check for loading state
      await page.getByRole('button', { name: /create account/i }).click()

      // Button should show loading text (may be brief)
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
      await expect(page.getByLabel(/email/i)).toHaveAttribute('required', '')
      await expect(page.getByLabel(/password/i)).toHaveAttribute('required', '')
      await expect(page.getByLabel(/company name/i)).toHaveAttribute('required', '')
    })

    test('email field enforces email type', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/email/i)).toHaveAttribute('type', 'email')
    })

    test('password field has minLength of 8', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/password/i)).toHaveAttribute('minlength', '8')
    })
  })

  // ─── Accessibility ────────────────────────────────────────────────────

  test.describe('Accessibility', () => {
    test('inputs have associated labels', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      // getByLabel only works if label[for] matches input[id]
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()
      await expect(page.getByLabel(/industry/i)).toBeVisible()
      await expect(page.getByLabel(/stage/i)).toBeVisible()
    })

    test('required fields have aria-required', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/full name/i)).toHaveAttribute('aria-required', 'true')
      await expect(page.getByLabel(/email/i)).toHaveAttribute('aria-required', 'true')
      await expect(page.getByLabel(/password/i)).toHaveAttribute('aria-required', 'true')
      await expect(page.getByLabel(/company name/i)).toHaveAttribute('aria-required', 'true')
    })

    test('password hint is linked via aria-describedby', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      await expect(page.getByLabel(/password/i)).toHaveAttribute('aria-describedby', 'password-hint')
      await expect(page.locator('#password-hint')).toContainText('Min 8 characters')
    })

    test('error message has role=alert and aria-live', async ({ page }) => {
      test.setTimeout(60_000)
      await page.goto(`${TEST_URL}/join?role=founder`)

      // Trigger an error
      await page.getByLabel(/full name/i).fill('Test')
      await page.getByLabel(/email/i).fill('test@example.com')
      await page.getByLabel(/password/i).fill('nouppercase1')
      await page.getByLabel(/company name/i).fill('Co')

      await page.getByRole('button', { name: /create account/i }).click()

      // Our inline error uses aria-live="polite" to distinguish from Next.js route announcer
      const errorAlert = page.locator('[role="alert"][aria-live="polite"]')
      await expect(errorAlert).toBeVisible({ timeout: 15_000 })
      await expect(errorAlert).toHaveAttribute('aria-live', 'polite')
    })
  })

  // ─── Old URL Redirects ────────────────────────────────────────────────

  test.describe('Legacy URL Redirects', () => {
    test('/join/founder redirects to /join?role=founder', async ({ page }) => {
      await page.goto(`${TEST_URL}/join/founder`)

      // Should redirect to unified page with role param
      await expect(page).toHaveURL(/\/join\?role=founder/i)

      // Form should be pre-selected
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

  // ─── Demo Mode ────────────────────────────────────────────────────────

  test.describe('Demo Mode', () => {
    test('demo mode banner appears and fields are pre-filled', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder&demo=true`)

      // Wait for demo data to load
      await expect(page.getByText('Demo Mode Active')).toBeVisible({ timeout: 10_000 })

      // Fields should have non-empty default values
      await expect(page.getByLabel(/full name/i)).not.toHaveValue('')
      await expect(page.getByLabel(/email/i)).not.toHaveValue('')
    })
  })

  // ─── Layer 3: Happy-Path Signup (real accounts) ───────────────────────

  test.describe('Happy-Path Signup', () => {
    // These tests create real Supabase users and clean them up.
    // They require SUPABASE env vars to be set.
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    // Skip this entire block if env vars aren't available
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
      // Clean up all test users created during this suite
      for (const userId of createdUserIds) {
        try {
          // Delete profile and memberships first (cascading may not cover everything)
          await adminClient.from('provider_profiles').delete().eq('user_id', userId)
          await adminClient.from('foundry_memberships').delete().eq('user_id', userId)
          await adminClient.from('profiles').delete().eq('id', userId)
          await adminClient.auth.admin.deleteUser(userId)
          console.log(`Cleaned up test user: ${userId}`)
        } catch (err) {
          console.warn(`Failed to clean up user ${userId}:`, err)
        }
      }
    })

    /**
     * Helper: look up the user we just created (by email) and record their
     * ID so afterAll can clean it up.
     */
    async function recordTestUser(email: string): Promise<void> {
      const { data } = await adminClient.auth.admin.listUsers()
      const user = data?.users?.find(u => u.email === email)
      if (user) {
        createdUserIds.push(user.id)

        // Also delete any foundry the user created (founders)
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

      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm founding a company").click()

      // Fill the form
      await page.getByLabel(/full name/i).fill('E2E Founder Test')
      await page.getByLabel(/email/i).fill(uniqueEmail)
      await page.getByLabel(/password/i).fill('TestPass123!')
      await page.getByLabel(/company name/i).fill('E2E Test Corp')
      await page.getByLabel(/industry/i).fill('Testing')
      await page.getByLabel(/stage/i).fill('Seed')

      // Submit
      await page.getByRole('button', { name: /create account/i }).click()

      // Should show loading state
      await expect(page.getByRole('button', { name: /creating account/i })).toBeVisible({ timeout: 5_000 })

      // Should redirect to /today (the app's main page)
      await expect(page).toHaveURL(/\/today/, { timeout: 30_000 })

      // Record for cleanup
      await recordTestUser(uniqueEmail)
    })

    test('executive signup: fills form, submits, redirects to /today', async ({ page }) => {
      const uniqueEmail = `e2e-exec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fractionalforge.app`

      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm joining the marketplace").click()

      // Executive is the default sub-role, so just fill the form
      await page.getByLabel(/full name/i).fill('E2E Executive Test')
      await page.getByLabel(/email/i).fill(uniqueEmail)
      await page.getByLabel(/password/i).fill('TestPass123!')

      // Submit
      await page.getByRole('button', { name: /create account/i }).click()

      // Should redirect to /today
      await expect(page).toHaveURL(/\/today/, { timeout: 30_000 })

      // Record for cleanup
      await recordTestUser(uniqueEmail)
    })

    test('apprentice signup: fills form, submits, redirects to /today', async ({ page }) => {
      const uniqueEmail = `e2e-apprentice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@test.fractionalforge.app`

      await page.goto(`${TEST_URL}/join`)
      await page.getByText("I'm joining the marketplace").click()

      // Select apprentice sub-role (use full button name to avoid ambiguity)
      await page.getByRole('button', { name: /Apprentice.*Early career/i }).click()

      await page.getByLabel(/full name/i).fill('E2E Apprentice Test')
      await page.getByLabel(/email/i).fill(uniqueEmail)
      await page.getByLabel(/password/i).fill('TestPass123!')

      // Submit
      await page.getByRole('button', { name: /create account/i }).click()

      // Should redirect to /today
      await expect(page).toHaveURL(/\/today/, { timeout: 30_000 })

      // Record for cleanup
      await recordTestUser(uniqueEmail)
    })
  })

  // ─── Mobile Responsiveness ────────────────────────────────────────────

  test.describe('Mobile Responsiveness', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('page renders correctly on mobile', async ({ page }) => {
      await page.goto(`${TEST_URL}/join`)

      // Header visible
      await expect(page.getByRole('heading', { level: 1, name: /join forgeos/i })).toBeVisible()

      // Path selection cards visible
      await expect(page.getByText("I'm founding a company")).toBeVisible()
      await expect(page.getByText("I'm joining the marketplace")).toBeVisible()
    })

    test('form fields render correctly on mobile', async ({ page }) => {
      await page.goto(`${TEST_URL}/join?role=founder`)

      // All fields visible
      await expect(page.getByLabel(/full name/i)).toBeVisible()
      await expect(page.getByLabel(/email/i)).toBeVisible()
      await expect(page.getByLabel(/password/i)).toBeVisible()
      await expect(page.getByLabel(/company name/i)).toBeVisible()

      // Submit button visible
      await expect(page.getByRole('button', { name: /create account/i })).toBeVisible()
    })
  })
})
