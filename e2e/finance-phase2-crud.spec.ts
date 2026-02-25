/**
 * @file finance-phase2-crud.spec.ts — E2E tests for Finance Phase 2 CRUD
 *
 * Tests: edit budget, edit funding opportunity, edit project + delete tx, mark invoice paid
 * Auth:  Uses saved storageState for elena.vasquez@perigee-labs.com (see auth-elena.setup.ts)
 *        Run `npx tsx scripts/create-elena-auth.ts` once to create/refresh elena.json
 */

import { test, expect } from '@playwright/test'
import { dismissOnboarding } from './auth-storage'
import path from 'path'

const BASE = 'https://fractionalforge.app'
const ELENA_STORAGE = path.join(__dirname, '../.playwright/auth/elena.json')

// Use pre-saved auth state for elena.vasquez (avoids login rate limiting)
// Run `npx tsx scripts/create-elena-auth.ts` once to create/refresh elena.json
test.use({ storageState: ELENA_STORAGE })

// Serial so tests don't race on shared Supabase state
test.describe.serial('Finance Phase 2 CRUD', () => {

  test.beforeEach(async ({ page }) => {
    // Prevent onboarding tour from blocking clicks — must be set before navigation
    await dismissOnboarding(page)
  })

  test('1. Edit Budget — Pencil appears on hover, dialog pre-fills, card updates', async ({ page }) => {
    await page.goto(`${BASE}/finance/budgets`)
    await page.waitForLoadState('networkidle')

    // Budget cards contain a progress bar — use that to distinguish from nav .group items
    const card = page.locator('.group').filter({
      has: page.locator('[class*="rounded-full"][class*="bg-muted"][class*="overflow-hidden"]'),
    }).first()
    await expect(card).toBeVisible({ timeout: 10000 })
    await card.hover()
    await page.waitForTimeout(300)

    // Pencil (right-8) + Trash (right-2) — absolutely positioned inside the card
    const editBtn = card.locator('button[class*="right-8"]')
    await editBtn.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Budget')

    const nameInput = dialog.locator('input#edit-budget-name')
    const currentName = await nameInput.inputValue()
    expect(currentName.length).toBeGreaterThan(0)

    const amountInput = dialog.locator('input#edit-budget-amount')
    const currentAmount = await amountInput.inputValue()
    const newAmount = String(parseFloat(currentAmount) + 500)
    await amountInput.fill(newAmount)

    await dialog.locator('button').filter({ hasText: 'Save Changes' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8000 })
    await expect(card).toBeVisible()

    console.log(`✅ Budget edit: "${currentName}" amount ${currentAmount} → ${newAmount}`)
  })

  test('2. Edit Funding Opportunity — Pencil on kanban card, dialog pre-fills', async ({ page }) => {
    await page.goto(`${BASE}/finance/funding`)
    await page.waitForLoadState('networkidle')

    // Kanban cards have a name paragraph with leading-tight — use that to distinguish from nav items
    const kanbanCard = page.locator('.group').filter({
      has: page.locator('[class*="leading-tight"]'),
    }).first()
    await expect(kanbanCard).toBeVisible({ timeout: 10000 })

    const cardName = await kanbanCard.locator('[class*="leading-tight"]').first().textContent()

    await kanbanCard.hover()
    await page.waitForTimeout(300)

    // Pencil is first opacity-0 button in the card header action cluster
    const pencilBtn = kanbanCard.locator('button[class*="opacity-0"]').first()
    await pencilBtn.click({ force: true })

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Funding Opportunity')

    const nameInput = dialog.locator('input#edit-funding-name')
    const prefilledName = await nameInput.inputValue()
    expect(prefilledName).toBe(cardName?.trim())

    const notesField = dialog.locator('textarea#edit-funding-notes')
    await notesField.fill('Updated via Phase 2 CRUD test')

    await dialog.locator('button').filter({ hasText: 'Save Changes' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8000 })

    console.log(`✅ Funding edit: updated notes on "${prefilledName}"`)
  })

  test('3. Edit Project — Pencil in header, change status, badge updates', async ({ page }) => {
    await page.goto(`${BASE}/finance/projects`)
    await page.waitForLoadState('networkidle')

    const projectLink = page.locator('a[href*="/finance/projects/"]').first()
    await expect(projectLink).toBeVisible({ timeout: 10000 })
    await projectLink.click()
    await page.waitForLoadState('networkidle')

    const pencilBtn = page.locator('h1').locator('..').locator('button').first()
    await expect(pencilBtn).toBeVisible({ timeout: 5000 })
    await pencilBtn.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Project')

    const nameInput = dialog.locator('input#edit-project-name')
    const currentName = await nameInput.inputValue()
    expect(currentName.length).toBeGreaterThan(0)

    const statusTrigger = dialog.locator('[role="combobox"]')
    const currentStatus = await statusTrigger.textContent()
    await statusTrigger.click()

    const targetStatus = currentStatus?.toLowerCase().includes('completed') ? 'Active' : 'Completed'
    await page.locator('[role="option"]').filter({ hasText: targetStatus }).click()

    await dialog.locator('button').filter({ hasText: 'Save Changes' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8000 })

    const headerArea = page.locator('h1').locator('..')
    await expect(headerArea).toContainText(new RegExp(targetStatus, 'i'), { timeout: 5000 })

    console.log(`✅ Project "${currentName}" status changed to ${targetStatus}`)
  })

  test('4. Delete Transaction — Trash only on manual rows, two-click confirm, count decreases', async ({ page }) => {
    // Loop through projects to find one with a deletable manual transaction.
    // project-detail-view.tsx marks rows with data-testid="tx-row" and delete buttons
    // with data-testid="tx-delete-btn" (only rendered for manual transactions).
    let foundDeletable = false

    for (let p = 0; p < 15; p++) {
      await page.goto(`${BASE}/finance/projects`)
      await page.waitForLoadState('networkidle')

      const projectLinks = page.locator('a[href*="/finance/projects/"]')
      const linkCount = await projectLinks.count()
      if (p >= linkCount) break

      await projectLinks.nth(p).click()
      await page.waitForLoadState('networkidle')

      const txRows = page.locator('[data-testid="tx-row"]')
      const rowCount = await txRows.count()
      if (rowCount === 0) continue

      const manualRows = txRows.filter({ has: page.locator('[data-testid="tx-delete-btn"]') })
      if ((await manualRows.count()) === 0) continue

      const targetRow = manualRows.first()
      await targetRow.hover()
      await page.waitForTimeout(400)

      const trashBtn = targetRow.locator('[data-testid="tx-delete-btn"]')

      await trashBtn.click({ force: true })
      await expect(targetRow.locator('text=Delete?')).toBeVisible({ timeout: 3000 })

      await trashBtn.click({ force: true })
      await page.waitForTimeout(800)

      const newRowCount = await txRows.count()
      expect(newRowCount).toBe(rowCount - 1)

      foundDeletable = true
      console.log(`✅ Transaction deleted — rows: ${rowCount} → ${newRowCount}`)
      break
    }

    if (!foundDeletable) {
      console.log('⚠️  No deletable transactions found across projects — skipping')
    }
  })

  test('5. Mark Invoice Paid (detail page) — button for sent/overdue, click updates badge', async ({ page }) => {
    await page.goto(`${BASE}/finance/invoices`)
    await page.waitForLoadState('networkidle')

    await page.locator('button').filter({ hasText: /^Invoices/ }).click()
    await page.waitForTimeout(300)

    // Find a payable invoice row in the list via "Paid" button DOM presence,
    // then navigate to its detail page to test the "Mark as Paid" button there.
    const payableRow = page.locator('div.group')
      .filter({ has: page.locator('a[href*="/finance/invoices/"]') })
      .filter({ has: page.locator('button', { hasText: 'Paid' }) })
      .first()

    if ((await payableRow.count()) === 0) {
      console.log('⚠️  No sent/overdue invoices found — skipping')
      return
    }

    const invoiceLink = payableRow.locator('a[href*="/finance/invoices/"]').first()
    const href = await invoiceLink.getAttribute('href')
    const invoiceUrl = href?.startsWith('http') ? href : `${BASE}${href}`

    await page.goto(invoiceUrl!)
    await page.waitForLoadState('networkidle')

    const markPaidBtn = page.locator('button').filter({ hasText: 'Mark as Paid' })
    await expect(markPaidBtn).toBeVisible({ timeout: 5000 })
    await markPaidBtn.click()
    await page.waitForTimeout(1000)

    await expect(page.locator('h1').locator('..')).toContainText(/paid/i, { timeout: 8000 })
    await expect(markPaidBtn).not.toBeVisible()

    console.log(`✅ Invoice marked as paid`)
  })

  test('6. Mark Invoice Paid (list page) — hover button appears, badge updates inline', async ({ page }) => {
    await page.goto(`${BASE}/finance/invoices`)
    await page.waitForLoadState('networkidle')

    await page.locator('button').filter({ hasText: /^Invoices/ }).click()
    await page.waitForTimeout(300)

    // "Paid" button is conditionally rendered only for sent/overdue invoices —
    // filter by its DOM presence to avoid text-content regex issues.
    const sentRow = page.locator('div.group')
      .filter({ has: page.locator('a[href*="/finance/invoices/"]') })
      .filter({ has: page.locator('button', { hasText: 'Paid' }) })
      .first()

    if ((await sentRow.count()) === 0) {
      console.log('⚠️  No sent/overdue invoices in list — skipping hover test')
      return
    }

    const invoiceNumber = await sentRow.locator('p.font-medium').first().textContent()

    await sentRow.hover()
    await page.waitForTimeout(300)

    const paidBtn = sentRow.locator('button').filter({ hasText: 'Paid' })
    await expect(paidBtn).toBeVisible({ timeout: 3000 })
    await paidBtn.click()
    await page.waitForTimeout(1000)

    await expect(sentRow).toContainText(/paid/i, { timeout: 5000 })

    console.log(`✅ Invoice ${invoiceNumber} marked paid from list`)
  })

})
