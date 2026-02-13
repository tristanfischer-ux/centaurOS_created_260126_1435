const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 200
  });
  
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();

  // Collect ALL console messages with detailed info
  const allConsoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    const location = msg.location();
    
    allConsoleMessages.push({
      type,
      text,
      location: `${location.url}:${location.lineNumber}:${location.columnNumber}`,
      timestamp: new Date().toISOString()
    });
    
    // Log errors and warnings immediately
    if (type === 'error' || type === 'warning') {
      console.log(`[${type.toUpperCase()}] ${text}`);
    }
  });

  // Collect page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push({
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    console.error('[PAGE ERROR]', error.message);
  });

  try {
    // Login
    console.log('=== LOGGING IN ===\n');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in\n');

    // Navigate to objectives
    console.log('=== NAVIGATING TO OBJECTIVES PAGE ===\n');
    await page.goto('http://localhost:3000/new-objectives', { waitUntil: 'domcontentloaded' });
    
    // Wait for page to fully render
    await page.waitForTimeout(3000);
    
    console.log('Page URL:', page.url());
    console.log('Page Title:', await page.title());
    
    // ITEM 1: Take screenshot
    console.log('\n=== ITEM 1: SCREENSHOT ===\n');
    await page.screenshot({ path: 'objectives-detailed-full.png', fullPage: true });
    console.log('✓ Screenshot saved: objectives-detailed-full.png');
    
    await page.screenshot({ path: 'objectives-detailed-viewport.png' });
    console.log('✓ Viewport screenshot saved: objectives-detailed-viewport.png');

    // ITEM 2: Check console for hydration errors
    console.log('\n=== ITEM 2: CONSOLE ERRORS CHECK ===\n');
    
    const hydrationErrors = allConsoleMessages.filter(msg => 
      msg.text.toLowerCase().includes('hydration') ||
      msg.text.toLowerCase().includes('cannot be a descendant')
    );
    
    const allErrors = allConsoleMessages.filter(msg => msg.type === 'error');
    const allWarnings = allConsoleMessages.filter(msg => msg.type === 'warning');
    
    console.log(`Total console messages: ${allConsoleMessages.length}`);
    console.log(`Total errors: ${allErrors.length}`);
    console.log(`Total warnings: ${allWarnings.length}`);
    console.log(`Hydration-related messages: ${hydrationErrors.length}`);
    
    if (hydrationErrors.length > 0) {
      console.log('\n⚠️  HYDRATION ERRORS FOUND:\n');
      hydrationErrors.forEach((msg, i) => {
        console.log(`${i + 1}. [${msg.type.toUpperCase()}] ${msg.text}`);
        console.log(`   Location: ${msg.location}`);
        console.log('');
      });
    } else {
      console.log('\n✓ NO HYDRATION ERRORS FOUND');
    }
    
    if (allErrors.length > 0) {
      console.log('\nAll Console Errors:');
      allErrors.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.text.substring(0, 150)}`);
      });
    }
    
    if (pageErrors.length > 0) {
      console.log('\nPage Errors:');
      pageErrors.forEach((err, i) => {
        console.log(`${i + 1}. ${err.message}`);
      });
    }
    
    if (hydrationErrors.length === 0 && allErrors.length === 0 && pageErrors.length === 0) {
      console.log('\n✅ CONSOLE IS CLEAN - No hydration errors, no console errors, no page errors');
    }

    // ITEM 3: Look for "Weekly Report" button in header
    console.log('\n=== ITEM 3: WEEKLY REPORT BUTTON ===\n');
    
    // Try multiple variations
    const weeklyReportVariations = [
      'button:has-text("Weekly Report")',
      'button:has-text("Weekly Digest")',
      'button:has-text("Progress Report")',
      'button:has-text("Report")',
    ];
    
    let weeklyReportFound = false;
    let weeklyReportText = '';
    
    for (const selector of weeklyReportVariations) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        weeklyReportFound = true;
        weeklyReportText = await page.locator(selector).first().textContent();
        console.log(`✓ FOUND: "${weeklyReportText.trim()}" button`);
        
        // Get button details
        const buttonClass = await page.locator(selector).first().getAttribute('class');
        console.log(`  Classes: ${buttonClass}`);
        
        // Check if it's near Create Objective button
        const createObjectiveButton = await page.locator('button:has-text("Create Objective")').count();
        console.log(`  "Create Objective" button nearby: ${createObjectiveButton > 0 ? 'YES' : 'NO'}`);
        
        // Take screenshot of header area
        await page.locator(selector).first().scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        await page.screenshot({ path: 'objectives-weekly-report-button.png' });
        console.log('  ✓ Screenshot saved: objectives-weekly-report-button.png');
        
        break;
      }
    }
    
    if (!weeklyReportFound) {
      console.log('❌ NOT FOUND: No "Weekly Report" or similar button found');
      
      // List all buttons in header area
      const allButtons = await page.locator('button').all();
      console.log(`\n  Found ${allButtons.length} total buttons on page`);
      console.log('  First 15 button texts:');
      
      for (let i = 0; i < Math.min(allButtons.length, 15); i++) {
        const text = await allButtons[i].textContent();
        const ariaLabel = await allButtons[i].getAttribute('aria-label');
        if (text.trim() || ariaLabel) {
          console.log(`    ${i + 1}. "${text.trim()}" ${ariaLabel ? `(aria: ${ariaLabel})` : ''}`);
        }
      }
    }

    // ITEM 4: Look for Team Pulse card
    console.log('\n=== ITEM 4: TEAM PULSE COMPONENT ===\n');
    
    // Look for Team Pulse heading
    const teamPulseHeading = await page.locator('text=/Team Pulse/i').count();
    console.log(`"Team Pulse" heading: ${teamPulseHeading > 0 ? '✓ FOUND' : '❌ NOT FOUND'}`);
    
    if (teamPulseHeading > 0) {
      console.log('\n✓ TEAM PULSE COMPONENT FOUND\n');
      
      // Scroll to it
      await page.locator('text=/Team Pulse/i').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      
      // Take screenshot
      await page.screenshot({ path: 'objectives-team-pulse.png' });
      console.log('  ✓ Screenshot saved: objectives-team-pulse.png');
      
      // Check for spinner
      const spinner = await page.locator('[class*="animate-spin"], [class*="spinner"]').count();
      console.log(`  Spinner/loading indicator: ${spinner > 0 ? 'YES' : 'NO'}`);
      
      // Check for team member names
      const bodyText = await page.locator('body').textContent();
      const hasNames = bodyText.includes('Founder') || bodyText.includes('Executive') || bodyText.includes('Apprentice');
      console.log(`  Team member names visible: ${hasNames ? 'YES' : 'NO'}`);
      
      // Get the content of the Team Pulse section
      const teamPulseContent = await page.locator('text=/Team Pulse/i').first()
        .locator('xpath=ancestor::div[contains(@class, "card") or contains(@class, "rounded")]')
        .textContent()
        .catch(() => 'Could not extract content');
      
      console.log(`\n  Team Pulse content preview:`);
      console.log(`  ${teamPulseContent.substring(0, 300).replace(/\n/g, ' ').trim()}...`);
      
    } else {
      console.log('\n❌ TEAM PULSE COMPONENT NOT FOUND\n');
      
      // Look for alternative indicators
      console.log('  Looking for alternative team activity indicators...');
      
      const activityKeywords = ['activity', 'workload', 'standup', 'team member', 'pulse'];
      const bodyText = await page.locator('body').textContent();
      
      activityKeywords.forEach(keyword => {
        const found = bodyText.toLowerCase().includes(keyword);
        console.log(`    "${keyword}": ${found ? '✓' : '✗'}`);
      });
      
      // Check for any cards with team info
      const cards = await page.locator('[class*="card"], [class*="rounded-"]').all();
      console.log(`\n  Found ${cards.length} card-like elements on page`);
      
      // Check first few cards for team-related content
      for (let i = 0; i < Math.min(cards.length, 5); i++) {
        const cardText = await cards[i].textContent();
        const preview = cardText.substring(0, 80).replace(/\n/g, ' ').trim();
        if (preview) {
          console.log(`    Card ${i + 1}: ${preview}...`);
        }
      }
    }

    // SUMMARY
    console.log('\n\n=== SUMMARY ===\n');
    console.log('1. Screenshots: ✓ CAPTURED');
    console.log(`2. Console Status: ${hydrationErrors.length === 0 && allErrors.length === 0 ? '✅ CLEAN' : '⚠️ ERRORS FOUND'}`);
    console.log(`   - Hydration errors: ${hydrationErrors.length}`);
    console.log(`   - Total console errors: ${allErrors.length}`);
    console.log(`   - Page errors: ${pageErrors.length}`);
    console.log(`3. Weekly Report button: ${weeklyReportFound ? '✓ FOUND' : '❌ NOT FOUND'}`);
    console.log(`4. Team Pulse component: ${teamPulseHeading > 0 ? '✓ FOUND' : '❌ NOT FOUND'}`);

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    await page.screenshot({ path: 'objectives-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('✓ Complete!');
})();
