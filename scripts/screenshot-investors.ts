import { chromium } from 'playwright'
import path from 'path'

const BASE_URL = 'http://localhost:3000'
const AUTH_STATE = path.join(__dirname, '../.playwright/auth/founder.json')

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: AUTH_STATE })
  const page = await context.newPage()

  // Capture console errors
  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(err.message))

  await page.goto(`${BASE_URL}/investors`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.screenshot({ path: 'screenshots/investors-test.png', fullPage: true })

  console.log('Page title:', await page.title())
  console.log('Page URL:', page.url())

  // Check for the panel
  const panelExists = await page.locator('text=Investor Insights').count()
  console.log('Insights panel elements:', panelExists)

  // Check stat card numbers specifically
  const statCards = await page.locator('.text-2xl').allTextContents()
  console.log('text-2xl elements:', statCards)

  // Check for Finance-category data hint
  const bodyText = await page.locator('body').textContent()
  const hasInvestorCards = bodyText?.includes('Priority') || bodyText?.includes('Actively deploying')
  console.log('Investor cards present:', hasInvestorCards)

  if (errors.length) {
    console.log('\nConsole errors:')
    errors.forEach(e => console.log(' -', e))
  }

  await browser.close()
}

run()
