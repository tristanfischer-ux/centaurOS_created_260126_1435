/**
 * Test Soldado Login - Final Version
 * 
 * Simple script to test logging in with the Soldado account credentials
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
    // Navigate to login page
    console.log('\n1. Navigating to login page...')
    await page.goto(`${BASE_URL}/login`)
    await page.waitForLoadState('networkidle')
    
    const screenshotsDir = path.join(process.cwd(), 'screenshots')
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-final-01-page.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot: soldado-final-01-page.png')

    // Fill in credentials
    console.log('\n2. Filling in credentials...')
    await page.locator('input[type="email"]').fill(EMAIL)
    console.log(`   ✓ Email: ${EMAIL}`)
    
    await page.locator('input[type="password"]').fill(PASSWORD)
    console.log('   ✓ Password: ********')

    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-final-02-filled.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot: soldado-final-02-filled.png')

    // Click "Enter the Forge" button
    console.log('\n3. Clicking "Enter the Forge" button...')
    await page.locator('button:has-text("Enter the Forge")').click()
    console.log('   ✓ Button clicked')

    // Wait for navigation
    console.log('\n4. Waiting for page to load...')
    await page.waitForTimeout(5000)

    // Take screenshot of result
    await page.screenshot({ 
      path: path.join(screenshotsDir, 'soldado-final-03-result.png'),
      fullPage: true 
    })
    console.log('   ✓ Screenshot: soldado-final-03-result.png')

    // Check current URL
    const currentUrl = page.url()
    console.log(`\n5. Current URL: ${currentUrl}`)

    // Check for error messages
    const errorText = await page.locator('[role="alert"], .error').allTextContents()
    if (errorText.length > 0 && errorText.some(t => t.trim())) {
      console.log('\n   ✗ Error messages found:')
      errorText.forEach(msg => {
        if (msg.trim()) console.log(`     "${msg.trim()}"`)
      })
    }

    // Check for company name
    const soldadoVisible = await page.locator('text=Soldado').count()
    console.log(`\n6. Company name "Soldado" visible: ${soldadoVisible > 0 ? '✓ YES' : '✗ NO'}`)

    // Check page title
    const title = await page.title()
    console.log(`\n7. Page title: "${title}"`)

    // Check navigation
    const navText = await page.locator('nav').textContent().catch(() => '')
    if (navText) {
      console.log(`\n8. Navigation preview: ${navText.substring(0, 100)}...`)
    }

    // Determine result
    console.log('\n' + '━'.repeat(60))
    if (currentUrl.includes('/login')) {
      console.log('  ✗ LOGIN FAILED - Still on login page')
      console.log('  Check soldado-final-03-result.png for error details')
    } else {
      console.log('  ✓ LOGIN SUCCESSFUL')
      console.log(`  Redirected to: ${currentUrl}`)
      console.log(`  Company visible: ${soldadoVisible > 0 ? 'Yes' : 'No'}`)
    }
    console.log('━'.repeat(60))

    // Keep browser open to see result
    console.log('\nKeeping browser open for 10 seconds...')
    await page.waitForTimeout(10000)

  } catch (error) {
    console.error('\n✗ Error:', error)
    throw error
  } finally {
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
