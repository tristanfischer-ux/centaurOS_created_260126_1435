/**
 * Script to verify CAD Lab UI elements
 * Run with: npx tsx verify-cad-lab-ui.ts
 */

import { chromium } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

async function verifyCadLabUI() {
  console.log('🚀 Starting CAD Lab UI verification...\n')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  })
  const page = await context.newPage()

  // Create screenshots directory
  const screenshotsDir = path.join(process.cwd(), 'cad-lab-verification')
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true })
  }

  try {
    console.log('📍 Navigating to http://localhost:3000/the-forge/cad-lab')
    console.log('⏳ Waiting up to 60 seconds for page to compile...\n')
    
    // Navigate with extended timeout for Next.js compilation
    await page.goto('http://localhost:3000/the-forge/cad-lab', {
      waitUntil: 'networkidle',
      timeout: 60000
    })

    // Take initial screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '01-initial-load.png'),
      fullPage: true 
    })
    console.log('✅ Screenshot saved: 01-initial-load.png')

    // Check if we're on a login page
    const currentUrl = page.url()
    console.log(`\n📍 Current URL: ${currentUrl}`)
    
    if (currentUrl.includes('/login') || currentUrl.includes('/auth')) {
      console.log('🔐 Redirected to login page - attempting to log in...')
      await page.screenshot({ 
        path: path.join(screenshotsDir, '02-login-page.png'),
        fullPage: true 
      })
      console.log('✅ Screenshot saved: 02-login-page.png')
      
      // Fill in login credentials (using test founder account)
      console.log('📝 Filling in login credentials...')
      await page.fill('input[type="email"], input[name="email"]', 'demo.founder@forgeos.io')
      await page.fill('input[type="password"], input[name="password"]', 'DemoFounder2026!')
      
      await page.screenshot({ 
        path: path.join(screenshotsDir, '03-login-filled.png'),
        fullPage: true 
      })
      console.log('✅ Screenshot saved: 03-login-filled.png')
      
      // Click login button
      console.log('🔐 Clicking login button...')
      await page.click('button:has-text("Access Foundry")')
      
      // Wait for navigation after login (goes to /updates by default)
      console.log('⏳ Waiting for login to complete...')
      await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 })
      
      console.log('✅ Login successful!')
      console.log(`📍 Redirected to: ${page.url()}\n`)
      
      // Take screenshot after login
      await page.screenshot({ 
        path: path.join(screenshotsDir, '04-after-login.png'),
        fullPage: true 
      })
      console.log('✅ Screenshot saved: 04-after-login.png')
      
      // Now navigate to CAD Lab
      console.log('📍 Navigating to CAD Lab page...')
      await page.goto('http://localhost:3000/the-forge/cad-lab', {
        waitUntil: 'networkidle',
        timeout: 60000
      })
      console.log('✅ Arrived at CAD Lab page\n')
    }

    // Wait a bit for any client-side rendering
    await page.waitForTimeout(2000)

    console.log('\n🔍 Checking for UI elements...\n')
    
    // Debug: Get page HTML to understand structure
    const pageContent = await page.content()
    const hasTabsRole = pageContent.includes('role="tab"')
    const hasTabsList = pageContent.includes('role="tablist"')
    console.log(`🔍 Debug: Has role="tab": ${hasTabsRole}`)
    console.log(`🔍 Debug: Has role="tablist": ${hasTabsList}`)
    
    // Get all buttons to see what's there
    const allButtons = await page.locator('button').allTextContents()
    console.log(`🔍 Debug: Found ${allButtons.length} buttons`)
    console.log(`🔍 Debug: Button texts (first 10):`, allButtons.slice(0, 10))
    console.log()

    // Check for Mission Control tabs (using role="tab")
    const tabs = [
      { name: 'Build', selector: '[role="tab"][value="build"]' },
      { name: 'Analysis', selector: '[role="tab"][value="analysis"]' },
      { name: 'Procurement', selector: '[role="tab"][value="procurement"]' },
      { name: 'Review', selector: '[role="tab"][value="review"]' }
    ]

    console.log('📋 Mission Control Tabs:')
    for (const tab of tabs) {
      const isVisible = await page.locator(tab.selector).isVisible().catch(() => false)
      const badgeCount = await page.locator(`${tab.selector} .badge, ${tab.selector} [class*="badge"]`).count()
      console.log(`  ${isVisible ? '✅' : '❌'} ${tab.name} tab${badgeCount > 0 ? ` (has ${badgeCount} badge)` : ''}`)
    }

    // Check for Step 1 - Research section
    console.log('\n📋 Step 1 - Research Section:')
    const researchSection = await page.locator('text=Step 1').isVisible().catch(() => false)
    console.log(`  ${researchSection ? '✅' : '❌'} Step 1 section header`)

    const productDescription = await page.locator('textarea[placeholder*="product"], textarea[name*="product"], textarea').first().isVisible().catch(() => false)
    console.log(`  ${productDescription ? '✅' : '❌'} Product description textarea`)

    const modelSelector = await page.locator('button[role="combobox"], select').first().isVisible().catch(() => false)
    console.log(`  ${modelSelector ? '✅' : '❌'} Model selector`)

    // Check if Build tab is active
    console.log('\n📋 Active Tab:')
    const buildTabActive = await page.locator('[role="tab"][value="build"][data-state="active"]').isVisible().catch(() => false)
    console.log(`  ${buildTabActive ? '✅' : '❌'} Build tab is active by default`)
    
    // Check for module decomposition section
    console.log('\n📋 Build Tab Content:')
    const moduleSection = await page.locator('text=Module Decomposition, text=Modules').first().isVisible().catch(() => false)
    console.log(`  ${moduleSection ? '✅' : '❌'} Module decomposition section visible`)

    // Take screenshot of the main content area
    await page.screenshot({ 
      path: path.join(screenshotsDir, '05-main-content.png'),
      fullPage: true 
    })
    console.log('\n✅ Screenshot saved: 05-main-content.png')

    // Check console errors
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    // Wait a bit to collect any console errors
    await page.waitForTimeout(2000)

    console.log('\n📋 Console Errors:')
    if (consoleErrors.length === 0) {
      console.log('  ✅ No console errors detected')
    } else {
      console.log(`  ❌ Found ${consoleErrors.length} console errors:`)
      consoleErrors.forEach((error, i) => {
        console.log(`     ${i + 1}. ${error}`)
      })
    }

    // Get page title and main heading
    const title = await page.title()
    const mainHeading = await page.locator('h1, h2').first().textContent().catch(() => 'Not found')
    
    console.log('\n📋 Page Info:')
    console.log(`  Title: ${title}`)
    console.log(`  Main heading: ${mainHeading}`)

    // Take final screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, '06-final-state.png'),
      fullPage: true 
    })
    console.log('\n✅ Screenshot saved: 06-final-state.png')

    console.log(`\n✅ Verification complete! Screenshots saved to: ${screenshotsDir}`)

  } catch (error) {
    console.error('\n❌ Error during verification:', error)
    
    // Take error screenshot
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'error-state.png'),
      fullPage: true 
    }).catch(() => {})
    
    throw error
  } finally {
    await browser.close()
  }
}

// Run the verification
verifyCadLabUI().catch(console.error)
