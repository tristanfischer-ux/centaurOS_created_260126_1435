/**
 * Manual smoke test for the Investor Directory page.
 * Tests: page load, insights panel, filters, load more, card links.
 *
 * Run: npx tsx scripts/test-investor-directory.ts
 */

import { chromium } from 'playwright'
import path from 'path'

const BASE_URL = 'http://localhost:3000'
const AUTH_STATE = path.join(__dirname, '../.playwright/auth/founder.json')

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: AUTH_STATE })
  const page = await context.newPage()
  const results: { test: string; pass: boolean; note?: string }[] = []

  function check(test: string, pass: boolean, note?: string) {
    results.push({ test, pass, note })
    console.log(`${pass ? '✅' : '❌'} ${test}${note ? ` — ${note}` : ''}`)
  }

  try {
    // -----------------------------------------------------------------------
    // 1. Page loads
    // -----------------------------------------------------------------------
    const res = await page.goto(`${BASE_URL}/investors`, { waitUntil: 'networkidle', timeout: 30_000 })
    check('Page returns 200', res?.status() === 200, `status=${res?.status()}`)

    // -----------------------------------------------------------------------
    // 2. Page header
    // -----------------------------------------------------------------------
    const h1 = await page.locator('h1').first().textContent()
    check('H1 is "UK Investor Directory"', h1?.includes('UK Investor Directory') ?? false, h1 ?? 'missing')

    // -----------------------------------------------------------------------
    // 3. Insights panel visible
    // -----------------------------------------------------------------------
    const panelHeader = await page.locator('text=Investor Insights').first().isVisible()
    check('Insights panel header visible', panelHeader)

    // Stat cards — check at least one has a number > 0
    const statNumbers = await page.locator('.text-2xl.font-bold').allTextContents()
    const nonZeroStat = statNumbers.some(n => parseInt(n.replace(/,/g, '')) > 0)
    check('Stat cards show non-zero numbers', nonZeroStat, `values: ${statNumbers.join(', ')}`)

    // -----------------------------------------------------------------------
    // 4. Charts render (recharts renders SVG)
    // -----------------------------------------------------------------------
    const svgCount = await page.locator('svg.recharts-surface').count()
    check('Charts rendered (≥3 recharts SVGs)', svgCount >= 3, `found ${svgCount}`)

    // -----------------------------------------------------------------------
    // 5. Collapse / expand
    // -----------------------------------------------------------------------
    await page.locator('button', { hasText: 'Collapse' }).first().click()
    await page.waitForTimeout(300)
    const panelHidden = !(await page.locator('svg.recharts-surface').first().isVisible({ timeout: 500 }).catch(() => false))
    check('Collapse hides charts', panelHidden)

    await page.locator('button', { hasText: 'Expand' }).first().click()
    await page.waitForTimeout(300)
    const panelVisible = await page.locator('svg.recharts-surface').first().isVisible()
    check('Expand shows charts', panelVisible)

    // -----------------------------------------------------------------------
    // 6. Investor cards render
    // -----------------------------------------------------------------------
    const cardCount = await page.locator('[href^="/investors/"]').count()
    check('Investor cards rendered (≥1)', cardCount >= 1, `found ${cardCount} links`)

    // -----------------------------------------------------------------------
    // 7. Website links have protocol
    // -----------------------------------------------------------------------
    const extLinks = await page.locator('a[target="_blank"][href]').evaluateAll(
      (els: HTMLAnchorElement[]) => els.map(el => el.href)
    )
    const bareLinks = extLinks.filter(href => !href.startsWith('http'))
    check('All external links have protocol', bareLinks.length === 0, bareLinks.length > 0 ? `bare: ${bareLinks.slice(0, 3).join(', ')}` : undefined)

    // -----------------------------------------------------------------------
    // 8. Filter: Active only
    // -----------------------------------------------------------------------
    const activeCheckbox = page.locator('label', { hasText: /active/i }).first()
    if (await activeCheckbox.isVisible()) {
      await activeCheckbox.click()
      await page.waitForTimeout(1500)
      const filteredCount = await page.locator('[href^="/investors/"]').count()
      check('Active filter reduces results', filteredCount < cardCount, `${filteredCount} vs ${cardCount} total`)
      // Reset
      await activeCheckbox.click()
      await page.waitForTimeout(1000)
    } else {
      check('Active filter visible', false, 'checkbox not found')
    }

    // -----------------------------------------------------------------------
    // 9. Text search
    // -----------------------------------------------------------------------
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('Sequoia')
      await page.waitForTimeout(1500)
      const searchCount = await page.locator('[href^="/investors/"]').count()
      check('Search filters results', searchCount < cardCount, `${searchCount} results for "Sequoia"`)
      await searchInput.clear()
      await page.waitForTimeout(1000)
    } else {
      check('Search input visible', false, 'not found')
    }

    // -----------------------------------------------------------------------
    // 10. Individual firm page loads
    // -----------------------------------------------------------------------
    const firstCardLink = page.locator('a[href^="/investors/"]').first()
    const firmHref = await firstCardLink.getAttribute('href')
    if (firmHref) {
      const firmRes = await page.goto(`${BASE_URL}${firmHref}`, { waitUntil: 'networkidle', timeout: 20_000 })
      check('Firm detail page returns 200', firmRes?.status() === 200, `${firmHref} → ${firmRes?.status()}`)
      const firmTitle = await page.locator('h1').first().textContent()
      check('Firm detail has H1', !!firmTitle && firmTitle.length > 0, firmTitle ?? 'missing')
    }

  } catch (err) {
    console.error('Test error:', err)
  } finally {
    await browser.close()
  }

  // Summary
  const passed = results.filter(r => r.pass).length
  const failed = results.filter(r => !r.pass).length
  console.log(`\n${passed}/${results.length} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

run()
