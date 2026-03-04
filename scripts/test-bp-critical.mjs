import { chromium } from '@playwright/test'

async function criticalTest() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Capture all console messages
  page.on('console', msg => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      console.log(`[BROWSER ${type.toUpperCase()}]:`, msg.text())
    }
  })

  // Capture page errors
  page.on('pageerror', error => {
    console.log('[PAGE ERROR]:', error.message)
  })

  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 1: LOGIN')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('1. Navigating to http://localhost:3000/login')
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
    await page.screenshot({ path: 'screenshots/critical-01-login-page.png', fullPage: true })
    console.log('   ✅ Screenshot: critical-01-login-page.png')
    
    console.log('2. Entering email: demo.founder@forgeos.io')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    
    console.log('3. Entering password: DemoFounder2026!')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    
    console.log('4. Clicking login button')
    await page.click('button:has-text("Enter the Forge")')
    
    console.log('5. Waiting for redirect...')
    try {
      await page.waitForURL(/.*\/(today|strategy|dashboard).*/, { timeout: 15000 })
      console.log('   ✅ Redirected successfully')
    } catch (e) {
      console.log('   ⚠️  Redirect timeout, checking current URL...')
      console.log('   Current URL:', page.url())
      
      // Check if there's an error message
      const errorMsg = await page.locator('text=/error|invalid/i').textContent().catch(() => null)
      if (errorMsg) {
        console.log('   ❌ Error message:', errorMsg)
        await page.screenshot({ path: 'screenshots/critical-01-login-error.png', fullPage: true })
        throw new Error('Login failed: ' + errorMsg)
      }
    }
    
    // Dismiss onboarding modals
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })
    
    console.log('6. Taking post-login screenshot')
    await page.screenshot({ path: 'screenshots/critical-02-after-login.png', fullPage: true })
    console.log('   ✅ Screenshot: critical-02-after-login.png\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 2: GO TO STRATEGY PAGE')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('1. Navigating to http://localhost:3000/strategy')
    await page.goto('http://localhost:3000/strategy', { waitUntil: 'networkidle' })
    
    console.log('2. Waiting 5 seconds for page to fully load')
    await page.waitForTimeout(5000)
    
    console.log('3. Taking screenshot')
    await page.screenshot({ path: 'screenshots/critical-03-strategy-page.png', fullPage: true })
    console.log('   ✅ Screenshot: critical-03-strategy-page.png')
    
    console.log('4. Looking for BUSINESS PLAN section...')
    const businessPlanSection = await page.locator('text=BUSINESS PLAN').isVisible().catch(() => false)
    console.log('   BUSINESS PLAN section visible:', businessPlanSection ? '✅ YES' : '❌ NO')
    
    const uploadZone = await page.locator('text=/Drop your business plan here/i').isVisible().catch(() => false)
    console.log('   Upload zone visible:', uploadZone ? '✅ YES' : '❌ NO\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 3: UPLOAD BUSINESS PLAN')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('1. Finding upload area')
    const fileInput = page.locator('input[type="file"]')
    const fileInputExists = await fileInput.count() > 0
    console.log('   File input found:', fileInputExists ? '✅ YES' : '❌ NO')
    
    if (!fileInputExists) {
      console.log('   ❌ Cannot proceed - no file input found')
      await page.screenshot({ path: 'screenshots/critical-error-no-input.png', fullPage: true })
      throw new Error('File input not found')
    }
    
    console.log('2. Uploading file: test-business-plan.txt')
    const filePath = '/Users/tristanfischer/Developer/CentaurOS created 260126 1435/test-business-plan.txt'
    await fileInput.setInputFiles(filePath)
    console.log('   ✅ File selected')
    
    console.log('3. Waiting for analysis to start...')
    await page.waitForTimeout(2000)
    
    console.log('4. Monitoring analysis progress (checking every 10 seconds for 90 seconds)...\n')
    
    let dialogAppeared = false
    let errorOccurred = false
    let analysisComplete = false
    
    for (let i = 0; i <= 90; i += 10) {
      console.log(`   [${i}s] Checking page state...`)
      
      // Check for analyzing message
      const analyzing = await page.locator('text=/Claude is analyzing|analyzing.*business plan/i').isVisible().catch(() => false)
      if (analyzing) {
        console.log('   📊 Status: "Claude is analyzing your business plan..."')
        await page.screenshot({ path: `screenshots/critical-04-analyzing-${i}s.png`, fullPage: true })
        console.log(`   ✅ Screenshot: critical-04-analyzing-${i}s.png`)
      }
      
      // Check for saving message
      const saving = await page.locator('text=/Saving.*results|preparing review/i').isVisible().catch(() => false)
      if (saving) {
        console.log('   💾 Status: "Saving results and preparing review..."')
        await page.screenshot({ path: `screenshots/critical-05-saving-${i}s.png`, fullPage: true })
        console.log(`   ✅ Screenshot: critical-05-saving-${i}s.png`)
      }
      
      // Check for dialog
      const dialog = await page.locator('[role="dialog"]').isVisible().catch(() => false)
      if (dialog) {
        console.log('   🎉 DIALOG APPEARED!')
        dialogAppeared = true
        await page.screenshot({ path: 'screenshots/critical-06-dialog-appeared.png', fullPage: true })
        console.log('   ✅ Screenshot: critical-06-dialog-appeared.png')
        break
      }
      
      // Check for error
      const error = await page.locator('text=/error|failed/i').first().isVisible().catch(() => false)
      if (error) {
        const errorText = await page.locator('text=/error|failed/i').first().textContent()
        console.log('   ❌ ERROR DETECTED:', errorText)
        errorOccurred = true
        await page.screenshot({ path: 'screenshots/critical-06-error.png', fullPage: true })
        console.log('   ✅ Screenshot: critical-06-error.png')
        break
      }
      
      // Check for completion message
      const complete = await page.locator('text=/Analysis complete|review suggestions/i').isVisible().catch(() => false)
      if (complete) {
        console.log('   ✅ Analysis complete message detected')
        analysisComplete = true
        await page.screenshot({ path: 'screenshots/critical-06-complete.png', fullPage: true })
        console.log('   ✅ Screenshot: critical-06-complete.png')
        break
      }
      
      if (i < 90) {
        await page.waitForTimeout(10000)
      }
    }
    
    console.log('\n   Analysis monitoring complete.')
    console.log('   Dialog appeared:', dialogAppeared ? '✅ YES' : '❌ NO')
    console.log('   Error occurred:', errorOccurred ? '❌ YES' : '✅ NO')
    console.log('   Analysis complete:', analysisComplete ? '✅ YES' : '❌ NO\n')

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 4: HANDLE THE RESULT')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    if (dialogAppeared) {
      console.log('Dialog detected - processing...')
      
      // Read dialog title
      const dialogTitle = await page.locator('[role="dialog"] h2, [role="dialog"] [class*="DialogTitle"]').first().textContent().catch(() => 'Could not read title')
      console.log('1. Dialog title:', dialogTitle)
      
      // Read counts
      const dialogText = await page.locator('[role="dialog"]').textContent()
      console.log('2. Dialog content preview:', dialogText.substring(0, 200) + '...')
      
      // Look for Apply button
      const applyButton = page.locator('[role="dialog"] button:has-text("Apply")')
      const applyExists = await applyButton.isVisible().catch(() => false)
      console.log('3. Apply button found:', applyExists ? '✅ YES' : '❌ NO')
      
      if (applyExists) {
        console.log('4. Clicking Apply button...')
        await applyButton.click()
        console.log('   ✅ Clicked')
        
        console.log('5. Waiting for toast notification...')
        await page.waitForTimeout(3000)
        
        const toast = await page.locator('[class*="toast"], [role="status"]').textContent().catch(() => 'No toast found')
        console.log('   Toast message:', toast)
        
        await page.screenshot({ path: 'screenshots/critical-07-after-apply.png', fullPage: true })
        console.log('   ✅ Screenshot: critical-07-after-apply.png')
      }
    } else if (analysisComplete) {
      console.log('Analysis complete message detected (no dialog)')
      await page.screenshot({ path: 'screenshots/critical-07-complete-no-dialog.png', fullPage: true })
      console.log('✅ Screenshot: critical-07-complete-no-dialog.png')
    } else if (errorOccurred) {
      console.log('Error occurred during analysis - see screenshot above')
    } else {
      console.log('⚠️  No clear result detected after 90 seconds')
      await page.screenshot({ path: 'screenshots/critical-07-timeout.png', fullPage: true })
      console.log('✅ Screenshot: critical-07-timeout.png')
    }
    
    console.log()

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 5: CHECK DOWNSTREAM PAGES')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('A. TEAM PAGE - HIRING PLAN')
    console.log('1. Navigating to http://localhost:3000/team')
    await page.goto('http://localhost:3000/team', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // Close any modal
    const closeBtn = page.locator('button[aria-label="Close"]')
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click()
      await page.waitForTimeout(500)
    }
    
    console.log('2. Clicking Hiring Plan tab')
    const hiringTab = page.locator('[role="tab"]', { hasText: 'Hiring Plan' })
    const hiringTabExists = await hiringTab.isVisible().catch(() => false)
    console.log('   Hiring Plan tab found:', hiringTabExists ? '✅ YES' : '❌ NO')
    
    if (hiringTabExists) {
      await hiringTab.click()
      await page.waitForTimeout(2000)
    }
    
    console.log('3. Taking screenshot')
    await page.screenshot({ path: 'screenshots/critical-08-hiring-plan.png', fullPage: true })
    console.log('   ✅ Screenshot: critical-08-hiring-plan.png')
    
    // Check what's visible
    const emptyState = await page.locator('text=/no hiring plan/i').isVisible().catch(() => false)
    const hireCards = await page.locator('[class*="card"]').count()
    console.log('   Empty state visible:', emptyState ? '✅ YES' : '❌ NO')
    console.log('   Hire cards found:', hireCards)
    
    console.log('\nB. FUNDING PAGE')
    console.log('1. Navigating to http://localhost:3000/funding')
    await page.goto('http://localhost:3000/funding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    console.log('2. Taking screenshot')
    await page.screenshot({ path: 'screenshots/critical-09-funding-page.png', fullPage: true })
    console.log('   ✅ Screenshot: critical-09-funding-page.png')
    
    // Check what's visible
    const fundingEmpty = await page.locator('text=/no funding plan/i').isVisible().catch(() => false)
    const fundingCards = await page.locator('[class*="card"]').count()
    console.log('   Empty state visible:', fundingEmpty ? '✅ YES' : '❌ NO')
    console.log('   Funding cards found:', fundingCards)
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('TEST COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('All screenshots saved to screenshots/ directory')
    console.log('\nKeeping browser open for 30 seconds for manual inspection...')
    await page.waitForTimeout(30000)
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message)
    await page.screenshot({ path: 'screenshots/critical-fatal-error.png', fullPage: true })
    console.log('✅ Error screenshot: critical-fatal-error.png')
  } finally {
    await browser.close()
  }
}

criticalTest()
