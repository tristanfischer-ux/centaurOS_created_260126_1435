const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 400
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('    CELEBRATION TESTS (B & C)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Set localStorage flags
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true');
      localStorage.setItem('forgeos_intent_selected', 'true');
      localStorage.setItem('forgeos_tour_completed', 'true');
    });

    // ═══════════════════════════════════════════════════════════════
    // TEST B: Board Drag to Complete
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST B: Board Drag to Complete');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Navigating to /new-tasks...');
    try {
      await page.goto('http://localhost:3000/new-tasks', { timeout: 60000 });
      console.log('✓ Navigated\n');
    } catch (e) {
      console.log(`✗ Navigation failed: ${e.message}\n`);
      console.log('Skipping TEST B\n');
      await page.screenshot({ path: 'test-b-error.png' });
      throw e;
    }
    
    await page.waitForTimeout(4000);
    
    // Close dialogs
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    console.log('Clicking Board tab...');
    const boardTab = page.locator('[role="tab"]:has-text("Board")');
    const boardTabCount = await boardTab.count();
    
    if (boardTabCount > 0) {
      await boardTab.first().click({ force: true });
      await page.waitForTimeout(2000);
      console.log('✓ Board tab clicked\n');
    }
    
    await page.screenshot({ path: 'test-b-1-board.png', fullPage: true });
    console.log('📸 Screenshot: test-b-1-board.png\n');
    
    console.log('Finding task to drag...');
    const gripIcons = await page.locator('svg.lucide-grip-vertical').all();
    console.log(`Drag handles found: ${gripIcons.length}\n`);
    
    if (gripIcons.length > 0) {
      const firstGrip = gripIcons[0];
      const gripBox = await firstGrip.boundingBox();
      
      // Find Completed column
      const completedHeader = page.locator('text=/Completed/i').first();
      const completedBox = await completedHeader.boundingBox();
      
      if (gripBox && completedBox) {
        console.log('Dragging to Completed column...');
        
        await page.mouse.move(gripBox.x + 5, gripBox.y + 5);
        await page.mouse.down();
        await page.waitForTimeout(500);
        
        await page.mouse.move(completedBox.x + 50, completedBox.y + 100, { steps: 15 });
        await page.waitForTimeout(500);
        
        await page.mouse.up();
        console.log('✓ Drag completed\n');
        
        await page.waitForTimeout(3000);
      }
    }
    
    await page.screenshot({ path: 'test-b-2-after-drag.png', fullPage: true });
    console.log('📸 Screenshot: test-b-2-after-drag.png\n');
    
    console.log('Checking for celebrations...');
    const confetti = await page.locator('canvas').count();
    const toasts = await page.locator('li[data-sonner-toast]:visible').all();
    
    console.log(`  Confetti: ${confetti > 0 ? '✓ YES' : '✗ NO'}`);
    console.log(`  Toast: ${toasts.length > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (toasts.length > 0) {
      for (const toast of toasts) {
        const text = await toast.textContent();
        console.log(`    Message: "${text.trim()}"`);
      }
    }
    
    console.log('\nTEST B COMPLETE\n');

    // ═══════════════════════════════════════════════════════════════
    // TEST C: Checkbox Complete
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST C: Checkbox Complete');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Refreshing /new-tasks page...');
    await page.goto('http://localhost:3000/new-tasks', { timeout: 60000 });
    await page.waitForTimeout(4000);
    console.log('✓ Page loaded\n');
    
    // Close dialogs
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    console.log('Switching to List view...');
    const listTab = page.locator('[role="tab"]:has-text("List")');
    const listTabCount = await listTab.count();
    
    if (listTabCount > 0) {
      await listTab.first().click({ force: true });
      await page.waitForTimeout(2000);
      console.log('✓ List view activated\n');
    }
    
    await page.screenshot({ path: 'test-c-1-list-view.png' });
    console.log('📸 Screenshot: test-c-1-list-view.png\n');
    
    console.log('Finding unchecked checkbox...');
    const checkboxes = await page.locator('input[type="checkbox"]:not(:checked)').all();
    console.log(`Unchecked checkboxes found: ${checkboxes.length}\n`);
    
    if (checkboxes.length > 0) {
      console.log('Clicking checkbox...');
      await checkboxes[0].click({ force: true });
      console.log('✓ Checkbox clicked\n');
      
      await page.waitForTimeout(3000);
    }
    
    await page.screenshot({ path: 'test-c-2-after-checkbox.png', fullPage: true });
    console.log('📸 Screenshot: test-c-2-after-checkbox.png\n');
    
    console.log('Checking for celebrations...');
    const confetti2 = await page.locator('canvas').count();
    const toasts2 = await page.locator('li[data-sonner-toast]:visible').all();
    
    console.log(`  Confetti: ${confetti2 > 0 ? '✓ YES' : '✗ NO'}`);
    console.log(`  Toast: ${toasts2.length > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (toasts2.length > 0) {
      for (const toast of toasts2) {
        const text = await toast.textContent();
        console.log(`    Message: "${text.trim()}"`);
      }
    }
    
    console.log('\nTEST C COMPLETE\n');
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`TEST B (Drag to Complete): Confetti=${confetti > 0}, Toast=${toasts.length > 0}`);
    console.log(`TEST C (Checkbox Complete): Confetti=${confetti2 > 0}, Toast=${toasts2.length > 0}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: 'test-celebrations-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 10 seconds...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n✓ Tests complete!');
})();
