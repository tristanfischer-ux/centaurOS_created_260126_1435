import { test, expect } from '@playwright/test'

test.describe('Marketing Pages Visual Verification', () => {
  test('Homepage loads and displays key sections', async ({ page }) => {
    // Navigate to homepage
    await page.goto('http://localhost:3000')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Take screenshot of hero section
    await page.screenshot({ 
      path: 'screenshots/homepage-hero.png',
      fullPage: false 
    })
    
    console.log('✓ Homepage loaded')
    
    // Verify hero section elements
    const heroHeading = page.locator('h1').first()
    await expect(heroHeading).toBeVisible()
    console.log('✓ Hero heading visible')
    
    // Check for founding member counter
    const founderCounter = page.getByText(/founding members?/i)
    if (await founderCounter.count() > 0) {
      console.log('✓ Founding member counter present')
    }
    
    // Scroll to savings calculator section
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(1000)
    
    await page.screenshot({ 
      path: 'screenshots/homepage-calculator.png',
      fullPage: false 
    })
    
    // Verify savings calculator
    const calculatorHeading = page.getByRole('heading', { name: /savings calculator|calculate|cost/i })
    if (await calculatorHeading.count() > 0) {
      await expect(calculatorHeading.first()).toBeVisible()
      console.log('✓ Savings calculator section visible')
    }
    
    // Check for sliders
    const sliders = page.locator('input[type="range"]')
    const sliderCount = await sliders.count()
    console.log(`✓ Found ${sliderCount} slider(s) in calculator`)
    
    // Scroll to case study section
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(1000)
    
    await page.screenshot({ 
      path: 'screenshots/homepage-casestudy.png',
      fullPage: false 
    })
    
    // Verify case study section
    const caseStudyHeading = page.getByRole('heading', { name: /case study|real world|example/i })
    if (await caseStudyHeading.count() > 0) {
      await expect(caseStudyHeading.first()).toBeVisible()
      console.log('✓ Case study section visible')
    }
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/homepage-full.png',
      fullPage: true 
    })
    
    console.log('✓ Homepage full screenshot captured')
  })
  
  test('Techniques page loads and displays content', async ({ page }) => {
    // Navigate to techniques page
    await page.goto('http://localhost:3000/techniques')
    
    // Wait for page to load
    await page.waitForLoadState('networkidle')
    
    // Take screenshot
    await page.screenshot({ 
      path: 'screenshots/techniques-page.png',
      fullPage: true 
    })
    
    console.log('✓ Techniques page loaded')
    
    // Verify page heading
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
    console.log('✓ Techniques page heading visible')
    
    // Check for search bar
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
      console.log('✓ Search bar visible')
    } else {
      console.log('⚠ Search bar not found')
    }
    
    // Check for technique cards/content
    const techniqueCards = page.locator('article, [class*="card"], [class*="technique"]')
    const cardCount = await techniqueCards.count()
    console.log(`✓ Found ${cardCount} technique card(s)`)
  })
  
  test('Marketing stats API returns valid JSON', async ({ request }) => {
    // Call the API endpoint
    const response = await request.get('http://localhost:3000/api/marketing/stats')
    
    // Verify response
    expect(response.ok()).toBeTruthy()
    console.log(`✓ API responded with status ${response.status()}`)
    
    // Parse JSON
    const data = await response.json()
    console.log('✓ API returned valid JSON')
    console.log('API Response:', JSON.stringify(data, null, 2))
    
    // Verify expected fields (adjust based on your API structure)
    expect(data).toBeDefined()
  })
})
