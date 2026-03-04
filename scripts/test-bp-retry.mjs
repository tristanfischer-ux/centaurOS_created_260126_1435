import { chromium } from '@playwright/test'

async function retryTest() {
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Capture console messages
  page.on('console', msg => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      console.log(`[BROWSER ${type.toUpperCase()}]:`, msg.text())
    }
  })

  page.on('pageerror', error => {
    console.log('[PAGE ERROR]:', error.message)
  })

  try {
    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 1: LOGIN')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('1. Navigating to http://localhost:3000/login')
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
    
    console.log('2. Entering credentials:')
    console.log('   Email: demo.founder@forgeos.io')
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    
    console.log('   Password: DemoFounder2026!')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    
    console.log('3. Clicking login button')
    await page.click('button:has-text("Enter the Forge")')
    
    console.log('4. Waiting for redirect...')
    try {
      await page.waitForURL(/.*\/(today|strategy|dashboard).*/, { timeout: 15000 })
      console.log('   ✅ Login successful\n')
    } catch (e) {
      const currentUrl = page.url()
      console.log('   ⚠️  Current URL:', currentUrl)
      
      if (currentUrl.includes('error=')) {
        const errorMsg = await page.locator('text=/error|invalid/i').textContent().catch(() => 'See URL')
        console.log('   ❌ Login failed:', errorMsg)
        await page.screenshot({ path: 'screenshots/retry-login-error.png', fullPage: true })
        throw new Error('Login failed: ' + errorMsg)
      }
    }
    
    // Dismiss onboarding
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true')
      localStorage.setItem('forgeos_intent_selected', 'true')
      localStorage.setItem('forgeos:onboarding:completed', 'true')
      localStorage.setItem('forgeos:marketplace:onboarding:completed', 'true')
    })

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 2: UPLOAD BUSINESS PLAN')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    console.log('1. Navigating to http://localhost:3000/strategy')
    await page.goto('http://localhost:3000/strategy', { waitUntil: 'networkidle' })
    
    console.log('2. Waiting 5 seconds for page to load')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/retry-01-strategy-page.png', fullPage: true })
    console.log('   ✅ Screenshot: retry-01-strategy-page.png')
    
    console.log('3. Finding upload zone')
    const uploadZoneVisible = await page.locator('text=/Drop your business plan here/i').isVisible().catch(() => false)
    console.log('   Upload zone visible:', uploadZoneVisible ? '✅ YES' : '❌ NO')
    
    console.log('4. Uploading file: test-business-plan.txt')
    const fileInput = page.locator('input[type="file"]')
    const filePath = '/Users/tristanfischer/Developer/CentaurOS created 260126 1435/test-business-plan.txt'
    await fileInput.setInputFiles(filePath)
    console.log('   ✅ File selected')
    
    console.log('5. Waiting for analysis to start...')
    await page.waitForTimeout(3000)
    
    console.log('6. CRITICAL: Monitoring analysis (checking every 15 seconds for 2 minutes)...\n')
    
    let result = {
      dialogAppeared: false,
      analysisComplete: false,
      errorOccurred: false,
      errorMessage: null
    }
    
    const maxWaitTime = 120 // 2 minutes
    const checkInterval = 15 // 15 seconds
    
    for (let elapsed = 0; elapsed <= maxWaitTime; elapsed += checkInterval) {
      console.log(`   [${elapsed}s] Checking page state...`)
      
      // Check for analyzing message
      const analyzing = await page.locator('text=/Claude is analyzing|analyzing.*business plan/i').isVisible().catch(() => false)
      if (analyzing) {
        const analyzeText = await page.locator('text=/Claude is analyzing|analyzing.*business plan/i').textContent()
        console.log(`   📊 Status: "${analyzeText}"`)
        await page.screenshot({ path: `screenshots/retry-02-analyzing-${elapsed}s.png`, fullPage: true })
        console.log(`   ✅ Screenshot: retry-02-analyzing-${elapsed}s.png`)
      }
      
      // Check for saving message
      const saving = await page.locator('text=/Saving.*results|preparing review/i').isVisible().catch(() => false)
      if (saving) {
        const saveText = await page.locator('text=/Saving.*results|preparing review/i').textContent()
        console.log(`   💾 Status: "${saveText}"`)
        await page.screenshot({ path: `screenshots/retry-03-saving-${elapsed}s.png`, fullPage: true })
        console.log(`   ✅ Screenshot: retry-03-saving-${elapsed}s.png`)
      }
      
      // Check for dialog
      const dialog = await page.locator('[role="dialog"]').isVisible().catch(() => false)
      if (dialog) {
        console.log('   🎉 DIALOG APPEARED!')
        result.dialogAppeared = true
        await page.screenshot({ path: 'screenshots/retry-04-dialog.png', fullPage: true })
        console.log('   ✅ Screenshot: retry-04-dialog.png')
        break
      }
      
      // Check for "Analysis complete" message
      const complete = await page.locator('text=/Analysis complete/i').isVisible().catch(() => false)
      if (complete) {
        console.log('   ✅ "Analysis complete" message detected')
        result.analysisComplete = true
        await page.screenshot({ path: 'screenshots/retry-04-complete.png', fullPage: true })
        console.log('   ✅ Screenshot: retry-04-complete.png')
        break
      }
      
      // Check for error
      const error = await page.locator('text=/error|failed/i').first().isVisible().catch(() => false)
      if (error) {
        const errorText = await page.locator('text=/error|failed/i').first().textContent()
        console.log('   ❌ ERROR DETECTED:', errorText)
        result.errorOccurred = true
        result.errorMessage = errorText
        await page.screenshot({ path: 'screenshots/retry-04-error.png', fullPage: true })
        console.log('   ✅ Screenshot: retry-04-error.png')
        break
      }
      
      if (elapsed < maxWaitTime) {
        await page.waitForTimeout(checkInterval * 1000)
      }
    }
    
    console.log('\n   Analysis monitoring complete.')
    console.log('   Dialog appeared:', result.dialogAppeared ? '✅ YES' : '❌ NO')
    console.log('   Analysis complete:', result.analysisComplete ? '✅ YES' : '❌ NO')
    console.log('   Error occurred:', result.errorOccurred ? '❌ YES' : '✅ NO')
    if (result.errorMessage) {
      console.log('   Error message:', result.errorMessage)
    }
    console.log()

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 3/4/5: HANDLE RESULT')
    console.log('═══════════════════════════════════════════════════════════\n')
    
    if (result.dialogAppeared) {
      console.log('✅ DIALOG APPEARED - Processing...\n')
      
      // Read dialog title
      const dialogTitle = await page.locator('[role="dialog"] h2, [role="dialog"] [class*="DialogTitle"]').first().textContent().catch(() => 'Could not read title')
      console.log('Dialog Title:', dialogTitle)
      
      // Read full dialog content
      const dialogContent = await page.locator('[role="dialog"]').textContent()
      console.log('\nDialog Content (first 500 chars):')
      console.log(dialogContent.substring(0, 500))
      console.log('...\n')
      
      // Look for counts
      const newMatch = dialogContent.match(/(\d+)\s+new/i)
      const mergeMatch = dialogContent.match(/(\d+)\s+merge/i)
      const skipMatch = dialogContent.match(/(\d+)\s+skip/i)
      
      console.log('Counts:')
      console.log('  - New:', newMatch ? newMatch[1] : 'Not found')
      console.log('  - Merge:', mergeMatch ? mergeMatch[1] : 'Not found')
      console.log('  - Skip:', skipMatch ? skipMatch[1] : 'Not found')
      
      // Try to extract objective titles
      console.log('\nAttempting to extract objective titles...')
      const objectiveTitles = await page.locator('[role="dialog"] [class*="objective"] h3, [role="dialog"] [class*="objective"] h4, [role="dialog"] li').allTextContents().catch(() => [])
      if (objectiveTitles.length > 0) {
        console.log(`Found ${objectiveTitles.length} potential objectives:`)
        objectiveTitles.slice(0, 10).forEach((title, i) => {
          if (title.trim().length > 5 && title.trim().length < 150) {
            console.log(`  ${i + 1}. ${title.trim()}`)
          }
        })
      } else {
        console.log('  Could not extract objective titles')
      }
      
      // Look for Apply button
      console.log('\nLooking for Apply button...')
      const applyButton = page.locator('[role="dialog"] button:has-text("Apply")')
      const applyExists = await applyButton.isVisible().catch(() => false)
      console.log('Apply button found:', applyExists ? '✅ YES' : '❌ NO')
      
      if (applyExists) {
        console.log('\nClicking Apply button...')
        await applyButton.click()
        console.log('✅ Clicked')
        
        console.log('Waiting for toast notification...')
        await page.waitForTimeout(3000)
        
        const toast = await page.locator('[class*="toast"], [role="status"], [class*="Toaster"]').textContent().catch(() => 'No toast found')
        console.log('Toast message:', toast)
        
        await page.screenshot({ path: 'screenshots/retry-05-after-apply.png', fullPage: true })
        console.log('✅ Screenshot: retry-05-after-apply.png')
      }
      
    } else if (result.analysisComplete) {
      console.log('✅ ANALYSIS COMPLETE (no dialog)')
      await page.screenshot({ path: 'screenshots/retry-05-complete-no-dialog.png', fullPage: true })
      console.log('✅ Screenshot: retry-05-complete-no-dialog.png')
      
    } else if (result.errorOccurred) {
      console.log('❌ ERROR OCCURRED')
      console.log('Error message:', result.errorMessage)
      console.log('See screenshot: retry-04-error.png')
      
    } else {
      console.log('⚠️  TIMEOUT - No clear result after 2 minutes')
      await page.screenshot({ path: 'screenshots/retry-05-timeout.png', fullPage: true })
      console.log('✅ Screenshot: retry-05-timeout.png')
    }
    
    console.log()

    console.log('═══════════════════════════════════════════════════════════')
    console.log('STEP 6: CHECK DOWNSTREAM PAGES')
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
    if (await hiringTab.isVisible().catch(() => false)) {
      await hiringTab.click()
      await page.waitForTimeout(2000)
    }
    
    console.log('3. Taking screenshot')
    await page.screenshot({ path: 'screenshots/retry-06-hiring-plan.png', fullPage: true })
    console.log('   ✅ Screenshot: retry-06-hiring-plan.png')
    
    // Analyze what's visible
    const emptyState = await page.locator('text=/no hiring plan/i').isVisible().catch(() => false)
    const hireCards = await page.locator('[class*="card"]').count()
    
    console.log('4. What I see:')
    console.log('   - Empty state visible:', emptyState ? 'YES' : 'NO')
    console.log('   - Card elements found:', hireCards)
    
    if (!emptyState && hireCards > 0) {
      // Try to extract hire data
      const hireTitles = await page.locator('h3, h4, [class*="title"]').allTextContents().catch(() => [])
      console.log('   - Hire titles found:')
      hireTitles.slice(0, 10).forEach((title, i) => {
        if (title.trim().length > 3 && title.trim().length < 100) {
          console.log(`     ${i + 1}. ${title.trim()}`)
        }
      })
    }
    
    console.log('\nB. FUNDING PAGE')
    console.log('1. Navigating to http://localhost:3000/funding')
    await page.goto('http://localhost:3000/funding', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    console.log('2. Taking screenshot')
    await page.screenshot({ path: 'screenshots/retry-07-funding-page.png', fullPage: true })
    console.log('   ✅ Screenshot: retry-07-funding-page.png')
    
    // Analyze what's visible
    const fundingEmpty = await page.locator('text=/no funding plan/i').isVisible().catch(() => false)
    const fundingCards = await page.locator('[class*="card"]').count()
    
    console.log('3. What I see:')
    console.log('   - Empty state visible:', fundingEmpty ? 'YES' : 'NO')
    console.log('   - Card elements found:', fundingCards)
    
    if (!fundingEmpty && fundingCards > 0) {
      // Try to extract funding data
      const fundingTitles = await page.locator('h3, h4, [class*="title"]').allTextContents().catch(() => [])
      console.log('   - Funding events found:')
      fundingTitles.slice(0, 10).forEach((title, i) => {
        if (title.trim().length > 3 && title.trim().length < 100) {
          console.log(`     ${i + 1}. ${title.trim()}`)
        }
      })
      
      // Look for amounts
      const amounts = await page.locator('text=/\\$[0-9,]+/').allTextContents().catch(() => [])
      if (amounts.length > 0) {
        console.log('   - Amounts found:', amounts.slice(0, 5).join(', '))
      }
    }
    
    console.log('\n═══════════════════════════════════════════════════════════')
    console.log('TEST COMPLETE')
    console.log('═══════════════════════════════════════════════════════════')
    console.log('All screenshots saved to screenshots/ directory')
    console.log('\nKeeping browser open for 30 seconds for inspection...')
    await page.waitForTimeout(30000)
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message)
    await page.screenshot({ path: 'screenshots/retry-fatal-error.png', fullPage: true })
    console.log('✅ Error screenshot: retry-fatal-error.png')
  } finally {
    await browser.close()
  }
}

retryTest()
