/**
 * Script to verify settings pages render correctly
 */

import { chromium } from '@playwright/test'

async function verifySettingsPages() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('Navigating to localhost:3000/settings...')
    await page.goto('http://localhost:3000/settings')
    await page.waitForLoadState('networkidle')

    // Check if we hit a login page
    const isLoginPage = await page.locator('input[type="email"]').count() > 0
    
    if (isLoginPage) {
      console.log('Login page detected, logging in...')
      await page.fill('input[type="email"]', 'tristan@forgeos.ai')
      await page.fill('input[type="password"]', 'password123')
      await page.click('button[type="submit"]')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
      
      // Navigate to settings again after login
      await page.goto('http://localhost:3000/settings')
      await page.waitForLoadState('networkidle')
    }

    // Page 1: Account overview
    console.log('\n=== Page 1: /settings (Account Overview) ===')
    await page.screenshot({ path: 'settings-account.png', fullPage: true })
    
    const accountTitle = await page.locator('h1').first().textContent()
    console.log('Page title:', accountTitle)
    
    const hasErrors = await page.locator('text=/error|Error|not found|404/i').count() > 0
    console.log('Has errors:', hasErrors)
    
    const visibleContent = await page.locator('body').textContent()
    console.log('Content preview:', visibleContent?.slice(0, 200))

    // Page 2: Privacy & Data
    console.log('\n=== Page 2: /settings/privacy (Privacy & Data) ===')
    await page.goto('http://localhost:3000/settings/privacy')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'settings-privacy.png', fullPage: true })
    
    const privacyTitle = await page.locator('h1').first().textContent()
    console.log('Page title:', privacyTitle)
    
    const privacyHasErrors = await page.locator('text=/error|Error|not found|404/i').count() > 0
    console.log('Has errors:', privacyHasErrors)
    
    const privacyContent = await page.locator('body').textContent()
    console.log('Content preview:', privacyContent?.slice(0, 200))

    // Page 3: Help & Support
    console.log('\n=== Page 3: /settings/help (Help & Support) ===')
    await page.goto('http://localhost:3000/settings/help')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'settings-help.png', fullPage: true })
    
    const helpTitle = await page.locator('h1').first().textContent()
    console.log('Page title:', helpTitle)
    
    const helpHasErrors = await page.locator('text=/error|Error|not found|404/i').count() > 0
    console.log('Has errors:', helpHasErrors)
    
    const helpContent = await page.locator('body').textContent()
    console.log('Content preview:', helpContent?.slice(0, 200))

    console.log('\n=== Summary ===')
    console.log('All pages visited successfully')
    console.log('Screenshots saved: settings-account.png, settings-privacy.png, settings-help.png')

  } catch (error) {
    console.error('Error during verification:', error)
  } finally {
    await browser.close()
  }
}

verifySettingsPages()
