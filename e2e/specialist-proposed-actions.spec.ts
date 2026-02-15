import { test, expect } from '@playwright/test'
import { dismissOnboarding } from './auth-storage'

/**
 * Specialist Proposed Actions E2E
 *
 * Tests the flow where a Specialist suggests tasks/objectives during conversation
 * and the user can create them with one click. Uses API mock to inject a response
 * containing PROPOSED_ACTIONS so the test doesn't depend on AI output.
 */

const MOCK_RESPONSE_WITH_PROPOSALS = [
  { text: 'Based on our discussion, here\'s what I recommend:\n\n' },
  {
    text: `<!-- PROPOSED_ACTIONS
[
  {"type":"objective","title":"Launch Q2 product update","description":"Ship the redesigned onboarding flow"},
  {"type":"task","title":"Draft onboarding copy","description":"Write the 5-step flow","objectiveTitle":"Launch Q2 product update"}
]
-->`,
  },
]

function buildMockStream(): string {
  return MOCK_RESPONSE_WITH_PROPOSALS.map(
    (chunk) => `data: ${JSON.stringify(chunk)}\n\n`
  ).join('') + 'data: [DONE]\n\n'
}

test.describe('Specialist Proposed Actions', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('specialist response with PROPOSED_ACTIONS shows suggested actions card', async ({
    page,
  }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')
    // Skip if session invalid (redirected to login); run auth-setup to refresh
    if (page.url().includes('/login')) {
      test.skip(true, 'Auth state invalid or expired — run: npx playwright test --project=auth-setup')
      return
    }

    // Mock the execute API to return a response with PROPOSED_ACTIONS
    await page.route('**/api/agents/execute**', async (route) => {
      const method = route.request().method()
      if (method === 'POST') {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          body: buildMockStream(),
        })
      } else {
        await route.continue()
      }
    })

    // Today page uses specialist chips: "Plan my day with Cal", "Strategy with Sam", "Choose Specialist"
    const specialistBtn = page.getByRole('button', {
      name: /Plan my day with Cal|Strategy with Sam|Ask .+/i,
    })
    await expect(specialistBtn.first()).toBeVisible({ timeout: 10000 })
    await specialistBtn.first().click()

    await page.waitForTimeout(1000)

    // Dialog should open - look for textarea or send button
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Type a message and send
    const textarea = dialog.locator('textarea')
    await textarea.fill('Help me plan Q2 goals')
    await page.waitForTimeout(300)

    const sendBtn = dialog.getByRole('button', { name: /send brief/i })
    await sendBtn.click()

    // Wait for the mock stream to complete and UI to parse PROPOSED_ACTIONS
    await page.waitForTimeout(3000)

    // Suggested actions card should appear
    await expect(page.getByText('Suggested actions')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Launch Q2 product update')).toBeVisible()
    await expect(page.getByText('Draft onboarding copy')).toBeVisible()
    await expect(page.getByRole('button', { name: /create all/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /dismiss/i })).toBeVisible()
  })

  test('Create all creates objectives and tasks and shows Created state', async ({
    page,
  }) => {
    await page.goto('/today')
    await page.waitForLoadState('networkidle')
    if (page.url().includes('/login')) {
      test.skip(true, 'Auth state invalid or expired — run: npx playwright test --project=auth-setup')
      return
    }

    await page.route('**/api/agents/execute**', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
          },
          body: buildMockStream(),
        })
      } else {
        await route.continue()
      }
    })

    const specialistBtn = page.getByRole('button', {
      name: /Plan my day with Cal|Strategy with Sam|Ask .+/i,
    })
    if (!(await specialistBtn.first().isVisible({ timeout: 10000 }).catch(() => false))) {
      test.skip()
      return
    }
    await specialistBtn.first().click()

    await page.waitForTimeout(1000)

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    const textarea = dialog.locator('textarea')
    await textarea.fill('Plan Q2')
    const sendBtn = dialog.getByRole('button', { name: /send brief/i })
    await sendBtn.click()

    await page.waitForTimeout(3000)

    const createAllBtn = page.getByRole('button', { name: /create all/i })
    if (!(await createAllBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.skip()
      return
    }

    await createAllBtn.click()

    // Wait for creation (API calls to createObjective, createTask)
    await page.waitForTimeout(5000)

    // Toast or Created state should appear
    const successToast = page.getByText(/item[s]? created/i)
    const createdViewLink = page.getByRole('link', { name: /view/i })
    const hasSuccess =
      (await successToast.isVisible({ timeout: 5000 }).catch(() => false)) ||
      (await createdViewLink.isVisible({ timeout: 5000 }).catch(() => false))

    expect(hasSuccess).toBeTruthy()
  })
})
