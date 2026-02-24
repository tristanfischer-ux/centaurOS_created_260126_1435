import { test, expect, type Page } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Outreach Feature — End-to-End Tests
 *
 * Tests the full outreach workflow: create campaign, add contacts,
 * manage knowledge base, research contacts, and generate email sequences.
 *
 * Uses the Founder persona (has foundry_id) and runs against the real backend,
 * except for SSE streaming which is mocked.
 */

test.use({ storageState: FOUNDER_STORAGE })

// ─── Helpers ──────────────────────────────────────────────────────────

/** Build a mock SSE stream body for the /api/outreach/generate endpoint. */
function buildMockStream(
    chunks: Array<{ text?: string; done?: boolean; emailCount?: number; error?: string }>
): string {
    return chunks.map(c => `data: ${JSON.stringify(c)}\n\n`).join('')
}

/** Shared campaign URL captured after creation. */
let campaignUrl = ''

// ─── 1. Campaign List & Create Wizard ─────────────────────────────────

test.describe.serial('Outreach — Campaign List & Create Wizard', () => {
    test.beforeEach(async ({ page }) => {
        await dismissOnboarding(page)
    })

    test('renders outreach hub with heading and New Campaign button', async ({ page }) => {
        await page.goto('/outreach')
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid — run: npx playwright test --project=auth-setup')
            return
        }

        await expect(page.getByRole('heading', { name: /outreach/i })).toBeVisible({ timeout: 15_000 })
        await expect(page.getByRole('button', { name: /new campaign/i }).first()).toBeVisible()
    })

    test('2-step wizard: fill basics, review, create campaign', async ({ page }) => {
        await page.goto('/outreach')
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Open wizard
        const newBtn = page.getByRole('button', { name: /new campaign/i }).first()
        await expect(newBtn).toBeVisible({ timeout: 15_000 })
        await newBtn.click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByText('Create Campaign')).toBeVisible()

        // Step 1: Basics
        const nameInput = dialog.locator('#campaign-name')
        await expect(nameInput).toBeVisible()

        const campaignName = `E2E Campaign — ${Date.now()}`
        await nameInput.fill(campaignName)

        // Next button should be enabled now
        const nextBtn = dialog.getByRole('button', { name: /next/i })
        await expect(nextBtn).toBeEnabled()
        await nextBtn.click()

        // Step 2: Review — verify summary
        await expect(dialog.getByText(campaignName)).toBeVisible({ timeout: 3_000 })
        await expect(dialog.getByText(/professional/i)).toBeVisible()
        await expect(dialog.getByText(/4 emails/i)).toBeVisible()

        // Submit
        const createBtn = dialog.getByRole('button', { name: /create campaign/i })
        await expect(createBtn).toBeEnabled()
        await createBtn.click()

        // Wait for success or error
        const successToast = page.getByText(/campaign created/i)
        const errorAlert = dialog.locator('[role="alert"]')

        const result = await Promise.race([
            successToast.waitFor({ timeout: 15_000 }).then(() => 'success'),
            errorAlert.waitFor({ timeout: 15_000 }).then(() => 'error'),
            page.waitForTimeout(15_000).then(() => 'timeout'),
        ])

        if (result === 'error') {
            const errorText = await errorAlert.textContent()
            expect(result, `Campaign creation failed: ${errorText}`).toBe('success')
        }
        if (result === 'timeout') {
            await page.screenshot({ path: 'test-results/outreach-create-timeout.png' })
            expect(result, 'Campaign creation timed out').toBe('success')
        }

        expect(result).toBe('success')

        // Should redirect to campaign detail
        await page.waitForURL(/\/outreach\//, { timeout: 10_000 })
        campaignUrl = page.url()

        console.log(`\nCampaign created at: ${campaignUrl}`)
    })

    test('wizard validates: Next disabled when name empty', async ({ page }) => {
        await page.goto('/outreach')
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        const newBtn = page.getByRole('button', { name: /new campaign/i }).first()
        await expect(newBtn).toBeVisible({ timeout: 15_000 })
        await newBtn.click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })

        const nextBtn = dialog.getByRole('button', { name: /next/i })
        const nameInput = dialog.locator('#campaign-name')

        // Initially empty — Next disabled
        await expect(nextBtn).toBeDisabled()

        // Type a name — Next enabled
        await nameInput.fill('Test')
        await expect(nextBtn).toBeEnabled()

        // Clear — Next disabled again
        await nameInput.clear()
        await expect(nextBtn).toBeDisabled()

        // Close dialog
        await dialog.getByRole('button', { name: /cancel/i }).click()
    })
})

// ─── 2. Campaign Detail — Tabs & Contacts ────────────────────────────

