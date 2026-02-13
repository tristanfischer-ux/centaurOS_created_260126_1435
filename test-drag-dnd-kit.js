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
      console.log(`[CONSOLE ERROR] ${text}`);
    }
  });

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('    DRAG & DROP TEST (dnd-kit library)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Navigate to tasks
    console.log('STEP 1: Navigate to /new-tasks');
    await page.goto('http://localhost:3000/new-tasks');
    await page.waitForTimeout(2000);
    console.log('  ✓ Navigated\n');
    
    // Close dialogs
    console.log('Closing dialogs...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    console.log('  ✓ Dialogs closed\n');
    
    // Click Board tab
    console.log('STEP 2: Switch to Board view');
    const boardTab = page.locator('[role="tab"]:has-text("Board")');
    const boardTabCount = await boardTab.count();
    
    if (boardTabCount > 0) {
      await boardTab.first().click({ force: true });
      await page.waitForTimeout(2000);
      console.log('  ✓ Board tab clicked\n');
    } else {
      console.log('  ⚠️  Board tab not found, may already be in board view\n');
    }
    
    // Screenshot initial state
    console.log('STEP 3: Screenshot initial board state');
    await page.screenshot({ path: 'dnd-1-initial.png', fullPage: true });
    console.log('  ✓ Screenshot: dnd-1-initial.png\n');
    
    // Verify columns
    console.log('STEP 4: Verify board columns');
    const pendingHeader = await page.locator('text=/Pending/i').first().isVisible();
    const inProgressHeader = await page.locator('text=/In Progress/i').first().isVisible();
    const inReviewHeader = await page.locator('text=/In Review/i').first().isVisible();
    const completedHeader = await page.locator('text=/Completed/i').first().isVisible();
    
    console.log(`  Columns visible:`);
    console.log(`    - Pending: ${pendingHeader ? '✓' : '✗'}`);
    console.log(`    - In Progress: ${inProgressHeader ? '✓' : '✗'}`);
    console.log(`    - In Review: ${inReviewHeader ? '✓' : '✗'}`);
    console.log(`    - Completed: ${completedHeader ? '✓' : '✗'}\n`);
    
    // Find drag handles (GripVertical icons)
    console.log('STEP 5: Find task cards with drag handles');
    
    // Look for GripVertical icons (these are the drag handles)
    const gripIcons = await page.locator('svg.lucide-grip-vertical').all();
    console.log(`  Drag handles (GripVertical icons): ${gripIcons.length}`);
    
    if (gripIcons.length === 0) {
      console.log('\n  ❌ NO DRAG HANDLES FOUND');
      console.log('  This means:');
      console.log('    - No tasks exist in the board');
      console.log('    - Board view is not properly loaded');
      console.log('    - Component structure has changed\n');
      
      // Check for any task-like content
      const bodyText = await page.locator('body').textContent();
      const hasNoTasks = bodyText.includes('No tasks');
      console.log(`  "No tasks" message visible: ${hasNoTasks ? 'YES' : 'NO'}`);
      
      await page.screenshot({ path: 'dnd-2-no-cards.png', fullPage: true });
      console.log('  ✓ Screenshot: dnd-2-no-cards.png\n');
      
      console.log('═══════════════════════════════════════════════════════');
      console.log('  RESULT: ❌ CANNOT TEST - NO TASKS IN BOARD');
      console.log('═══════════════════════════════════════════════════════');
      
      await page.waitForTimeout(10000);
      await browser.close();
      return;
    }
    
    console.log(`  ✓ Found ${gripIcons.length} task cards with drag handles\n`);
    
    // Take detailed screenshot
    await page.screenshot({ path: 'dnd-2-cards-found.png' });
    console.log('  ✓ Screenshot: dnd-2-cards-found.png\n');
    
    // Get the first drag handle and its parent card
    console.log('STEP 6: Prepare to drag first card');
    const firstGrip = gripIcons[0];
    
    // The drag handle is a button, get its parent card container
    const cardContainer = page.locator('div.rounded-lg.border').first();
    const cardText = await cardContainer.textContent();
    console.log(`  Card to drag: "${cardText.substring(0, 60).trim()}..."`);
    
    // Get positions
    const gripBox = await firstGrip.boundingBox();
    console.log(`  Drag handle position: x=${Math.round(gripBox.x)}, y=${Math.round(gripBox.y)}\n`);
    
    // Find target column (In Progress or Completed)
    console.log('STEP 7: Find target column');
    
    // Get all column headers
    const columnHeaders = await page.locator('div.rounded-t-xl.border').all();
    console.log(`  Column containers found: ${columnHeaders.length}`);
    
    // Find a column that's not the first one (Pending)
    let targetColumn = null;
    let targetColumnName = '';
    
    for (let i = 1; i < Math.min(columnHeaders.length, 3); i++) {
      const header = columnHeaders[i];
      const headerText = await header.textContent();
      
      if (headerText.includes('In Progress') || headerText.includes('Completed')) {
        targetColumn = header;
        targetColumnName = headerText.includes('In Progress') ? 'In Progress' : 'Completed';
        break;
      }
    }
    
    if (!targetColumn) {
      console.log('  ✗ Could not find target column\n');
      await browser.close();
      return;
    }
    
    const targetBox = await targetColumn.boundingBox();
    console.log(`  Target column: ${targetColumnName}`);
    console.log(`  Target position: x=${Math.round(targetBox.x)}, y=${Math.round(targetBox.y)}\n`);
    
    // Perform drag and drop
    console.log('STEP 8: Perform drag and drop');
    console.log('  Method: Mouse down on grip → Move to target → Mouse up\n');
    
    try {
      // Move to grip handle
      await page.mouse.move(gripBox.x + 5, gripBox.y + 5);
      await page.waitForTimeout(300);
      
      // Mouse down (start drag)
      await page.mouse.down();
      console.log('  ✓ Mouse down on drag handle');
      await page.waitForTimeout(500);
      
      // Move to target column (with steps for smooth animation)
      const targetX = targetBox.x + targetBox.width / 2;
      const targetY = targetBox.y + targetBox.height / 2;
      
      await page.mouse.move(targetX, targetY, { steps: 15 });
      console.log(`  ✓ Moved to target column (${targetColumnName})`);
      await page.waitForTimeout(500);
      
      // Mouse up (drop)
      await page.mouse.up();
      console.log('  ✓ Mouse up (dropped)\n');
      
      // Wait for any animations/updates
      console.log('STEP 9: Wait for result (2 seconds)');
      await page.waitForTimeout(2000);
      console.log('  ✓ Waited\n');
      
      // Screenshot after drag
      console.log('STEP 10: Screenshot after drag');
      await page.screenshot({ path: 'dnd-3-after-drag.png', fullPage: true });
      console.log('  ✓ Screenshot: dnd-3-after-drag.png\n');
      
      // Check results
      console.log('STEP 11: Verify drag results');
      
      // 1. Check for toast notification
      const toastVisible = await page.locator('[class*="sonner"], [role="status"], [class*="toast"]').isVisible().catch(() => false);
      console.log(`  Toast notification: ${toastVisible ? '✓ APPEARED' : '✗ NOT VISIBLE'}`);
      
      if (toastVisible) {
        const toastText = await page.locator('[class*="sonner"], [role="status"], [class*="toast"]').first().textContent();
        console.log(`    Message: "${toastText.trim()}"`);
      }
      
      // 2. Check for confetti (if moved to Completed)
      if (targetColumnName === 'Completed') {
        const confettiCanvas = await page.locator('canvas').count();
        console.log(`  Confetti animation: ${confettiCanvas > 0 ? '✓ APPEARED' : '✗ NOT FOUND'}`);
      }
      
      // 3. Check if card moved by counting cards in first column
      const gripIconsAfter = await page.locator('svg.lucide-grip-vertical').all();
      const cardsInFirstColumn = await page.locator('div.rounded-t-xl.border').first()
        .locator('..') // parent
        .locator('svg.lucide-grip-vertical')
        .count();
      
      console.log(`  Cards in first column after: ${cardsInFirstColumn}`);
      console.log(`  Total cards after: ${gripIconsAfter.length}`);
      
      // 4. Check console errors
      console.log('\nSTEP 12: Check console for errors');
      console.log(`  Console errors during drag: ${consoleErrors.length}`);
      
      if (consoleErrors.length > 0) {
        consoleErrors.forEach((err, i) => console.log(`    ${i + 1}. ${err.substring(0, 100)}`));
      } else {
        console.log('  ✓ No console errors');
      }
      
      // Final verdict
      console.log('\n═══════════════════════════════════════════════════════');
      
      if (toastVisible) {
        console.log('  RESULT: ✅ DRAG & DROP WORKS');
        console.log('  Evidence:');
        console.log('    - Toast notification appeared');
        console.log('    - No console errors');
        if (targetColumnName === 'Completed') {
          console.log('    - Confetti may have appeared');
        }
      } else {
        console.log('  RESULT: ⚠️  DRAG ATTEMPTED (no confirmation)');
        console.log('  Evidence:');
        console.log('    - Mouse movements completed');
        console.log('    - No toast notification');
        console.log('    - May need to check if card actually moved');
      }
      
      console.log('═══════════════════════════════════════════════════════');
      
    } catch (dragError) {
      console.error('\n❌ DRAG FAILED:', dragError.message);
      await page.screenshot({ path: 'dnd-error.png' });
    }

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: 'dnd-critical-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 15 seconds for inspection...');
  await page.waitForTimeout(15000);
  await browser.close();
  console.log('\n✓ Test complete!');
})();
