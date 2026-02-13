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
    // Login
    console.log('═══════════════════════════════════════');
    console.log('         LOGGING IN');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
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
    
    console.log('Step 1: Navigate to /plan');
    await page.goto('http://localhost:3000/plan', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('  ✓ Page loaded\n');
    
    console.log('Step 2: Look for morning briefing card');
    
    // Try multiple variations
    const morningVariations = [
      'text=/Good morning/i',
      'text=/Today\'s focus/i',
      'text=/Here is what needs your attention/i',
      'text=/Morning Briefing/i',
      'text=/Daily Briefing/i'
    ];
    
    let briefingFound = false;
    let briefingText = '';
    let briefingLocator = null;
    
    for (const selector of morningVariations) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        briefingFound = true;
        briefingLocator = page.locator(selector).first();
        briefingText = await briefingLocator.textContent();
        console.log(`  ✓ FOUND: "${briefingText.substring(0, 50).trim()}..."`);
        break;
      }
    }
    
    if (briefingFound && briefingLocator) {
      console.log('\nStep 3: Take screenshot of morning briefing card');
      
      // Scroll to the card
      await briefingLocator.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      // Take screenshot of just the card area
      await page.screenshot({ path: 'feature1-1-morning-briefing-card.png' });
      console.log('  ✓ Screenshot saved: feature1-1-morning-briefing-card.png');
      
      // Also take full page for context
      await page.screenshot({ path: 'feature1-2-plan-page-full.png', fullPage: true });
      console.log('  ✓ Full page screenshot: feature1-2-plan-page-full.png\n');
      
      console.log('Step 4: Analyze card content');
      
      // Get the card's parent container to analyze full content
      const cardContent = await page.locator('body').textContent();
      
      // Check for real data indicators
      const hasTaskTitles = cardContent.includes('task') || cardContent.includes('Task');
      const hasCounts = /\d+/.test(cardContent);
      const hasObjectiveNames = cardContent.includes('objective') || cardContent.includes('Objective');
      const hasGenericText = cardContent.includes('No tasks') || cardContent.includes('Nothing to show');
      
      console.log('  Content analysis:');
      console.log(`    - Contains task references: ${hasTaskTitles ? '✓' : '✗'}`);
      console.log(`    - Contains numbers/counts: ${hasCounts ? '✓' : '✗'}`);
      console.log(`    - Contains objective names: ${hasObjectiveNames ? '✓' : '✗'}`);
      console.log(`    - Generic/empty message: ${hasGenericText ? '✓' : '✗'}`);
      
      // Extract visible text near the briefing
      const pageText = await page.locator('body').textContent();
      const briefingIndex = pageText.indexOf('Good morning') !== -1 ? pageText.indexOf('Good morning') : 
                           pageText.indexOf('Today') !== -1 ? pageText.indexOf('Today') : 0;
      const briefingSection = pageText.substring(briefingIndex, briefingIndex + 500);
      
      console.log('\n  Visible content preview:');
      console.log(`    "${briefingSection.substring(0, 200).replace(/\s+/g, ' ').trim()}..."`);
      
      // Check for dismiss button
      const dismissButton = await page.locator('button:has-text("Dismiss"), button:has-text("Close"), button[aria-label*="dismiss" i], button[aria-label*="close" i]').count();
      console.log(`\n  Dismiss/Close button present: ${dismissButton > 0 ? 'YES' : 'NO'}`);
      
      // Determine if real data
      const hasRealData = (hasTaskTitles || hasObjectiveNames) && hasCounts && !hasGenericText;
      
      console.log('\n  ═══════════════════════════════════');
      console.log(`  DATA STATUS: ${hasRealData ? '✓ REAL DATA' : '⚠ EMPTY/GENERIC'}`);
      console.log('  ═══════════════════════════════════');
      
    } else {
      console.log('  ✗ Morning briefing card NOT FOUND');
      await page.screenshot({ path: 'feature1-not-found.png', fullPage: true });
      console.log('  ✓ Screenshot saved: feature1-not-found.png');
    }

    // ═══════════════════════════════════════════════════════════
    // FEATURE 2: WEEKLY REPORT
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n═══════════════════════════════════════');
    console.log('   FEATURE 2: WEEKLY REPORT');
    console.log('═══════════════════════════════════════\n');
    
    console.log('Step 1: Navigate to /new-objectives');
    await page.goto('http://localhost:3000/new-objectives', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('  ✓ Page loaded\n');
    
    console.log('Step 2: Find "Weekly Report" button');
    const weeklyReportButton = await page.locator('button:has-text("Weekly Report")').count();
    console.log(`  Weekly Report button found: ${weeklyReportButton > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (weeklyReportButton > 0) {
      // Scroll to button
      await page.locator('button:has-text("Weekly Report")').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      console.log('\nStep 3: Take screenshot showing the button');
      await page.screenshot({ path: 'feature2-1-weekly-report-button.png' });
      console.log('  ✓ Screenshot saved: feature2-1-weekly-report-button.png\n');
      
      console.log('Step 4: Click "Weekly Report" button');
      
      // Close any existing dialogs first
      await page.keyboard.press('Escape');
      await page.waitForTimeout(1000);
      
      try {
        await page.locator('button:has-text("Weekly Report")').first().click({ timeout: 5000 });
        console.log('  ✓ Button clicked\n');
        
        console.log('Step 5: Wait for dialog to load (up to 20 seconds)');
        console.log('  Waiting for dialog...');
        
        // Wait for dialog to appear
        await page.waitForTimeout(2000);
        
        // Check for loading state
        const loadingState = await page.locator('text=/Analyzing your week|Loading|Generating/i').count();
        if (loadingState > 0) {
          console.log('  ✓ Loading state detected: "Analyzing your week..."');
          await page.screenshot({ path: 'feature2-2-dialog-loading.png' });
          console.log('  ✓ Screenshot saved: feature2-2-dialog-loading.png');
          
          // Wait additional time for generation
          console.log('  Waiting additional 15 seconds for generation...');
          await page.waitForTimeout(15000);
        } else {
          console.log('  No loading state detected, checking for dialog...');
          await page.waitForTimeout(3000);
        }
        
        console.log('\nStep 6: Take screenshot of dialog');
        await page.screenshot({ path: 'feature2-3-dialog-content.png', fullPage: true });
        console.log('  ✓ Screenshot saved: feature2-3-dialog-content.png\n');
        
        console.log('Step 7: Analyze dialog content');
        
        // Check if dialog is open
        const dialogOpen = await page.locator('[role="dialog"], [class*="dialog"]').count();
        console.log(`  Dialog open: ${dialogOpen > 0 ? '✓ YES' : '✗ NO'}`);
        
        if (dialogOpen > 0) {
          const dialogContent = await page.locator('[role="dialog"]').first().textContent();
          
          // Check for specific elements
          const hasProgressBars = await page.locator('[role="progressbar"], [class*="progress"]').count();
          const hasTaskCounts = /\d+\s*(task|Task|completed|pending)/i.test(dialogContent);
          const hasAISummary = dialogContent.toLowerCase().includes('summary') || 
                               dialogContent.toLowerCase().includes('analysis') ||
                               dialogContent.toLowerCase().includes('week');
          const hasHealthIndicators = dialogContent.toLowerCase().includes('on track') || 
                                      dialogContent.toLowerCase().includes('at risk') ||
                                      dialogContent.toLowerCase().includes('health');
          const hasCopyButton = await page.locator('button:has-text("Copy Report"), button:has-text("Copy")').count();
          const hasErrorMessage = dialogContent.toLowerCase().includes('error') || 
                                 dialogContent.toLowerCase().includes('failed') ||
                                 dialogContent.toLowerCase().includes('could not');
          
          console.log('  Content verification:');
          console.log(`    ✓ Progress bars for objectives: ${hasProgressBars > 0 ? `YES (${hasProgressBars})` : 'NO'}`);
          console.log(`    ✓ Task completion counts: ${hasTaskCounts ? 'YES' : 'NO'}`);
          console.log(`    ✓ AI-generated summary section: ${hasAISummary ? 'YES' : 'NO'}`);
          console.log(`    ✓ Health indicators: ${hasHealthIndicators ? 'YES' : 'NO'}`);
          console.log(`    ✓ "Copy Report" button: ${hasCopyButton > 0 ? 'YES' : 'NO'}`);
          
          if (hasErrorMessage) {
            console.log('\n  ⚠️  ERROR MESSAGE DETECTED:');
            // Extract error message
            const errorMatch = dialogContent.match(/(error|failed|could not)[^.]*\./i);
            if (errorMatch) {
              console.log(`    "${errorMatch[0]}"`);
            }
          }
          
          // Show content preview
          console.log('\n  Dialog content preview (first 300 chars):');
          console.log(`    "${dialogContent.substring(0, 300).replace(/\s+/g, ' ').trim()}..."`);
          
          // Determine if real data
          const hasRealData = (hasProgressBars > 0 || hasTaskCounts) && !hasErrorMessage;
          
          console.log('\n  ═══════════════════════════════════');
          console.log(`  DATA STATUS: ${hasRealData ? '✓ REAL DATA' : '⚠ EMPTY/ERROR'}`);
          console.log('  ═══════════════════════════════════');
          
        } else {
          console.log('  ⚠️  Dialog did not open or could not be detected');
        }
        
        console.log('\nStep 9: Close dialog');
        await page.keyboard.press('Escape');
        await page.waitForTimeout(1000);
        console.log('  ✓ Dialog closed (ESC key)');
        
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
        await page.screenshot({ path: 'feature2-error.png' });
        console.log('  ✓ Error screenshot saved: feature2-error.png');
      }
      
    } else {
      console.log('  ✗ Weekly Report button NOT FOUND');
      await page.screenshot({ path: 'feature2-button-not-found.png' });
      console.log('  ✓ Screenshot saved: feature2-button-not-found.png');
    }

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════
    console.log('\n\n╔═══════════════════════════════════════╗');
    console.log('║          FEATURE TEST SUMMARY         ║');
    console.log('╚═══════════════════════════════════════╝\n');
    
    console.log('FEATURE 1: Morning Briefing');
    console.log(`  Status: ${briefingFound ? '✓ FOUND' : '✗ NOT FOUND'}`);
    if (briefingFound) {
      console.log('  Screenshots: feature1-1-morning-briefing-card.png');
      console.log('               feature1-2-plan-page-full.png');
    }
    
    console.log('\nFEATURE 2: Weekly Report');
    console.log(`  Button: ${weeklyReportButton > 0 ? '✓ FOUND' : '✗ NOT FOUND'}`);
    if (weeklyReportButton > 0) {
      console.log('  Screenshots: feature2-1-weekly-report-button.png');
      console.log('               feature2-2-dialog-loading.png (if applicable)');
      console.log('               feature2-3-dialog-content.png');
    }
    
  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    await page.screenshot({ path: 'critical-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n✓ Testing complete!');
})();
