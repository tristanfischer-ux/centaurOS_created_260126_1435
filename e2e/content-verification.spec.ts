import { test, expect } from '@playwright/test'

test.describe('Marketing Page Content Verification', () => {
  test('Verify honest content replaced fake case study and testimonials', async ({ page }) => {
    console.log('🌐 Navigating to http://localhost:3000')
    
    // Navigate to homepage
    await page.goto('http://localhost:3000')
    await page.waitForLoadState('networkidle')
    
    console.log('✓ Homepage loaded')
    
    // Take full page screenshot first
    await page.screenshot({ 
      path: 'screenshots/content-full-page.png',
      fullPage: true 
    })
    console.log('✓ Full page screenshot captured')
    
    // Check for OLD content that should NOT exist
    console.log('\n🔍 Checking for removed content...')
    
    const aeroDynamics = await page.getByText(/aero dynamics/i).count()
    if (aeroDynamics > 0) {
      console.log('❌ FOUND "Aero Dynamics" - should be removed!')
    } else {
      console.log('✓ "Aero Dynamics" not found (correctly removed)')
    }
    
    const realResults = await page.getByText(/real results.*real people/i).count()
    if (realResults > 0) {
      console.log('❌ FOUND "Real Results. Real People." - should be removed!')
    } else {
      console.log('✓ "Real Results. Real People." not found (correctly removed)')
    }
    
    // Check for testimonial indicators (quotes, star ratings)
    const quoteMarks = await page.locator('text=/[""]/').count()
    console.log(`ℹ️  Found ${quoteMarks} quote mark(s) on page`)
    
    const starRatings = await page.locator('[class*="star"], svg[class*="star"]').count()
    console.log(`ℹ️  Found ${starRatings} star icon(s) on page`)
    
    // Find "How a Project Works" section
    console.log('\n🔍 Looking for "How a Project Works" section...')
    
    const howItWorksHeading = page.getByRole('heading', { name: /how a project works/i })
    const howItWorksCount = await howItWorksHeading.count()
    
    if (howItWorksCount > 0) {
      console.log('✓ Found "How a Project Works" heading')
      
      // Scroll to this section
      await howItWorksHeading.first().scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000)
      
      // Take screenshot of this section
      await page.screenshot({ 
        path: 'screenshots/content-how-it-works.png',
        fullPage: false 
      })
      
      // Get the full text content of this section
      const sectionLocator = howItWorksHeading.first().locator('xpath=ancestor::section | ancestor::div[contains(@class, "section")]')
      const sectionText = await sectionLocator.textContent().catch(() => '')
      
      // Check for "Illustrative Example"
      const illustrativeExample = await page.getByText(/illustrative example/i).count()
      if (illustrativeExample > 0) {
        console.log('✓ Found "Illustrative Example" text')
      } else {
        console.log('⚠️  "Illustrative Example" not found')
      }
      
      // Check for "Typical Sprint Timeline"
      const typicalTimeline = await page.getByText(/typical sprint timeline/i).count()
      if (typicalTimeline > 0) {
        console.log('✓ Found "Typical Sprint Timeline" text')
      } else {
        console.log('⚠️  "Typical Sprint Timeline" not found')
      }
      
      console.log('\n📝 Section text preview:')
      console.log(sectionText!.substring(0, 500))
      
    } else {
      console.log('⚠️  "How a Project Works" heading not found')
    }
    
    // Find "What You Get on Day One" or "The Founding Member Advantage" section
    console.log('\n🔍 Looking for "What You Get on Day One" or "The Founding Member Advantage" section...')
    
    let advantageHeading = page.getByRole('heading', { name: /what you get on day one/i })
    let advantageCount = await advantageHeading.count()
    
    if (advantageCount === 0) {
      advantageHeading = page.getByRole('heading', { name: /founding member advantage/i })
      advantageCount = await advantageHeading.count()
    }
    
    if (advantageCount > 0) {
      const headingText = await advantageHeading.first().textContent()
      console.log(`✓ Found heading: "${headingText?.trim()}"`)
      
      // Scroll to this section
      await advantageHeading.first().scrollIntoViewIfNeeded()
      await page.waitForTimeout(1000)
      
      // Take screenshot of this section
      await page.screenshot({ 
        path: 'screenshots/content-advantage.png',
        fullPage: false 
      })
      
      // Get surrounding content
      const parentSection = advantageHeading.first().locator('xpath=ancestor::section | ancestor::div[contains(@class, "section")]')
      const sectionText = await parentSection.textContent().catch(() => '')
      
      // Check for testimonial indicators in this section
      const sectionHtml = await parentSection.innerHTML().catch(() => '')
      
      const hasQuotes = sectionText!.includes('"') || sectionText!.includes('"') || sectionText!.includes('"')
      const hasStars = sectionHtml.includes('star') || sectionHtml.includes('★')
      const hasFakeNames = /john|jane|smith|doe|sarah|michael/i.test(sectionText ?? '')
      
      if (hasQuotes) {
        console.log('⚠️  Found quote marks in this section')
      } else {
        console.log('✓ No quote marks found (correctly removed)')
      }
      
      if (hasStars) {
        console.log('⚠️  Found star ratings in this section')
      } else {
        console.log('✓ No star ratings found (correctly removed)')
      }
      
      if (hasFakeNames) {
        console.log('⚠️  Found potential fake names in this section')
      } else {
        console.log('✓ No fake names found (correctly removed)')
      }
      
      console.log('\n📝 Section text preview:')
      console.log(sectionText!.substring(0, 800))
      
    } else {
      console.log('⚠️  Neither "What You Get on Day One" nor "The Founding Member Advantage" heading found')
    }
    
    // Scroll through page sections and capture key areas
    console.log('\n📸 Capturing additional section screenshots...')
    
    // Scroll to top
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(500)
    
    await page.screenshot({ 
      path: 'screenshots/content-hero.png',
      fullPage: false 
    })
    console.log('✓ Hero section screenshot')
    
    // Scroll to middle
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2))
    await page.waitForTimeout(500)
    
    await page.screenshot({ 
      path: 'screenshots/content-middle.png',
      fullPage: false 
    })
    console.log('✓ Middle section screenshot')
    
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(500)
    
    await page.screenshot({ 
      path: 'screenshots/content-footer.png',
      fullPage: false 
    })
    console.log('✓ Footer section screenshot')
    
    console.log('\n✅ Content verification complete')
  })
})
