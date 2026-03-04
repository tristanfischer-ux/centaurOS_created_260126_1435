import { chromium } from '@playwright/test'

async function testPages() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('🔐 Logging in...')
    await page.goto('http://localhost:3000/login')
    await page.waitForSelector('input[name="email"]')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    await page.click('button:has-text("Enter the Forge")')
    await page.waitForURL(/.*\/(today|strategy|team|dashboard).*/, { timeout: 15000 })
    
    // Dismiss any onboarding modals
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })
    
    console.log('✅ Logged in successfully\n')

    // Test 1: Strategy page
    console.log('📄 Testing Strategy page...')
    await page.goto('http://localhost:3000/strategy')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/test-strategy-page.png', fullPage: true })
    
    const hasBusinessPlan = await page.locator('text=Business Plan').first().isVisible().catch(() => false)
    const hasUploadZone = await page.locator('text=/Drop your business plan here/i').isVisible().catch(() => false)
    
    console.log('Strategy page results:')
    console.log(`  - Business Plan section: ${hasBusinessPlan ? '✅ FOUND' : '❌ NOT FOUND'}`)
    console.log(`  - Upload zone: ${hasUploadZone ? '✅ FOUND' : '❌ NOT FOUND'}`)
    console.log(`  - Screenshot saved: screenshots/test-strategy-page.png\n`)

    // Test 2: Team page
    console.log('👥 Testing Team page...')
    await page.goto('http://localhost:3000/team')
    await page.waitForLoadState('networkidle')
    
    // Try to close any modal that might be open
    const closeButton = page.locator('button[aria-label="Close"]')
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(500)
    }
    
    await page.screenshot({ path: 'screenshots/test-team-initial.png', fullPage: true })
    
    const hiringPlanTab = page.locator('[role="tab"]', { hasText: 'Hiring Plan' })
    const hasHiringPlanTab = await hiringPlanTab.isVisible().catch(() => false)
    
    console.log('Team page results:')
    console.log(`  - Hiring Plan tab: ${hasHiringPlanTab ? '✅ FOUND' : '❌ NOT FOUND'}`)
    
    if (hasHiringPlanTab) {
      try {
        await hiringPlanTab.click({ timeout: 5000 })
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'screenshots/test-team-hiring-plan.png', fullPage: true })
        console.log(`  - Clicked Hiring Plan tab`)
        console.log(`  - Screenshot saved: screenshots/test-team-hiring-plan.png`)
      } catch (e) {
        console.log(`  - Could not click Hiring Plan tab (modal blocking): ${e.message}`)
      }
    }
    console.log(`  - Initial screenshot saved: screenshots/test-team-initial.png\n`)

    // Test 3: Funding page
    console.log('💰 Testing Funding page...')
    await page.goto('http://localhost:3000/funding')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/test-funding-page.png', fullPage: true })
    
    const hasFundingTitle = await page.locator('h1', { hasText: 'Funding & Financing' }).isVisible().catch(() => false)
    
    console.log('Funding page results:')
    console.log(`  - "Funding & Financing" title: ${hasFundingTitle ? '✅ FOUND' : '❌ NOT FOUND'}`)
    console.log(`  - Screenshot saved: screenshots/test-funding-page.png\n`)

    console.log('✅ All tests completed!')
  } catch (error) {
    console.error('❌ Error during testing:', error.message)
  } finally {
    await browser.close()
  }
}

testPages()
