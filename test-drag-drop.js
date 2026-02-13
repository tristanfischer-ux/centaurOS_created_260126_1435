const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 600
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  const consoleErrors = [];
  const consoleMessages = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text });
    
    if (type === 'error' && !text.includes('401')) {
      consoleErrors.push(text);
      console.log(`[CONSOLE ERROR] ${text}`);
    }
  });

  try {
    console.log('═══════════════════════════════════════');
    console.log('    DRAG & DROP TEST');
    console.log('═══════════════════════════════════════\n');
    
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Step 1: Navigate to tasks
    console.log('STEP 1: Navigate to /new-tasks');
    await page.goto('http://localhost:3000/new-tasks');
    console.log('  ✓ Navigated\n');
    
    // Step 2: Wait for page load
    console.log('STEP 2: Wait 2 seconds for page load');
    await page.waitForTimeout(2000);
    console.log('  ✓ Page loaded\n');
    
    // Close any dialogs
    console.log('Closing any open dialogs...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    console.log('  ✓ Dialogs closed\n');
    
    // Step 3: Find and click Board tab
    console.log('STEP 3: Find and click "Board" tab');
    const boardTab = page.locator('[role="tab"]:has-text("Board")');
    const boardTabCount = await boardTab.count();
    console.log(`  Board tab found: ${boardTabCount > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (boardTabCount > 0) {
      await boardTab.first().click({ force: true });
      await page.waitForTimeout(2000);
      console.log('  ✓ Board tab clicked\n');
    } else {
      console.log('  ⚠️  Board tab not found, may already be in board view\n');
    }
    
    // Step 4: Screenshot of board view
    console.log('STEP 4: Screenshot of board view');
    await page.screenshot({ path: 'drag-1-board-view.png', fullPage: true });
    console.log('  ✓ Screenshot: drag-1-board-view.png\n');
    
    // Step 5: Check for columns
    console.log('STEP 5: Verify board columns');
    const pendingCol = await page.locator('text=/Pending/i').count();
    const inProgressCol = await page.locator('text=/In Progress|Active/i').count();
    const inReviewCol = await page.locator('text=/In Review|Review/i').count();
    const completedCol = await page.locator('text=/Completed|Done/i').count();
    
    console.log('  Columns found:');
    console.log(`    - Pending: ${pendingCol > 0 ? '✓' : '✗'}`);
    console.log(`    - In Progress: ${inProgressCol > 0 ? '✓' : '✗'}`);
    console.log(`    - In Review: ${inReviewCol > 0 ? '✓' : '✗'}`);
    console.log(`    - Completed: ${completedCol > 0 ? '✓' : '✗'}`);
    
    const totalColumns = pendingCol + inProgressCol + inReviewCol + completedCol;
    console.log(`  Total columns: ${totalColumns}\n`);
    
    // Step 6-7: Look for task cards and drag handles
    console.log('STEP 6-7: Look for task cards and drag handles');
    
    // Find all task cards
    const taskCards = await page.locator('[draggable="true"], [data-task-id], [class*="task-card"]').all();
    console.log(`  Task cards found: ${taskCards.length}`);
    
    if (taskCards.length === 0) {
      // Try alternative selectors
      const altCards = await page.locator('div').filter({ hasText: /task|Task/ }).all();
      console.log(`  Alternative card elements: ${altCards.length}`);
    }
    
    // Look for drag handles (grip icons)
    const dragHandles = await page.locator('[class*="grip"], [class*="drag-handle"], svg[class*="lucide-grip"]').count();
    console.log(`  Drag handles (grip icons): ${dragHandles > 0 ? `✓ FOUND (${dragHandles})` : '✗ NOT FOUND'}`);
    
    // Take detailed screenshot
    await page.screenshot({ path: 'drag-2-cards-detail.png' });
    console.log('  ✓ Screenshot: drag-2-cards-detail.png\n');
    
    // Step 8-13: Attempt drag and drop
    console.log('STEP 8-13: Attempt drag and drop');
    
    if (taskCards.length > 0) {
      console.log('  Found draggable cards, attempting drag...\n');
      
      // Get first card in pending column
      const firstCard = taskCards[0];
      const cardText = await firstCard.textContent();
      console.log(`  Card to drag: "${cardText.substring(0, 50).trim()}..."`);
      
      // Get card position
      const cardBox = await firstCard.boundingBox();
      console.log(`  Card position: x=${Math.round(cardBox.x)}, y=${Math.round(cardBox.y)}`);
      
      // Find target column (In Progress or Completed)
      const targetColumn = page.locator('text=/In Progress|Completed/i').first();
      const targetBox = await targetColumn.boundingBox();
      
      if (targetBox) {
        console.log(`  Target column position: x=${Math.round(targetBox.x)}, y=${Math.round(targetBox.y)}`);
        
        console.log('\n  Attempting drag and drop...');
        
        try {
          // Method 1: Playwright drag and drop
          await firstCard.dragTo(targetColumn, { 
            force: true,
            sourcePosition: { x: 10, y: 10 },
            targetPosition: { x: 50, y: 50 }
          });
          console.log('  ✓ Drag completed (Playwright dragTo)');
          
        } catch (e) {
          console.log(`  ✗ Playwright dragTo failed: ${e.message.substring(0, 80)}`);
          
          // Method 2: Manual mouse movements
          console.log('\n  Trying manual mouse movements...');
          try {
            await page.mouse.move(cardBox.x + 10, cardBox.y + 10);
            await page.mouse.down();
            await page.waitForTimeout(300);
            
            await page.mouse.move(targetBox.x + 50, targetBox.y + 50, { steps: 10 });
            await page.waitForTimeout(300);
            
            await page.mouse.up();
            console.log('  ✓ Manual drag completed');
            
          } catch (e2) {
            console.log(`  ✗ Manual drag failed: ${e2.message.substring(0, 80)}`);
          }
        }
        
        // Step 10: Wait 2 seconds
        console.log('\n  Waiting 2 seconds...');
        await page.waitForTimeout(2000);
        
        // Step 11: Screenshot after drag
        console.log('\nSTEP 11: Screenshot after drag');
        await page.screenshot({ path: 'drag-3-after-drag.png', fullPage: true });
        console.log('  ✓ Screenshot: drag-3-after-drag.png\n');
        
        // Step 12: Check results
        console.log('STEP 12: Check drag results');
        
        // Check for toast notification
        const toast = await page.locator('[class*="sonner"], [role="status"], [class*="toast"]').count();
        console.log(`  Toast notification: ${toast > 0 ? '✓ APPEARED' : '✗ NOT FOUND'}`);
        
        if (toast > 0) {
          const toastText = await page.locator('[class*="sonner"], [role="status"], [class*="toast"]').first().textContent();
          console.log(`    Message: "${toastText.trim()}"`);
        }
        
        // Check for confetti
        const confetti = await page.locator('[class*="confetti"], canvas').count();
        console.log(`  Confetti animation: ${confetti > 0 ? '✓ APPEARED' : '✗ NOT FOUND'}`);
        
        // Check if card moved
        const cardStillInOriginal = await page.locator('text=/Pending/i').locator(`text="${cardText.substring(0, 30)}"`).count();
        const cardMoved = cardStillInOriginal === 0;
        console.log(`  Card moved to different column: ${cardMoved ? '✓ YES' : '✗ NO (still in original)'}`);
        
        // Step 13: Check console
        console.log('\nSTEP 13: Check console for errors');
        const dragErrors = consoleErrors.filter(e => 
          !e.includes('401') && 
          !e.includes('UpdatesThreadPanel')
        );
        console.log(`  Console errors during drag: ${dragErrors.length}`);
        
        if (dragErrors.length > 0) {
          dragErrors.forEach((err, i) => console.log(`    ${i + 1}. ${err.substring(0, 100)}`));
        } else {
          console.log('  ✓ No console errors');
        }
        
        // Summary
        console.log('\n  ═══════════════════════════════════');
        if (cardMoved && toast > 0) {
          console.log('  RESULT: ✅ DRAG & DROP WORKS');
        } else if (cardMoved) {
          console.log('  RESULT: ⚠️  DRAG WORKS (no toast)');
        } else {
          console.log('  RESULT: ❌ DRAG DID NOT WORK');
        }
        console.log('  ═══════════════════════════════════');
        
      } else {
        console.log('  ✗ Could not get target column position');
      }
      
    } else {
      console.log('  ✗ No draggable cards found');
      console.log('  This may mean:');
      console.log('    - Board view is not active');
      console.log('    - No tasks exist in the board');
      console.log('    - Cards use different markup');
      
      // Try to find any card-like elements
      const anyCards = await page.locator('[class*="card"], [class*="rounded-lg"]').count();
      console.log(`\n  Generic card elements found: ${anyCards}`);
      
      // Get page structure
      const bodyText = await page.locator('body').textContent();
      const hasTaskText = bodyText.includes('task') || bodyText.includes('Task');
      console.log(`  Page contains task text: ${hasTaskText ? 'YES' : 'NO'}`);
    }

    // Final console summary
    console.log('\n\n═══════════════════════════════════════');
    console.log('  CONSOLE SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total console errors: ${consoleErrors.length}`);
    
    if (consoleErrors.length > 0) {
      console.log('\nErrors:');
      consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 150)}`));
    } else {
      console.log('✓ No console errors');
    }

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: 'drag-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 20 seconds for inspection...');
  await page.waitForTimeout(20000);
  await browser.close();
  console.log('\n✓ Test complete!');
})();
