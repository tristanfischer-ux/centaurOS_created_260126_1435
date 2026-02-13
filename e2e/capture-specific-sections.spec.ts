import { test } from '@playwright/test'

test('Capture specific sections with exact content', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.waitForLoadState('networkidle')
  
  console.log('\n📸 Capturing "From Concept to Prototype" section (replaced fake case study)...\n')
  
  // Find "From Concept to Prototype" section (this is the section that replaced the case study)
  const conceptSection = page.getByRole('heading', { name: /from concept to prototype/i })
  await conceptSection.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  
  await page.screenshot({ 
    path: 'screenshots/section-concept-to-prototype.png',
    fullPage: false 
  })
  
  // Get the text content of this section
  const sectionParent = conceptSection.locator('xpath=ancestor::section | ancestor::div[contains(@class, "py-")]').first()
  const sectionText = await sectionParent.textContent()
  
  console.log('📝 "From Concept to Prototype" section text:')
  console.log('─'.repeat(80))
  console.log(sectionText)
  console.log('─'.repeat(80))
  
  // Check for specific elements
  const hasIllustrativeExample = sectionText?.includes('Illustrative Example')
  const hasTypicalTimeline = sectionText?.includes('Typical Sprint Timeline')
  const hasAeroDynamics = sectionText?.includes('Aero Dynamics')
  
  console.log('\n✅ Content verification:')
  console.log(`  ${hasIllustrativeExample ? '✓' : '❌'} Contains "Illustrative Example"`)
  console.log(`  ${hasTypicalTimeline ? '✓' : '❌'} Contains "Typical Sprint Timeline"`)
  console.log(`  ${hasAeroDynamics ? '❌ FAIL' : '✓'} Does NOT contain "Aero Dynamics"`)
  
  console.log('\n📸 Capturing "What You Get on Day One" section (replaced testimonials)...\n')
  
  // Find "What You Get on Day One" section
  const dayOneSection = page.getByRole('heading', { name: /what you get on day one/i })
  await dayOneSection.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1000)
  
  await page.screenshot({ 
    path: 'screenshots/section-day-one.png',
    fullPage: false 
  })
  
  // Get the text content
  const dayOneSectionParent = dayOneSection.locator('xpath=ancestor::section | ancestor::div[contains(@class, "py-")]').first()
  const dayOneText = await dayOneSectionParent.textContent()
  
  console.log('📝 "What You Get on Day One" section text:')
  console.log('─'.repeat(80))
  console.log(dayOneText)
  console.log('─'.repeat(80))
  
  // Check for testimonial indicators
  const hasQuotes = dayOneText?.includes('"') || dayOneText?.includes('"') || dayOneText?.includes('"')
  const hasStars = dayOneText?.includes('★') || dayOneText?.includes('⭐')
  const hasRealResults = dayOneText?.includes('Real Results')
  const hasFakeNames = /john|jane|smith|doe|sarah|michael|ceo|founder at/i.test(dayOneText || '')
  
  console.log('\n✅ Content verification:')
  console.log(`  ${hasQuotes ? '❌ FAIL' : '✓'} Does NOT contain quote marks`)
  console.log(`  ${hasStars ? '❌ FAIL' : '✓'} Does NOT contain star ratings`)
  console.log(`  ${hasRealResults ? '❌ FAIL' : '✓'} Does NOT contain "Real Results"`)
  console.log(`  ${hasFakeNames ? '❌ FAIL' : '✓'} Does NOT contain fake names/attributions`)
  
  // Check what it DOES contain
  const hasSeniorSpecialists = dayOneText?.includes('Senior Specialists')
  const hasNoEquity = dayOneText?.includes('No Equity')
  const hasManufacturing = dayOneText?.includes('Manufacturing')
  
  console.log('\n✅ Positive content check:')
  console.log(`  ${hasSeniorSpecialists ? '✓' : '❌'} Contains "Senior Specialists"`)
  console.log(`  ${hasNoEquity ? '✓' : '❌'} Contains "No Equity"`)
  console.log(`  ${hasManufacturing ? '✓' : '❌'} Contains "Manufacturing"`)
  
  console.log('\n✅ Section capture complete!')
})
