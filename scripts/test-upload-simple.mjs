import { chromium } from '@playwright/test'

async function testUpload() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Capture console messages
  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type()}]:`, msg.text())
  })

  // Capture page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]:', error.message)
  })

  try {
    console.log('Logging in...')
    await page.goto('http://localhost:3000/login')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    await page.click('button:has-text("Enter the Forge")')
    await page.waitForURL(/.*\/(today|strategy).*/, { timeout: 15000 })
    
    // Dismiss onboarding
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
    })
    
    console.log('Navigating to strategy page...')
    await page.goto('http://localhost:3000/strategy')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/simple-01-strategy.png', fullPage: true })
    
    console.log('Uploading file...')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles('/Users/tristanfischer/Developer/CentaurOS created 260126 1435/test-business-plan.txt')
    
    console.log('Waiting for analysis...')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/simple-02-analyzing.png', fullPage: true })
    
    // Wait up to 90 seconds for dialog or error
    for (let i = 0; i < 90; i++) {
      const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false)
      if (dialogVisible) {
        console.log('✅ Dialog appeared!')
        await page.screenshot({ path: 'screenshots/simple-03-dialog.png', fullPage: true })
        break
      }
      
      const errorVisible = await page.locator('text=/error/i').first().isVisible().catch(() => false)
      if (errorVisible) {
        const errorText = await page.locator('text=/error/i').first().textContent()
        console.log(`❌ Error: ${errorText}`)
        await page.screenshot({ path: 'screenshots/simple-03-error.png', fullPage: true })
        break
      }
      
      await page.waitForTimeout(1000)
      if (i % 10 === 0) {
        console.log(`  ... still waiting (${i}s)`)
      }
    }
    
    console.log('Keeping browser open for inspection...')
    await page.waitForTimeout(30000)
    
  } catch (error) {
    console.error('Error:', error.message)
    await page.screenshot({ path: 'screenshots/simple-error.png', fullPage: true })
  } finally {
    await browser.close()
  }
}

testUpload()
