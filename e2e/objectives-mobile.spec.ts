import { test, expect, devices } from '@playwright/test';

test.use({
  ...devices['iPhone 13 Mini'],
  viewport: { width: 375, height: 812 },
});

test.describe('Objectives Page - Mobile Responsiveness', () => {
  test('should display objectives page correctly on mobile @mobile', async ({ page }) => {
    // Navigate to login
    await page.goto('http://localhost:3000/login');
    
    // Login with demo credentials
    await page.getByLabel('Email').fill('demo.founder@fractionalforge.app');
    await page.getByLabel('Password').fill('DemoFounder2026!');
    await page.getByRole('button', { name: /enter the forge/i }).click();
    
    // Wait for navigation after login
    await page.waitForURL(/\/(?!login)/, { timeout: 10000 });
    
    // Navigate to objectives page
    await page.goto('http://localhost:3000/new-objectives');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot of board view
    await page.screenshot({ 
      path: 'e2e-results/objectives-mobile-board.png',
      fullPage: true 
    });
    
    // Check 1: Page header fits without overflow
    const header = page.locator('[class*="page-header"], header, [role="banner"]').first();
    const headerBox = await header.boundingBox();
    console.log('Header width:', headerBox?.width);
    expect(headerBox?.width).toBeLessThanOrEqual(375);
    
    // Check 2: No horizontal scrolling
    const bodyScrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidth = await page.evaluate(() => document.body.clientWidth);
    console.log('Body scroll width:', bodyScrollWidth, 'Client width:', bodyClientWidth);
    expect(bodyScrollWidth).toBeLessThanOrEqual(bodyClientWidth + 1); // +1 for rounding
    
    // Check 3: Health bar stats - should be in 3-column grid
    const statCards = page.locator('[class*="stat"], [data-testid*="stat"]');
    const statCount = await statCards.count();
    if (statCount > 0) {
      const firstStatBox = await statCards.first().boundingBox();
      const secondStatBox = await statCards.nth(1).boundingBox();
      const thirdStatBox = await statCards.nth(2).boundingBox();
      
      if (firstStatBox && secondStatBox && thirdStatBox) {
        // Check if they're in same row (similar y position)
        const yDiff = Math.abs(firstStatBox.y - secondStatBox.y);
        console.log('Stat cards Y difference:', yDiff);
        
        // If y difference is small, they're in the same row (grid layout)
        if (yDiff < 20) {
          console.log('✓ Stat cards appear to be in grid layout');
        }
      }
    }
    
    // Check 4: Toolbar (tabs + filter + search) visibility
    const toolbar = page.locator('[role="tablist"], [class*="toolbar"]').first();
    if (await toolbar.isVisible()) {
      const toolbarBox = await toolbar.boundingBox();
      console.log('Toolbar width:', toolbarBox?.width);
      expect(toolbarBox?.width).toBeLessThanOrEqual(375);
    }
    
    // Switch to Tree view
    const treeTab = page.getByRole('tab', { name: /tree/i });
    await treeTab.click();
    await page.waitForTimeout(1000); // Wait for view transition
    
    // Take screenshot of tree view
    await page.screenshot({ 
      path: 'e2e-results/objectives-mobile-tree.png',
      fullPage: true 
    });
    
    // Check 5: Tree view - action buttons visible (not hidden behind hover)
    const actionButtons = page.locator('button[aria-label*="edit"], button[aria-label*="delete"], button[class*="action"]');
    const buttonCount = await actionButtons.count();
    console.log('Action buttons found:', buttonCount);
    
    if (buttonCount > 0) {
      const firstButton = actionButtons.first();
      const isVisible = await firstButton.isVisible();
      console.log('First action button visible:', isVisible);
      expect(isVisible).toBe(true);
    }
    
    // Check 6: Tree indentation doesn't push content off-screen
    const treeItems = page.locator('[role="treeitem"], [class*="tree-item"]');
    const treeItemCount = await treeItems.count();
    console.log('Tree items found:', treeItemCount);
    
    if (treeItemCount > 0) {
      for (let i = 0; i < Math.min(treeItemCount, 5); i++) {
        const item = treeItems.nth(i);
        const itemBox = await item.boundingBox();
        if (itemBox) {
          console.log(`Tree item ${i} - x: ${itemBox.x}, width: ${itemBox.width}, right edge: ${itemBox.x + itemBox.width}`);
          expect(itemBox.x + itemBox.width).toBeLessThanOrEqual(375);
        }
      }
    }
    
    // Final check: No horizontal scrolling in tree view
    const bodyScrollWidthTree = await page.evaluate(() => document.body.scrollWidth);
    const bodyClientWidthTree = await page.evaluate(() => document.body.clientWidth);
    console.log('Tree view - Body scroll width:', bodyScrollWidthTree, 'Client width:', bodyClientWidthTree);
    expect(bodyScrollWidthTree).toBeLessThanOrEqual(bodyClientWidthTree + 1);
  });
});
