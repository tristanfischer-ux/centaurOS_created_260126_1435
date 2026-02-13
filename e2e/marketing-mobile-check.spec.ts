import { test, expect, devices } from '@playwright/test'

// Configure mobile viewport (iPhone 12/13 size) at top level
test.use({
  ...devices['iPhone 12'],
  viewport: { width: 375, height: 812 }
})

test.describe('Marketing Pages Mobile Verification', () => {
  test('Homepage mobile layout', async ({ page }) => {
    console.log('📱 Testing homepage at 375x812 (iPhone size)')
    
    // Navigate to homepage
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot of hero section
    await page.screenshot({ 
      path: 'screenshots/mobile-homepage-hero.png',
      fullPage: false 
    })
    
    console.log('✓ Homepage loaded at mobile size')
    
    // Verify hero section
    const heroHeading = page.locator('h1').first()
    await expect(heroHeading).toBeVisible()
    console.log('✓ Hero heading visible')
    
    // Check founding member counter
    const founderCounter = page.getByText(/founding members?/i)
    if (await founderCounter.count() > 0) {
      console.log('✓ Founding member counter present')
    }
    
    // Scroll to calculator section
    console.log('📜 Scrolling to calculator section...')
    await page.evaluate(() => window.scrollBy(0, 600))
    await page.waitForTimeout(1000)
    
    await page.screenshot({ 
      path: 'screenshots/mobile-homepage-calculator.png',
      fullPage: false 
    })
    
    // Verify calculator section
    const calculatorHeading = page.getByRole('heading', { name: /savings calculator|calculate|cost/i })
    if (await calculatorHeading.count() > 0) {
      await expect(calculatorHeading.first()).toBeVisible()
      console.log('✓ Savings calculator visible on mobile')
    }
    
    // Check sliders are present
    const sliders = page.locator('input[type="range"]')
    const sliderCount = await sliders.count()
    console.log(`✓ Found ${sliderCount} slider(s) in mobile calculator`)
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/mobile-homepage-full.png',
      fullPage: true 
    })
    
    console.log('✓ Full mobile homepage screenshot captured')
  })
  
  test('Techniques page mobile layout', async ({ page }) => {
    console.log('📱 Testing techniques page at 375x812 (iPhone size)')
    
    // Navigate to techniques page
    await page.goto('http://localhost:3000/techniques')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot
    await page.screenshot({ 
      path: 'screenshots/mobile-techniques-page.png',
      fullPage: false 
    })
    
    console.log('✓ Techniques page loaded at mobile size')
    
    // Verify heading
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
    console.log('✓ Techniques page heading visible')
    
    // Check for search bar
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
      console.log('✓ Search bar visible on mobile')
    }
    
    // Check technique cards
    const techniqueCards = page.locator('article, [class*="card"], [class*="technique"]')
    const cardCount = await techniqueCards.count()
    console.log(`✓ Found ${cardCount} technique card(s) on mobile`)
    
    // Scroll down to see more cards
    await page.evaluate(() => window.scrollBy(0, 400))
    await page.waitForTimeout(500)
    
    await page.screenshot({ 
      path: 'screenshots/mobile-techniques-scrolled.png',
      fullPage: false 
    })
    
    console.log('✓ Mobile techniques page scrolled screenshot captured')
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/mobile-techniques-full.png',
      fullPage: true 
    })
    
    console.log('✓ Full mobile techniques page screenshot captured')
  })
  
  test('Mobile viewport dimensions verification', async ({ page }) => {
    await page.goto('http://localhost:3000')
    
    // Verify viewport size
    const viewportSize = page.viewportSize()
    console.log(`📐 Viewport size: ${viewportSize?.width}x${viewportSize?.height}`)
    
    expect(viewportSize?.width).toBe(375)
    expect(viewportSize?.height).toBe(812)
    console.log('✓ Mobile viewport dimensions confirmed')
  })
})
