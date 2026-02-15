import { test, expect } from '@playwright/test'
import path from 'path'

const authDir = path.join(__dirname, '..', '.playwright/auth')

test.describe('Specialist Chat Fixes', () => {
  test.use({ storageState: path.join(authDir, 'founder.json') })

  test('should not show <think> tags and should address user by name', async ({
    page,
  }) => {
    // Navigate to agents page
    await page.goto('/agents')

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Take screenshot of agents page
    await page.screenshot({
      path: 'test-results/specialist-chat-1-agents-page.png',
      fullPage: true,
    })

    // Find and click on a specialist card
    // Look for any button or card that opens a specialist chat
    const specialistCard = page.locator('[data-testid="specialist-card"]').first()
    
    // If no test id, try finding by role
    if ((await specialistCard.count()) === 0) {
      // Look for cards or buttons that might open specialist dialogs
      const cards = page.locator('button:has-text("Brief"), button:has-text("Chat"), button:has-text("Specialist")')
      await cards.first().click()
    } else {
      await specialistCard.click()
    }

    // Wait for dialog to open
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 })

    // Take screenshot of chat dialog
    await page.screenshot({
      path: 'test-results/specialist-chat-2-dialog-opened.png',
      fullPage: true,
    })

    // Get the dialog content
    const dialog = page.locator('[role="dialog"]')
    const dialogText = await dialog.textContent()

    console.log('Dialog content:', dialogText)

    // Check 1: No <think> tags should be visible
    const hasVisibleThinkTags =
      dialogText?.includes('<think>') || dialogText?.includes('</think>')
    console.log('Has visible <think> tags:', hasVisibleThinkTags)

    // Check 2: Should address user by name
    // Look for common names or "you" in greeting
    const hasGreeting = dialogText?.toLowerCase().includes('hello') ||
      dialogText?.toLowerCase().includes('hi') ||
      dialogText?.toLowerCase().includes('welcome')
    console.log('Has greeting:', hasGreeting)

    // Look for input field and send a message
    const input = page.locator('textarea, input[type="text"]').last()
    await input.fill('Hello, what can you help me with?')

    // Find and click send button
    const sendButton = page.locator('button:has-text("Send"), button[type="submit"]').last()
    await sendButton.click()

    // Wait for response (give it time to stream)
    await page.waitForTimeout(3000)

    // Take screenshot of response
    await page.screenshot({
      path: 'test-results/specialist-chat-3-after-message.png',
      fullPage: true,
    })

    // Get updated dialog content
    const updatedDialogText = await dialog.textContent()
    console.log('Updated dialog content:', updatedDialogText)

    // Check again for <think> tags in response
    const hasVisibleThinkTagsInResponse =
      updatedDialogText?.includes('<think>') ||
      updatedDialogText?.includes('</think>')
    console.log('Has visible <think> tags in response:', hasVisibleThinkTagsInResponse)

    // Assertions
    expect(hasVisibleThinkTags).toBe(false)
    expect(hasVisibleThinkTagsInResponse).toBe(false)
    expect(hasGreeting).toBe(true)

    // Report findings
    console.log('\n=== TEST RESULTS ===')
    console.log('1. <think> tags visible in greeting:', hasVisibleThinkTags ? 'FAIL' : 'PASS')
    console.log('2. <think> tags visible in response:', hasVisibleThinkTagsInResponse ? 'FAIL' : 'PASS')
    console.log('3. Has greeting message:', hasGreeting ? 'PASS' : 'FAIL')
  })
})
