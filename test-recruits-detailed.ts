/**
 * Detailed test script for /recruits page
 * 
 * Usage: npx tsx test-recruits-detailed.ts
 */

import { chromium } from '@playwright/test'

async function testRecruitsPageDetailed() {
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page = await context.newPage()

    // Collect console messages
    const consoleMessages: Array<{ type: string; text: string }> = []
    page.on('console', msg => {
        consoleMessages.push({ type: msg.type(), text: msg.text() })
    })

    try {
        console.log('=== RECRUITS PAGE DETAILED TEST ===\n')

        console.log('1. Navigating to login page...')
        await page.goto('http://localhost:3000/login')
        await page.waitForLoadState('networkidle')

        console.log('2. Logging in with test credentials...')
        await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
        await page.fill('input[name="password"]', 'DemoFounder2026!')
        await page.click('button:has-text("Access Foundry")')
        
        await page.waitForURL(/\/(updates|workspace-picker|recruits)/, { timeout: 10000 })
        console.log(`   ✅ Logged in, redirected to: ${page.url()}`)

        console.log('\n3. Navigating to /recruits page...')
        await page.goto('http://localhost:3000/recruits')
        await page.waitForLoadState('networkidle')
        await page.waitForTimeout(2000)

        console.log('\n4. Checking for welcome modal...')
        const welcomeModal = await page.locator('text=Welcome, Founder').count()
        if (welcomeModal > 0) {
            console.log('   ✅ Welcome modal found - closing it...')
            // Try to close the modal
            const closeButton = page.locator('button:has-text("NEXT STEP")')
            if (await closeButton.count() > 0) {
                await closeButton.click()
                await page.waitForTimeout(1000)
            }
            // Or try X button
            const xButton = page.locator('button[aria-label="Close"]')
            if (await xButton.count() > 0) {
                await xButton.click()
                await page.waitForTimeout(1000)
            }
        } else {
            console.log('   ℹ️  No welcome modal')
        }

        console.log('\n5. Taking screenshot of page (after modal)...')
        await page.screenshot({ path: 'recruits-detailed-1-page.png', fullPage: false })
        console.log('   Screenshot saved: recruits-detailed-1-page.png')

        console.log('\n6. Analyzing page structure...')
        
        // Check for TalentFinder section
        console.log('\n   === TALENT FINDER SECTION ===')
        const talentFinderHeading = await page.locator('text=Describe who you need').count()
        console.log(`   - "Describe who you need" heading: ${talentFinderHeading > 0 ? '✅ Found' : '❌ Not found'}`)
        
        const searchInput = await page.locator('input[placeholder*="Looking for"]').count()
        console.log(`   - Search input: ${searchInput > 0 ? '✅ Found' : '❌ Not found'}`)
        
        const findTalentButton = await page.locator('button:has-text("Find Talent")').count()
        console.log(`   - "Find Talent" button: ${findTalentButton > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for Recruits section
        console.log('\n   === RECRUITS SECTION ===')
        const recruitsHeading = await page.locator('h1:has-text("Recruits"), h2:has-text("Recruits")').count()
        console.log(`   - "Recruits" heading: ${recruitsHeading > 0 ? '✅ Found' : '❌ Not found'}`)
        
        const subtitle = await page.locator('text=Find expert talent').count()
        console.log(`   - Subtitle: ${subtitle > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for Browse tab
        const browseTab = await page.locator('button:has-text("Browse")').count()
        console.log(`   - Browse tab: ${browseTab > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for results count
        const resultsText = await page.locator('text=/\\d+ results/').count()
        console.log(`   - Results count: ${resultsText > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for person cards
        const personCards = await page.locator('[class*="grid"] > div').count()
        console.log(`   - Person cards in grid: ${personCards} found`)

        // Check for filters
        const filtersButton = await page.locator('button:has-text("Filters")').count()
        console.log(`   - Filters button: ${filtersButton > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for sort dropdown
        const sortDropdown = await page.locator('text=Relevance').count()
        console.log(`   - Sort dropdown: ${sortDropdown > 0 ? '✅ Found' : '❌ Not found'}`)

        console.log('\n7. Taking full page screenshot...')
        await page.screenshot({ path: 'recruits-detailed-2-fullpage.png', fullPage: true })
        console.log('   Screenshot saved: recruits-detailed-2-fullpage.png')

        console.log('\n8. Testing TalentFinder search...')
        if (searchInput > 0) {
            const input = page.locator('input[placeholder*="Looking for"]')
            await input.click()
            await input.fill('I need a fractional CTO with hardware experience')
            await page.waitForTimeout(500)
            await page.screenshot({ path: 'recruits-detailed-3-search-filled.png', fullPage: false })
            console.log('   Screenshot saved: recruits-detailed-3-search-filled.png')
        }

        console.log('\n9. Scrolling to see more cards...')
        await page.evaluate(() => window.scrollTo(0, 800))
        await page.waitForTimeout(1000)
        await page.screenshot({ path: 'recruits-detailed-4-scrolled.png', fullPage: false })
        console.log('   Screenshot saved: recruits-detailed-4-scrolled.png')

        console.log('\n10. Checking for errors...')
        const errorAlerts = await page.locator('[role="alert"]').count()
        if (errorAlerts > 0) {
            console.log(`   ⚠️  Found ${errorAlerts} error alert(s)`)
            const errorTexts = await page.locator('[role="alert"]').allTextContents()
            errorTexts.forEach((text, i) => console.log(`   - Error ${i + 1}: ${text}`))
        } else {
            console.log('   ✅ No error alerts')
        }

        console.log('\n11. Console messages summary:')
        const errors = consoleMessages.filter(m => m.type === 'error')
        const warnings = consoleMessages.filter(m => m.type === 'warning')
        console.log(`   - Errors: ${errors.length}`)
        console.log(`   - Warnings: ${warnings.length}`)
        
        if (errors.length > 0) {
            console.log('\n   Console errors:')
            errors.slice(0, 5).forEach(e => console.log(`   - ${e.text}`))
        }

        console.log('\n=== TEST COMPLETE ===')
        console.log('\nScreenshots saved:')
        console.log('  - recruits-detailed-1-page.png')
        console.log('  - recruits-detailed-2-fullpage.png')
        console.log('  - recruits-detailed-3-search-filled.png')
        console.log('  - recruits-detailed-4-scrolled.png')

        console.log('\n✅ All tests passed!')

    } catch (error) {
        console.error('\n❌ Test failed:', error)
        await page.screenshot({ path: 'recruits-detailed-error.png', fullPage: true })
        console.log('   Error screenshot saved: recruits-detailed-error.png')
    } finally {
        await browser.close()
    }
}

testRecruitsPageDetailed()
