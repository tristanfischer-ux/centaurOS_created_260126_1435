import { test, expect } from '@playwright/test'
import { FOUNDER_STORAGE, dismissOnboarding } from './auth-storage'

/**
 * Targeted test: Create a task end-to-end.
 *
 * This test authenticates as the Founder persona, navigates to the tasks
 * page, opens the create-task dialog, fills in required fields (title,
 * assignee, objective), submits, and verifies success.
 */
test.describe('Create Task — End-to-End', () => {
  test.use({ storageState: FOUNDER_STORAGE })

  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('creates a task successfully', async ({ page }) => {
    // 1. Navigate to the tasks page
    await page.goto('/new-tasks')
    await page.waitForLoadState('networkidle')

    // 2. Capture any console errors for diagnostics
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[CONSOLE ERROR] ${msg.text()}`)
      }
    })

    // Also capture failed network requests
    const failedRequests: string[] = []
    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push(`[${response.status()}] ${response.url()}`)
      }
    })

    // 3. Find and click "New Task" button
    const newTaskBtn = page.getByRole('button', { name: /new task/i }).first()
    await expect(newTaskBtn).toBeVisible({ timeout: 15_000 })
    await newTaskBtn.click()

    // 4. Verify dialog is open
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5_000 })

    // 5. Fill in the title
    const titleInput = dialog.locator('input[name="title"]')
    await expect(titleInput).toBeVisible({ timeout: 5_000 })
    await titleInput.fill(`E2E test task — ${Date.now()}`)

    // 6. Check if assignee is already pre-selected (should default to current user)
    // The dialog defaults selectedAssignees to [currentUserId], so it should be set

    // 7. Select an objective — click the combobox button
    const objectiveBtn = dialog.getByRole('combobox', { name: /select an objective/i })
    if (await objectiveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await objectiveBtn.click()
      // Wait for the popover list to appear and select the first item
      const firstObjective = page.getByRole('option').first()
      await expect(firstObjective).toBeVisible({ timeout: 5_000 })
      await firstObjective.click()
      // Wait for popover to close
      await page.waitForTimeout(500)
    } else {
      // If no combobox, check if objective is already pre-selected via default
      console.log('No objective combobox found — might be pre-selected or no objectives exist')
    }

    // 8. Submit the form
    const createBtn = dialog.getByRole('button', { name: /create task/i })
    await expect(createBtn).toBeEnabled({ timeout: 3_000 })
    await createBtn.click()

    // 9. Wait for result — either success toast or error
    // Give it up to 15 seconds for the server action to complete
    const successToast = page.getByText(/task created/i)
    const errorAlert = dialog.locator('[role="alert"]')

    // Wait for either success or error
    const result = await Promise.race([
      successToast.waitFor({ timeout: 15_000 }).then(() => 'success'),
      errorAlert.waitFor({ timeout: 15_000 }).then(() => 'error'),
      page.waitForTimeout(15_000).then(() => 'timeout'),
    ])

    // Print diagnostics
    if (consoleErrors.length > 0) {
      console.log('\n=== Console Errors ===')
      consoleErrors.forEach(e => console.log(e))
    }
    if (failedRequests.length > 0) {
      console.log('\n=== Failed Requests ===')
      failedRequests.forEach(r => console.log(r))
    }

    if (result === 'error') {
      const errorText = await errorAlert.textContent()
      console.log(`\n=== TASK CREATION ERROR ===\n${errorText}`)
      // Fail the test with the actual error message
      expect(result, `Task creation failed with: ${errorText}`).toBe('success')
    }

    if (result === 'timeout') {
      console.log('\n=== TIMEOUT ===')
      console.log('Task creation neither succeeded nor showed an error within 15s')
      // Take a screenshot for diagnostics
      await page.screenshot({ path: 'test-results/create-task-timeout.png' })
      expect(result, 'Task creation timed out with no response').toBe('success')
    }

    // If we got here with 'success', verify dialog closed
    expect(result).toBe('success')
    await expect(dialog).not.toBeVisible({ timeout: 5_000 })

    console.log('\n✅ Task created successfully!')
  })
})
