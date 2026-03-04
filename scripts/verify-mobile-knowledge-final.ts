import { chromium } from '@playwright/test'

async function verifyMobileKnowledge() {
  const browser = await chromium.launch({ headless: false }) // Show browser for debugging
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
  })
  const page = await context.newPage()

  console.log('📱 Mobile Knowledge Page Verification')
  console.log('=' .repeat(50))
  
  console.log('\n✅ Viewport: 375x812 (iPhone size)')

  console.log('\n📱 Step 1: Navigating to login...')
  await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)
  await page.screenshot({ path: 'mobile-verification/01-login-page.png' })
  console.log('   Screenshot: 01-login-page.png')
  
  const emailInput = await page.locator('input[type="email"]').first()
  if (await emailInput.isVisible()) {
    console.log('\n📱 Step 2: Logging in...')
    await emailInput.fill('tristan@fractionalforge.com')
    await page.locator('input[type="password"]').first().fill('TriFi2025!')
    await page.screenshot({ path: 'mobile-verification/02-credentials-filled.png' })
    console.log('   Screenshot: 02-credentials-filled.png')
    
    console.log('\n📱 Step 3: Clicking login button...')
    await page.locator('button:has-text("Enter the Forge")').click()
    await page.waitForTimeout(5000) // Wait for navigation
    
    const afterLoginUrl = page.url()
    console.log(`   After login URL: ${afterLoginUrl}`)
    await page.screenshot({ path: 'mobile-verification/03-after-login.png' })
    console.log('   Screenshot: 03-after-login.png')
    
    if (afterLoginUrl.includes('/login')) {
      console.log('\n   ❌ Login failed - checking for error message...')
      const errorMsg = await page.locator('[role="alert"]').textContent().catch(() => null)
      if (errorMsg) {
        console.log(`   Error: ${errorMsg}`)
      }
      console.log('\n   ℹ️  Please check the screenshots to see what happened.')
      console.log('   ℹ️  You may need to create this account or use different credentials.')
      await browser.close()
      return
    }
    
    console.log('   ✅ Login successful!')
  }

  console.log('\n📱 Step 4: Navigating to Knowledge page...')
  await page.goto('http://localhost:3000/knowledge', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  console.log(`   Current URL: ${currentUrl}`)
  
  await page.screenshot({ path: 'mobile-verification/04-knowledge-page.png', fullPage: true })
  console.log('   Screenshot: 04-knowledge-page.png (full page)')
  
  await page.screenshot({ path: 'mobile-verification/05-knowledge-viewport.png', fullPage: false })
  console.log('   Screenshot: 05-knowledge-viewport.png (above fold)')

  if (!currentUrl.includes('/knowledge')) {
    console.log(`\n⚠️  WARNING: Not on Knowledge page! Currently at: ${currentUrl}`)
    console.log('   Check the screenshots to see where we ended up.')
    await browser.close()
    return
  }

  console.log('\n🔍 Visual Analysis:')
  console.log('=' .repeat(50))

  // Check page title
  const pageTitle = await page.locator('h1').first().textContent()
  console.log(`\n📋 Page Title: "${pageTitle?.trim()}"`)

  // Check header structure
  console.log('\n🎯 Header Layout:')
  try {
    // Look for the page header div
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

  // Count buttons
  console.log('\n🔘 Buttons:')
  const allButtons = await page.locator('button:visible').count()
  console.log(`   Total visible: ${allButtons}`)

  // Check for New Note button
  const newNoteButton = page.locator('button').filter({ hasText: /New Note|Create|Add/i })
  const hasNewNote = await newNoteButton.count() > 0
  console.log(`   ✓ New Note/Create button: ${hasNewNote ? '✅ FOUND' : '❌ NOT FOUND'}`)
  
  if (hasNewNote) {
    const firstButton = newNoteButton.first()
    const buttonText = await firstButton.textContent()
    const buttonBox = await firstButton.boundingBox()
    console.log(`      Text: "${buttonText?.trim()}"`)
    if (buttonBox) {
      console.log(`      Width: ${Math.round(buttonBox.width)}px`)
      const isIconOnly = buttonBox.width < 60
      console.log(`      Icon-only/compact: ${isIconOnly ? '✅ YES' : '❌ NO (shows text)'}`)
    }
  }

  // Check grid layout
  console.log('\n📐 Grid Layout:')
  try {
    const gridContainer = page.locator('[class*="grid"]').first()
    const gridClasses = await gridContainer.getAttribute('class')
    console.log(`   Classes: ${gridClasses}`)
    
    const isSingleColumn = gridClasses?.includes('grid-cols-1')
    const hasMdCols = gridClasses?.match(/md:grid-cols-(\d+)/)
    console.log(`   ✓ Single column on mobile (grid-cols-1): ${isSingleColumn ? '✅ YES' : '❌ NO'}`)
    if (hasMdCols) {
      console.log(`   ✓ Desktop columns: ${hasMdCols[0]}`)
    }
  } catch (e) {
    console.log('   ⚠️  Could not find grid container')
  }

  // Check for note cards
  console.log('\n📝 Note Cards:')
  const noteCards = page.locator('[class*="border"][class*="rounded"]').filter({ 
    has: page.locator('h3, h2, h4') 
  })
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
    
    // Check for three-dot menu
    const moreButtons = firstCard.locator('button').filter({ 
      has: page.locator('svg') 
    })
    const moreButtonCount = await moreButtons.count()
    
    if (moreButtonCount > 0) {
      const lastButton = moreButtons.last()
      const isVisible = await lastButton.isVisible()
      console.log(`   ✓ Three-dot menu visible: ${isVisible ? '✅ YES' : '❌ NO'}`)
    }
  } else {
    console.log('   ℹ️  No note cards found (empty state or different layout)')
  }

  // Check for type filter chips
  console.log('\n🏷️  Type Filter Chips:')
  const filterChips = page.locator('button').filter({ hasText: /All|Note|Task|Decision|Insight/ })
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
  console.log('   - 01-login-page.png')
  console.log('   - 02-credentials-filled.png')
  console.log('   - 03-after-login.png')
  console.log('   - 04-knowledge-page.png (full page)')
  console.log('   - 05-knowledge-viewport.png (above the fold)')
  
  console.log('\n   Browser will remain open for 10 seconds for manual inspection...')
  await page.waitForTimeout(10000)

  await browser.close()
}

verifyMobileKnowledge().catch(console.error)
