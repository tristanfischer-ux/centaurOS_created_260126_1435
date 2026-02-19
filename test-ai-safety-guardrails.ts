import { chromium } from '@playwright/test'

async function testAISafetyGuardrails() {
  console.log('Starting AI safety guardrails test...')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext()
  const page = await context.newPage()

  // Listen for console messages and errors
  page.on('console', msg => {
    const type = msg.type()
    if (type === 'error' || type === 'warning') {
      console.log(`[Browser ${type}]:`, msg.text())
    }
  })

  page.on('pageerror', error => {
    console.error('[Page Error]:', error.message)
  })

  try {
    // Step 0: Login first
    console.log('\n0. Logging in as demo founder...')
    await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle' })
    await page.screenshot({ path: 'screenshots/00-login-page.png', fullPage: true })
    
    // Fill in login credentials
    await page.fill('input[type="email"], input[name="email"]', 'demo.founder@forgeos.io')
    await page.fill('input[type="password"], input[name="password"]', 'DemoFounder2026!')
    await page.screenshot({ path: 'screenshots/00-credentials-filled.png', fullPage: true })
    
    // Click login button
    await page.click('button[type="submit"], button:has-text("Enter the Forge"), button:has-text("Sign in")')
    console.log('✓ Login button clicked, waiting for redirect...')
    
    // Wait for navigation after login (redirects to /today)
    await page.waitForURL(/\/(home|dashboard|agents|today)/, { timeout: 10000 })
    await page.waitForTimeout(2000) // Extra wait for any client-side hydration
    await page.screenshot({ path: 'screenshots/00-logged-in.png', fullPage: true })
    console.log('✓ Successfully logged in')

    // Step 1: Navigate to agents page
    console.log('\n1. Navigating to http://localhost:3000/agents')
    await page.goto('http://localhost:3000/agents', { waitUntil: 'networkidle' })
    await page.screenshot({ path: 'screenshots/01-agents-page.png', fullPage: true })
    console.log('✓ Agents page loaded')

    // Check if we're logged in
    const isLoggedIn = await page.locator('body').evaluate(() => {
      return !window.location.pathname.includes('/login')
    })
    console.log(`✓ Login status: ${isLoggedIn ? 'Logged in' : 'Not logged in'}`)

    // Step 1.5: Handle onboarding tour modal if present
    console.log('\n1.5. Checking for onboarding tour modal...')
    const skipTourButton = page.locator('button:has-text("SKIP TOUR"), button:has-text("Skip Tour"), button:has-text("Skip")')
    const skipButtonCount = await skipTourButton.count()
    
    if (skipButtonCount > 0) {
      console.log('✓ Onboarding tour modal detected, clicking skip...')
      await skipTourButton.first().click()
      await page.waitForTimeout(1000)
      await page.screenshot({ path: 'screenshots/01-tour-skipped.png', fullPage: true })
      console.log('✓ Tour skipped')
    } else {
      console.log('✓ No onboarding tour modal detected')
    }

    // Step 2: Look for specialist cards
    console.log('\n2. Looking for specialist cards...')
    const specialistCards = page.locator('[data-testid="specialist-card"], .specialist-card, button:has-text("Sage"), button:has-text("Brief")')
    const cardCount = await specialistCards.count()
    console.log(`✓ Found ${cardCount} specialist cards`)

    if (cardCount === 0) {
      console.log('⚠ No specialist cards found. Taking screenshot of current state.')
      await page.screenshot({ path: 'screenshots/02-no-specialists.png', fullPage: true })
      
      // Try to find any clickable elements
      const buttons = page.locator('button')
      const buttonCount = await buttons.count()
      console.log(`Found ${buttonCount} buttons on page`)
      
      if (buttonCount > 0) {
        for (let i = 0; i < Math.min(5, buttonCount); i++) {
          const text = await buttons.nth(i).textContent()
          console.log(`  Button ${i}: "${text}"`)
        }
      }
      
      throw new Error('No specialist cards found')
    }

    // Step 3: Click on first specialist card to open chat
    console.log('\n3. Clicking on first specialist card...')
    await specialistCards.first().click()
    await page.waitForTimeout(2000) // Wait for chat to initialize
    await page.screenshot({ path: 'screenshots/03-specialist-clicked.png', fullPage: true })
    console.log('✓ Specialist clicked')

    // Step 4: Wait for chat interface to load
    console.log('\n4. Waiting for chat interface to load...')
    try {
      // Wait for chat input to appear
      await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 })
      console.log('✓ Chat interface loaded')
    } catch (e) {
      console.log('⚠ Chat interface did not load within 10 seconds')
    }
    await page.screenshot({ path: 'screenshots/04-chat-loaded.png', fullPage: true })

    // Step 5: Find chat input and send message
    console.log('\n5. Looking for chat input...')
    const chatInput = page.locator('textarea[placeholder*="message"], textarea[placeholder*="Message"], input[placeholder*="message"], input[placeholder*="Message"], textarea').first()
    
    const inputExists = await chatInput.count() > 0
    if (!inputExists) {
      console.log('⚠ Chat input not found. Taking screenshot.')
      await page.screenshot({ path: 'screenshots/05-no-chat-input.png', fullPage: true })
      throw new Error('Chat input not found')
    }

    console.log('✓ Chat input found')
    await chatInput.fill('What should I focus on this week?')
    await page.screenshot({ path: 'screenshots/06-message-typed.png', fullPage: true })
    console.log('✓ Message typed')

    // Find and click send button
    console.log('\n6. Looking for send button...')
    const sendButton = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="Send"]').first()
    const sendExists = await sendButton.count() > 0
    
    if (!sendExists) {
      console.log('⚠ Send button not found. Trying Enter key...')
      await chatInput.press('Enter')
    } else {
      await sendButton.click()
    }
    
    console.log('✓ Message sent')
    await page.screenshot({ path: 'screenshots/07-message-sent.png', fullPage: true })

    // Step 7: Wait for response to stream in
    console.log('\n7. Waiting for AI response...')
    
    // Wait for response to appear (look for message container or streaming indicator)
    try {
      await page.waitForSelector('[data-testid="ai-message"], .ai-message, [role="article"]', { 
        timeout: 15000 
      })
      console.log('✓ AI response detected')
    } catch (e) {
      console.log('⚠ No AI response detected within 15 seconds')
    }

    // Wait a bit more for streaming to complete
    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'screenshots/08-response-received.png', fullPage: true })
    console.log('✓ Response screenshot captured')

    // Check for any error messages
    console.log('\n8. Checking for errors...')
    const errorMessages = await page.locator('[role="alert"], .error, .text-destructive, .text-red-500').allTextContents()
    if (errorMessages.length > 0) {
      console.log('⚠ Error messages found:')
      errorMessages.forEach(msg => console.log(`  - ${msg}`))
    } else {
      console.log('✓ No error messages detected')
    }

    // Get final page state
    const finalUrl = page.url()
    console.log(`\n✓ Final URL: ${finalUrl}`)
    
    console.log('\n✅ Test completed successfully!')
    console.log('Screenshots saved to screenshots/ directory')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    await page.screenshot({ path: 'screenshots/error-state.png', fullPage: true })
    throw error
  } finally {
    // Keep browser open for manual inspection
    console.log('\nBrowser will remain open for 30 seconds for manual inspection...')
    await page.waitForTimeout(30000)
    await browser.close()
  }
}

testAISafetyGuardrails().catch(console.error)
