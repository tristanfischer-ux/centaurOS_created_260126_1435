import { chromium } from '@playwright/test'
import { writeFileSync } from 'fs'
import { join } from 'path'

async function verifyMobileKnowledge() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  })
  const page = await context.newPage()

  console.log('📱 Step 1: Setting viewport to 375x812 (iPhone size)')
  console.log('✅ Viewport set')

  console.log('\n📱 Step 2: Navigating to login page...')
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'mobile-verification/01-login-page.png', fullPage: true })
  console.log('✅ Login page loaded - screenshot saved')

  console.log('\n📱 Step 3: Checking for login form...')
  const emailInput = await page.locator('input[type="email"]').first()
  const passwordInput = await page.locator('input[type="password"]').first()
  
  if (await emailInput.isVisible()) {
    console.log('✅ Login form found - filling credentials...')
    await emailInput.fill('tristan@fractionalforge.com')
    await passwordInput.fill('TriFi2025!')
    await page.screenshot({ path: 'mobile-verification/02-credentials-filled.png', fullPage: true })
    console.log('✅ Credentials filled - screenshot saved')
    
    console.log('\n📱 Submitting login...')
    await page.locator('button:has-text("Enter the Forge")').click()
    await page.waitForTimeout(3000) // Wait for navigation
    await page.screenshot({ path: 'mobile-verification/03-after-login.png', fullPage: true })
    console.log('✅ Login submitted - screenshot saved')
  } else {
    console.log('ℹ️  Already logged in or no login form visible')
  }

  console.log('\n📱 Step 4: Navigating to Knowledge page...')
  await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000) // Wait for any animations
  await page.screenshot({ path: 'mobile-verification/04-knowledge-page.png', fullPage: true })
  console.log('✅ Knowledge page loaded - screenshot saved')

  console.log('\n📱 Step 5: Analyzing mobile layout...')
  
  // Check header layout
  const header = page.locator('[class*="flex"][class*="border-b"]').first()
  const headerBox = await header.boundingBox()
  console.log('\n🔍 Header Analysis:')
  console.log(`   Width: ${headerBox?.width}px (viewport: 375px)`)
  
  // Check if header has flex-col on mobile
  const headerClasses = await header.getAttribute('class')
  const hasFlexCol = headerClasses?.includes('flex-col')
  console.log(`   ✓ Stacks vertically (flex-col): ${hasFlexCol ? '✅ YES' : '❌ NO'}`)

  // Check buttons
  const buttons = page.locator('button').filter({ hasText: /New Note|Filter|Sort/ })
  const buttonCount = await buttons.count()
  console.log('\n🔍 Button Analysis:')
  console.log(`   Found ${buttonCount} buttons`)
  
  if (buttonCount > 0) {
    const firstButton = buttons.first()
    const buttonBox = await firstButton.boundingBox()
    const buttonText = await firstButton.textContent()
    console.log(`   First button: "${buttonText?.trim()}"`)
    console.log(`   Width: ${buttonBox?.width}px`)
    
    // Check if buttons are icon-only (compact)
    const hasOnlyIcon = buttonBox && buttonBox.width < 60
    console.log(`   ✓ Icon-only/compact: ${hasOnlyIcon ? '✅ YES' : '❌ NO (may show text)'}`)
  }

  // Check filters layout
  const filtersSection = page.locator('[class*="space-y"]').filter({ has: page.locator('button[role="combobox"]') })
  console.log('\n🔍 Filters Analysis:')
  const filtersBox = await filtersSection.first().boundingBox()
  if (filtersBox) {
    console.log(`   Width: ${filtersBox.width}px`)
    const filtersClasses = await filtersSection.first().getAttribute('class')
    const stacksVertically = filtersClasses?.includes('space-y')
    console.log(`   ✓ Stacks vertically (space-y): ${stacksVertically ? '✅ YES' : '❌ NO'}`)
  }

  // Check note cards layout
  const cardsGrid = page.locator('[class*="grid"]').filter({ has: page.locator('[class*="border"][class*="rounded"]') })
  console.log('\n🔍 Note Cards Analysis:')
  const gridClasses = await cardsGrid.first().getAttribute('class')
  const isSingleColumn = gridClasses?.includes('grid-cols-1')
  console.log(`   ✓ Single column (grid-cols-1): ${isSingleColumn ? '✅ YES' : '❌ NO'}`)

  // Check for more actions button (three-dot menu)
  const moreActionsButtons = page.locator('button[aria-label*="More"]').or(page.locator('button').filter({ has: page.locator('svg[class*="lucide-more"]') }))
  const moreActionsCount = await moreActionsButtons.count()
  console.log('\n🔍 More Actions Button Analysis:')
  console.log(`   Found ${moreActionsCount} three-dot menu buttons`)
  
  if (moreActionsCount > 0) {
    const firstMoreButton = moreActionsButtons.first()
    const isVisible = await firstMoreButton.isVisible()
    console.log(`   ✓ Visible without hover: ${isVisible ? '✅ YES' : '❌ NO'}`)
  }

  // Check type filter chips
  const filterChips = page.locator('[role="button"]').filter({ hasText: /All|Note|Task|Decision/ })
  const chipsCount = await filterChips.count()
  console.log('\n🔍 Type Filter Chips Analysis:')
  console.log(`   Found ${chipsCount} filter chips`)
  
  if (chipsCount > 0) {
    const chipsContainer = filterChips.first().locator('..')
    const containerClasses = await chipsContainer.getAttribute('class')
    const wrapsNicely = containerClasses?.includes('flex-wrap')
    console.log(`   ✓ Wraps nicely (flex-wrap): ${wrapsNicely ? '✅ YES' : '❌ NO'}`)
  }

  console.log('\n📱 Step 6: Taking final full-page screenshot...')
  await page.screenshot({ path: 'mobile-verification/05-knowledge-full-page.png', fullPage: true })
  console.log('✅ Final screenshot saved')

  console.log('\n✅ Mobile verification complete!')
  console.log('\n📸 Screenshots saved to: mobile-verification/')
  console.log('   - 01-login-page.png')
  console.log('   - 02-credentials-filled.png')
  console.log('   - 03-after-login.png')
  console.log('   - 04-knowledge-page.png')
  console.log('   - 05-knowledge-full-page.png')

  await browser.close()
}

verifyMobileKnowledge().catch(console.error)
