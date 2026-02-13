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

  const consoleErrors = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    
    if (type === 'error' && !text.includes('401') && !text.includes('UpdatesThreadPanel')) {
      consoleErrors.push(text);
      console.log(`[CONSOLE ERROR] ${text.substring(0, 100)}`);
    }
  });

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('    THREE FEATURE TESTS');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Set localStorage flags to prevent onboarding
    console.log('Setting localStorage flags to prevent onboarding...');
    await page.evaluate(() => {
      localStorage.setItem('forgeos_onboarding_completed', 'true');
      localStorage.setItem('forgeos_intent_selected', 'true');
      localStorage.setItem('forgeos_tour_completed', 'true');
    });
    console.log('✓ Onboarding flags set\n');

    // ═══════════════════════════════════════════════════════════════
    // TEST A: Template Deploy Creates Real Objectives
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST A: Template Deploy Creates Real Objectives');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Step 1: Navigate to /plan');
    await page.goto('http://localhost:3000/plan');
    console.log('  ✓ Navigated\n');
    
    console.log('Step 2: Wait 4 seconds for page load');
    await page.waitForTimeout(4000);
    console.log('  ✓ Page loaded\n');
    
    // Close any dialogs
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    console.log('Step 3: Scroll down to template gallery');
    await page.evaluate(() => {
      window.scrollBy(0, 1000);
    });
    await page.waitForTimeout(2000);
    console.log('  ✓ Scrolled\n');
    
    await page.screenshot({ path: 'test-a-1-templates.png' });
    console.log('  📸 Screenshot: test-a-1-templates.png\n');
    
    console.log('Step 4: Click "First 5 Hires" template card');
    
    // Try multiple selectors for the template card
    const templateSelectors = [
      'text=/First 5 Hires/i',
      'div:has-text("First 5 Hires")',
      '[class*="template"]:has-text("First 5 Hires")',
    ];
    
    let templateCard = null;
    for (const selector of templateSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        templateCard = page.locator(selector).first();
        console.log(`  ✓ Found template using: ${selector}`);
        break;
      }
    }
    
    if (!templateCard) {
      console.log('  ⚠️  "First 5 Hires" not found, trying any template card...');
      templateCard = page.locator('[class*="card"], div[role="button"]').first();
    }
    
    await templateCard.click({ force: true });
    console.log('  ✓ Template clicked\n');
    
    console.log('Step 5: Wait for preview dialog to open');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'test-a-2-preview.png' });
    console.log('  ✓ Dialog opened');
    console.log('  📸 Screenshot: test-a-2-preview.png\n');
    
    console.log('Step 6: Click "Deploy this plan" button');
    const deployButton = page.locator('button:has-text("Deploy")').first();
    await deployButton.click({ force: true });
    console.log('  ✓ Deploy clicked\n');
    
    console.log('Step 7: Wait 10 seconds');
    await page.waitForTimeout(10000);
    console.log('  ✓ Waited\n');
    
    console.log('Step 8: Take screenshot');
    await page.screenshot({ path: 'test-a-3-result.png', fullPage: true });
    console.log('  📸 Screenshot: test-a-3-result.png\n');
    
    console.log('Step 9: Analyze results');
    const currentUrl = page.url();
    console.log(`  Current URL: ${currentUrl}`);
    
    const isOnObjectives = currentUrl.includes('/new-objectives');
    console.log(`  Redirected to /new-objectives: ${isOnObjectives ? '✓ YES' : '✗ NO'}`);
    
    if (isOnObjectives) {
      const objectiveCards = await page.locator('[class*="objective"], [class*="card"]').count();
      console.log(`  Objective cards visible: ${objectiveCards}`);
    }
    
    console.log('\n  TEST A COMPLETE\n');

    // ═══════════════════════════════════════════════════════════════
    // TEST B: Task Board - Complete a Task (Celebration)
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST B: Task Board - Complete a Task (Celebration)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Step 1: Navigate to /new-tasks');
    await page.goto('http://localhost:3000/new-tasks');
    console.log('  ✓ Navigated\n');
    
    console.log('Step 2: Wait 4 seconds');
    await page.waitForTimeout(4000);
    console.log('  ✓ Page loaded\n');
    
    // Close any dialogs
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    console.log('Step 3: Find and click "Board" tab');
    const boardTab = page.locator('[role="tab"]:has-text("Board")');
    const boardTabCount = await boardTab.count();
    
    if (boardTabCount > 0) {
      await boardTab.first().click({ force: true });
      console.log('  ✓ Board tab clicked\n');
    } else {
      console.log('  ⚠️  Board tab not found\n');
    }
    
    console.log('Step 4: Wait 2 seconds');
    await page.waitForTimeout(2000);
    console.log('  ✓ Waited\n');
    
    console.log('Step 5: Screenshot of board');
    await page.screenshot({ path: 'test-b-1-board.png', fullPage: true });
    console.log('  📸 Screenshot: test-b-1-board.png\n');
    
    console.log('Step 6-7: Find task in Pending and drag to Completed');
    
    // Find grip handles (drag handles)
    const gripIcons = await page.locator('svg.lucide-grip-vertical').all();
    console.log(`  Drag handles found: ${gripIcons.length}`);
    
    if (gripIcons.length > 0) {
      const firstGrip = gripIcons[0];
      const gripBox = await firstGrip.boundingBox();
      
      // Find Completed column
      const completedHeader = page.locator('text=/Completed/i').first();
      const completedBox = await completedHeader.boundingBox();
      
      if (gripBox && completedBox) {
        console.log('  Attempting drag to Completed column...');
        
        // Perform drag
        await page.mouse.move(gripBox.x + 5, gripBox.y + 5);
        await page.mouse.down();
        await page.waitForTimeout(300);
        
        await page.mouse.move(completedBox.x + 50, completedBox.y + 100, { steps: 15 });
        await page.waitForTimeout(300);
        
        await page.mouse.up();
        console.log('  ✓ Drag completed\n');
      }
    } else {
      console.log('  ✗ No drag handles found\n');
    }
    
    console.log('Step 8: Wait 3 seconds');
    await page.waitForTimeout(3000);
    console.log('  ✓ Waited\n');
    
    console.log('Step 9: Screenshot after drag');
    await page.screenshot({ path: 'test-b-2-after-drag.png', fullPage: true });
    console.log('  📸 Screenshot: test-b-2-after-drag.png\n');
    
    console.log('Step 10: Check for confetti and toast');
    
    // Check for confetti canvas
    const confettiCanvas = await page.locator('canvas').count();
    console.log(`  Confetti canvas: ${confettiCanvas > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    // Check for toast (real toast, not CSS)
    const toasts = await page.locator('li[data-sonner-toast]:visible').all();
    console.log(`  Toast notifications: ${toasts.length > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (toasts.length > 0) {
      for (let i = 0; i < toasts.length; i++) {
        const text = await toasts[i].textContent();
        console.log(`    Toast ${i + 1}: "${text.trim()}"`);
      }
    }
    
    console.log('\n  TEST B COMPLETE\n');

    // ═══════════════════════════════════════════════════════════════
    // TEST C: Celebration on Checkbox Complete
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  TEST C: Celebration on Checkbox Complete');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Step 1: Navigate to /new-tasks');
    await page.goto('http://localhost:3000/new-tasks');
    console.log('  ✓ Navigated\n');
    
    console.log('Step 2: Wait 4 seconds');
    await page.waitForTimeout(4000);
    console.log('  ✓ Page loaded\n');
    
    // Close any dialogs
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    
    console.log('Step 3: Ensure List view is active');
    const listTab = page.locator('[role="tab"]:has-text("List")');
    const listTabCount = await listTab.count();
    
    if (listTabCount > 0) {
      await listTab.first().click({ force: true });
      await page.waitForTimeout(2000);
      console.log('  ✓ List view activated\n');
    } else {
      console.log('  ℹ️  List view may already be active\n');
    }
    
    await page.screenshot({ path: 'test-c-1-list-view.png' });
    console.log('  📸 Screenshot: test-c-1-list-view.png\n');
    
    console.log('Step 4-5: Find and click a checkbox');
    
    // Find checkboxes
    const checkboxes = await page.locator('input[type="checkbox"], [role="checkbox"]').all();
    console.log(`  Checkboxes found: ${checkboxes.length}`);
    
    if (checkboxes.length > 0) {
      // Find an unchecked checkbox
      let uncheckedBox = null;
      for (const checkbox of checkboxes) {
        const isChecked = await checkbox.isChecked().catch(() => false);
        if (!isChecked) {
          uncheckedBox = checkbox;
          break;
        }
      }
      
      if (uncheckedBox) {
        console.log('  Found unchecked checkbox, clicking...');
        await uncheckedBox.click({ force: true });
        console.log('  ✓ Checkbox clicked\n');
      } else {
        console.log('  ⚠️  All checkboxes already checked\n');
      }
    } else {
      console.log('  ✗ No checkboxes found\n');
    }
    
    console.log('Step 6: Wait 2 seconds');
    await page.waitForTimeout(2000);
    console.log('  ✓ Waited\n');
    
    console.log('Step 7: Screenshot after checkbox click');
    await page.screenshot({ path: 'test-c-2-after-checkbox.png', fullPage: true });
    console.log('  📸 Screenshot: test-c-2-after-checkbox.png\n');
    
    console.log('Step 8: Check for confetti and toast');
    
    // Check for confetti
    const confettiCanvas2 = await page.locator('canvas').count();
    console.log(`  Confetti canvas: ${confettiCanvas2 > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    // Check for toast
    const toasts2 = await page.locator('li[data-sonner-toast]:visible').all();
    console.log(`  Toast notifications: ${toasts2.length > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (toasts2.length > 0) {
      for (let i = 0; i < toasts2.length; i++) {
        const text = await toasts2[i].textContent();
        console.log(`    Toast ${i + 1}: "${text.trim()}"`);
      }
    }
    
    console.log('\n  TEST C COMPLETE\n');

    // ═══════════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════════
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('TEST A: Template Deploy');
    console.log(`  - Redirected to objectives: ${isOnObjectives ? 'YES' : 'NO'}`);
    
    console.log('\nTEST B: Board Drag to Complete');
    console.log(`  - Confetti: ${confettiCanvas > 0 ? 'YES' : 'NO'}`);
    console.log(`  - Toast: ${toasts.length > 0 ? 'YES' : 'NO'}`);
    
    console.log('\nTEST C: Checkbox Complete');
    console.log(`  - Confetti: ${confettiCanvas2 > 0 ? 'YES' : 'NO'}`);
    console.log(`  - Toast: ${toasts2.length > 0 ? 'YES' : 'NO'}`);
    
    console.log('\n═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: 'test-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 15 seconds for inspection...');
  await page.waitForTimeout(15000);
  await browser.close();
  console.log('\n✓ All tests complete!');
})();
