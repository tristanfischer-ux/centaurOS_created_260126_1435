import { chromium } from 'playwright'
import path from 'path'

async function checkMobileViewport() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    storageState: path.join(__dirname, '../.playwright/auth/founder.json')
  })
  
  const page = await context.newPage()
  
  try {
    console.log('Navigating to http://localhost:3000/knowledge...')
    await page.goto('http://localhost:3000/knowledge', { waitUntil: 'networkidle' })
    
    // Wait a bit for any dynamic content
    await page.waitForTimeout(2000)
    
    // Take screenshot
    await page.screenshot({ 
      path: 'mobile-knowledge-page.png',
      fullPage: true 
    })
    
    console.log('Screenshot saved to mobile-knowledge-page.png')
    
    // Get page title and URL to confirm where we landed
    const title = await page.title()
    const url = page.url()
    console.log(`Page title: ${title}`)
    console.log(`Current URL: ${url}`)
    
    // Check if we're on a login page
    const loginForm = await page.locator('form').count()
    const hasLoginButton = await page.getByRole('button', { name: /sign in|log in/i }).count()
    
    if (url.includes('login') || url.includes('auth') || hasLoginButton > 0) {
      console.log('⚠️  Redirected to login page - authentication required')
    } else {
      console.log('✓ Successfully loaded knowledge page')
      
      // Check for key elements
      const pageHeader = await page.locator('h1').first().textContent()
      console.log(`Page header: ${pageHeader}`)
      
      const buttons = await page.getByRole('button').count()
      console.log(`Number of buttons found: ${buttons}`)
      
      const cards = await page.locator('[class*="card"]').count()
      console.log(`Number of cards found: ${cards}`)
    }
    
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await browser.close()
  }
}

checkMobileViewport()
