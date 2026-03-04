import { chromium } from '@playwright/test'

async function checkStrategy() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('1. Navigating to login page...')
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
    
    console.log('2. Logging in...')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    await page.click('button:has-text("Enter the Forge")')
    await page.waitForURL(/.*\/(today|strategy|dashboard).*/, { timeout: 15000 })
    
    // Dismiss onboarding
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
    })
    
    console.log('3. Navigating to Strategy page...')
    await page.goto('http://localhost:3000/strategy', { waitUntil: 'networkidle' })
    
    console.log('4. Waiting 5 seconds...')
    await page.waitForTimeout(5000)
    
    console.log('5. Taking screenshot...')
    await page.screenshot({ path: 'screenshots/strategy-check.png', fullPage: true })
    console.log('   ✅ Screenshot: strategy-check.png')
    
    console.log('\n6. Checking Business Plan upload zone...')
    
    // Check for "Last analysed" text
    const lastAnalysed = await page.locator('text=/Last analys/i').textContent().catch(() => null)
    console.log('   "Last analysed" text:', lastAnalysed || 'NOT FOUND')
    
    // Check for "Analysis complete" text
    const analysisComplete = await page.locator('text=/Analysis complete/i').textContent().catch(() => null)
    console.log('   "Analysis complete" text:', analysisComplete || 'NOT FOUND')
    
    // Check for "Re-analyse" text
    const reanalyse = await page.locator('text=/Re-analys|Analyze again|Upload.*new/i').textContent().catch(() => null)
    console.log('   "Re-analyse" text:', reanalyse || 'NOT FOUND')
    
    // Get all text from the Business Plan section
    console.log('\n7. Full text from Business Plan section:')
    const businessPlanSection = await page.locator('text=BUSINESS PLAN').locator('..').textContent().catch(() => 'Could not read section')
    console.log('---')
    console.log(businessPlanSection.substring(0, 500))
    console.log('---')
    
    // Check for specific elements in the upload zone
    const uploadZoneText = await page.locator('[class*="upload"], [class*="drop"]').allTextContents().catch(() => [])
    console.log('\n8. Text from upload zone elements:')
    uploadZoneText.forEach((text, i) => {
      if (text.trim().length > 0) {
        console.log(`   ${i + 1}. ${text.trim()}`)
      }
    })
    
    console.log('\nKeeping browser open for 20 seconds...')
    await page.waitForTimeout(20000)
    
  } catch (error) {
    console.error('Error:', error.message)
    await page.screenshot({ path: 'screenshots/strategy-check-error.png', fullPage: true })
  } finally {
    await browser.close()
  }
}

checkStrategy()
