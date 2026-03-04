import { chromium } from 'playwright'
import path from 'path'

async function auditMobileLayout() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    storageState: path.join(__dirname, '../.playwright/auth/founder.json')
  })
  
  const page = await context.newPage()
  
  try {
    console.log('📱 Mobile Layout Audit - iPhone viewport (375x812)')
    console.log('=' .repeat(60))
    
    await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // 1. Page Header Check
    console.log('\n1️⃣  PAGE HEADER LAYOUT:')
    const headerContainer = page.locator('div').filter({ hasText: /^Knowledge/ }).first()
    const headerBox = await headerContainer.boundingBox()
    console.log(`   Header container height: ${headerBox?.height}px`)
    
    // Check if header is stacked (flex-col on mobile)
    const headerClasses = await headerContainer.getAttribute('class')
    const isStacked = headerClasses?.includes('flex-col')
    console.log(`   ✓ Header stacks on mobile: ${isStacked ? 'YES' : 'NO'}`)
    
    // Check header buttons
    const uploadButton = page.getByRole('button', { name: /upload document/i }).first()
    const addKnowledgeButton = page.getByRole('button', { name: /add knowledge/i }).first()
    const uploadVisible = await uploadButton.isVisible().catch(() => false)
    const addKnowledgeVisible = await addKnowledgeButton.isVisible().catch(() => false)
    console.log(`   ✓ Upload Document button visible: ${uploadVisible ? 'YES' : 'NO'}`)
    console.log(`   ✓ Add Knowledge button visible: ${addKnowledgeVisible ? 'YES' : 'NO'}`)
    
    if (uploadVisible) {
      const uploadBox = await uploadButton.boundingBox()
      console.log(`   Upload button width: ${uploadBox?.width}px`)
    }
    if (addKnowledgeVisible) {
      const addBox = await addKnowledgeButton.boundingBox()
      console.log(`   Add Knowledge button width: ${addBox?.width}px`)
    }
    
    // 2. Stat Cards Check
    console.log('\n2️⃣  STAT CARDS LAYOUT:')
    const statCards = page.locator('[class*="grid"]').filter({ has: page.locator('p:has-text("Total Notes")') })
    const gridClasses = await statCards.first().getAttribute('class')
    console.log(`   Grid classes: ${gridClasses}`)
    const hasTwoColumns = gridClasses?.includes('grid-cols-2')
    console.log(`   ✓ Shows 2 columns on mobile: ${hasTwoColumns ? 'YES' : 'NO'}`)
    
    // 3. Filter Inputs Check
    console.log('\n3️⃣  FILTER INPUTS:')
    const searchInput = page.getByPlaceholder(/search/i)
    const searchBox = await searchInput.boundingBox()
    console.log(`   Search input width: ${searchBox?.width}px (should be ~375px for full width)`)
    
    const filterContainer = page.locator('div').filter({ has: searchInput }).first()
    const filterClasses = await filterContainer.getAttribute('class')
    const filtersStack = filterClasses?.includes('flex-col') || filterClasses?.includes('space-y')
    console.log(`   ✓ Filters stack vertically: ${filtersStack ? 'YES' : 'NO'}`)
    
    // 4. Tab Triggers Check
    console.log('\n4️⃣  TAB TRIGGERS:')
    const tabsList = page.locator('[role="tablist"]')
    const tabsBox = await tabsList.boundingBox()
    console.log(`   Tabs container width: ${tabsBox?.width}px`)
    
    const allTab = page.getByRole('tab', { name: /^all/i })
    const allTabBox = await allTab.boundingBox()
    console.log(`   "All" tab width: ${allTabBox?.width}px`)
    console.log(`   ✓ Tab text readable: ${(allTabBox?.width || 0) > 40 ? 'YES' : 'NO'}`)
    
    // 5. Note Type Filter Chips
    console.log('\n5️⃣  NOTE TYPE FILTER CHIPS:')
    const filterChips = page.locator('[role="button"]').filter({ hasText: /Meeting|Decision|Insight/ })
    const chipCount = await filterChips.count()
    console.log(`   Number of filter chips: ${chipCount}`)
    
    if (chipCount > 0) {
      const firstChip = filterChips.first()
      const chipBox = await firstChip.boundingBox()
      const chipClasses = await firstChip.getAttribute('class')
      console.log(`   First chip width: ${chipBox?.width}px`)
      
      // Check if chips wrap
      const chipsContainer = page.locator('div').filter({ has: filterChips.first() }).first()
      const containerClasses = await chipsContainer.getAttribute('class')
      const wraps = containerClasses?.includes('flex-wrap')
      console.log(`   ✓ Chips wrap nicely: ${wraps ? 'YES' : 'NO'}`)
    }
    
    // 6. Knowledge Note Cards
    console.log('\n6️⃣  KNOWLEDGE NOTE CARDS:')
    const noteCards = page.locator('[class*="card"]').filter({ hasText: /Meeting|Decision|Insight/ })
    const cardCount = await noteCards.count()
    console.log(`   Number of note cards: ${cardCount}`)
    
    if (cardCount > 0) {
      const firstCard = noteCards.first()
      const cardBox = await firstCard.boundingBox()
      console.log(`   First card width: ${cardBox?.width}px (should be ~343px for single column)`)
      console.log(`   ✓ Single column layout: ${(cardBox?.width || 0) > 300 ? 'YES' : 'NO'}`)
      
      // Check for more actions button (three dots)
      const moreButton = firstCard.locator('[aria-label*="more"]').or(firstCard.locator('button').filter({ hasText: /⋮|•••/ }))
      const moreButtonVisible = await moreButton.isVisible().catch(() => false)
      console.log(`   ✓ More actions button visible: ${moreButtonVisible ? 'YES' : 'NO'}`)
    }
    
    // 7. Overall Mobile Responsiveness
    console.log('\n7️⃣  OVERALL MOBILE RESPONSIVENESS:')
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    console.log(`   Body scroll width: ${bodyWidth}px`)
    console.log(`   ✓ No horizontal scroll: ${bodyWidth <= 375 ? 'YES' : 'NO'}`)
    
    // Take screenshot
    await page.screenshot({ 
      path: 'mobile-knowledge-page.png',
      fullPage: true 
    })
    console.log('\n📸 Screenshot saved to mobile-knowledge-page.png')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Mobile layout audit complete!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

auditMobileLayout()
