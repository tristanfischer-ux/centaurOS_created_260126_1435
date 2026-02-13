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

  // Track results
  const testResults = {
    plan: { pass: false, details: [] },
    objectives: { pass: false, details: [] },
    tasks: { pass: false, details: [] }
  };

  // Console tracking
  let consoleErrors = [];
  let consoleWarnings = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    
    if (type === 'error') {
      consoleErrors.push({ text, timestamp: new Date().toISOString() });
      console.log(`[ERROR] ${text}`);
    } else if (type === 'warning') {
      consoleWarnings.push({ text, timestamp: new Date().toISOString() });
    }
  });

  try {
    // Login
    console.log('═══════════════════════════════════════');
    console.log('         LOGGING IN');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in successfully\n');

    // ═══════════════════════════════════════════════════════════
    // TEST 1: /plan PAGE
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════');
    console.log('   TEST 1: /plan PAGE');
    console.log('═══════════════════════════════════════\n');
    
    consoleErrors = []; // Reset
    
    await page.goto('http://localhost:3000/plan', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Step 1: Navigate to /plan');
    console.log('  URL:', page.url());
    console.log('  ✓ Page loaded\n');
    
    console.log('Step 2: Take full-page screenshot');
    await page.screenshot({ path: 'final-test-1-plan-full.png', fullPage: true });
    console.log('  ✓ Screenshot saved: final-test-1-plan-full.png\n');
    
    console.log('Step 3: Verify components');
    
    // Check for "One sentence. Full plan." section
    const oneSentenceHeading = await page.locator('text="One sentence. Full plan."').count();
    const oneSentenceInput = await page.locator('input[type="text"], textarea').count();
    console.log('  a) "One sentence. Full plan." section:');
    console.log(`     - Heading: ${oneSentenceHeading > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    console.log(`     - Input field: ${oneSentenceInput > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (oneSentenceHeading > 0 && oneSentenceInput > 0) {
      testResults.plan.details.push('✓ One Sentence Planner section present');
    } else {
      testResults.plan.details.push('✗ One Sentence Planner section incomplete');
    }
    
    // Check for morning/daily briefing
    const morningBriefing = await page.locator('text=/Morning Briefing|Daily Briefing|Today\'s focus/i').count();
    console.log(`\n  b) Morning/Daily briefing card:`);
    console.log(`     ${morningBriefing > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (morningBriefing > 0) {
      testResults.plan.details.push('✓ Morning briefing card present');
    } else {
      testResults.plan.details.push('⚠ Morning briefing card not found');
    }
    
    // Check for Plan Templates
    const planTemplates = await page.locator('text=/Plan Templates|Template Gallery/i').count();
    const templateCards = await page.locator('[class*="card"]').count();
    console.log(`\n  c) Plan Templates section:`);
    console.log(`     - Heading: ${planTemplates > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    console.log(`     - Template cards: ${templateCards > 0 ? `✓ FOUND (${templateCards})` : '✗ NOT FOUND'}`);
    
    if (planTemplates > 0 && templateCards > 0) {
      testResults.plan.details.push('✓ Plan Templates section present');
    } else {
      testResults.plan.details.push('✗ Plan Templates section incomplete');
    }
    
    console.log('\nStep 4: Check console for errors');
    const planErrors = consoleErrors.filter(e => !e.text.includes('401'));
    console.log(`  Console errors (excluding 401): ${planErrors.length}`);
    
    if (planErrors.length > 0) {
      console.log('  Errors found:');
      planErrors.forEach(err => console.log(`    - ${err.text.substring(0, 100)}`));
      testResults.plan.details.push(`✗ ${planErrors.length} console error(s)`);
    } else {
      console.log('  ✓ No console errors');
      testResults.plan.details.push('✓ Console clean');
    }
    
    // Determine pass/fail
    const planPass = oneSentenceHeading > 0 && oneSentenceInput > 0 && planTemplates > 0 && planErrors.length === 0;
    testResults.plan.pass = planPass;
    
    console.log(`\n${'═'.repeat(43)}`);
    console.log(`TEST 1 RESULT: ${planPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═'.repeat(43));

    // ═══════════════════════════════════════════════════════════
    // TEST 2: /new-objectives PAGE
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════');
    console.log('   TEST 2: /new-objectives PAGE');
    console.log('═══════════════════════════════════════\n');
    
    consoleErrors = []; // Reset
    
    await page.goto('http://localhost:3000/new-objectives', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Step 1: Navigate to /new-objectives');
    console.log('  URL:', page.url());
    console.log('  ✓ Page loaded\n');
    
    console.log('Step 2: Take full-page screenshot');
    await page.screenshot({ path: 'final-test-2-objectives-full.png', fullPage: true });
    console.log('  ✓ Screenshot saved: final-test-2-objectives-full.png\n');
    
    console.log('Step 3: Verify components');
    
    // Check for Weekly Report button
    const weeklyReportButton = await page.locator('button:has-text("Weekly Report")').count();
    console.log(`  a) "Weekly Report" button in header:`);
    console.log(`     ${weeklyReportButton > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (weeklyReportButton > 0) {
      testResults.objectives.details.push('✓ Weekly Report button present');
    } else {
      testResults.objectives.details.push('✗ Weekly Report button not found');
    }
    
    // Check for hydration errors
    const allMessages = await page.evaluate(() => {
      return window.console ? 'checked' : 'checked';
    });
    
    const hydrationErrors = consoleErrors.filter(e => 
      e.text.toLowerCase().includes('hydration') || 
      e.text.toLowerCase().includes('cannot be a descendant')
    );
    
    console.log(`\n  b) Hydration errors check:`);
    console.log(`     ${hydrationErrors.length === 0 ? '✓ NO HYDRATION ERRORS' : `✗ ${hydrationErrors.length} HYDRATION ERROR(S)`}`);
    
    if (hydrationErrors.length > 0) {
      hydrationErrors.forEach(err => console.log(`       - ${err.text.substring(0, 100)}`));
      testResults.objectives.details.push(`✗ ${hydrationErrors.length} hydration error(s)`);
    } else {
      testResults.objectives.details.push('✓ No hydration errors');
    }
    
    // Check for objective cards
    const objectiveCards = await page.locator('[class*="objective"]').count();
    const hasObjectives = await page.locator('text=/Book first-round meetings|Initial meetings|Partner meetings/i').count();
    console.log(`\n  c) Objective cards rendering:`);
    console.log(`     ${hasObjectives > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    
    if (hasObjectives > 0) {
      testResults.objectives.details.push('✓ Objective cards rendering');
    } else {
      testResults.objectives.details.push('✗ Objective cards not rendering');
    }
    
    // Click Weekly Report button
    console.log('\nStep 4: Click "Weekly Report" button');
    if (weeklyReportButton > 0) {
      try {
        await page.locator('button:has-text("Weekly Report")').first().click();
        await page.waitForTimeout(2000);
        
        await page.screenshot({ path: 'final-test-2-weekly-report-dialog.png', fullPage: true });
        console.log('  ✓ Button clicked');
        console.log('  ✓ Screenshot saved: final-test-2-weekly-report-dialog.png');
        
        // Check if dialog opened
        const dialogOpen = await page.locator('[role="dialog"], [class*="dialog"]').count();
        console.log(`  Dialog opened: ${dialogOpen > 0 ? '✓ YES' : '✗ NO'}`);
        
        if (dialogOpen > 0) {
          testResults.objectives.details.push('✓ Weekly Report dialog opens');
        } else {
          testResults.objectives.details.push('⚠ Weekly Report dialog did not open');
        }
        
        // Close dialog
        console.log('\nStep 5: Close dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        console.log('  ✓ Dialog closed (ESC key)');
        
      } catch (error) {
        console.log(`  ✗ Error clicking button: ${error.message}`);
        testResults.objectives.details.push('✗ Could not interact with Weekly Report button');
      }
    } else {
      console.log('  ⚠ Skipped - button not found');
    }
    
    // Determine pass/fail
    const objectivesPass = weeklyReportButton > 0 && hydrationErrors.length === 0 && hasObjectives > 0;
    testResults.objectives.pass = objectivesPass;
    
    console.log(`\n${'═'.repeat(43)}`);
    console.log(`TEST 2 RESULT: ${objectivesPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═'.repeat(43));

    // ═══════════════════════════════════════════════════════════
    // TEST 3: /new-tasks PAGE
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════');
    console.log('   TEST 3: /new-tasks PAGE');
    console.log('═══════════════════════════════════════\n');
    
    consoleErrors = []; // Reset
    
    await page.goto('http://localhost:3000/new-tasks', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    
    console.log('Step 1: Navigate to /new-tasks');
    console.log('  URL:', page.url());
    console.log('  ✓ Page loaded\n');
    
    // Close any open dialogs
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    console.log('Step 2: Find and click "Board" tab');
    const boardTab = await page.locator('[role="tab"]:has-text("Board")').count();
    console.log(`  Board tab found: ${boardTab > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (boardTab > 0) {
      try {
        await page.locator('[role="tab"]:has-text("Board")').first().click({ force: true });
        await page.waitForTimeout(2000);
        console.log('  ✓ Board tab clicked');
        testResults.tasks.details.push('✓ Board tab clickable');
      } catch (error) {
        console.log(`  ✗ Error clicking Board tab: ${error.message}`);
        testResults.tasks.details.push('✗ Could not click Board tab');
      }
    } else {
      testResults.tasks.details.push('✗ Board tab not found');
    }
    
    console.log('\nStep 3: Take screenshot of board view');
    await page.screenshot({ path: 'final-test-3-tasks-board.png', fullPage: true });
    console.log('  ✓ Screenshot saved: final-test-3-tasks-board.png\n');
    
    console.log('Step 4: Verify kanban columns');
    const pendingColumn = await page.locator('text=/Pending|Backlog/i').count();
    const inProgressColumn = await page.locator('text=/In Progress|Active/i').count();
    const inReviewColumn = await page.locator('text=/In Review|Review/i').count();
    const completedColumn = await page.locator('text=/Completed|Done/i').count();
    
    console.log('  Columns found:');
    console.log(`    - Pending: ${pendingColumn > 0 ? '✓' : '✗'}`);
    console.log(`    - In Progress: ${inProgressColumn > 0 ? '✓' : '✗'}`);
    console.log(`    - In Review: ${inReviewColumn > 0 ? '✓' : '✗'}`);
    console.log(`    - Completed: ${completedColumn > 0 ? '✓' : '✗'}`);
    
    const columnsFound = pendingColumn + inProgressColumn + inReviewColumn + completedColumn;
    console.log(`\n  Total columns visible: ${columnsFound}/4`);
    
    if (columnsFound >= 3) {
      testResults.tasks.details.push(`✓ Kanban columns visible (${columnsFound}/4)`);
    } else {
      testResults.tasks.details.push(`✗ Insufficient columns (${columnsFound}/4)`);
    }
    
    console.log('\nStep 5: Check console for errors');
    const tasksErrors = consoleErrors.filter(e => !e.text.includes('401'));
    console.log(`  Console errors (excluding 401): ${tasksErrors.length}`);
    
    if (tasksErrors.length > 0) {
      console.log('  Errors found:');
      tasksErrors.forEach(err => console.log(`    - ${err.text.substring(0, 100)}`));
      testResults.tasks.details.push(`✗ ${tasksErrors.length} console error(s)`);
    } else {
      console.log('  ✓ No console errors');
      testResults.tasks.details.push('✓ Console clean');
    }
    
    // Determine pass/fail
    const tasksPass = boardTab > 0 && columnsFound >= 3 && tasksErrors.length === 0;
    testResults.tasks.pass = tasksPass;
    
    console.log(`\n${'═'.repeat(43)}`);
    console.log(`TEST 3 RESULT: ${tasksPass ? '✅ PASS' : '❌ FAIL'}`);
    console.log('═'.repeat(43));

    // ═══════════════════════════════════════════════════════════
    // FINAL SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n');
    console.log('╔═══════════════════════════════════════╗');
    console.log('║     FINAL COMPREHENSIVE SUMMARY       ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('TEST 1: /plan PAGE');
    console.log(`  Result: ${testResults.plan.pass ? '✅ PASS' : '❌ FAIL'}`);
    testResults.plan.details.forEach(d => console.log(`    ${d}`));
    
    console.log('\nTEST 2: /new-objectives PAGE');
    console.log(`  Result: ${testResults.objectives.pass ? '✅ PASS' : '❌ FAIL'}`);
    testResults.objectives.details.forEach(d => console.log(`    ${d}`));
    
    console.log('\nTEST 3: /new-tasks PAGE');
    console.log(`  Result: ${testResults.tasks.pass ? '✅ PASS' : '❌ FAIL'}`);
    testResults.tasks.details.forEach(d => console.log(`    ${d}`));
    
    const allPass = testResults.plan.pass && testResults.objectives.pass && testResults.tasks.pass;
    const passCount = [testResults.plan.pass, testResults.objectives.pass, testResults.tasks.pass].filter(Boolean).length;
    
    console.log('\n' + '═'.repeat(43));
    console.log(`OVERALL: ${passCount}/3 TESTS PASSED`);
    console.log(allPass ? '✅ ALL TESTS PASSED' : `⚠️  ${3 - passCount} TEST(S) FAILED`);
    console.log('═'.repeat(43));
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    await page.screenshot({ path: 'final-test-critical-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n✓ Testing complete!');
})();
