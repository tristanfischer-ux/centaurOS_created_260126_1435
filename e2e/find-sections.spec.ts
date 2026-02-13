import { test } from '@playwright/test'

test('Find all sections on marketing page', async ({ page }) => {
  await page.goto('http://localhost:3000')
  await page.waitForLoadState('networkidle')
  
  console.log('\n🔍 Finding all h2 and h3 headings on page...\n')
  
  // Get all h2 headings
  const h2Headings = await page.locator('h2').all()
  console.log(`Found ${h2Headings.length} h2 headings:`)
  for (const heading of h2Headings) {
    const text = await heading.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  // Get all h3 headings
  const h3Headings = await page.locator('h3').all()
  console.log(`\nFound ${h3Headings.length} h3 headings:`)
  for (const heading of h3Headings) {
    const text = await heading.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  // Search for specific text patterns
  console.log('\n🔍 Searching for specific content...\n')
  
  const illustrative = await page.getByText(/illustrative/i).all()
  console.log(`Found ${illustrative.length} "illustrative" text(s):`)
  for (const elem of illustrative) {
    const text = await elem.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  const timeline = await page.getByText(/timeline/i).all()
  console.log(`\nFound ${timeline.length} "timeline" text(s):`)
  for (const elem of timeline) {
    const text = await elem.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  const sprint = await page.getByText(/sprint/i).all()
  console.log(`\nFound ${sprint.length} "sprint" text(s):`)
  for (const elem of sprint) {
    const text = await elem.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  const project = await page.getByText(/how.*project.*works/i).all()
  console.log(`\nFound ${project.length} "how project works" text(s):`)
  for (const elem of project) {
    const text = await elem.textContent()
    console.log(`  - "${text?.trim()}"`)
  }
  
  // Get page text content to search manually
  const bodyText = await page.locator('body').textContent()
  
  if (bodyText?.includes('Illustrative Example')) {
    console.log('\n✓ Found "Illustrative Example" in page body')
  }
  
  if (bodyText?.includes('Typical Sprint Timeline')) {
    console.log('✓ Found "Typical Sprint Timeline" in page body')
  }
  
  if (bodyText?.includes('How a Project Works')) {
    console.log('✓ Found "How a Project Works" in page body')
  }
  
  if (bodyText?.includes('Aero Dynamics')) {
    console.log('❌ Found "Aero Dynamics" in page body (should be removed!)')
  }
})
