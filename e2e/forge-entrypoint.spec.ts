import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

test.describe('Forge entrypoint routing', () => {
  const founderEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
  const founderPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'

  async function loginIfNeeded(page: Page) {
    await page.addInitScript(() => {
      window.localStorage.setItem('forgeos_onboarding_completed', 'true')
      window.localStorage.setItem('forgeos_intent_selected', 'team_builder')
    })

    await page.goto('/the-forge')
    await page.waitForLoadState('networkidle')

    if (page.url().includes('/login')) {
      await page.fill('input[type="email"]', founderEmail)
      await page.fill('input[type="password"]', founderPassword)
      await page.getByRole('button', { name: /enter the forge|access foundry/i }).click()
      await page.waitForURL(/\/(today|dashboard|updates|new-objectives|new-tasks)/, { timeout: 30000 })
      await page.goto('/the-forge')
      await page.waitForLoadState('networkidle')
    }
  }

  test('shows Design-to-RFQ lab as recommended path', async ({ page }) => {
    await loginIfNeeded(page)

    await expect(page.getByRole('heading', { name: 'Design-to-RFQ Lab' })).toBeVisible()
    await expect(page.getByText('Recommended path')).toBeVisible()

    const designToRfqLink = page.getByRole('link', { name: /Open Design-to-RFQ Lab/i })
    await expect(designToRfqLink).toBeVisible()
    await expect(designToRfqLink).toHaveAttribute('href', '/the-forge/cad-lab')

    const legacyConceptLink = page.getByRole('link', { name: /Open Legacy Concept Flow/i })
    await expect(legacyConceptLink).toBeVisible()
    await expect(legacyConceptLink).toHaveAttribute('href', '/the-forge/new')
  })

  test('recommended CTA navigates into cad-lab flow', async ({ page }) => {
    await loginIfNeeded(page)
    await page.getByRole('link', { name: /Open Design-to-RFQ Lab/i }).click()
    await page.waitForURL('**/the-forge/cad-lab')
    await expect(page).toHaveURL(/\/the-forge\/cad-lab$/)
  })

  test('legacy CTA navigates into concept flow', async ({ page }) => {
    await loginIfNeeded(page)
    await page.getByRole('link', { name: /Open Legacy Concept Flow/i }).click()
    await page.waitForURL('**/the-forge/new')
    await expect(page).toHaveURL(/\/the-forge\/new$/)
  })
})
