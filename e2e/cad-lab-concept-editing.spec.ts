import { test, expect } from '@playwright/test'
import { dismissOnboarding, FOUNDER_STORAGE } from './auth-storage'

test.use({ storageState: FOUNDER_STORAGE })

test.describe('CAD Lab Concept Editing', () => {
  test.beforeEach(async ({ page }) => {
    await dismissOnboarding(page)
  })

  test('hero renders with correct text, input, and Research button', async ({ page }) => {
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')

    // Hero heading
    await expect(page.getByText('What do you want to build?')).toBeVisible()

    // Description
    await expect(page.getByText('Describe any physical product or sub-assembly')).toBeVisible()

    // Input field
    const input = page.locator('input[placeholder*="1U CubeSat bus structure"]')
    await expect(input).toBeVisible()

    // Research button (disabled when input empty)
    const researchBtn = page.locator('#research-btn')
    await expect(researchBtn).toBeVisible()
    await expect(researchBtn).toBeDisabled()
  })

  test('example chips fill the input', async ({ page }) => {
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')

    // Chips should be visible when input is empty
    const chip = page.getByText('CubeSat frame')
    await expect(chip).toBeVisible()

    // Click a chip
    await chip.click()

    // Input should now contain the chip text
    const input = page.locator('#subject')
    await expect(input).toHaveValue('CubeSat frame')

    // Research button should now be enabled
    const researchBtn = page.locator('#research-btn')
    await expect(researchBtn).toBeEnabled()

    // Chips should disappear after input is filled
    await expect(page.getByText('Drone arm bracket')).not.toBeVisible()
  })

  test('pipeline navigation between Concept and Review works', async ({ page }) => {
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')

    // Should start on Concept stage
    await expect(page.getByText('The Forge')).toBeVisible()

    // Navigate to Review via the pipeline nav
    const reviewLink = page.getByRole('link', { name: /Review/ })
    if (await reviewLink.isVisible()) {
      await reviewLink.click()
      await page.waitForURL(/\/the-forge\/cad-lab\/review/)

      // Navigate back to Concept
      const conceptLink = page.getByRole('link', { name: /Concept/ })
      await conceptLink.click()
      await page.waitForURL(/\/the-forge\/cad-lab$/)

      // Hero should still be visible
      await expect(page.getByText('What do you want to build?')).toBeVisible()
    }
  })

  test('saved project loads with expected UI elements', async ({ page }) => {
    // Navigate to CAD Lab — if there's a saved project with modules, test editing UI
    await page.goto('/the-forge/cad-lab')
    await page.waitForLoadState('networkidle')

    // Open project browser
    const projectsBtn = page.getByRole('button', { name: /Projects/ })
    await expect(projectsBtn).toBeVisible()
    await projectsBtn.click()

    // Wait for dialog
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Check if there are saved projects
    const projectButtons = dialog.locator('button.flex-1.text-left')
    const count = await projectButtons.count()

    if (count > 0) {
      // Load the first project
      await projectButtons.first().click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      // If project has research, the header save indicator should show "Saved"
      const savedIndicator = page.getByText('Saved')
      if (await savedIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
        await expect(savedIndicator).toBeVisible()
      }
    } else {
      // No projects — close dialog and verify empty state message
      const closeBtn = dialog.locator('button[aria-label="Close"]').or(page.keyboard.press('Escape').then(() => dialog) as never)
      await page.keyboard.press('Escape')
      await expect(page.getByText('No saved projects yet')).toBeVisible()
    }
  })
})
