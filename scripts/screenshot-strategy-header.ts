import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

async function captureStrategyHeader() {
  // Use existing auth state from E2E tests (Founder has full access)
  const authFile = path.join(process.cwd(), '.playwright/auth/founder.json')
  
  if (!fs.existsSync(authFile)) {
    console.error('Auth file not found at:', authFile)
    console.error('Please run Playwright auth setup first')
    process.exit(1)
  }

  const browser = await chromium.launch()
  const context = await browser.newContext({
    storageState: authFile
  })
  const page = await context.newPage()

  try {
    // Navigate to strategy page
    console.log('Navigating to strategy page...')
    await page.goto('http://localhost:3000/strategy', { waitUntil: 'networkidle' })
    
    // Wait for header to be visible
    await page.waitForSelector('h1:has-text("Strategy")', { timeout: 10000 })
    console.log('Strategy page loaded')
    
    // Take full-width screenshot
    await page.setViewportSize({ width: 1400, height: 900 })
    await page.waitForTimeout(500) // Wait for layout to settle
    await page.screenshot({ 
      path: path.join(process.cwd(), 'screenshots', 'strategy-header-full-width.png'),
      fullPage: false
    })
    console.log('✓ Captured full-width screenshot (1400px)')
    
    // Take narrow-width screenshot
    await page.setViewportSize({ width: 900, height: 900 })
    await page.waitForTimeout(500) // Wait for layout to adjust
    await page.screenshot({ 
      path: path.join(process.cwd(), 'screenshots', 'strategy-header-narrow.png'),
      fullPage: false
    })
    console.log('✓ Captured narrow-width screenshot (900px)')
    
  } catch (error) {
    console.error('Error capturing screenshots:', error)
    throw error
  } finally {
    await browser.close()
  }
}

captureStrategyHeader()
