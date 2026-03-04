import { chromium } from '@playwright/test'
import path from 'path'

async function testBusinessPlanE2E() {
  const browser = await chromium.launch({ headless: false }) // Non-headless so we can see what's happening
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 1: LOGIN')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/login')
    await page.waitForSelector('input[name="email"]')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    await page.click('button:has-text("Enter the Forge")')
    await page.waitForURL(/.*\/(today|strategy|team|dashboard).*/, { timeout: 15000 })
    
    // Dismiss onboarding modals
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos_supplier_onboarding_completed', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })
    
    console.log('✅ Logged in successfully\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 2: UPLOAD BUSINESS PLAN')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/strategy')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'screenshots/e2e-01-strategy-before-upload.png', fullPage: true })
    console.log('📸 Screenshot: e2e-01-strategy-before-upload.png')
    
    // The file input is hidden, but we can set files on it directly
    const filePath = '/Users/tristanfischer/Developer/CentaurOS created 260126 1435/test-business-plan.txt'
    console.log(`📤 Uploading file: ${filePath}`)
    
    // Set the file on the hidden input
    const fileInput = await page.locator('input[type="file"]')
    await fileInput.setInputFiles(filePath)
    console.log('✅ File selected, waiting for analysis to start...\n')
    
    // Wait a moment for the upload to register
    await page.waitForTimeout(2000)
    
    console.log('⏳ Waiting for AI analysis (30-60 seconds)...')
    console.log('   Looking for progress states:')
    console.log('   1. "Claude is analyzing your business plan..."')
    console.log('   2. "Saving results and preparing review..."')
    
    // Try to capture progress states
    let progressScreenshotTaken = false
    for (let i = 0; i < 60; i++) {
      const analyzingText = await page.locator('text=/analyzing.*business plan/i').isVisible().catch(() => false)
      const savingText = await page.locator('text=/saving.*results/i').isVisible().catch(() => false)
      
      if ((analyzingText || savingText) && !progressScreenshotTaken) {
        await page.screenshot({ path: 'screenshots/e2e-02-analysis-in-progress.png', fullPage: true })
        console.log('📸 Screenshot: e2e-02-analysis-in-progress.png (analysis in progress)')
        progressScreenshotTaken = true
      }
      
      // Check if dialog appeared
      const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false)
      if (dialogVisible) {
        console.log('✅ Review dialog appeared!')
        break
      }
      
      // Check for error
      const errorVisible = await page.locator('text=/error/i').isVisible().catch(() => false)
      if (errorVisible) {
        const errorText = await page.locator('text=/error/i').textContent()
        console.log(`❌ ERROR DETECTED: ${errorText}`)
        await page.screenshot({ path: 'screenshots/e2e-02-error.png', fullPage: true })
        break
      }
      
      await page.waitForTimeout(1000)
    }
    
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 3: REVIEW DIALOG')
    console.log('═══════════════════════════════════════════════════════════')
    
    const dialogVisible = await page.locator('[role="dialog"]').isVisible().catch(() => false)
    
    if (dialogVisible) {
      await page.screenshot({ path: 'screenshots/e2e-03-review-dialog.png', fullPage: true })
      console.log('📸 Screenshot: e2e-03-review-dialog.png')
      
      // Try to read the dialog title
      const dialogTitle = await page.locator('[role="dialog"] h2, [role="dialog"] [class*="title"]').first().textContent().catch(() => 'Could not read title')
      console.log(`📋 Dialog Title: ${dialogTitle}`)
      
      // Try to read counts
      const newCount = await page.locator('text=/\\d+\\s+new/i').textContent().catch(() => 'N/A')
      const mergeCount = await page.locator('text=/\\d+\\s+merge/i').textContent().catch(() => 'N/A')
      const skipCount = await page.locator('text=/\\d+\\s+skip/i').textContent().catch(() => 'N/A')
      
      console.log(`📊 Counts:`)
      console.log(`   - New: ${newCount}`)
      console.log(`   - Merge: ${mergeCount}`)
      console.log(`   - Skip: ${skipCount}`)
      
      // Try to read suggested objectives
      const objectives = await page.locator('[role="dialog"] [class*="objective"], [role="dialog"] li').allTextContents().catch(() => [])
      console.log(`📝 Suggested Objectives (${objectives.length} found):`)
      objectives.slice(0, 10).forEach((obj, i) => {
        console.log(`   ${i + 1}. ${obj.substring(0, 100)}${obj.length > 100 ? '...' : ''}`)
      })
      
      // Click Apply button
      console.log('\n🔘 Clicking "Apply" button...')
      const applyButton = page.locator('button:has-text("Apply")')
      await applyButton.click()
      
      // Wait for success toast
      console.log('⏳ Waiting for success toast...')
      await page.waitForTimeout(3000)
      await page.screenshot({ path: 'screenshots/e2e-04-after-apply.png', fullPage: true })
      console.log('📸 Screenshot: e2e-04-after-apply.png')
      
      const toastText = await page.locator('[class*="toast"], [role="status"]').textContent().catch(() => 'No toast found')
      console.log(`📬 Toast message: ${toastText}`)
    } else {
      console.log('❌ Review dialog did NOT appear')
      await page.screenshot({ path: 'screenshots/e2e-03-no-dialog.png', fullPage: true })
      console.log('📸 Screenshot: e2e-03-no-dialog.png')
    }
    
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 4: CHECK TEAM PAGE → HIRING PLAN')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/team')
    await page.waitForLoadState('networkidle')
    
    // Close any modal
    const closeButton = page.locator('button[aria-label="Close"]')
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click()
      await page.waitForTimeout(500)
    }
    
    // Click Hiring Plan tab
    const hiringPlanTab = page.locator('[role="tab"]', { hasText: 'Hiring Plan' })
    await hiringPlanTab.click()
    await page.waitForTimeout(1000)
    
    await page.screenshot({ path: 'screenshots/e2e-05-hiring-plan.png', fullPage: true })
    console.log('📸 Screenshot: e2e-05-hiring-plan.png')
    
    // Check for hire cards
    const hireCards = await page.locator('[class*="hire"], [class*="card"]').count()
    console.log(`📋 Hire cards found: ${hireCards}`)
    
    // Check for role legend
    const legendVisible = await page.locator('text=/role.*type/i, text=/legend/i').isVisible().catch(() => false)
    console.log(`🏷️  Role type legend visible: ${legendVisible ? 'YES' : 'NO'}`)
    
    // Check for status buttons
    const statusButtons = await page.locator('button:has-text("Planned"), button:has-text("Recruiting"), button:has-text("Hired")').count()
    console.log(`🔘 Status buttons found: ${statusButtons}`)
    
    // Try to read hire titles
    const hireTitles = await page.locator('[class*="title"], h3, h4').allTextContents().catch(() => [])
    console.log(`📝 Hiring requirements visible:`)
    hireTitles.slice(0, 10).forEach((title, i) => {
      if (title.trim().length > 0 && title.trim().length < 100) {
        console.log(`   ${i + 1}. ${title.trim()}`)
      }
    })
    
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 5: CHECK FUNDING PAGE')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/funding')
    await page.waitForLoadState('networkidle')
    
    await page.screenshot({ path: 'screenshots/e2e-06-funding-page.png', fullPage: true })
    console.log('📸 Screenshot: e2e-06-funding-page.png')
    
    // Check for funding events
    const fundingCards = await page.locator('[class*="funding"], [class*="card"]').count()
    console.log(`💰 Funding event cards found: ${fundingCards}`)
    
    // Try to read summary values
    const totalRequired = await page.locator('text=/total.*required/i').textContent().catch(() => 'N/A')
    const secured = await page.locator('text=/secured/i').textContent().catch(() => 'N/A')
    const stillNeeded = await page.locator('text=/still.*needed/i').textContent().catch(() => 'N/A')
    
    console.log(`📊 Summary Card Values:`)
    console.log(`   - Total Required: ${totalRequired}`)
    console.log(`   - Secured: ${secured}`)
    console.log(`   - Still Needed: ${stillNeeded}`)
    
    // Check for status controls
    const statusControls = await page.locator('button:has-text("Projected"), button:has-text("Seeking"), button:has-text("Secured")').count()
    console.log(`🔘 Status controls found: ${statusControls}`)
    
    console.log('')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 6: RETURN TO STRATEGY PAGE')
    console.log('═══════════════════════════════════════════════════════════')
    
    await page.goto('http://localhost:3000/strategy')
    await page.waitForLoadState('networkidle')
    
    await page.screenshot({ path: 'screenshots/e2e-07-strategy-after-analysis.png', fullPage: true })
    console.log('📸 Screenshot: e2e-07-strategy-after-analysis.png')
    
    // Check for "Last analysed" text
    const lastAnalysed = await page.locator('text=/last.*analys/i').isVisible().catch(() => false)
    console.log(`📅 "Last analysed" indicator visible: ${lastAnalysed ? 'YES' : 'NO'}`)
    
    if (lastAnalysed) {
      const analysedText = await page.locator('text=/last.*analys/i').textContent()
      console.log(`   Text: ${analysedText}`)
    }
    
    console.log('')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('✅ END-TO-END TEST COMPLETED')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('All screenshots saved to screenshots/ directory')
    
  } catch (error) {
    console.error('\n❌ ERROR DURING TEST:', error.message)
    await page.screenshot({ path: 'screenshots/e2e-error.png', fullPage: true })
    console.log('📸 Error screenshot saved: e2e-error.png')
  } finally {
    console.log('\n⏳ Keeping browser open for 10 seconds for manual inspection...')
    await page.waitForTimeout(10000)
    await browser.close()
  }
}

testBusinessPlanE2E()
