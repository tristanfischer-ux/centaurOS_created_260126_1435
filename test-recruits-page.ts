/**
 * Quick test script for /recruits page
 * 
 * Usage: npx tsx test-recruits-page.ts
 */

import { chromium } from '@playwright/test'

async function testRecruitsPage() {
    const browser = await chromium.launch({ headless: false })
    const context = await browser.newContext()
    const page = await context.newPage()

    try {
        console.log('1. Navigating to login page...')
        await page.goto('http://localhost:3000/login')
        await page.waitForLoadState('networkidle')
        
        console.log('2. Taking screenshot of login page...')
        await page.screenshot({ path: 'test-recruits-1-login.png', fullPage: true })
        console.log('   Screenshot saved: test-recruits-1-login.png')

        console.log('3. Filling in login credentials...')
        await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
        await page.fill('input[name="password"]', 'DemoFounder2026!')

        console.log('4. Submitting login form...')
        // The button uses formAction, not type="submit"
        await page.click('button:has-text("Access Foundry")')
        
        // Wait for navigation after login
        await page.waitForURL(/\/(updates|workspace-picker|recruits)/, { timeout: 10000 })
        console.log(`   Redirected to: ${page.url()}`)

        console.log('5. Navigating to /recruits page...')
        await page.goto('http://localhost:3000/recruits')
        await page.waitForLoadState('networkidle')
        
        // Wait for content to load
        await page.waitForTimeout(2000)

        console.log('6. Taking screenshot of recruits page (top)...')
        await page.screenshot({ path: 'test-recruits-2-page-top.png', fullPage: false })
        console.log('   Screenshot saved: test-recruits-2-page-top.png')

        console.log('7. Taking full page screenshot...')
        await page.screenshot({ path: 'test-recruits-3-page-full.png', fullPage: true })
        console.log('   Screenshot saved: test-recruits-3-page-full.png')

        console.log('8. Checking for key elements...')
        
        // Check for TalentFinder
        const talentFinderInput = await page.locator('input[placeholder*="Describe who you need"]').count()
        console.log(`   - TalentFinder search input: ${talentFinderInput > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for page title
        const pageTitle = await page.locator('text=Recruits').count()
        console.log(`   - Page title "Recruits": ${pageTitle > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for marketplace cards
        const cards = await page.locator('[class*="grid"]').count()
        console.log(`   - Grid layout for cards: ${cards > 0 ? '✅ Found' : '❌ Not found'}`)

        // Check for any error messages
        const errors = await page.locator('[role="alert"]').count()
        console.log(`   - Error messages: ${errors > 0 ? '⚠️ Found errors' : '✅ No errors'}`)

        console.log('\n9. Scrolling down to see more content...')
        await page.evaluate(() => window.scrollBy(0, 500))
        await page.waitForTimeout(1000)
        
        await page.screenshot({ path: 'test-recruits-4-scrolled.png', fullPage: false })
        console.log('   Screenshot saved: test-recruits-4-scrolled.png')

        console.log('\n10. Checking browser console for errors...')
        const consoleMessages: string[] = []
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleMessages.push(`ERROR: ${msg.text()}`)
            }
        })
        
        if (consoleMessages.length > 0) {
            console.log('   Console errors found:')
            consoleMessages.forEach(msg => console.log(`   - ${msg}`))
        } else {
            console.log('   ✅ No console errors')
        }

        console.log('\n✅ Test complete! Check the screenshots:')
        console.log('   - test-recruits-1-login.png')
        console.log('   - test-recruits-2-page-top.png')
        console.log('   - test-recruits-3-page-full.png')
        console.log('   - test-recruits-4-scrolled.png')

    } catch (error) {
        console.error('❌ Test failed:', error)
        await page.screenshot({ path: 'test-recruits-error.png', fullPage: true })
        console.log('   Error screenshot saved: test-recruits-error.png')
    } finally {
        await browser.close()
    }
}

testRecruitsPage()
