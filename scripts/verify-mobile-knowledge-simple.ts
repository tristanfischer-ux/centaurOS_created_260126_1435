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

  console.log('\n📱 Navigating to login...')
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
  
  const emailInput = await page.locator('input[type="email"]').first()
  if (await emailInput.isVisible()) {
    console.log('📝 Logging in with demo founder account...')
    await emailInput.fill('demo.founder@fractionalforge.app')
    await page.locator('input[type="password"]').first().fill('DemoFounder2026!')
    
    // Wait for navigation after login
    const navigationPromise = page.waitForURL('**/plan', { timeout: 10000 }).catch(() => {
      console.log('   ⚠️  Did not navigate to /plan after login')
    })
    
    await page.locator('button:has-text("Enter the Forge")').click()
    await navigationPromise
    await page.waitForTimeout(2000)
    
    const afterLoginUrl = page.url()
    console.log(`   After login URL: ${afterLoginUrl}`)
    
    if (afterLoginUrl.includes('/login')) {
      console.log('   ❌ Login failed - still on login page')
      console.log('   Checking for error messages...')
      const errorMsg = await page.locator('[role="alert"]').textContent().catch(() => null)
      if (errorMsg) {
        console.log(`   Error: ${errorMsg}`)
      }
    } else {
      console.log('   ✅ Login successful')
    }
  }

  console.log('\n📱 Navigating to Knowledge page...')
  await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  console.log(`   Current URL: ${currentUrl}`)

  console.log('\n📸 Taking full-page screenshot...')
  await page.screenshot({ path: 'mobile-verification/knowledge-mobile-full.png', fullPage: true })
  
  console.log('\n🔍 Visual Analysis:')
  console.log('=' .repeat(50))

  // Check page title
  const pageTitle = await page.locator('h1').first().textContent()
  console.log(`\n📋 Page Title: "${pageTitle?.trim()}"`)

  // Check if we're actually on the Knowledge page
  if (!currentUrl.includes('/knowledge')) {
    console.log(`\n⚠️  WARNING: Not on Knowledge page! Redirected to: ${currentUrl}`)
    console.log('   This might indicate an auth or routing issue.')
  }

  // Check header structure - look for the Knowledge page header specifically
  try {
    const headerSection = page.locator('div').filter({ has: page.locator('h1') }).first()
    const headerClasses = await headerSection.getAttribute('class')
    console.log(`\n🎯 Header Classes: ${headerClasses}`)
    
    const hasFlexCol = headerClasses?.includes('flex-col')
    const hasSmFlexRow = headerClasses?.includes('sm:flex-row')
    console.log(`   ✓ Stacks on mobile (flex-col): ${hasFlexCol ? '✅ YES' : '❌ NO'}`)
    console.log(`   ✓ Row on desktop (sm:flex-row): ${hasSmFlexRow ? '✅ YES' : '❌ NO'}`)
  } catch (e) {
    console.log('   ⚠️  Could not analyze header structure')
  }

  // Count buttons
  const allButtons = await page.locator('button:visible').count()
  console.log(`\n🔘 Visible Buttons: ${allButtons}`)

  // Check for New Note button
  const newNoteButton = page.locator('button').filter({ hasText: /New Note/i })
  const hasNewNote = await newNoteButton.count() > 0
  console.log(`   ✓ New Note button: ${hasNewNote ? '✅ FOUND' : '❌ NOT FOUND'}`)
  if (hasNewNote) {
    const buttonText = await newNoteButton.first().textContent()
    console.log(`      Text: "${buttonText?.trim()}"`)
  }

  // Check for filter/sort buttons
  const filterButtons = page.locator('button[role="combobox"]')
  const filterCount = await filterButtons.count()
  console.log(`   ✓ Filter/Sort dropdowns: ${filterCount} found`)

  // Check grid layout
  try {
    const gridContainer = page.locator('[class*="grid"]').first()
    const gridClasses = await gridContainer.getAttribute('class')
    console.log(`\n📐 Grid Layout Classes: ${gridClasses}`)
    
    const isSingleColumn = gridClasses?.includes('grid-cols-1')
    const hasMdCols = gridClasses?.match(/md:grid-cols-(\d+)/)
    console.log(`   ✓ Mobile: Single column (grid-cols-1): ${isSingleColumn ? '✅ YES' : '❌ NO'}`)
    if (hasMdCols) {
      console.log(`   ✓ Desktop: ${hasMdCols[0]} (responsive)`)
    }
  } catch (e) {
    console.log('   ⚠️  Could not analyze grid layout')
  }

  // Check for note cards
  const noteCards = page.locator('[class*="border"][class*="rounded"]').filter({ has: page.locator('h3') })
  const cardCount = await noteCards.count()
  console.log(`\n📝 Note Cards Found: ${cardCount}`)

  if (cardCount > 0) {
    // Check first card for three-dot menu
    const firstCard = noteCards.first()
    const moreButton = firstCard.locator('button').filter({ has: page.locator('svg') }).last()
    const moreButtonVisible = await moreButton.isVisible().catch(() => false)
    console.log(`   ✓ Three-dot menu visible: ${moreButtonVisible ? '✅ YES' : '❌ NO'}`)
    
    // Get card width
    const cardBox = await firstCard.boundingBox()
    if (cardBox) {
      console.log(`   ✓ Card width: ${Math.round(cardBox.width)}px (viewport: 375px)`)
      const fillsWidth = cardBox.width > 330 // Accounting for padding
      console.log(`   ✓ Fills mobile width: ${fillsWidth ? '✅ YES' : '❌ NO'}`)
    }
  }

  // Check for type filter chips
  const filterChips = page.locator('[class*="flex"]').filter({ has: page.locator('button:has-text("All")') })
  const hasChips = await filterChips.count() > 0
  console.log(`\n🏷️  Type Filter Chips: ${hasChips ? '✅ FOUND' : '❌ NOT FOUND'}`)
  
  if (hasChips) {
    const chipsContainer = filterChips.first()
    const chipsClasses = await chipsContainer.getAttribute('class')
    const wraps = chipsClasses?.includes('flex-wrap')
    console.log(`   ✓ Wraps on mobile (flex-wrap): ${wraps ? '✅ YES' : '❌ NO'}`)
    
    const chipButtons = chipsContainer.locator('button')
    const chipCount = await chipButtons.count()
    console.log(`   ✓ Number of chips: ${chipCount}`)
  }

  // Take viewport screenshot (what user sees without scrolling)
  console.log('\n📸 Taking viewport screenshot...')
  await page.screenshot({ path: 'mobile-verification/knowledge-mobile-viewport.png', fullPage: false })

  console.log('\n✅ Verification Complete!')
  console.log('\n📸 Screenshots saved:')
  console.log('   - knowledge-mobile-full.png (full page)')
  console.log('   - knowledge-mobile-viewport.png (above the fold)')

  await browser.close()
}

verifyMobileKnowledge().catch(console.error)
