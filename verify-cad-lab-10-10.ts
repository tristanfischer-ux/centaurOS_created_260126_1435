/**
 * Verify CAD Lab 10/10 Engineering Powerhouse UI
 * Checks for hero banner, stats bar, capability cards, and engineering templates
 */

import { chromium } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function verifyCadLab10() {
  console.log('🚀 Verifying CAD Lab 10/10 Engineering Powerhouse UI')
  console.log('🌐 Site: https://centauros.io/the-forge/cad-lab\n')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  })
  const page = await context.newPage()

  const screenshotsDir = path.join(process.cwd(), 'cad-lab-10-10-verification')
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true })
  }

  let stepNumber = 1

  try {
    // Navigate to CAD Lab
    console.log('📍 Step 1: Navigating to CAD Lab')
    await page.goto('https://centauros.io/the-forge/cad-lab', {
      waitUntil: 'networkidle',
      timeout: 30000
    })
    
    await sleep(2000)
    
    // Check if redirected to login
    const currentUrl = page.url()
    console.log(`   Current URL: ${currentUrl}`)
    
    if (currentUrl.includes('/login')) {
      console.log('⚠️  Redirected to login page')
      console.log('   Attempting to login...')
      
      await page.fill('input[type="email"]', 'demo.founder@forgeos.io')
      await page.fill('input[type="password"]', 'DemoFounder2026!')
      
      // Click login and wait for navigation
      await Promise.all([
        page.waitForURL(url => !url.toString().includes('/login'), { timeout: 10000 }),
        page.click('button:has-text("Enter the Forge")')
      ])
      
      console.log(`   Logged in successfully, redirected to: ${page.url()}`)
      await sleep(2000)
      
      // If not already on CAD Lab, navigate there
      if (!page.url().includes('/the-forge/cad-lab')) {
        console.log('   Navigating to CAD Lab')
        await page.goto('https://centauros.io/the-forge/cad-lab', {
          waitUntil: 'networkidle',
          timeout: 30000
        })
        await sleep(2000)
      }
    }
    
    // Press Escape to dismiss any modals
    console.log('⌨️  Pressing Escape to dismiss modals')
    await page.keyboard.press('Escape')
    await sleep(1000)
    
    // Take full page screenshot
    console.log('📸 Taking full page screenshot')
    await page.evaluate(() => window.scrollTo(0, 0))
    await sleep(500)
    
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-full-page.png`),
      fullPage: true 
    })
    
    // Take viewport screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, `${String(stepNumber++).padStart(2, '0')}-viewport.png`),
      fullPage: false 
    })
    
    // ═══════════════════════════════════════════════════════════════
    // VERIFICATION CHECKS
    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60))
    console.log('📊 CAD LAB 10/10 VERIFICATION')
    console.log('═'.repeat(60))
    
    // Check 1: Page loads without errors
    console.log('\n✅ CHECK 1: Page Load')
    const pageTitle = await page.title()
    console.log(`   Page title: ${pageTitle}`)
    console.log(`   URL: ${page.url()}`)
    console.log(`   ${page.url().includes('/the-forge/cad-lab') ? '✅' : '❌'} Correct URL`)
    
    // Check 2: Hero banner image
    console.log('\n🖼️  CHECK 2: Hero Banner Image')
    const heroBannerSelectors = [
      'img[alt*="rocket"]',
      'img[alt*="satellite"]',
      'img[alt*="robot"]',
      'img[alt*="progression"]',
      'img[src*="hero"]',
      'img[src*="cad-lab"]',
      '[class*="hero"] img',
      'img[alt*="engineering"]',
      'img[alt*="powerhouse"]'
    ]
    
    let heroBannerFound = false
    let heroBannerAlt = ''
    for (const selector of heroBannerSelectors) {
      const visible = await page.locator(selector).first().isVisible().catch(() => false)
      if (visible) {
        const src = await page.locator(selector).first().getAttribute('src').catch(() => 'unknown')
        const alt = await page.locator(selector).first().getAttribute('alt').catch(() => 'no alt')
        console.log(`   ✅ Found hero image: ${alt}`)
        console.log(`      Source: ${src}`)
        heroBannerFound = true
        heroBannerAlt = alt ?? ''
        break
      }
    }
    
    if (!heroBannerFound) {
      console.log('   ❌ Hero banner image not found')
    }
    
    // Check 3: Credibility stats bar
    console.log('\n📊 CHECK 3: Credibility Stats Bar')
    const statsTexts = [
      '256 Parametric Components',
      '15 Industry Sectors',
      '7 Projection Views',
      'STEP + STL Export'
    ]
    
    let statsFound = 0
    for (const text of statsTexts) {
      const visible = await page.locator(`text=${text}`).isVisible().catch(() => false)
      if (visible) {
        statsFound++
        console.log(`   ✅ Found: ${text}`)
      } else {
        console.log(`   ❌ Not found: ${text}`)
      }
    }
    console.log(`   Total stats found: ${statsFound}/4`)
    
    // Check 4: 5 Capability cards
    console.log('\n📦 CHECK 4: Capability Cards (Expected: 5)')
    const capabilityCards = [
      'AI Research',
      '256 Components',
      'DFM Analysis',
      'Mass Properties',
      'STEP + STL'
    ]
    
    let capabilityCount = 0
    for (const card of capabilityCards) {
      const visible = await page.locator(`text=${card}`).isVisible().catch(() => false)
      if (visible) {
        capabilityCount++
        console.log(`   ✅ Found: ${card}`)
      } else {
        console.log(`   ❌ Not found: ${card}`)
      }
    }
    console.log(`   Total capability cards found: ${capabilityCount}/5`)
    
    // Check 5: 6 Engineering template cards
    console.log('\n🛰️  CHECK 5: Engineering Template Cards (Expected: 6)')
    const engineeringTemplates = [
      'CubeSat Bus',
      'Rocket Thrust Mount',
      'EV Battery Module',
      'Robotic Arm Joint',
      'Reaction Wheel',
      'Heavy-Lift Drone'
    ]
    
    let templateCount = 0
    for (const template of engineeringTemplates) {
      const visible = await page.locator(`text=${template}`).isVisible().catch(() => false)
      if (visible) {
        templateCount++
        console.log(`   ✅ Found: ${template}`)
        
        // Check for image near this text
        const nearbyImage = await page.locator(`text=${template}`).locator('..').locator('img').isVisible().catch(() => false)
        console.log(`      Image: ${nearbyImage ? '✅ Present' : '⚠️  Not found'}`)
      } else {
        console.log(`   ❌ Not found: ${template}`)
      }
    }
    console.log(`   Total template cards found: ${templateCount}/6`)
    
    // Check 6: Header text
    console.log('\n📝 CHECK 6: Header Text')
    const headerVisible = await page.locator('text=CAD Lab').isVisible().catch(() => false)
    console.log(`   ${headerVisible ? '✅' : '❌'} "CAD Lab" header found`)
    
    const subtitleTexts = [
      '256 components',
      '15 industry sectors',
      'across 15 industry sectors'
    ]
    
    let subtitleFound = false
    for (const text of subtitleTexts) {
      const visible = await page.locator(`text=${text}`).isVisible().catch(() => false)
      if (visible) {
        subtitleFound = true
        console.log(`   ✅ Subtitle mentions: "${text}"`)
        break
      }
    }
    
    if (!subtitleFound) {
      console.log('   ⚠️  Subtitle with "256 components" or "15 industry sectors" not found')
    }
    
    // Check 7: Input placeholder
    console.log('\n🔍 CHECK 7: Input Placeholder')
    const inputPlaceholders = [
      'CubeSat bus structure',
      'CubeSat',
      'engineering',
      'rocket',
      'satellite'
    ]
    
    let placeholderFound = false
    for (const placeholder of inputPlaceholders) {
      const input = await page.locator(`input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`).first().isVisible().catch(() => false)
      if (input) {
        const actualPlaceholder = await page.locator(`input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`).first().getAttribute('placeholder').catch(() => '')
        console.log(`   ✅ Found input with placeholder: "${actualPlaceholder}"`)
        placeholderFound = true
        break
      }
    }
    
    if (!placeholderFound) {
      console.log('   ⚠️  Engineering-themed placeholder not found')
    }
    
    // Check 8: No "decompose" text
    console.log('\n🚫 CHECK 8: No "Decompose" Text')
    const decomposeVisible = await page.locator('text=decompose').isVisible().catch(() => false)
    console.log(`   ${decomposeVisible ? '❌' : '✅'} ${decomposeVisible ? 'Found "decompose" (should not be present)' : 'No "decompose" text found (correct)'}`)
    
    // Check for correct alternatives
    const alternatives = ['Module Breakdown', 'Map Sub-Assemblies']
    let alternativeFound = false
    for (const alt of alternatives) {
      const visible = await page.locator(`text=${alt}`).isVisible().catch(() => false)
      if (visible) {
        alternativeFound = true
        console.log(`   ✅ Found correct alternative: "${alt}"`)
      }
    }
    
    if (!alternativeFound && !decomposeVisible) {
      console.log('   ⚠️  Neither "decompose" nor alternatives found')
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
    
    // Summary
    console.log('\n' + '═'.repeat(60))
    console.log('📊 VERIFICATION SUMMARY')
    console.log('═'.repeat(60))
    console.log(`✅ Page loads: ${page.url().includes('/the-forge/cad-lab') ? 'YES' : 'NO'}`)
    console.log(`✅ Hero banner: ${heroBannerFound ? 'YES' : 'NO'}`)
    console.log(`✅ Stats bar: ${statsFound}/4 stats found`)
    console.log(`✅ Capability cards: ${capabilityCount}/5 found`)
    console.log(`✅ Template cards: ${templateCount}/6 found`)
    console.log(`✅ Header text: ${headerVisible ? 'YES' : 'NO'}`)
    console.log(`✅ Engineering placeholder: ${placeholderFound ? 'YES' : 'NO'}`)
    console.log(`✅ No "decompose": ${!decomposeVisible ? 'YES' : 'NO'}`)
    console.log(`✅ Images: ${brokenImages.length === 0 ? 'All loading' : `${brokenImages.length} broken`}`)
    
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

verifyCadLab10().catch(console.error)
