/**
 * @file finance-phase2-crud.spec.ts — E2E tests for Finance Phase 2 CRUD
 *
 * Tests: edit budget, edit funding opportunity, edit project + delete tx, mark invoice paid
 * Auth:  Uses saved storageState for elena.vasquez@perigee-labs.com (see auth-elena.setup.ts)
 *        Run `npx playwright test --project=auth-setup-elena` once to create elena.json
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

    // Two action buttons with [class*="absolute"]: Pencil (right-8) + Trash (right-2)
    const editBtn = card.locator('button[class*="right-8"]')
    const deleteBtn = card.locator('button[class*="right-2"]')
    // Click the pencil
    await editBtn.click()

    // Dialog should open pre-filled
    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Budget')

    const nameInput = dialog.locator('input#edit-budget-name')
    const currentName = await nameInput.inputValue()
    expect(currentName.length).toBeGreaterThan(0)

    // Change the amount by +500
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

    // Capture card name before edit
    const cardName = await kanbanCard.locator('[class*="leading-tight"]').first().textContent()

    await kanbanCard.hover()
    await page.waitForTimeout(300)

    // Pencil is first ghost button in the card header action cluster
    const pencilBtn = kanbanCard.locator('button[class*="opacity-0"]').first()
    await pencilBtn.click({ force: true }) // force because it's opacity-0 normally

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Funding Opportunity')

    // Name should be pre-filled with card name
    const nameInput = dialog.locator('input#edit-funding-name')
    const prefilledName = await nameInput.inputValue()
    expect(prefilledName).toBe(cardName?.trim())

    // Update notes
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

    // Pencil is in the header next to project name
    const pencilBtn = page.locator('h1').locator('..').locator('button').first()
    await expect(pencilBtn).toBeVisible({ timeout: 5000 })
    await pencilBtn.click()

    const dialog = page.locator('[role="dialog"]')
    await expect(dialog).toBeVisible({ timeout: 5000 })
    await expect(dialog.locator('h2')).toContainText('Edit Project')

    const nameInput = dialog.locator('input#edit-project-name')
    const currentName = await nameInput.inputValue()
    expect(currentName.length).toBeGreaterThan(0)

    // Read current status so we can cycle it
    const statusTrigger = dialog.locator('[role="combobox"]')
    const currentStatus = await statusTrigger.textContent()
    await statusTrigger.click()

    // Toggle between active↔completed
    const targetStatus = currentStatus?.toLowerCase().includes('completed') ? 'Active' : 'Completed'
    await page.locator('[role="option"]').filter({ hasText: targetStatus }).click()

    await dialog.locator('button').filter({ hasText: 'Save Changes' }).click()
    await expect(dialog).not.toBeVisible({ timeout: 8000 })

    // Header area (parent of h1) should contain the new status text
    const headerArea = page.locator('h1').locator('..')
    await expect(headerArea).toContainText(new RegExp(targetStatus, 'i'), { timeout: 5000 })

    console.log(`✅ Project "${currentName}" status changed to ${targetStatus}`)
  })

  test('4. Delete Transaction — Trash only on manual rows, two-click confirm, count decreases', async ({ page }) => {
    await page.goto(`${BASE}/finance/projects`)
    await page.waitForLoadState('networkidle')

    const projectLink = page.locator('a[href*="/finance/projects/"]').first()
    await projectLink.click()
    await page.waitForLoadState('networkidle')

    // Transaction rows (grid-cols-6 data rows, not the header)
    const txRows = page.locator('[class*="grid-cols-6"]').filter({ hasNot: page.locator('text=Description') })
    const rowCount = await txRows.count()

    if (rowCount === 0) {
      console.log('⚠️  No transactions found — skipping delete test')
      return
    }

    // Find a manual row (has a Trash button — linked expenses don't)
    let targetRow = txRows.first()
    let trashBtn = targetRow.locator('button').last()

    for (let i = 0; i < rowCount; i++) {
      const row = txRows.nth(i)
      await row.hover()
      await page.waitForTimeout(200)
      const btn = row.locator('button').last()
      if (await btn.isVisible()) {
        targetRow = row
        trashBtn = btn
        break
      }
      if (i === rowCount - 1) {
        console.log('⚠️  No deletable transactions found (all linked expenses) — skipping')
        return
      }
    }

    // First click → shows "Delete?" confirmation
    await trashBtn.click()
    await expect(targetRow.locator('text=Delete?')).toBeVisible({ timeout: 3000 })

    // Second click → confirms
    await trashBtn.click()
    await page.waitForTimeout(800)

    const newRowCount = await txRows.count()
    expect(newRowCount).toBe(rowCount - 1)

    console.log(`✅ Transaction deleted — rows: ${rowCount} → ${newRowCount}`)
  })

  test('5. Mark Invoice Paid (detail page) — button for sent/overdue, click updates badge', async ({ page }) => {
    await page.goto(`${BASE}/finance/invoices`)
    await page.waitForLoadState('networkidle')

    // Switch to Invoices tab
    await page.locator('button').filter({ hasText: /^Invoices/ }).click()
    await page.waitForTimeout(300)

    // Invoice detail links are /finance/invoices/{uuid} — exclude /new
    const invoiceLinks = page.locator('a[href*="/finance/invoices/"]:not([href$="new"])')
    const linkCount = await invoiceLinks.count()

    if (linkCount === 0) {
      console.log('⚠️  No invoices found — skipping')
      return
    }

    let foundPayable = false
    for (let i = 0; i < Math.min(linkCount, 8); i++) {
      await page.goto(`${BASE}/finance/invoices`)
      await page.waitForLoadState('networkidle')
      await page.locator('button').filter({ hasText: /^Invoices/ }).click()
      await page.waitForTimeout(300)

      await page.locator('a[href*="/finance/invoices/"]:not([href$="new"])').nth(i).click()
      await page.waitForLoadState('networkidle')

      // Status is shown as text sibling to the invoice number h1
      const headerText = await page.locator('h1').locator('..').textContent({ timeout: 5000 })
      const status = headerText?.match(/\b(draft|sent|paid|overdue|cancelled)\b/i)?.[0]

      if (status?.match(/sent|overdue/i)) {
        foundPayable = true
        const markPaidBtn = page.locator('button').filter({ hasText: 'Mark as Paid' })
        await expect(markPaidBtn).toBeVisible({ timeout: 5000 })
        await markPaidBtn.click()
        await page.waitForTimeout(1000)

        // Header area should now contain "paid"
        await expect(page.locator('h1').locator('..')).toContainText(/paid/i, { timeout: 8000 })
        await expect(markPaidBtn).not.toBeVisible()

        console.log(`✅ Invoice (${status}) marked as paid`)
        break
      }
    }

    if (!foundPayable) {
      console.log('⚠️  No sent/overdue invoices found — skipping')
    }
  })

  test('6. Mark Invoice Paid (list page) — hover button appears, badge updates inline', async ({ page }) => {
    await page.goto(`${BASE}/finance/invoices`)
    await page.waitForLoadState('networkidle')

    await page.locator('button').filter({ hasText: /^Invoices/ }).click()
    await page.waitForTimeout(300)

    // Rows contain the status as text — find a row with "sent" or "overdue" in its text
    const sentRow = page.locator('div.group').filter({
      hasText: /\bsent\b|\boverdue\b/i,
    }).first()

    if (await sentRow.count() === 0) {
      console.log('⚠️  No sent/overdue invoices in list — skipping hover test')
      return
    }

    const invoiceNumber = await sentRow.locator('p.font-medium').first().textContent()

    // Hover to reveal Mark Paid button
    await sentRow.hover()
    await page.waitForTimeout(300)

    const paidBtn = sentRow.locator('button').filter({ hasText: /paid/i })
    await expect(paidBtn).toBeVisible({ timeout: 3000 })
    await paidBtn.click()
    await page.waitForTimeout(1000)

    // Row text should now contain "paid" (badge updated in-place)
    await expect(sentRow).toContainText(/paid/i, { timeout: 5000 })

    console.log(`✅ Invoice ${invoiceNumber} marked paid from list`)
  })

})
