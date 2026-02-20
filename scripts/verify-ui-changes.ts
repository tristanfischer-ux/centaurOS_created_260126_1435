/**
 * Visual verification script for UI label changes
 * 
 * Checks that the following changes are present:
 * - /today: "Your AI Team" section (not "Specialist Intelligence")
 * - /today: "Brief Your AI Team" card (not "Ask a Specialist")
 * - /agents: Page title "AI Team" (not "Specialists")
 * - /agents: 4-card capability banner with correct labels
 * - Sidebar: "AI Team" and "AI Outputs" labels
 */

import { chromium } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'
const TEST_EMAIL = 'tristan+freya@forgeos.co'
const TEST_PASSWORD = 'ForgeOS2025!'

interface VerificationResult {
  page: string
  check: string
  passed: boolean
  details?: string
}

async function verifyUIChanges() {
  const results: VerificationResult[] = []
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // 1. Login
    console.log('🔐 Logging in...')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    
    await page.fill('input[name="email"]', TEST_EMAIL)
    await page.fill('input[name="password"]', TEST_PASSWORD)
    
    // Click the submit button
    await page.click('button:has-text("Enter the Forge")')
    await page.waitForURL('**/today', { timeout: 15000 })
    console.log('✅ Login successful\n')

    // 2. Verify /today page
    console.log('📄 Checking /today page...')
    
    // Check for "Your AI Team" section header
    const aiTeamSection = await page.locator('text="Your AI Team"').first()
    const hasAiTeamSection = await aiTeamSection.isVisible()
    results.push({
      page: '/today',
      check: 'Section header "Your AI Team"',
      passed: hasAiTeamSection,
      details: hasAiTeamSection ? 'Found' : 'Not found'
    })
    console.log(`  ${hasAiTeamSection ? '✅' : '❌'} "Your AI Team" section header`)

    // Check for "Brief Your AI Team" card
    const briefCard = await page.locator('text="Brief Your AI Team"').first()
    const hasBriefCard = await briefCard.isVisible()
    results.push({
      page: '/today',
      check: 'Card "Brief Your AI Team"',
      passed: hasBriefCard,
      details: hasBriefCard ? 'Found' : 'Not found'
    })
    console.log(`  ${hasBriefCard ? '✅' : '❌'} "Brief Your AI Team" card\n`)

    // 3. Verify /agents page
    console.log('📄 Checking /agents page...')
    await page.goto(`${BASE_URL}/agents`)
    await page.waitForLoadState('networkidle')

    // Check page title
    const pageTitle = await page.locator('h1:has-text("AI Team")').first()
    const hasCorrectTitle = await pageTitle.isVisible()
    results.push({
      page: '/agents',
      check: 'Page title "AI Team"',
      passed: hasCorrectTitle,
      details: hasCorrectTitle ? 'Found' : 'Not found'
    })
    console.log(`  ${hasCorrectTitle ? '✅' : '❌'} Page title "AI Team"`)

    // Check capability banner cards
    const capabilities = [
      'Deep expertise',
      'Persistent memory',
      'Propose actions',
      'Generate deliverables'
    ]

    for (const cap of capabilities) {
      const capCard = await page.locator(`text="${cap}"`).first()
      const hasCapability = await capCard.isVisible()
      results.push({
        page: '/agents',
        check: `Capability: "${cap}"`,
        passed: hasCapability,
        details: hasCapability ? 'Found' : 'Not found'
      })
      console.log(`  ${hasCapability ? '✅' : '❌'} Capability: "${cap}"`)
    }

    // Check for "Try asking" prompts on specialist cards
    const tryAskingPrompts = await page.locator('text=/Try asking/i').count()
    const hasTryAskingPrompts = tryAskingPrompts > 0
    results.push({
      page: '/agents',
      check: '"Try asking" example prompts',
      passed: hasTryAskingPrompts,
      details: `Found ${tryAskingPrompts} instances`
    })
    console.log(`  ${hasTryAskingPrompts ? '✅' : '❌'} "Try asking" prompts (${tryAskingPrompts} found)\n`)

    // 4. Check sidebar labels
    console.log('📄 Checking sidebar...')
    
    const sidebarAiTeam = await page.locator('nav a:has-text("AI Team")').first()
    const hasSidebarAiTeam = await sidebarAiTeam.isVisible()
    results.push({
      page: 'sidebar',
      check: 'Nav link "AI Team"',
      passed: hasSidebarAiTeam,
      details: hasSidebarAiTeam ? 'Found' : 'Not found'
    })
    console.log(`  ${hasSidebarAiTeam ? '✅' : '❌'} Sidebar: "AI Team"`)

    const sidebarAiOutputs = await page.locator('nav a:has-text("AI Outputs")').first()
    const hasSidebarAiOutputs = await sidebarAiOutputs.isVisible()
    results.push({
      page: 'sidebar',
      check: 'Nav link "AI Outputs"',
      passed: hasSidebarAiOutputs,
      details: hasSidebarAiOutputs ? 'Found' : 'Not found'
    })
    console.log(`  ${hasSidebarAiOutputs ? '✅' : '❌'} Sidebar: "AI Outputs"\n`)

    // Summary
    const totalChecks = results.length
    const passedChecks = results.filter(r => r.passed).length
    const failedChecks = totalChecks - passedChecks

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(`📊 SUMMARY: ${passedChecks}/${totalChecks} checks passed`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

    if (failedChecks > 0) {
      console.log('❌ Failed checks:')
      results.filter(r => !r.passed).forEach(r => {
        console.log(`  - ${r.page}: ${r.check} (${r.details})`)
      })
      console.log('')
    }

    // Keep browser open for visual inspection
    console.log('🔍 Browser left open for visual inspection.')
    console.log('   Press Ctrl+C to close when done.\n')
    
    // Wait indefinitely
    await new Promise(() => {})

  } catch (error) {
    console.error('❌ Error during verification:', error)
    throw error
  }
}

verifyUIChanges().catch(console.error)