test.describe.serial('Outreach — Campaign Detail & Contacts', () => {
    test.beforeEach(async ({ page }) => {
        await dismissOnboarding(page)
    })

    test('campaign detail shows 4 tabs and back link', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL — run create test first')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Back link
        await expect(page.getByRole('link', { name: /all campaigns/i })).toBeVisible({ timeout: 15_000 })

        // 4 tabs
        await expect(page.getByRole('tab', { name: /contacts/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /emails/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /knowledge/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /settings/i })).toBeVisible()
    })

    test('add contact via dialog', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Click "Add" or "Add Contact" button
        const addBtn = page.getByRole('button', { name: /add contact|^add$/i }).first()
        await expect(addBtn).toBeVisible({ timeout: 15_000 })
        await addBtn.click()

        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByText('Add Contact')).toBeVisible()

        // Fill required fields
        await dialog.locator('#first-name').fill('Jane')
        await dialog.locator('#last-name').fill('Smith')
        await dialog.locator('#company').fill('Acme Corp')
        await dialog.locator('#email').fill(`jane+${Date.now()}@acme.com`)
        await dialog.locator('#title').fill('VP Engineering')

        // Submit
        const submitBtn = dialog.getByRole('button', { name: /add contact/i })
        await expect(submitBtn).toBeEnabled()
        await submitBtn.click()

        // Wait for result
        const successToast = page.getByText(/contact added/i)
        const errorToast = page.getByText(/required|error|failed/i)

        const result = await Promise.race([
            successToast.waitFor({ timeout: 15_000 }).then(() => 'success'),
            errorToast.waitFor({ timeout: 15_000 }).then(() => 'error'),
            page.waitForTimeout(15_000).then(() => 'timeout'),
        ])

        expect(result, 'Add contact should succeed').toBe('success')
        console.log('\nContact added successfully')
    })

    test('contact name click opens detail dialog', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Wait for table to render with the added contact
        const contactName = page.locator('td button').filter({ hasText: /jane/i }).first()

        // If no contacts visible, skip
        if (!(await contactName.isVisible({ timeout: 10_000 }).catch(() => false))) {
            test.skip(true, 'No contacts visible — add contact test may have failed')
            return
        }

        await contactName.click()

        // Detail dialog should open
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })

        // Should show contact name
        await expect(dialog.getByText(/jane/i).first()).toBeVisible()

        // Should have action buttons
        await expect(dialog.getByRole('button', { name: /research/i }).first()).toBeVisible()

        // Close
        const closeBtn = dialog.getByRole('button', { name: /close/i })
        if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await closeBtn.click()
        } else {
            await page.keyboard.press('Escape')
        }

        console.log('\nContact detail dialog verified')
    })
})

// ─── 3. Knowledge Base Tab ───────────────────────────────────────────

test.describe.serial('Outreach — Knowledge Base Tab', () => {
    test.beforeEach(async ({ page }) => {
        await dismissOnboarding(page)
    })

    test('shows empty state and adds KB entry', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Switch to Knowledge tab
        const kbTab = page.getByRole('tab', { name: /knowledge/i })
        await expect(kbTab).toBeVisible({ timeout: 15_000 })
        await kbTab.click()

        // Wait for tab content to load
        await page.waitForTimeout(500)

        // Click "Add Entry" or "Add First Entry" button
        const addBtn = page.getByRole('button', { name: /add.*entry/i }).first()
        await expect(addBtn).toBeVisible({ timeout: 5_000 })
        await addBtn.click()

        // Dialog
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })

        // Fill title and content
        await dialog.locator('#kb-title').fill('E2E Product Overview')
        await dialog.locator('#kb-content').fill('ForgeOS helps fractional teams collaborate with their clients on product engineering, design, and manufacturing tasks.')

        // Submit
        const submitBtn = dialog.getByRole('button', { name: /add entry/i })
        await submitBtn.click()

        // Wait for result
        const successToast = page.getByText(/entry added/i)
        const result = await Promise.race([
            successToast.waitFor({ timeout: 15_000 }).then(() => 'success'),
            page.waitForTimeout(15_000).then(() => 'timeout'),
        ])

        expect(result, 'Add KB entry should succeed').toBe('success')
        console.log('\nKB entry added successfully')
    })

    test('edit KB entry pre-fills and saves', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Switch to Knowledge tab
        await page.getByRole('tab', { name: /knowledge/i }).click()
        await page.waitForTimeout(500)

        // Find and click the edit (pencil) button
        const editBtn = page.getByRole('button', { name: /edit/i }).first()

        if (!(await editBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
            test.skip(true, 'No KB entries to edit — add test may have failed')
            return
        }

        await editBtn.click()

        // Dialog should open in edit mode
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByText('Edit Entry')).toBeVisible()

        // Title should be pre-filled
        const titleInput = dialog.locator('#kb-title')
        await expect(titleInput).toHaveValue(/e2e product overview/i)

        // Modify title
        await titleInput.clear()
        await titleInput.fill('Updated E2E Product Overview')

        // Save
        const saveBtn = dialog.getByRole('button', { name: /save changes/i })
        await saveBtn.click()

        const successToast = page.getByText(/entry updated/i)
        const result = await Promise.race([
            successToast.waitFor({ timeout: 15_000 }).then(() => 'success'),
            page.waitForTimeout(15_000).then(() => 'timeout'),
        ])

        expect(result, 'Edit KB entry should succeed').toBe('success')
        console.log('\nKB entry edited successfully')
    })
})

