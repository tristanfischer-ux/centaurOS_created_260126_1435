import { test } from '@playwright/test'

test('Quick visual check of specialist chat', async ({ page }) => {
  // Go to today page
  await page.goto('/today')
  await page.waitForLoadState('networkidle')
  
  // Take screenshot
  await page.screenshot({
    path: 'test-results/visual-check-today.png',
    fullPage: true,
  })
  
  console.log('Screenshot saved to test-results/visual-check-today.png')
  console.log('URL:', page.url())
  console.log('Title:', await page.title())
})
