const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });

  try {
    // Login
    console.log('=== LOGGING IN ===\n');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in\n');

    // ========================================
    // TEST 2: TASKS BOARD VIEW (RETRY)
    // ========================================
    console.log('=== TEST 2: TASKS BOARD VIEW (RETRY) ===\n');
    
    await page.goto('http://localhost:3000/new-tasks');
    await page.waitForTimeout(3000);
    
    // Close any open dialogs first
    console.log('Checking for open dialogs...');
    const dialogOverlay = await page.locator('[class*="fixed inset-0"][class*="z-50"]').count();
    if (dialogOverlay > 0) {
      console.log('  Dialog overlay detected, attempting to close...');
      
      // Try pressing Escape
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      
      // Try clicking close button
      const closeButtons = await page.locator('button[aria-label="Close"], button:has-text("Close"), [data-state="open"] button').count();
      if (closeButtons > 0) {
        await page.locator('button[aria-label="Close"], button:has-text("Close")').first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }
    
    await page.screenshot({ path: 'test2-retry-1-initial.png', fullPage: true });
    console.log('✓ Screenshot: test2-retry-1-initial.png');
    
    // Look for Board tab
    const boardTab = await page.locator('[role="tab"]:has-text("Board")').count();
    console.log('\nBoard tab found:', boardTab > 0 ? '✓ YES' : '✗ NO');
    
    if (boardTab > 0) {
      console.log('Attempting to click Board tab...');
      
      // Force click if needed
      await page.locator('[role="tab"]:has-text("Board")').first().click({ force: true }).catch(async (e) => {
        console.log('  Regular click failed, trying force click...');
        await page.locator('[role="tab"]:has-text("Board")').first().click({ force: true });
      });
      
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test2-retry-2-board-view.png', fullPage: true });
      console.log('✓ Screenshot: test2-retry-2-board-view.png');
      
      // Check for columns
      console.log('\nChecking for board columns...');
      const columns = await page.locator('[class*="column"], [data-column]').count();
      console.log('  Column elements:', columns);
      
      const pendingText = await page.locator('text=/Pending|Backlog/i').count();
      const inProgressText = await page.locator('text=/In Progress|Active|Accepted/i').count();
      const completedText = await page.locator('text=/Completed|Done/i').count();
      
      console.log('  "Pending" text:', pendingText > 0 ? '✓ FOUND' : '✗ NOT FOUND');
      console.log('  "In Progress" text:', inProgressText > 0 ? '✓ FOUND' : '✗ NOT FOUND');
      console.log('  "Completed" text:', completedText > 0 ? '✓ FOUND' : '✗ NOT FOUND');
      
      // Get page content to see what's actually there
      const bodyText = await page.locator('body').textContent();
      console.log('\nPage contains "Board":', bodyText.includes('Board') ? 'YES' : 'NO');
      console.log('Page contains "List":', bodyText.includes('List') ? 'YES' : 'NO');
      console.log('Page contains "Kanban":', bodyText.includes('Kanban') ? 'YES' : 'NO');
    }

    // ========================================
    // TEST 3: ONE SENTENCE PLANNER (DETAILED)
    // ========================================
    console.log('\n\n=== TEST 3: ONE SENTENCE PLANNER ===\n');
    
    await page.goto('http://localhost:3000/plan');
    await page.waitForTimeout(3000);
    
    // Scroll to find the input
    console.log('Looking for One Sentence Planner section...');
    const oneSentenceHeading = page.locator('text="One sentence. Full plan."');
    const headingCount = await oneSentenceHeading.count();
    console.log('  "One sentence. Full plan." heading:', headingCount > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
    if (headingCount > 0) {
      await oneSentenceHeading.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
    }
    
    await page.screenshot({ path: 'test3-1-planner-section.png' });
    console.log('✓ Screenshot: test3-1-planner-section.png');
    
    // Find input field
    const allInputs = await page.locator('input[type="text"], textarea').all();
    console.log(`\nFound ${allInputs.length} text inputs on page`);
    
    let plannerInput = null;
    for (let i = 0; i < allInputs.length; i++) {
      const placeholder = await allInputs[i].getAttribute('placeholder');
      console.log(`  Input ${i + 1}: ${placeholder || '(no placeholder)'}`);
      
      if (placeholder && placeholder.includes('Launch')) {
        plannerInput = allInputs[i];
        console.log(`  ✓ Found planner input at index ${i + 1}`);
        break;
      }
    }
    
    if (plannerInput) {
      console.log('\nFilling input with: "Launch a mobile app MVP in 8 weeks"');
      await plannerInput.scrollIntoViewIfNeeded();
      await plannerInput.click();
      await plannerInput.fill('Launch a mobile app MVP in 8 weeks');
      await page.waitForTimeout(1000);
      
      await page.screenshot({ path: 'test3-2-input-filled.png' });
      console.log('✓ Screenshot: test3-2-input-filled.png');
      
      // Look for generate button
      console.log('\nLooking for generate button...');
      
      // Try multiple selectors
      const buttonSelectors = [
        'button:has-text("Generate")',
        'button:has-text("Create")',
        'button[type="submit"]',
        'button:has([class*="arrow"])',
        'button:has(svg)',
      ];
      
      let generateButton = null;
      for (const selector of buttonSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          console.log(`  Found button with selector: ${selector}`);
          generateButton = page.locator(selector).first();
          break;
        }
      }
      
      if (generateButton) {
        console.log('  Clicking generate button...');
        await generateButton.click();
        
        console.log('  Waiting for generation (2 seconds)...');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test3-3-generating.png', fullPage: true });
        console.log('  ✓ Screenshot: test3-3-generating.png');
        
        console.log('  Waiting for result (15 more seconds)...');
        await page.waitForTimeout(15000);
        
        await page.screenshot({ path: 'test3-4-result.png', fullPage: true });
        console.log('  ✓ Screenshot: test3-4-result.png');
        
        // Check for result indicators
        const resultKeywords = ['Phase', 'Week', 'Task', 'Timeline', 'Milestone', 'Sprint'];
        const bodyText = await page.locator('body').textContent();
        
        console.log('\n  Checking for result indicators:');
        resultKeywords.forEach(keyword => {
          const found = bodyText.includes(keyword);
          console.log(`    "${keyword}": ${found ? '✓' : '✗'}`);
        });
        
      } else {
        console.log('  ✗ Could not find generate button');
        
        // Get all buttons near the input
        const allButtons = await page.locator('button').all();
        console.log(`\n  Found ${allButtons.length} buttons on page`);
        
        for (let i = 0; i < Math.min(allButtons.length, 10); i++) {
          const text = await allButtons[i].textContent();
          const ariaLabel = await allButtons[i].getAttribute('aria-label');
          console.log(`    Button ${i + 1}: "${text.trim()}" ${ariaLabel ? `(aria: ${ariaLabel})` : ''}`);
        }
      }
    } else {
      console.log('  ✗ Could not find planner input field');
    }

    console.log('\n\n=== SUMMARY ===\n');
    console.log('Console errors:', consoleErrors.length);
    console.log('Page errors:', pageErrors.length);
    
    if (consoleErrors.length > 0 && consoleErrors.length <= 5) {
      console.log('\nRecent console errors:');
      consoleErrors.slice(-5).forEach(err => console.log(`  - ${err.substring(0, 100)}`));
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: 'final-error.png' });
  }
  
  console.log('\nKeeping browser open for 10 seconds...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('✓ Complete!');
})();
