/**
 * Test Soldado Login
 * 
 * Simple script to test logging in with the Soldado account credentials
 * and report what happens.
 */

import { chromium } from 'playwright'
import path from 'path'

const EMAIL = 'mark@soldado.uk'
const PASSWORD = 'Soldado2026!'
const BASE_URL = 'http://localhost:3000'

async function testLogin() {
  console.log('━'.repeat(60))
  console.log('  Testing Soldado Login')
  console.log('━'.repeat(60))

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  try {
    // Step 1: Navigate to login page
    console.log('\n1. Navigating to login page...')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    
    // Step 2: Take screenshot of login page
    const screenshotsDir = path.join(process.cwd(), 'screenshots')
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-login-01-page.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot saved: soldado-login-01-page.png')

    // Step 3: Fill in email
    console.log('\n2. Filling in credentials...')
    const emailInput = page.locator('input[type="email"]')
    await emailInput.fill(EMAIL)
    console.log(`   ✓ Email filled: ${EMAIL}`)

    // Step 4: Fill in password
    const passwordInput = page.locator('input[type="password"]')
    await passwordInput.fill(PASSWORD)
    console.log('   ✓ Password filled')

    // Take screenshot with credentials filled
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-login-02-filled.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot saved: soldado-login-02-filled.png')

    // Step 5: Click Sign In button
    console.log('\n3. Clicking Sign In button...')
    
    // Try multiple selectors for the button
    let buttonClicked = false
    const buttonSelectors = [
      'button[type="submit"]',
      'button:has-text("Sign in")',
      'button:has-text("Log in")',
      'button:has-text("Sign In")',
      'button:has-text("Log In")',
      '[type="submit"]',
    ]
    
    for (const selector of buttonSelectors) {
      try {
        const button = page.locator(selector).first()
        if (await button.isVisible({ timeout: 2000 })) {
          console.log(`   Found button with selector: ${selector}`)
          await button.click()
          buttonClicked = true
          console.log('   ✓ Sign In button clicked')
          break
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    if (!buttonClicked) {
      console.log('   ✗ Could not find Sign In button')
      console.log('   Available buttons:')
      const buttons = await page.locator('button').allTextContents()
      buttons.forEach(text => console.log(`     - "${text.trim()}"`))
    }

    // Step 6: Wait for navigation or error
    console.log('\n4. Waiting for response...')
    await page.waitForTimeout(5000)

    // Check for errors
    const errorMessages = await page.locator('[role="alert"], .error, [class*="error"]').allTextContents()
    
    if (errorMessages.length > 0) {
      console.log('\n   ✗ Error detected:')
      errorMessages.forEach(msg => {
        if (msg.trim()) {
          console.log(`     - ${msg.trim()}`)
        }
      })
    }

    // Step 7: Take screenshot of result page
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-login-03-result.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot saved: soldado-login-03-result.png')

    // Step 8: Check what page we're on
    const currentUrl = page.url()
    console.log(`\n5. Current URL: ${currentUrl}`)

    // Check for company name
    const soldadoText = await page.locator('text=Soldado').count()
    if (soldadoText > 0) {
      console.log('   ✓ Company name "Soldado" is visible')
    } else {
      console.log('   ✗ Company name "Soldado" not found')
    }

    // Check for navigation items
    console.log('\n6. Checking navigation...')
    const navLinks = await page.locator('nav a, [role="navigation"] a').allTextContents()
    if (navLinks.length > 0) {
      console.log('   Navigation items found:')
      navLinks.forEach(link => {
        if (link.trim()) {
          console.log(`     - ${link.trim()}`)
        }
      })
    }

    // Check page title
    const title = await page.title()
    console.log(`\n7. Page title: ${title}`)

    // Check for main content
    const mainContent = await page.locator('main, [role="main"]').textContent()
    if (mainContent) {
      const preview = mainContent.trim().substring(0, 200)
      console.log(`\n8. Page content preview:\n   ${preview}...`)
    }

    // Determine success
    console.log('\n' + '━'.repeat(60))
    if (currentUrl.includes('/login')) {
      console.log('  ✗ LOGIN FAILED - Still on login page')
    } else if (errorMessages.length > 0) {
      console.log('  ✗ LOGIN FAILED - Error messages detected')
    } else {
      console.log('  ✓ LOGIN SUCCESSFUL')
      console.log(`  Redirected to: ${currentUrl}`)
    }
    console.log('━'.repeat(60))

  } catch (error) {
    console.error('\n✗ Error during test:', error)
    throw error
  } finally {
    // Keep browser open for 5 seconds to see the result
    console.log('\nKeeping browser open for 5 seconds...')
    await page.waitForTimeout(5000)
    await browser.close()
  }
}

testLogin()
  .then(() => {
    console.log('\n✓ Test complete')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n✗ Test failed:', err)
    process.exit(1)
  })
