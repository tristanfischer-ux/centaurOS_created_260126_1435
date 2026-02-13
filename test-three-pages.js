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

  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text, timestamp: new Date().toISOString() });
    if (type === 'error') {
      console.log(`[CONSOLE ERROR] ${text}`);
    }
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
    console.error('[PAGE ERROR]', error.message);
  });

  try {
    // Login first
    console.log('=== LOGGING IN ===\n');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in\n');

    // ========================================
    // TEST 1: OBJECTIVES BOARD
    // ========================================
    console.log('=== TEST 1: OBJECTIVES BOARD ===\n');
    
    await page.goto('http://localhost:3000/new-objectives', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Page URL:', page.url());
    await page.screenshot({ path: 'test1-1-objectives-full.png', fullPage: true });
    console.log('✓ Screenshot: test1-1-objectives-full.png');
    
    // Check for Weekly Digest / Progress Report button
    console.log('\nLooking for Weekly Digest / Progress Report button...');
    const weeklyDigestButton = await page.locator('button:has-text("Weekly Digest"), button:has-text("Progress Report")').count();
    console.log('  Weekly Digest/Progress Report button:', weeklyDigestButton > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
    if (weeklyDigestButton > 0) {
      console.log('  Clicking Weekly Digest button...');
      await page.locator('button:has-text("Weekly Digest"), button:has-text("Progress Report")').first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test1-2-weekly-digest-dialog.png', fullPage: true });
      console.log('  ✓ Screenshot: test1-2-weekly-digest-dialog.png');
      
      // Close dialog if it opened
      const closeButton = await page.locator('button[aria-label="Close"], button:has-text("Close")').count();
      if (closeButton > 0) {
        await page.locator('button[aria-label="Close"], button:has-text("Close")').first().click();
        await page.waitForTimeout(500);
      }
    }
    
    // Check for Team Pulse section
    console.log('\nLooking for Team Pulse section...');
    const teamPulse = await page.locator('text=/Team Pulse/i').count();
    console.log('  Team Pulse section:', teamPulse > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
    if (teamPulse > 0) {
      await page.locator('text=/Team Pulse/i').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'test1-3-team-pulse.png' });
      console.log('  ✓ Screenshot: test1-3-team-pulse.png');
    }
    
    // Check for errors or blank areas
    console.log('\nChecking for errors or blank areas...');
    const errorMessages = await page.locator('text=/error|failed|something went wrong/i').count();
    const emptyStates = await page.locator('text=/no objectives|empty|nothing to show/i').count();
    console.log('  Error messages:', errorMessages > 0 ? `✗ FOUND (${errorMessages})` : '✓ NONE');
    console.log('  Empty states:', emptyStates > 0 ? `Found (${emptyStates})` : 'None');
    
    // Get all headings
    const objectivesHeadings = await page.locator('h1, h2, h3').allTextContents();
    console.log('\nVisible headings:');
    objectivesHeadings.slice(0, 10).forEach((h, i) => {
      const text = h.trim();
      if (text) console.log(`  ${i + 1}. ${text}`);
    });

    // ========================================
    // TEST 2: TASKS BOARD VIEW
    // ========================================
    console.log('\n\n=== TEST 2: TASKS BOARD VIEW ===\n');
    
    await page.goto('http://localhost:3000/new-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Page URL:', page.url());
    await page.screenshot({ path: 'test2-1-tasks-initial.png', fullPage: true });
    console.log('✓ Screenshot: test2-1-tasks-initial.png');
    
    // Look for Board tab/toggle
    console.log('\nLooking for Board view toggle...');
    const boardTab = await page.locator('button:has-text("Board"), [role="tab"]:has-text("Board")').count();
    console.log('  Board tab/toggle:', boardTab > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
    if (boardTab > 0) {
      console.log('  Clicking Board tab...');
      await page.locator('button:has-text("Board"), [role="tab"]:has-text("Board")').first().click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test2-2-board-view.png', fullPage: true });
      console.log('  ✓ Screenshot: test2-2-board-view.png');
    }
    
    // Check for board columns
    console.log('\nLooking for board columns...');
    const pendingColumn = await page.locator('text=/Pending/i').count();
    const acceptedColumn = await page.locator('text=/Accepted|In Progress/i').count();
    const completedColumn = await page.locator('text=/Completed|Done/i').count();
    
    console.log('  Pending column:', pendingColumn > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Accepted/In Progress column:', acceptedColumn > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Completed/Done column:', completedColumn > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
    // Check for task cards
    const taskCards = await page.locator('[class*="task-card"], [data-task-id], [class*="kanban-card"]').count();
    console.log('  Task cards found:', taskCards);
    
    // Get visible headings
    const tasksHeadings = await page.locator('h1, h2, h3').allTextContents();
    console.log('\nVisible headings:');
    tasksHeadings.slice(0, 10).forEach((h, i) => {
      const text = h.trim();
      if (text) console.log(`  ${i + 1}. ${text}`);
    });

    // ========================================
    // TEST 3: ONE SENTENCE PLANNER
    // ========================================
    console.log('\n\n=== TEST 3: ONE SENTENCE PLANNER ===\n');
    
    await page.goto('http://localhost:3000/plan', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Page URL:', page.url());
    
    // Find the One Sentence Planner input
    console.log('\nLooking for One Sentence Planner input...');
    const oneSentenceInput = await page.locator('input[placeholder*="Launch"], textarea[placeholder*="Launch"], input[type="text"]').first();
    const inputCount = await page.locator('input[placeholder*="Launch"], textarea[placeholder*="Launch"]').count();
    console.log('  Input fields found:', inputCount);
    
    if (inputCount > 0) {
      // Scroll to the input
      await oneSentenceInput.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'test3-1-before-input.png' });
      console.log('✓ Screenshot: test3-1-before-input.png');
      
      // Clear and type new text
      console.log('\nEntering text: "Launch a mobile app MVP in 8 weeks"');
      await oneSentenceInput.click();
      await oneSentenceInput.fill('Launch a mobile app MVP in 8 weeks');
      await page.waitForTimeout(500);
      
      await page.screenshot({ path: 'test3-2-after-input.png' });
      console.log('✓ Screenshot: test3-2-after-input.png');
      
      // Look for generate/submit button
      console.log('\nLooking for generate button...');
      const generateButton = await page.locator('button:has-text("Generate"), button[type="submit"], button:has([class*="arrow"])').count();
      console.log('  Generate button found:', generateButton > 0 ? '✓ YES' : '✗ NO');
      
      if (generateButton > 0) {
        console.log('  Clicking generate button...');
        await page.locator('button:has-text("Generate"), button[type="submit"], button:has([class*="arrow"])').first().click();
        
        console.log('  Waiting for AI generation (15 seconds)...');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test3-3-generating.png' });
        console.log('  ✓ Screenshot: test3-3-generating.png');
        
        // Wait for result
        await page.waitForTimeout(13000);
        
        await page.screenshot({ path: 'test3-4-result.png', fullPage: true });
        console.log('  ✓ Screenshot: test3-4-result.png');
        
        // Check if result appeared
        const resultVisible = await page.locator('text=/Phase|Task|Timeline|Risk/i').count();
        console.log('  Result elements found:', resultVisible);
        
        if (resultVisible > 0) {
          console.log('  ✓ AI generation completed successfully');
        } else {
          console.log('  ⚠️ No result elements found - may still be loading');
        }
      } else {
        console.log('  ⚠️ Could not find generate button');
        
        // Try looking for any button near the input
        const nearbyButtons = await page.locator('button').all();
        console.log(`  Found ${nearbyButtons.length} buttons on page`);
        
        // Take screenshot showing the area
        await page.screenshot({ path: 'test3-3-no-button-found.png' });
        console.log('  ✓ Screenshot: test3-3-no-button-found.png');
      }
    } else {
      console.log('  ✗ Could not find One Sentence Planner input field');
      await page.screenshot({ path: 'test3-1-input-not-found.png', fullPage: true });
      console.log('  ✓ Screenshot: test3-1-input-not-found.png');
    }

    // ========================================
    // FINAL SUMMARY
    // ========================================
    console.log('\n\n=== FINAL SUMMARY ===\n');
    
    const consoleErrors = consoleMessages.filter(m => m.type === 'error');
    console.log('Total console errors:', consoleErrors.length);
    if (consoleErrors.length > 0 && consoleErrors.length <= 10) {
      console.log('\nConsole errors:');
      consoleErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.text}`);
      });
    }
    
    console.log('\nTotal page errors:', pageErrors.length);
    if (pageErrors.length > 0) {
      console.log('\nPage errors:');
      pageErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err}`);
      });
    }
    
    console.log('\n=== TEST RESULTS ===');
    console.log('\nTest 1 - Objectives Board:');
    console.log('  Weekly Digest button:', weeklyDigestButton > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Team Pulse section:', teamPulse > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Errors on page:', errorMessages > 0 ? '✗ YES' : '✓ NO');
    
    console.log('\nTest 2 - Tasks Board View:');
    console.log('  Board tab/toggle:', boardTab > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Board columns:', (pendingColumn > 0 || acceptedColumn > 0 || completedColumn > 0) ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Task cards:', taskCards > 0 ? `✓ FOUND (${taskCards})` : '✗ NOT FOUND');
    
    console.log('\nTest 3 - One Sentence Planner:');
    console.log('  Input field:', inputCount > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    console.log('  Generate button:', generateButton > 0 ? '✓ FOUND' : '✗ NOT FOUND');
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'test-error.png' });
    console.log('Error screenshot saved');
  }
  
  console.log('\n\nKeeping browser open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n✓ All tests complete!');
})();
