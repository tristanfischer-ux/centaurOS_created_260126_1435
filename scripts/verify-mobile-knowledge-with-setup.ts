import { chromium } from '@playwright/test'

async function verifyMobileKnowledge() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  })
  const page = await context.newPage()

  console.log('📱 Mobile Knowledge Page Verification')
  console.log('=' .repeat(50))
  
  console.log('\n✅ Viewport: 375x812 (iPhone size)')

  console.log('\n📱 Step 1: Navigating to login...')
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  
  const emailInput = await page.locator('input[type="email"]').first()
  if (await emailInput.isVisible()) {
    console.log('📝 Step 2: Logging in with demo founder account...')
    await emailInput.fill('demo.founder@fractionalforge.app')
    await page.locator('input[type="password"]').first().fill('DemoFounder2026!')
    
    await page.locator('button:has-text("Enter the Forge")').click()
    await page.waitForTimeout(3000)
    
    const afterLoginUrl = page.url()
    console.log(`   After login URL: ${afterLoginUrl}`)
    
    // Check if we need to complete profile setup
    if (afterLoginUrl.includes('/knowledge') && await page.locator('text=finish setting up').isVisible()) {
      console.log('\n📝 Step 3: Profile setup required, completing...')
      
      // Fill in company purpose if needed
      const purposeInput = page.locator('textarea').first()
      if (await purposeInput.isVisible()) {
        await purposeInput.fill('Build innovative hardware products that solve real-world problems')
        const saveButton = page.locator('button:has-text("Save")')
        if (await saveButton.isVisible()) {
          await saveButton.click()
          await page.waitForTimeout(2000)
        }
      }
      
      // Skip any other onboarding steps
      const skipButton = page.locator('button:has-text("Skip")').or(page.locator('button:has-text("Later")'))
      while (await skipButton.isVisible()) {
        await skipButton.click()
        await page.waitForTimeout(1000)
      }
    }
  }

  console.log('\n📱 Step 4: Navigating to Knowledge page...')
  await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  console.log(`   Current URL: ${currentUrl}`)

  console.log('\n📸 Step 5: Taking screenshots...')
  await page.screenshot({ path: 'mobile-verification/knowledge-mobile-full.png', fullPage: true })
  await page.screenshot({ path: 'mobile-verification/knowledge-mobile-viewport.png', fullPage: false })
  
  console.log('\n🔍 Visual Analysis:')
  console.log('=' .repeat(50))

  // Check page title
  const pageTitle = await page.locator('h1').first().textContent()
  console.log(`\n📋 Page Title: "${pageTitle?.trim()}"`)

  // Check if we're actually on the Knowledge page
  if (!currentUrl.includes('/knowledge')) {
    console.log(`\n⚠️  WARNING: Not on Knowledge page! Currently at: ${currentUrl}`)
    await browser.close()
    return
  }

  // Check header structure
  console.log('\n🎯 Header Layout:')
  try {
    const pageHeader = page.locator('div').filter({ has: page.locator('h1') }).first()
    const headerClasses = await pageHeader.getAttribute('class')
    console.log(`   Classes: ${headerClasses}`)
    
    const hasFlexCol = headerClasses?.includes('flex-col')
    const hasSmFlexRow = headerClasses?.includes('sm:flex-row')
    console.log(`   ✓ Stacks vertically on mobile (flex-col): ${hasFlexCol ? '✅ YES' : '❌ NO'}`)
    console.log(`   ✓ Row layout on desktop (sm:flex-row): ${hasSmFlexRow ? '✅ YES' : '❌ NO'}`)
  } catch (e) {
    console.log('   ⚠️  Could not analyze header')
  }

  // Count buttons and check for key buttons
  console.log('\n🔘 Buttons:')
  const allButtons = await page.locator('button:visible').count()
  console.log(`   Total visible: ${allButtons}`)

  const newNoteButton = page.locator('button').filter({ hasText: /New Note|Create/i })
  const hasNewNote = await newNoteButton.count() > 0
  console.log(`   ✓ New Note button: ${hasNewNote ? '✅ FOUND' : '❌ NOT FOUND'}`)
  
  if (hasNewNote) {
    const buttonText = await newNoteButton.first().textContent()
    const buttonBox = await newNoteButton.first().boundingBox()
    console.log(`      Text: "${buttonText?.trim()}"`)
    console.log(`      Width: ${buttonBox?.width}px (icon-only if < 60px)`)
  }

  // Check for filter dropdowns
  const filterDropdowns = page.locator('button[role="combobox"]')
  const filterCount = await filterDropdowns.count()
  console.log(`   ✓ Filter/Sort dropdowns: ${filterCount}`)

  // Check grid layout
  console.log('\n📐 Grid Layout:')
  try {
    const gridContainer = page.locator('[class*="grid"]').first()
    const gridClasses = await gridContainer.getAttribute('class')
    console.log(`   Classes: ${gridClasses}`)
    
    const isSingleColumn = gridClasses?.includes('grid-cols-1')
    console.log(`   ✓ Single column on mobile (grid-cols-1): ${isSingleColumn ? '✅ YES' : '❌ NO'}`)
  } catch (e) {
    console.log('   ⚠️  Could not find grid container')
  }

  // Check for note cards
  console.log('\n📝 Note Cards:')
  const noteCards = page.locator('[class*="border"][class*="rounded"]').filter({ has: page.locator('h3, h2') })
  const cardCount = await noteCards.count()
  console.log(`   Found: ${cardCount} cards`)

  if (cardCount > 0) {
    const firstCard = noteCards.first()
    const cardBox = await firstCard.boundingBox()
    
    if (cardBox) {
      console.log(`   ✓ Card width: ${Math.round(cardBox.width)}px (viewport: 375px)`)
      const fillsWidth = cardBox.width > 330
      console.log(`   ✓ Fills mobile width: ${fillsWidth ? '✅ YES' : '❌ NO'}`)
    }
    
    // Check for three-dot menu (more actions)
    const moreButtons = firstCard.locator('button').filter({ 
      has: page.locator('svg[class*="lucide"]') 
    })
    const moreButtonCount = await moreButtons.count()
    
    if (moreButtonCount > 0) {
      const lastButton = moreButtons.last()
      const isVisible = await lastButton.isVisible()
      console.log(`   ✓ Three-dot menu visible without hover: ${isVisible ? '✅ YES' : '❌ NO'}`)
    }
  } else {
    console.log('   ℹ️  No note cards found (empty state)')
  }

  // Check for type filter chips
  console.log('\n🏷️  Type Filter Chips:')
  const filterChips = page.locator('button').filter({ hasText: /All|Note|Task|Decision/ })
  const chipCount = await filterChips.count()
  console.log(`   Found: ${chipCount} chips`)
  
  if (chipCount > 0) {
    const chipsContainer = filterChips.first().locator('..')
    const containerClasses = await chipsContainer.getAttribute('class')
    const wraps = containerClasses?.includes('flex-wrap')
    console.log(`   ✓ Wraps nicely (flex-wrap): ${wraps ? '✅ YES' : '❌ NO'}`)
  }

  console.log('\n✅ Verification Complete!')
  console.log('\n📸 Screenshots saved to mobile-verification/:')
  console.log('   - knowledge-mobile-full.png (full scrollable page)')
  console.log('   - knowledge-mobile-viewport.png (above the fold)')

  await browser.close()
}

verifyMobileKnowledge().catch(console.error)
