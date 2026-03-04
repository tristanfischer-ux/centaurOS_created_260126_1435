/**
 * Verify the "briefs" jargon fix on live ForgeOS site
 * Specifically checks the "Plan a Team Project" card
 */

import { chromium, type Browser, type Page } from '@playwright/test'

async function verifyBriefsFix() {
  let browser: Browser | null = null
  let page: Page | null = null

  try {
    console.log('🚀 Starting verification of briefs jargon fix...\n')

    // Launch browser
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    page = await context.newPage()

    // Step 1: Navigate to login page
    console.log('📍 Step 1: Navigating to login page')
    await page.goto('https://fractionalforge.app/login', { waitUntil: 'networkidle' })
    await page.screenshot({ path: 'screenshots/verify-briefs/01-login-page.png', fullPage: true })

    // Step 2: Login with provided credentials
    console.log('🔐 Step 2: Logging in with tristan@fractionalforge.app')
    
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')
    
    await emailInput.waitFor({ state: 'visible', timeout: 5000 })
    await emailInput.fill('tristan@fractionalforge.app')
    await passwordInput.fill('Pass1234!')
    
    await page.screenshot({ path: 'screenshots/verify-briefs/02-login-filled.png', fullPage: true })
    
    // Click submit button
    const submitButton = page.locator('button:has-text("ENTER THE FORGE"), button:has-text("Enter"), button[type="submit"]').first()
    await submitButton.waitFor({ state: 'visible', timeout: 5000 })
    await submitButton.click()
    
    // Wait for navigation
    console.log('⏳ Waiting for navigation after login...')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/verify-briefs/03-after-login.png', fullPage: true })
    
    const afterLoginUrl = page.url()
    console.log(`✅ Login successful, redirected to: ${afterLoginUrl}\n`)

    // Step 3: Navigate to agents page
    console.log('📍 Step 3: Navigating to /agents page')
    await page.goto('https://fractionalforge.app/agents', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // Check for and close any onboarding overlays
    const skipButton = page.locator('button:has-text("SKIP"), button:has-text("Skip"), a:has-text("SKIP TOUR")')
    if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found onboarding overlay, clicking skip...')
      await skipButton.click()
      await page.waitForTimeout(1000)
    }
    
    await page.screenshot({ path: 'screenshots/verify-briefs/04-agents-page-top.png', fullPage: true })
    console.log('✅ On agents page\n')

    // Step 4: Scroll down to find "Plan a Team Project" card
    console.log('📜 Step 4: Scrolling down to find "Plan a Team Project" card')
    
    // Try to find the card by text
    const projectCard = page.locator('text="Plan a Team Project"').first()
    
    // Scroll to the card if it exists
    if (await projectCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found "Plan a Team Project" card, scrolling to it...')
      await projectCard.scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000)
    } else {
      console.log('Card not immediately visible, scrolling down...')
      // Scroll down in increments
      for (let i = 0; i < 5; i++) {
        await page.evaluate(() => window.scrollBy(0, 500))
        await page.waitForTimeout(500)
        
        if (await projectCard.isVisible({ timeout: 1000 }).catch(() => false)) {
          console.log('Found card after scrolling')
          await projectCard.scrollIntoViewIfNeeded()
          break
        }
      }
    }
    
    await page.screenshot({ path: 'screenshots/verify-briefs/05-scrolled-to-card.png', fullPage: true })

    // Step 5: Extract the card text
    console.log('\n🔍 Step 5: Extracting "Plan a Team Project" card text')
    
    const cardContainer = page.locator('text="Plan a Team Project"').locator('..').locator('..')
    
    if (await cardContainer.isVisible({ timeout: 2000 }).catch(() => false)) {
      const cardText = await cardContainer.innerText()
      console.log('\n' + '='.repeat(80))
      console.log('📋 CARD TEXT:')
      console.log('='.repeat(80))
      console.log(cardText)
      console.log('='.repeat(80))
      
      // Check if it contains "brief" or "briefs"
      const hasBrief = /\bbrief\b/i.test(cardText)
      const hasBriefs = /\bbriefs\b/i.test(cardText)
      
      if (hasBrief || hasBriefs) {
        console.log('\n❌ ISSUE: Card still contains "brief" or "briefs"')
        
        // Highlight the specific text
        const briefMatch = cardText.match(/[^.]*\bbrief[s]?\b[^.]*/i)
        if (briefMatch) {
          console.log(`   Found: "${briefMatch[0]}"`)
        }
      } else {
        console.log('\n✅ GOOD: Card does NOT contain "brief" or "briefs"')
      }
      
      // Check for expected text
      if (/chain multiple specialists together/i.test(cardText)) {
        console.log('✅ VERIFIED: Card says "chain multiple specialists together"')
      } else if (/brief multiple specialists in sequence/i.test(cardText)) {
        console.log('❌ PROBLEM: Card still says "brief multiple specialists in sequence"')
      } else {
        console.log('⚠️  WARNING: Card text doesn\'t match expected patterns')
      }
    } else {
      console.log('⚠️  Could not find "Plan a Team Project" card')
    }

    // Step 6: Check entire page for "brief" or "briefs"
    console.log('\n🔍 Step 6: Checking entire page for "brief" or "briefs"')
    
    const pageText = await page.locator('body').innerText()
    
    // Search for "brief" or "briefs" (case-insensitive)
    const briefsRegex = /\bbriefs?\b/gi
    const briefsMatches = pageText.match(briefsRegex) || []
    
    if (briefsMatches.length > 0) {
      console.log(`\n⚠️  Found ${briefsMatches.length} instances of "brief/briefs" on the page:`)
      
      // Find specific elements containing "briefs"
      const briefElements = await page.locator('body *').evaluateAll((elements) => {
        const results: { text: string; context: string }[] = []
        elements.forEach((el) => {
          const text = el.textContent || ''
          if (/\bbriefs?\b/i.test(text) && text.length < 300 && text.length > 10) {
            // Get some context
            const match = text.match(/[^.]*\bbriefs?\b[^.]*/i)
            if (match) {
              results.push({
                text: match[0].trim(),
                context: text.substring(0, 150).trim(),
              })
            }
          }
        })
        // Deduplicate
        const seen = new Set()
        return results.filter((r) => {
          if (seen.has(r.text)) return false
          seen.add(r.text)
          return true
        }).slice(0, 10)
      })
      
      briefElements.forEach((el, i) => {
        console.log(`\n  ${i + 1}. "${el.text}"`)
        if (el.context !== el.text) {
          console.log(`     Context: "${el.context}..."`)
        }
        
        // Check if it's the acceptable "Meeting prep & briefs"
        if (/meeting prep.*briefs/i.test(el.text) || /briefs.*meeting prep/i.test(el.text)) {
          console.log('     ✅ This is acceptable (executive briefings)')
        } else {
          console.log('     ❌ This should be fixed')
        }
      })
    } else {
      console.log('\n✅ No instances of "brief/briefs" found on the page')
    }

    // Final screenshot
    await page.screenshot({ path: 'screenshots/verify-briefs/06-final-state.png', fullPage: true })
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ Verification complete!')
    console.log('='.repeat(80))

  } catch (error) {
    console.error('❌ Error during verification:', error)
  } finally {
    if (page) await page.close()
    if (browser) await browser.close()
  }
}

// Run verification
verifyBriefsFix()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
