import { chromium } from 'playwright'
import path from 'path'

const BASE_URL = 'http://localhost:3000'
const AUTH_STATE = path.join(__dirname, '../.playwright/auth/founder.json')

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: AUTH_STATE })
  const page = await context.newPage()

  const errors: string[] = []
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  page.on('pageerror', err => errors.push(`PAGE ERROR: ${err.message}\n${err.stack}`))
  page.on('response', resp => {
    if (resp.url().includes('/investors') && resp.status() >= 400) {
      console.log('HTTP error:', resp.status(), resp.url())
    }
  })

  await page.goto(`${BASE_URL}/investors`, { waitUntil: 'domcontentloaded', timeout: 30_000 })

  const body = await page.content()
  // Look for Next.js error detail in the page source
  const errorMatch = body.match(/digest[&quot;]*[: ]+[&quot;]*([^"<&\s]+)/) ||
                     body.match(/Error: ([^\n<]{10,100})/)
  if (errorMatch) console.log('Error digest:', errorMatch[1])

  console.log('Page URL after nav:', page.url())
  console.log('Console errors:', errors)

  await browser.close()
}

run()
