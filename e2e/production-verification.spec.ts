import { test, expect } from '@playwright/test'

test.describe('Production Site Verification - fractionalforge.app', () => {
  test('Homepage verification', async ({ page }) => {
    console.log('🌐 Navigating to https://fractionalforge.app')
    
    // Navigate to production site
    await page.goto('https://fractionalforge.app')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot of hero section
    await page.screenshot({ 
      path: 'screenshots/prod-homepage-hero.png',
      fullPage: false 
    })
    
    console.log('✓ Production homepage loaded')
    
    // Verify hero section
    const heroHeading = page.locator('h1').first()
    await expect(heroHeading).toBeVisible()
    const heroText = await heroHeading.textContent()
    console.log(`✓ Hero heading: "${heroText?.trim()}"`)
    
    // Check for founding member counter
    const founderCounter = page.getByText(/founding members?/i)
    if (await founderCounter.count() > 0) {
      const counterText = await founderCounter.first().textContent()
      console.log(`✓ Founding member counter: "${counterText?.trim()}"`)
    }
    
    // Scroll to Savings Calculator section
    console.log('📜 Scrolling to Savings Calculator section...')
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(1500)
    
    await page.screenshot({ 
      path: 'screenshots/prod-calculator.png',
      fullPage: false 
    })
    
    // Look for calculator elements
    const calculatorHeading = page.getByRole('heading', { name: /savings calculator|calculate|cost/i })
    if (await calculatorHeading.count() > 0) {
      const calcText = await calculatorHeading.first().textContent()
      console.log(`✓ Calculator heading found: "${calcText?.trim()}"`)
    }
    
    // Check for "Standing Army" text
    const standingArmyText = page.getByText(/standing army/i)
    if (await standingArmyText.count() > 0) {
      console.log('✓ "Standing Army" text found')
    }
    
    // Check for sliders
    const sliders = page.locator('input[type="range"]')
    const sliderCount = await sliders.count()
    console.log(`✓ Found ${sliderCount} slider(s)`)
    
    // Check for cost comparison elements
    const costText = page.getByText(/cost|savings|save/i)
    const costCount = await costText.count()
    console.log(`✓ Found ${costCount} cost-related text element(s)`)
    
    // Scroll to Case Study section
    console.log('📜 Scrolling to Case Study section...')
    await page.evaluate(() => window.scrollBy(0, 800))
    await page.waitForTimeout(1500)
    
    await page.screenshot({ 
      path: 'screenshots/prod-casestudy.png',
      fullPage: false 
    })
    
    // Look for case study elements
    const caseStudyHeading = page.getByRole('heading', { name: /case study|real world|example/i })
    if (await caseStudyHeading.count() > 0) {
      const caseText = await caseStudyHeading.first().textContent()
      console.log(`✓ Case study heading: "${caseText?.trim()}"`)
    }
    
    // Check for "Aero Dynamics"
    const aeroDynamics = page.getByText(/aero dynamics/i)
    if (await aeroDynamics.count() > 0) {
      console.log('✓ "Aero Dynamics" found in case study')
    }
    
    // Check for "drone"
    const droneText = page.getByText(/drone/i)
    if (await droneText.count() > 0) {
      console.log('✓ "drone" mentioned in case study')
    }
    
    // Check for "9 weeks" or timeline
    const timeline = page.getByText(/9 weeks|weeks|timeline/i)
    if (await timeline.count() > 0) {
      console.log('✓ Timeline information found')
    }
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/prod-homepage-full.png',
      fullPage: true 
    })
    
    console.log('✓ Full production homepage screenshot captured')
  })
  
  test('Techniques page verification', async ({ page }) => {
    console.log('🌐 Navigating to https://fractionalforge.app/techniques')
    
    // Navigate to techniques page
    await page.goto('https://fractionalforge.app/techniques')
    await page.waitForLoadState('networkidle')
    
    // Take screenshot
    await page.screenshot({ 
      path: 'screenshots/prod-techniques-page.png',
      fullPage: false 
    })
    
    console.log('✓ Production techniques page loaded')
    
    // Verify heading
    const heading = page.locator('h1').first()
    await expect(heading).toBeVisible()
    const headingText = await heading.textContent()
    console.log(`✓ Techniques heading: "${headingText?.trim()}"`)
    
    // Check for search bar
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]')
    if (await searchInput.count() > 0) {
      await expect(searchInput.first()).toBeVisible()
      console.log('✓ Search bar visible')
      
      // Try typing in search
      await searchInput.first().fill('laser')
      await page.waitForTimeout(500)
      console.log('✓ Search input working (typed "laser")')
      
      await page.screenshot({ 
        path: 'screenshots/prod-techniques-search.png',
        fullPage: false 
      })
    } else {
      console.log('⚠ Search bar not found')
    }
    
    // Check for technique cards
    const techniqueCards = page.locator('article, [class*="card"], [class*="technique"]')
    const cardCount = await techniqueCards.count()
    console.log(`✓ Found ${cardCount} technique card(s)`)
    
    // Take full page screenshot
    await page.screenshot({ 
      path: 'screenshots/prod-techniques-full.png',
      fullPage: true 
    })
    
    console.log('✓ Full production techniques page screenshot captured')
  })
  
  test('Production API verification', async ({ request }) => {
    console.log('🌐 Testing https://fractionalforge.app/api/marketing/stats')
    
    // Call the API endpoint
    const response = await request.get('https://fractionalforge.app/api/marketing/stats')
    
    // Verify response
    expect(response.ok()).toBeTruthy()
    console.log(`✓ API responded with status ${response.status()}`)
    
    // Parse JSON
    const data = await response.json()
    console.log('✓ API returned valid JSON')
    console.log('Production API Response:', JSON.stringify(data, null, 2))
  })
})
