/**
 * Test CAD Lab Landing Page on Production
 */

import { chromium } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function testCadLabLanding() {
  console.log('🚀 Testing CAD Lab Landing Page on Production')
  console.log('🌐 Site: https://centauros.io\n')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  })
  const page = await context.newPage()

  const screenshotsDir = path.join(process.cwd(), 'cad-lab-landing-test')
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
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-login-page.png`),
      fullPage: true 
    })
    
    // Step 3: Fill in credentials
    console.log('📝 Step 3: Filling in credentials')
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[type="password"]', 'DemoFounder2026!')
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-credentials-filled.png`),
      fullPage: true 
    })
    
    // Step 4: Click Sign In button
    console.log('🔐 Step 4: Clicking Sign In button')
    await page.click('button:has-text("Access Foundry")')
    
    // Step 5: Wait for redirect
    console.log('⏳ Step 5: Waiting for redirect (2-3 seconds)')
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
    console.log('⌨️  Step 8: Pressing Escape to dismiss any modals')
    await page.keyboard.press('Escape')
    await sleep(1000)
    
    // Step 9: Take snapshot of hero section
    console.log('📸 Step 9: Taking snapshot of hero landing section')
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-hero-section.png`),
      fullPage: false // Just viewport
    })
    
    // Step 10: Scroll down to see full page
    console.log('📜 Step 10: Scrolling down to see value pillars and templates')
    
    // Scroll in stages to capture everything
    await page.evaluate(() => window.scrollTo(0, 800))
    await sleep(1000)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-value-pillars.png`),
      fullPage: false
    })
    
    await page.evaluate(() => window.scrollTo(0, 1600))
    await sleep(1000)
    
    // Step 11: Take snapshot of templates section
    console.log('📸 Step 11: Taking snapshot of templates section')
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-templates-section.png`),
      fullPage: false
    })
    
    // Take full page screenshot for reference
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-full-page.png`),
      fullPage: true
    })
    
    // Analysis
    console.log('\n' + '═'.repeat(60))
    console.log('📊 ANALYSIS')
    console.log('═'.repeat(60))
    
    // Check hero banner image
    const heroBannerImage = await page.locator('img[alt*="CAD"], img[alt*="hero"], img[src*="hero"]').first().isVisible().catch(() => false)
    console.log(`\n🖼️  Hero Banner Image: ${heroBannerImage ? '✅ VISIBLE' : '❌ NOT FOUND'}`)
    
    // Check for value pillar cards
    const valuePillarCards = await page.locator('[class*="pillar"], [class*="value"]').count()
    console.log(`📦 Value Pillar Cards: ${valuePillarCards >= 3 ? '✅' : '⚠️'} Found ${valuePillarCards} elements`)
    
    // Check for images in value pillars
    const pillarImages = await page.locator('[class*="pillar"] img, [class*="value"] img').count()
    console.log(`   Images in pillars: ${pillarImages >= 3 ? '✅' : '⚠️'} Found ${pillarImages} images`)
    
    // Check for template cards
    const templateCards = await page.locator('[class*="template"]').count()
    console.log(`📋 Template Cards: ${templateCards >= 6 ? '✅' : '⚠️'} Found ${templateCards} elements`)
    
    // Check for images in templates
    const templateImages = await page.locator('[class*="template"] img').count()
    console.log(`   Images in templates: ${templateImages >= 6 ? '✅' : '⚠️'} Found ${templateImages} images`)
    
    // Check for model selector
    const modelSelector = await page.locator('select, [role="combobox"], input[placeholder*="model"]').isVisible().catch(() => false)
    console.log(`🎛️  Model Selector: ${modelSelector ? '✅ VISIBLE' : '❌ NOT FOUND'}`)
    
    // Check sidebar for CAD Lab nav item
    const cadLabNavItem = await page.locator('nav a:has-text("CAD Lab"), [role="navigation"] a:has-text("CAD Lab")').isVisible().catch(() => false)
    console.log(`🧭 CAD Lab in Sidebar: ${cadLabNavItem ? '✅ VISIBLE' : '❌ NOT FOUND'}`)
    
    // Check for Workshop section in sidebar
    const workshopSection = await page.locator('nav:has-text("Workshop"), [role="navigation"]:has-text("Workshop")').isVisible().catch(() => false)
    console.log(`🏗️  Workshop Section: ${workshopSection ? '✅ VISIBLE' : '❌ NOT FOUND'}`)
    
    // Check page title
    const pageTitle = await page.title()
    console.log(`\n📄 Page Title: ${pageTitle}`)
    
    // Check for any broken images
    const brokenImages = await page.evaluate(() => {
      const images = Array.from(document.querySelectorAll('img'))
      return images.filter(img => !img.complete || img.naturalHeight === 0).length
    })
    console.log(`🖼️  Broken Images: ${brokenImages === 0 ? '✅ None' : `⚠️  ${brokenImages} broken`}`)
    
    // Check for console errors
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })
    
    await sleep(2000)
    
    if (consoleErrors.length === 0) {
      console.log(`🐛 Console Errors: ✅ None`)
    } else {
      console.log(`🐛 Console Errors: ⚠️  ${consoleErrors.length} errors`)
      consoleErrors.slice(0, 3).forEach((error, i) => {
        console.log(`   ${i + 1}. ${error.substring(0, 100)}`)
      })
    }
    
    console.log('\n' + '─'.repeat(60))
    console.log(`📸 Screenshots saved to: ${screenshotsDir}`)
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

testCadLabLanding().catch(console.error)
