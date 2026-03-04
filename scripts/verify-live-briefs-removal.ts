/**
 * Visual verification script for live ForgeOS site
 * Checks if "briefs" jargon has been removed from the AI Team page
 */

import { chromium, type Browser, type Page } from '@playwright/test'

interface VerificationResult {
  step: string
  success: boolean
  details: string
  screenshot?: string
  briefsFound?: string[]
}

async function verifyLiveSite() {
  const results: VerificationResult[] = []
  let browser: Browser | null = null
  let page: Page | null = null

  try {
    console.log('🚀 Starting live site verification...\n')

    // Launch browser
    browser = await chromium.launch({ headless: false })
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
    })
    page = await context.newPage()

    // Step 1: Navigate directly to login page
    console.log('📍 Step 1: Navigating to https://fractionalforge.app/login')
    await page.goto('https://fractionalforge.app/login', { waitUntil: 'networkidle' })
    await page.screenshot({ path: 'screenshots/verify-live/01-login-page.png', fullPage: true })
    
    const currentUrl = page.url()
    console.log(`Current URL: ${currentUrl}`)

    // Step 2: Login
    console.log('🔐 Step 2: Logging in...')
    
    // Use test credentials from E2E tests
    const testEmail = process.env.TEST_FOUNDER_EMAIL || 'demo.founder@forgeos.io'
    const testPassword = process.env.TEST_FOUNDER_PASSWORD || 'DemoFounder2026!'
    
    console.log(`Attempting login with: ${testEmail}`)
    
    // Fill login form
    const emailInput = page.locator('input[type="email"], input[name="email"]')
    const passwordInput = page.locator('input[type="password"], input[name="password"]')
    
    await emailInput.waitFor({ state: 'visible', timeout: 5000 })
    await emailInput.fill(testEmail)
    await passwordInput.fill(testPassword)
    
    await page.screenshot({ path: 'screenshots/verify-live/02-login-filled.png', fullPage: true })
    
    // Find and click submit button - look for "ENTER THE FORGE" button
    const submitButton = page.locator('button:has-text("ENTER THE FORGE"), button:has-text("Enter"), button[type="submit"]').first()
    await submitButton.waitFor({ state: 'visible', timeout: 5000 })
    await submitButton.click()
    
    // Wait for navigation
    console.log('Waiting for navigation after login...')
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/verify-live/02b-after-login.png', fullPage: true })
    
    const afterLoginUrl = page.url()
    console.log(`After login URL: ${afterLoginUrl}`)
    
    if (afterLoginUrl.includes('/login')) {
      console.log('⚠️  Login failed - still on login page')
      results.push({
        step: 'Login',
        success: false,
        details: 'Login failed - credentials may be invalid',
        screenshot: 'screenshots/verify-live/02b-after-login.png',
      })
      return results
    } else {
      console.log('✅ Login successful')
      results.push({
        step: 'Login',
        success: true,
        details: `Logged in as ${testEmail}, redirected to ${afterLoginUrl}`,
        screenshot: 'screenshots/verify-live/02b-after-login.png',
      })
    }

    // Step 3: Try to navigate directly to /agents
    console.log('\n📍 Step 3: Navigating to /agents page')
    await page.goto('https://fractionalforge.app/agents', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // Check for and close any onboarding overlays
    const skipButton = page.locator('button:has-text("SKIP"), button:has-text("Skip"), a:has-text("SKIP TOUR")')
    if (await skipButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found onboarding overlay, clicking skip...')
      await skipButton.click()
      await page.waitForTimeout(1000)
    }
    
    // Close any dialogs that might be open
    const closeButton = page.locator('[aria-label="Close"], button:has-text("Close")').first()
    if (await closeButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Found dialog, closing...')
      await closeButton.click()
      await page.waitForTimeout(1000)
    }
    
    await page.screenshot({ path: 'screenshots/verify-live/03-agents-page.png', fullPage: true })

    // Step 4: Check for "briefs" text on the page
    console.log('\n🔍 Step 4: Checking for "briefs" text...')
    const pageContent = await page.content()
    const pageText = await page.locator('body').innerText()
    
    // Search for "brief" or "briefs" (case-insensitive)
    const briefsRegex = /\bbriefs?\b/gi
    const briefsMatches = pageText.match(briefsRegex) || []
    
    if (briefsMatches.length > 0) {
      console.log(`❌ Found ${briefsMatches.length} instances of "brief/briefs":`)
      
      // Find specific elements containing "briefs"
      const briefElements = await page.locator('body *').evaluateAll((elements) => {
        const results: { tag: string; text: string; className: string }[] = []
        elements.forEach((el) => {
          const text = el.textContent || ''
          if (/\bbriefs?\b/i.test(text) && text.length < 200) {
            results.push({
              tag: el.tagName,
              text: text.trim(),
              className: (el as HTMLElement).className || '',
            })
          }
        })
        return results.slice(0, 10) // Limit to first 10
      })
      
      briefElements.forEach((el, i) => {
        console.log(`  ${i + 1}. <${el.tag}${el.className ? ` class="${el.className}"` : ''}>: "${el.text.substring(0, 100)}..."`)
      })
      
      results.push({
        step: 'Check for "briefs" text',
        success: false,
        details: `Found ${briefsMatches.length} instances of "brief/briefs" on the page`,
        screenshot: 'screenshots/verify-live/03-agents-page.png',
        briefsFound: briefElements.map(el => el.text),
      })
    } else {
      console.log('✅ No instances of "brief/briefs" found on the page')
      results.push({
        step: 'Check for "briefs" text',
        success: true,
        details: 'No instances of "brief/briefs" found',
        screenshot: 'screenshots/verify-live/03-agents-page.png',
      })
    }

    // Step 5: Check hero section
    console.log('\n🔍 Step 5: Checking hero section...')
    const heroSection = page.locator('h1, [class*="hero"], [class*="heading"]').first()
    if (await heroSection.isVisible()) {
      const heroText = await heroSection.innerText()
      console.log(`Hero text: "${heroText}"`)
      results.push({
        step: 'Check hero section',
        success: true,
        details: `Hero text: "${heroText}"`,
      })
    } else {
      console.log('⚠️  Could not find hero section')
      results.push({
        step: 'Check hero section',
        success: false,
        details: 'Hero section not found',
      })
    }

    // Step 6: Check for specialist cards
    console.log('\n🔍 Step 6: Checking specialist cards...')
    const cards = page.locator('[class*="card"], [class*="specialist"]')
    const cardCount = await cards.count()
    console.log(`Found ${cardCount} cards`)
    
    if (cardCount > 0) {
      // Check first few cards for "topics to explore" or similar
      for (let i = 0; i < Math.min(3, cardCount); i++) {
        const cardText = await cards.nth(i).innerText()
        console.log(`Card ${i + 1}: "${cardText.substring(0, 100)}..."`)
        
        if (/topics to explore/i.test(cardText)) {
          console.log(`  ❌ Found "topics to explore" in card ${i + 1}`)
          results.push({
            step: `Check card ${i + 1}`,
            success: false,
            details: `Found "topics to explore" in card ${i + 1}`,
          })
        }
      }
    }

    // Step 7: Try to access workflow/project builder
    console.log('\n📍 Step 7: Looking for workflow/project builder...')
    const builderLink = page.locator('a[href*="forge"], a[href*="builder"], a[href*="workflow"]').first()
    if (await builderLink.isVisible()) {
      console.log('Found builder link, clicking...')
      await builderLink.click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: 'screenshots/verify-live/04-builder-page.png', fullPage: true })
      
      // Check for "Template Library" vs "Brief Library"
      const sidebarText = await page.locator('[class*="sidebar"], nav').innerText()
      console.log(`Sidebar text: "${sidebarText}"`)
      
      if (/brief library/i.test(sidebarText)) {
        console.log('❌ Found "Brief Library" in sidebar')
        results.push({
          step: 'Check builder sidebar',
          success: false,
          details: 'Found "Brief Library" in sidebar (should be "Template Library")',
          screenshot: 'screenshots/verify-live/04-builder-page.png',
        })
      } else if (/template library/i.test(sidebarText)) {
        console.log('✅ Found "Template Library" in sidebar')
        results.push({
          step: 'Check builder sidebar',
          success: true,
          details: 'Found "Template Library" in sidebar',
          screenshot: 'screenshots/verify-live/04-builder-page.png',
        })
      } else {
        console.log('⚠️  Could not find library reference in sidebar')
        results.push({
          step: 'Check builder sidebar',
          success: false,
          details: 'Could not find library reference in sidebar',
          screenshot: 'screenshots/verify-live/04-builder-page.png',
        })
      }
    } else {
      console.log('⚠️  Could not find builder link')
      results.push({
        step: 'Find builder link',
        success: false,
        details: 'Could not find builder/workflow link',
      })
    }

  } catch (error) {
    console.error('❌ Error during verification:', error)
    results.push({
      step: 'Verification error',
      success: false,
      details: error instanceof Error ? error.message : String(error),
    })
  } finally {
    if (page) await page.close()
    if (browser) await browser.close()
  }

  return results
}

// Run verification
verifyLiveSite()
  .then((results) => {
    console.log('\n' + '='.repeat(80))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('='.repeat(80))
    
    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    results.forEach((result, i) => {
      const icon = result.success ? '✅' : '❌'
      console.log(`\n${icon} ${result.step}`)
      console.log(`   ${result.details}`)
      if (result.screenshot) {
        console.log(`   Screenshot: ${result.screenshot}`)
      }
      if (result.briefsFound && result.briefsFound.length > 0) {
        console.log(`   Found text containing "briefs":`)
        result.briefsFound.forEach((text, i) => {
          console.log(`     ${i + 1}. "${text.substring(0, 100)}..."`)
        })
      }
    })
    
    console.log('\n' + '='.repeat(80))
    console.log(`Total: ${results.length} checks | Passed: ${passed} | Failed: ${failed}`)
    console.log('='.repeat(80))
    
    process.exit(failed > 0 ? 1 : 0)
  })
  .catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
