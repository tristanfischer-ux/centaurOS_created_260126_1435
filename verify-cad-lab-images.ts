/**
 * Verify CAD Lab Images on Production
 * Checks hero banner, value pillars, and template cards
 */

import { chromium } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function verifyCadLabImages() {
  console.log('🚀 Verifying CAD Lab Images on Production')
  console.log('🌐 Site: https://centauros.io\n')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  })
  const page = await context.newPage()

  const screenshotsDir = path.join(process.cwd(), 'cad-lab-images-verification')
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true })
  }

  let stepNumber = 1

  try {
    // Step 1: Navigate to login
    console.log('📍 Step 1: Navigate to login page')
    await page.goto('https://centauros.io/login', {
      waitUntil: 'networkidle',
      timeout: 30000
    })
    
    // Step 2: Take snapshot of login form
    console.log('📸 Step 2: Taking snapshot of login form')
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-login-form.png`),
      fullPage: true 
    })
    
    // Step 3: Fill in credentials
    console.log('📝 Step 3: Filling in credentials')
    console.log('   Email: demo.founder@forgeos.io')
    console.log('   Password: DemoFounder2026!')
    
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[type="password"]', 'DemoFounder2026!')
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-credentials-filled.png`),
      fullPage: true 
    })
    
    // Step 4: Click Sign In
    console.log('🔐 Step 4: Clicking Sign In button')
    await page.click('button:has-text("Access Foundry")')
    
    // Step 5: Wait for redirect
    console.log('⏳ Step 5: Waiting 3 seconds for redirect')
    await sleep(3000)
    
    console.log(`   Redirected to: ${page.url()}`)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-after-login.png`),
      fullPage: true 
    })
    
    // Step 6: Navigate to CAD Lab
    console.log('📍 Step 6: Navigating to CAD Lab')
    await page.goto('https://centauros.io/the-forge/cad-lab', {
      waitUntil: 'networkidle',
      timeout: 30000
    })
    
    // Step 7: Wait for page to load
    console.log('⏳ Step 7: Waiting 3 seconds for page to load')
    await sleep(3000)
    
    // Step 8: Press Escape to dismiss modals
    console.log('⌨️  Step 8: Pressing Escape to dismiss any modal overlays')
    await page.keyboard.press('Escape')
    await sleep(1000)
    
    // Step 9: Take snapshot of hero section
    console.log('📸 Step 9: Taking snapshot of hero section (top of page)')
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(500)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-hero-section.png`),
      fullPage: false
    })
    
    // Step 10: Scroll to value pillars
    console.log('📜 Step 10: Scrolling down to value pillars section')
    await page.evaluate(() => window.scrollTo(0, 600))
    await sleep(1000)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-value-pillars.png`),
      fullPage: false
    })
    
    // Step 11: Scroll to templates
    console.log('📜 Step 11: Scrolling down to quick-start templates section')
    await page.evaluate(() => window.scrollTo(0, 1400))
    await sleep(1000)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-templates-section.png`),
      fullPage: false
    })
    
    // Step 12: Scroll to model selector
    console.log('📜 Step 12: Scrolling to model selector input')
    await page.evaluate(() => window.scrollTo(0, 2400))
    await sleep(1000)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-model-selector.png`),
      fullPage: false
    })
    
    // Take full page screenshot
    console.log('📸 Taking full page screenshot for reference')
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(500)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-full-page.png`),
      fullPage: true
    })
    
    // ═══════════════════════════════════════════════════════════════
    // DETAILED ANALYSIS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60))
    console.log('📊 IMAGE VERIFICATION ANALYSIS')
    console.log('═'.repeat(60))
    
    // Check hero banner
    console.log('\n🖼️  HERO BANNER IMAGE')
    const heroBannerSelectors = [
      'img[alt*="CAD"]',
      'img[alt*="hero"]',
      'img[alt*="banner"]',
      'img[src*="hero"]',
      'img[src*="cad-lab"]',
      '[class*="hero"] img'
    ]
    
    let heroBannerFound = false
    for (const selector of heroBannerSelectors) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false)
      if (visible) {
        const src = await page.locator(selector).first().getAttribute('src').catch(() => 'unknown')
        const alt = await page.locator(selector).first().getAttribute('alt').catch(() => 'no alt')
        console.log(`   ✅ Found hero image: ${alt}`)
        console.log(`      Source: ${src}`)
        heroBannerFound = true
        break
      }
    }
    
    if (!heroBannerFound) {
      console.log('   ❌ Hero banner image not found')
    }
    
    // Check value pillar cards
    console.log('\n📦 VALUE PILLAR CARDS (Expected: 3)')
    const pillarSelectors = [
      'text=AI Research',
      'text=Parametric CAD',
      'text=Production Ready'
    ]
    
    let pillarCount = 0
    for (const selector of pillarSelectors) {
      const visible = await page.locator(selector).isVisible().catch(() => false)
      if (visible) {
        pillarCount++
        console.log(`   ✅ Found: ${selector.replace('text=', '')}`)
        
        // Check for image near this text
        const nearbyImage = await page.locator(selector).locator('..').locator('img').isVisible().catch(() => false)
        console.log(`      Image: ${nearbyImage ? '✅ Present' : '⚠️  Not found'}`)
      } else {
        console.log(`   ❌ Not found: ${selector.replace('text=', '')}`)
      }
    }
    
    console.log(`   Total pillars found: ${pillarCount}/3`)
    
    // Check template cards
    console.log('\n📋 QUICK-START TEMPLATE CARDS (Expected: 6)')
    const templateNames = [
      'Drone Frame',
      'Desk Organizer',
      'Phone Stand',
      'Enclosure Box',
      'Bracket Mount',
      'Gear Assembly'
    ]
    
    let templateCount = 0
    for (const templateName of templateNames) {
      const visible = await page.locator(`text=${templateName}`).isVisible().catch(() => false)
      if (visible) {
        templateCount++
        console.log(`   ✅ Found: ${templateName}`)
        
        // Check for image near this text
        const nearbyImage = await page.locator(`text=${templateName}`).locator('..').locator('img').isVisible().catch(() => false)
        console.log(`      Image: ${nearbyImage ? '✅ Present' : '⚠️  Not found'}`)
      } else {
        console.log(`   ❌ Not found: ${templateName}`)
      }
    }
    
    console.log(`   Total templates found: ${templateCount}/6`)
    
    // Check model selector
    console.log('\n🎛️  MODEL SELECTOR')
    const modelSelectorVisible = await page.locator('select, [role="combobox"], input[placeholder*="model"]').isVisible().catch(() => false)
    console.log(`   ${modelSelectorVisible ? '✅' : '❌'} Model selector visible`)
    
    if (modelSelectorVisible) {
      const selectorType = await page.locator('select').isVisible().catch(() => false) ? 'select' : 'input'
      console.log(`   Type: ${selectorType}`)
    }
    
    // Check all images on page
    console.log('\n🖼️  IMAGE HEALTH CHECK')
    const totalImages = await page.locator('img').count()
    console.log(`   Total images on page: ${totalImages}`)
    
    const brokenImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
      return images.filter(img => !img.complete || img.naturalHeight === 0).map(img => ({
        src: img.src,
        alt: img.alt
      }))
    })
    
    if (brokenImages.length === 0) {
      console.log(`   ✅ All images loaded successfully (0 broken)`)
    } else {
      console.log(`   ⚠️  ${brokenImages.length} broken images:`)
      brokenImages.forEach((img, i) => {
        console.log(`      ${i + 1}. ${img.alt || 'No alt'} - ${img.src}`)
      })
    }
    
    // Visual impression
    console.log('\n✨ VISUAL IMPRESSION')
    const hasBackgroundColor = await page.evaluate(() => {
      const body = document.body
      const bgColor = window.getComputedStyle(body).backgroundColor
      return bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent'
    })
    console.log(`   Background: ${hasBackgroundColor ? '✅ Styled' : '⚠️  Transparent'}`)
    
    const hasProperSpacing = await page.locator('[class*="space"], [class*="gap"]').count()
    console.log(`   Spacing elements: ${hasProperSpacing > 5 ? '✅' : '⚠️'} Found ${hasProperSpacing} spacing utilities`)
    
    const hasCards = await page.locator('[class*="card"], .card').count()
    console.log(`   Card components: ${hasCards > 0 ? '✅' : '⚠️'} Found ${hasCards} cards`)
    
    console.log('\n' + '─'.repeat(60))
    console.log(`📸 All screenshots saved to: ${screenshotsDir}`)
    console.log(`   Total screenshots: ${stepNumber - 1}`)
    console.log('─'.repeat(60))

  } catch (error) {
    console.error('\n❌ Test failed with error:', error)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error-state.png'),
      fullPage: true 
    }).catch(() => {})
    
    throw error
  } finally {
    console.log('\n🏁 Test complete. Closing browser in 5 seconds...')
    await sleep(5000)
    await browser.close()
  }
}

verifyCadLabImages().catch(console.error)
