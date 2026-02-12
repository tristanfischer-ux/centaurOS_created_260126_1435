/**
 * @file forge-module-navigation.spec.ts
 * 
 * @description E2E test for module card navigation from concept page to dossier page.
 * Tests that clicking a module card on the concept page navigates to the dossier
 * page with the correct module expanded.
 */

import { test, expect } from '@playwright/test'

test.describe('Forge Module Card Navigation', () => {
  // Test project IDs with known modules
  const PROJECT_IDS = [
    '7ec7ba8b-b2d9-4997-8beb-da8fa92cabb4',
    '59ef4d03-df75-46be-8e20-c4fc0fd0ab53',
  ]

  test.beforeEach(async ({ page }) => {
    // Navigate to home and ensure we're logged in
    await page.goto('http://localhost:3000')
    
    // Wait for auth to settle (either redirect to login or show platform)
    await page.waitForLoadState('networkidle')
    
    // If we see a login page, we need to authenticate first
    const isLoginPage = page.url().includes('/login')
    if (isLoginPage) {
      // Skip test if not authenticated - this should be handled by auth setup
      test.skip()
    }
  })

  for (const projectId of PROJECT_IDS) {
    test(`should navigate from concept page module card to dossier page for project ${projectId}`, async ({ page }) => {
      // Navigate to the concept page
      await page.goto(`http://localhost:3000/the-forge/${projectId}/concept`)
      await page.waitForLoadState('networkidle')

      // Check if we have module cards on the page
      const moduleCards = page.locator('button:has-text("parts"):has-text("risks")')
      const moduleCount = await moduleCards.count()

      if (moduleCount === 0) {
        console.log(`No module cards found for project ${projectId}, skipping...`)
        test.skip()
        return
      }

      console.log(`Found ${moduleCount} module cards`)

      // Take screenshot of concept page
      await page.screenshot({ 
        path: `tests/screenshots/concept-page-${projectId}.png`,
        fullPage: true 
      })

      // Get the first module card
      const firstModuleCard = moduleCards.first()
      
      // Extract module name for verification
      const moduleName = await firstModuleCard.locator('.text-sm.font-medium').first().textContent()
      console.log(`Clicking module card: ${moduleName}`)

      // Click the module card
      await firstModuleCard.click()

      // Wait for navigation to complete
      await page.waitForLoadState('networkidle')

      // Verify URL changed to dossier page with module query param
      const currentUrl = page.url()
      expect(currentUrl).toContain('/dossier')
      expect(currentUrl).toContain('?module=')
      
      console.log(`Navigated to: ${currentUrl}`)

      // Extract module ID from URL
      const urlParams = new URL(currentUrl).searchParams
      const moduleId = urlParams.get('module')
      expect(moduleId).toBeTruthy()
      console.log(`Module ID from URL: ${moduleId}`)

      // Wait for the dossier page to render
      await page.waitForSelector('[role="tablist"]', { timeout: 5000 })

      // Verify the "Modules" tab is active
      const modulesTab = page.locator('[role="tab"]:has-text("Modules")')
      await expect(modulesTab).toHaveAttribute('data-state', 'active')
      console.log('✓ Modules tab is active')

      // Wait a bit for the accordion to expand and scroll
      await page.waitForTimeout(500)

      // Take screenshot of dossier page
      await page.screenshot({ 
        path: `tests/screenshots/dossier-page-${projectId}-module-${moduleId}.png`,
        fullPage: true 
      })

      // Verify a module is expanded in the accordion
      // The expanded module should have the matching module ID in its element ID
      const expandedModule = page.locator(`[id="module-v2-${moduleId}"]`)
      await expect(expandedModule).toBeVisible({ timeout: 5000 })
      console.log(`✓ Module ${moduleId} is expanded`)

      // Verify the expanded module contains the module name we clicked
      if (moduleName) {
        const expandedModuleName = await expandedModule.locator('h3, .font-semibold').first().textContent()
        expect(expandedModuleName).toContain(moduleName.trim())
        console.log(`✓ Expanded module matches clicked module: ${moduleName}`)
      }

      // Verify the module is in the viewport (auto-scrolled)
      const isInViewport = await expandedModule.evaluate((el) => {
        const rect = el.getBoundingClientRect()
        return (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= window.innerHeight &&
          rect.right <= window.innerWidth
        )
      })
      
      if (isInViewport) {
        console.log('✓ Module is visible in viewport (auto-scrolled)')
      } else {
        console.log('⚠ Module may not be fully in viewport, but is visible')
      }
    })
  }

  test('should handle clicking multiple module cards sequentially', async ({ page }) => {
    const projectId = PROJECT_IDS[0]
    
    // Navigate to the concept page
    await page.goto(`http://localhost:3000/the-forge/${projectId}/concept`)
    await page.waitForLoadState('networkidle')

    // Get all module cards
    const moduleCards = page.locator('button:has-text("parts"):has-text("risks")')
    const moduleCount = await moduleCards.count()

    if (moduleCount < 2) {
      console.log('Need at least 2 modules for this test, skipping...')
      test.skip()
      return
    }

    // Click first module
    const firstModuleName = await moduleCards.nth(0).locator('.text-sm.font-medium').first().textContent()
    await moduleCards.nth(0).click()
    await page.waitForLoadState('networkidle')
    
    let currentUrl = page.url()
    const firstModuleId = new URL(currentUrl).searchParams.get('module')
    console.log(`First module: ${firstModuleName} (${firstModuleId})`)

    // Verify first module is expanded
    await expect(page.locator(`[id="module-v2-${firstModuleId}"]`)).toBeVisible()

    // Navigate back to concept page
    await page.goto(`http://localhost:3000/the-forge/${projectId}/concept`)
    await page.waitForLoadState('networkidle')

    // Click second module
    const secondModuleName = await moduleCards.nth(1).locator('.text-sm.font-medium').first().textContent()
    await moduleCards.nth(1).click()
    await page.waitForLoadState('networkidle')

    currentUrl = page.url()
    const secondModuleId = new URL(currentUrl).searchParams.get('module')
    console.log(`Second module: ${secondModuleName} (${secondModuleId})`)

    // Verify second module is expanded
    await expect(page.locator(`[id="module-v2-${secondModuleId}"]`)).toBeVisible()

    // Verify the module IDs are different
    expect(firstModuleId).not.toBe(secondModuleId)
    console.log('✓ Different modules expand correctly')
  })

  test('should handle direct navigation to dossier with module param', async ({ page }) => {
    const projectId = PROJECT_IDS[0]
    
    // First, get a valid module ID from the concept page
    await page.goto(`http://localhost:3000/the-forge/${projectId}/concept`)
    await page.waitForLoadState('networkidle')

    const moduleCards = page.locator('button:has-text("parts"):has-text("risks")')
    const moduleCount = await moduleCards.count()

    if (moduleCount === 0) {
      test.skip()
      return
    }

    // Click a module to get its ID
    await moduleCards.first().click()
    await page.waitForLoadState('networkidle')
    
    const currentUrl = page.url()
    const moduleId = new URL(currentUrl).searchParams.get('module')

    // Now directly navigate to dossier with the module param
    await page.goto(`http://localhost:3000/the-forge/${projectId}/dossier?module=${moduleId}`)
    await page.waitForLoadState('networkidle')

    // Verify the module is expanded
    await expect(page.locator(`[id="module-v2-${moduleId}"]`)).toBeVisible({ timeout: 5000 })
    console.log('✓ Direct navigation with module param works')
  })
})
