/**
 * Script to verify platform pages render correctly
 * 
 * Usage: npx tsx verify-platform-pages.ts
 */

import { chromium } from 'playwright'
import { mkdir } from 'fs/promises'
import { join } from 'path'

const BASE_URL = 'http://localhost:3000'
const SCREENSHOTS_DIR = join(process.cwd(), 'platform-verification')

const PAGES = [
  { path: '/plan', name: 'plan-page' },
  { path: '/workshop', name: 'workshop-page' },
  { path: '/marketplace-hub', name: 'marketplace-hub-page' },
  { path: '/me', name: 'me-page' },
]

async function main() {
  console.log('🚀 Starting platform pages verification...\n')

  // Create screenshots directory
  await mkdir(SCREENSHOTS_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  })
  const page = await context.newPage()

  try {
    // Step 1: Login
    console.log('📝 Logging in...')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')

    // Fill login form (using test credentials from .env.local)
    await page.fill('input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[name="password"]', 'DemoFounder2026!')
    
    // Click login button (button with "Enter the Forge" text)
    await page.click('button:has-text("Enter the Forge")')
    
    // Wait for navigation away from login page
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 })
    await page.waitForLoadState('networkidle')
    
    // Verify we're authenticated by checking the current URL
    const currentUrl = page.url()
    console.log(`  Current URL after login: ${currentUrl}`)
    
    if (currentUrl.includes('/login')) {
      throw new Error('Login failed - still on login page')
    }
    
    console.log('✅ Login successful\n')

    // Dismiss onboarding modal if present
    console.log('🔍 Checking for onboarding modal...')
    const onboardingButton = page.locator('button:has-text("SHOW ME WHAT\'S POSSIBLE")')
    if (await onboardingButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('  Dismissing onboarding modal...')
      await onboardingButton.click()
      await page.waitForTimeout(1000)
    }
    console.log('')

    // Step 2: Visit each page and capture screenshots
    for (const { path, name } of PAGES) {
      console.log(`📸 Visiting ${path}...`)
      
      try {
        await page.goto(`${BASE_URL}${path}`)
        await page.waitForLoadState('networkidle')
        
        // Dismiss onboarding modal if present on this page
        const onboardingButton = page.locator('button:has-text("SHOW ME WHAT\'S POSSIBLE")')
        if (await onboardingButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  Dismissing onboarding modal (step 1)...')
          await onboardingButton.click()
          await page.waitForTimeout(500)
        }
        
        // Check for "Your command centre" onboarding screen
        const commandCentreButton = page.locator('button:has-text("CONTINUE")')
        if (await commandCentreButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  Dismissing command centre modal (step 2)...')
          await commandCentreButton.click()
          await page.waitForTimeout(500)
        }
        
        // Check for "What brings you here?" and skip tour
        const skipTourButton = page.locator('button:has-text("SKIP TOUR")')
        if (await skipTourButton.isVisible({ timeout: 2000 }).catch(() => false)) {
          console.log('  Skipping onboarding tour...')
          await skipTourButton.click()
          await page.waitForTimeout(500)
        }
        
        // Wait for any animations to complete
        await page.waitForTimeout(1000)
        
        // Take full page screenshot
        const screenshotPath = join(SCREENSHOTS_DIR, `${name}.png`)
        await page.screenshot({ 
          path: screenshotPath, 
          fullPage: true 
        })
        
        // Check for errors
        const hasError = await page.locator('text=/error|something went wrong/i').count() > 0
        const hasContent = await page.locator('main, [role="main"]').count() > 0
        
        console.log(`  ✅ Screenshot saved: ${screenshotPath}`)
        console.log(`  📊 Has content: ${hasContent}`)
        console.log(`  ⚠️  Has errors: ${hasError}`)
        
        // Get page title
        const title = await page.title()
        console.log(`  📄 Page title: ${title}`)
        
        console.log('')
      } catch (error) {
        console.error(`  ❌ Error visiting ${path}:`, error)
        console.log('')
      }
    }

    console.log('✅ Verification complete!')
    console.log(`📁 Screenshots saved to: ${SCREENSHOTS_DIR}`)

  } catch (error) {
    console.error('❌ Error during verification:', error)
    throw error
  } finally {
    await browser.close()
  }
}

main().catch(console.error)