// ─── 4. Research Contacts Dialog ─────────────────────────────────────

test.describe.serial('Outreach — Research Contacts', () => {
    test.beforeEach(async ({ page }) => {
        await dismissOnboarding(page)
    })

    test('research dialog shows progress and completes', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        // Generous timeout — real AI calls
        test.setTimeout(120_000)

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Wait for contacts to load
        await page.waitForTimeout(1_000)

        // Click "Research All" button (visible when no contacts are selected)
        const researchBtn = page.getByRole('button', { name: /research all/i })

        if (!(await researchBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
            test.skip(true, 'No Research All button — contacts may not exist')
            return
        }

        await researchBtn.click()

        // Research dialog
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByText('Research Contacts')).toBeVisible()

        // Click the research action button
        const startBtn = dialog.getByRole('button', { name: /research.*contact/i })
        await expect(startBtn).toBeVisible()
        await startBtn.click()

        // Wait for completion — AI calls can be slow
        const doneBtn = dialog.getByRole('button', { name: /done/i })
        await expect(doneBtn).toBeVisible({ timeout: 90_000 })

        // Check for success or failure messages
        const successMsg = dialog.getByText(/researched successfully/i)
        const failMsg = dialog.getByText(/failed/i)

        const hasSuccess = await successMsg.isVisible().catch(() => false)
        const hasFail = await failMsg.isVisible().catch(() => false)

        console.log(`\nResearch complete — success: ${hasSuccess}, failures: ${hasFail}`)

        // Close
        await doneBtn.click()
        await expect(dialog).not.toBeVisible({ timeout: 5_000 })
    })
})

// ─── 5. Generate Sequences — SSE Streaming ──────────────────────────

test.describe.serial('Outreach — Generate Sequences (SSE)', () => {
    test.beforeEach(async ({ page }) => {
        await dismissOnboarding(page)
    })

    test('generate dialog streams text and shows progress (mocked SSE)', async ({ page }) => {
        test.skip(!campaignUrl, 'No campaign URL')

        await page.goto(campaignUrl)
        await page.waitForLoadState('networkidle')

        if (page.url().includes('/login')) {
            test.skip(true, 'Auth state invalid')
            return
        }

        // Mock the SSE endpoint to avoid real AI calls
        await page.route('**/api/outreach/generate', async (route) => {
            if (route.request().method() === 'POST') {
                await route.fulfill({
                    status: 200,
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                    },
                    body: buildMockStream([
                        { text: 'Subject: Quick question about your engineering team\n\n' },
                        { text: 'Hi Jane,\n\nI noticed Acme Corp recently expanded...' },
                        { text: '\n\nWould love to chat about how we can help.\n\nBest,\nTest' },
                        { done: true, emailCount: 4 },
                    ]),
                })
            } else {
                await route.continue()
            }
        })

        // Wait for contacts table
        await page.waitForTimeout(1_000)

        // Click "Generate All"
        const genBtn = page.getByRole('button', { name: /generate all/i })

        if (!(await genBtn.isVisible({ timeout: 5_000 }).catch(() => false))) {
            test.skip(true, 'No Generate All button — contacts may not exist')
            return
        }

        await genBtn.click()

        // Generate dialog
        const dialog = page.getByRole('dialog')
        await expect(dialog).toBeVisible({ timeout: 5_000 })
        await expect(dialog.getByText('Generate Email Sequences')).toBeVisible()

        // Verify summary info
        await expect(dialog.getByText(/contacts/i).first()).toBeVisible()
        await expect(dialog.getByText(/emails per contact/i)).toBeVisible()

        // Click "Generate" button
        const generateBtn = dialog.getByRole('button', { name: /^generate$/i })
        await expect(generateBtn).toBeVisible()
        await generateBtn.click()

        // Should show progress
        await expect(dialog.getByText(/generating/i)).toBeVisible({ timeout: 5_000 })

        // Wait for done
        const doneBtn = dialog.getByRole('button', { name: /done/i })
        await expect(doneBtn).toBeVisible({ timeout: 30_000 })

        // Check for success message
        const successMsg = dialog.getByText(/generated successfully/i)
        const hasSuccess = await successMsg.isVisible().catch(() => false)
        console.log(`\nGeneration complete — success message visible: ${hasSuccess}`)

        // Close
        await doneBtn.click()
        await expect(dialog).not.toBeVisible({ timeout: 5_000 })
    })
})
