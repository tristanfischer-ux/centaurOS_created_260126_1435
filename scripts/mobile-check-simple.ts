import { chromium } from 'playwright'
import path from 'path'

async function checkMobile() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    storageState: path.join(__dirname, '../.playwright/auth/founder.json')
  })
  
  const page = await context.newPage()
  
  try {
    console.log('📱 MOBILE KNOWLEDGE PAGE CHECK (375px iPhone)')
    console.log('=' .repeat(60))
    
    await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
    await page.waitForTimeout(2000)
    
    // Get page HTML structure
    const pageContent = await page.evaluate(() => {
      const results: any = {}
      
      // 1. Check page header
      const header = document.querySelector('h1')
      if (header) {
        const headerParent = header.closest('div')
        results.headerClasses = headerParent?.className || 'not found'
        results.headerHasFlexCol = headerParent?.className.includes('flex-col') || false
      }
      
      // 2. Check for buttons
      const buttons = Array.from(document.querySelectorAll('button'))
      results.uploadButton = buttons.find(b => b.textContent?.includes('Upload'))?.textContent?.trim()
      results.addKnowledgeButton = buttons.find(b => b.textContent?.includes('Add Knowledge'))?.textContent?.trim()
      
      // 3. Check grid layouts
      const grids = Array.from(document.querySelectorAll('[class*="grid"]'))
      results.gridCount = grids.length
      results.gridClasses = grids.slice(0, 3).map(g => g.className)
      
      // 4. Check for cards
      const cards = Array.from(document.querySelectorAll('[class*="card"]'))
      results.cardCount = cards.length
      
      // 5. Check tabs
      const tabsList = document.querySelector('[role="tablist"]')
      results.tabsFound = !!tabsList
      results.tabsClasses = tabsList?.className
      
      // 6. Check body width
      results.bodyWidth = document.body.scrollWidth
      results.hasHorizontalScroll = document.body.scrollWidth > 375
      
      return results
    })
    
    console.log('\n1️⃣  PAGE HEADER:')
    console.log(`   Classes: ${pageContent.headerClasses}`)
    console.log(`   ✓ Stacks on mobile (flex-col): ${pageContent.headerHasFlexCol ? 'YES' : 'NO'}`)
    console.log(`   Upload button: ${pageContent.uploadButton || 'NOT FOUND'}`)
    console.log(`   Add Knowledge button: ${pageContent.addKnowledgeButton || 'NOT FOUND'}`)
    
    console.log('\n2️⃣  GRID LAYOUTS:')
    console.log(`   Number of grids found: ${pageContent.gridCount}`)
    pageContent.gridClasses?.forEach((cls: string, i: number) => {
      const hasTwoCol = cls.includes('grid-cols-2')
      console.log(`   Grid ${i + 1}: ${hasTwoCol ? '✓ 2 columns' : '❌ not 2 columns'}`)
    })
    
    console.log('\n3️⃣  TABS:')
    console.log(`   Tabs found: ${pageContent.tabsFound ? 'YES' : 'NO'}`)
    if (pageContent.tabsFound) {
      console.log(`   Classes: ${pageContent.tabsClasses}`)
    }
    
    console.log('\n4️⃣  CARDS:')
    console.log(`   Number of cards: ${pageContent.cardCount}`)
    
    console.log('\n5️⃣  RESPONSIVE CHECK:')
    console.log(`   Body width: ${pageContent.bodyWidth}px`)
    console.log(`   ✓ No horizontal scroll: ${!pageContent.hasHorizontalScroll ? 'YES' : 'NO'}`)
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'mobile-knowledge-full.png',
      fullPage: true 
    })
    
    // Take viewport screenshot (what user sees without scrolling)
    await page.screenshot({ 
      path: 'mobile-knowledge-viewport.png',
      fullPage: false 
    })
    
    console.log('\n📸 Screenshots saved:')
    console.log('   - mobile-knowledge-full.png (full page)')
    console.log('   - mobile-knowledge-viewport.png (above the fold)')
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Check complete!')
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

checkMobile()
