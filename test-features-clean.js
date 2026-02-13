const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 500
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('401')) {
      consoleErrors.push(msg.text());
      console.log(`[ERROR] ${msg.text()}`);
    }
  });

  try {
    // Login
    console.log('═══════════════════════════════════════');
    console.log('    FEATURE TEST (CLEAN START)');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in\n');

    // ═══════════════════════════════════════════════════════════
    // FEATURE 1: MORNING BRIEFING
    // ═══════════════════════════════════════════════════════════
    console.log('═══════════════════════════════════════');
    console.log('   FEATURE 1: MORNING BRIEFING');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/plan');
    await page.waitForTimeout(3000);
    
    // Close any dialogs
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
    
    console.log('Step 1-2: Navigate and find morning briefing');
    
    const briefingLocator = page.locator('text=/Good morning|Today\'s focus/i').first();
    const briefingCount = await briefingLocator.count();
    console.log(`  Morning briefing found: ${briefingCount > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (briefingCount > 0) {
      await briefingLocator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      console.log('\nStep 3: Screenshot of morning briefing card');
      await page.screenshot({ path: 'morning-briefing-card.png' });
      console.log('  ✓ Screenshot: morning-briefing-card.png');
      
      console.log('\nStep 4: Analyze card content');
      
      // Get surrounding card content
      const cardElement = briefingLocator.locator('xpath=ancestor::div[contains(@class, "card") or contains(@class, "rounded")]').first();
      let cardText = '';
      try {
        cardText = await cardElement.textContent();
      } catch {
        cardText = await page.locator('body').textContent();
      }
      
      // Look for specific data
      const hasTaskTitles = /E2E test task|task —|Review|Complete|Finish/i.test(cardText);
      const hasObjectiveNames = /objective|Q1 Goals|Sample Objective/i.test(cardText);
      const hasDates = /Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{1,2}\/\d{1,2}/i.test(cardText);
      const hasCounts = /\d+\s*(task|item|objective)/i.test(cardText);
      
      console.log('  Data verification:');
      console.log(`    Task titles: ${hasTaskTitles ? '✓ YES' : '✗ NO'}`);
      console.log(`    Objective names: ${hasObjectiveNames ? '✓ YES' : '✗ NO'}`);
      console.log(`    Dates: ${hasDates ? '✓ YES' : '✗ NO'}`);
      console.log(`    Counts: ${hasCounts ? '✓ YES' : '✗ NO'}`);
      
      const hasRealData = hasTaskTitles || hasObjectiveNames || hasDates;
      
      console.log('\n  ═══════════════════════════════════');
      console.log(`  RESULT: ${hasRealData ? '✅ SHOWS REAL DATA' : '❌ EMPTY/GENERIC'}`);
      console.log('  ═══════════════════════════════════');
      
      // Show content sample
      const contentSample = cardText.substring(0, 300).replace(/\s+/g, ' ').trim();
      console.log(`\n  Content sample: "${contentSample}..."`);
      
      console.log(`\nStep 5: Dismiss button check`);
      const dismissBtn = await page.locator('button:has-text("Dismiss"), button[aria-label*="dismiss" i]').count();
      console.log(`  Dismiss button present: ${dismissBtn > 0 ? 'YES (not clicked)' : 'NO'}`);
    }

    // ═══════════════════════════════════════════════════════════
    // FEATURE 2: WEEKLY REPORT
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════');
    console.log('   FEATURE 2: WEEKLY REPORT');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/new-objectives');
    await page.waitForTimeout(3000);
    
    // Aggressively close all dialogs
    console.log('Closing any open dialogs...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
    }
    await page.waitForTimeout(1000);
    console.log('  ✓ Dialogs closed\n');
    
    console.log('Step 1-2: Navigate and find Weekly Report button');
    const weeklyReportBtn = page.locator('button:has-text("Weekly Report")');
    const btnCount = await weeklyReportBtn.count();
    console.log(`  Weekly Report button found: ${btnCount > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (btnCount > 0) {
      await weeklyReportBtn.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      console.log('\nStep 3: Screenshot showing the button');
      await page.screenshot({ path: 'weekly-report-button.png' });
      console.log('  ✓ Screenshot: weekly-report-button.png');
      
      console.log('\nStep 4: Click Weekly Report button');
      await weeklyReportBtn.first().click({ force: true });
      console.log('  ✓ Button clicked');
      
      console.log('\nStep 5: Wait for dialog (up to 20 seconds)');
      await page.waitForTimeout(2000);
      
      // Check for loading state
      const loading = await page.locator('text=/Analyzing your week|Generating|Loading/i').count();
      if (loading > 0) {
        console.log('  ✓ Loading state: "Analyzing your week..."');
        await page.screenshot({ path: 'weekly-report-loading.png' });
        console.log('  ✓ Screenshot: weekly-report-loading.png');
        await page.waitForTimeout(15000);
      } else {
        console.log('  Dialog loaded immediately (no loading state)');
        await page.waitForTimeout(3000);
      }
      
      console.log('\nStep 6: Screenshot of dialog');
      await page.screenshot({ path: 'weekly-report-dialog.png', fullPage: true });
      console.log('  ✓ Screenshot: weekly-report-dialog.png');
      
      console.log('\nStep 7: Analyze dialog content');
      
      const dialog = page.locator('[role="dialog"]').first();
      const dialogExists = await dialog.count();
      console.log(`  Dialog open: ${dialogExists > 0 ? '✓ YES' : '✗ NO'}`);
      
      if (dialogExists > 0) {
        const dialogText = await dialog.textContent();
        
        // Get dialog title
        const dialogTitle = await dialog.locator('h2, h3').first().textContent().catch(() => 'Not found');
        console.log(`\n  Dialog title: "${dialogTitle.trim()}"`);
        
        // Check for specific elements
        const progressBars = await dialog.locator('[role="progressbar"], progress, [class*="progress"]').count();
        const taskCountMatch = dialogText.match(/(\d+)\s*(task|Task)/);
        const hasSummary = dialogText.toLowerCase().includes('summary') || dialogText.toLowerCase().includes('executive');
        const hasHealth = dialogText.toLowerCase().includes('on track') || 
                         dialogText.toLowerCase().includes('at risk') ||
                         dialogText.toLowerCase().includes('behind') ||
                         dialogText.toLowerCase().includes('ahead');
        const copyButton = await dialog.locator('button:has-text("Copy Report"), button:has-text("Copy")').count();
        const errorInDialog = dialogText.toLowerCase().includes('error') || dialogText.toLowerCase().includes('failed');
        
        console.log('\n  Content elements:');
        console.log(`    a) Progress bars for objectives: ${progressBars > 0 ? `✓ YES (${progressBars})` : '❌ NO'}`);
        console.log(`    b) Task completion counts: ${taskCountMatch ? `✓ YES (${taskCountMatch[0]})` : '❌ NO'}`);
        console.log(`    c) AI-generated summary: ${hasSummary ? '✓ YES' : '❌ NO'}`);
        console.log(`    d) Health indicators: ${hasHealth ? '✓ YES' : '❌ NO'}`);
        console.log(`    e) "Copy Report" button: ${copyButton > 0 ? '✓ YES' : '❌ NO'}`);
        
        if (errorInDialog) {
          console.log('\n  ⚠️  ERROR MESSAGE IN DIALOG:');
          const errorMatch = dialogText.match(/(error|failed|could not)[^.]*\./i);
          if (errorMatch) {
            console.log(`    "${errorMatch[0]}"`);
          }
        } else {
          console.log('\n  ✓ No error messages in dialog');
        }
        
        // Show content preview
        console.log('\n  Dialog content (first 400 chars):');
        const cleanText = dialogText.replace(/\[data-radix[^\]]*\][^}]*}/g, '').substring(0, 400).replace(/\s+/g, ' ').trim();
        console.log(`    "${cleanText}..."`);
        
        const hasRealData = (taskCountMatch || progressBars > 0) && !errorInDialog;
        
        console.log('\n  ═══════════════════════════════════');
        console.log(`  RESULT: ${hasRealData ? '✅ SHOWS REAL DATA' : '❌ EMPTY/ERROR'}`);
        console.log('  ═══════════════════════════════════');
        
      } else {
        console.log('  ❌ Dialog did not open');
      }
      
      console.log('\nStep 9: Close dialog');
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      console.log('  ✓ Dialog closed');
    }

    // Console summary
    console.log('\n\n═══════════════════════════════════════');
    console.log('  CONSOLE ERRORS SUMMARY');
    console.log('═══════════════════════════════════════');
    console.log(`Total errors (excluding 401): ${consoleErrors.length}`);
    if (consoleErrors.length > 0) {
      consoleErrors.forEach((err, i) => console.log(`  ${i + 1}. ${err.substring(0, 100)}`));
    } else {
      console.log('  ✓ No console errors');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: 'test-error-final.png' });
  }
  
  console.log('\n\nKeeping browser open for 15 seconds...');
  await page.waitForTimeout(15000);
  await browser.close();
})();
