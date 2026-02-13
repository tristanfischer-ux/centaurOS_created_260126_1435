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

  // Console tracking
  const consoleMessages = [];
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text, timestamp: new Date().toISOString() });
    
    if (type === 'error') {
      console.log(`[CONSOLE ERROR] ${text}`);
    }
  });

  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push({ message: error.message, stack: error.stack });
    console.error(`[PAGE ERROR] ${error.message}`);
  });

  try {
    // Login
    console.log('═══════════════════════════════════════');
    console.log('    TEMPLATE GALLERY TEST');
    console.log('═══════════════════════════════════════\n');
    
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(3000);
    console.log('✓ Logged in\n');

    // Step 1: Navigate to /plan
    console.log('STEP 1: Navigate to /plan');
    await page.goto('http://localhost:3000/plan', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('  ✓ Page loaded');
    console.log('  URL:', page.url());
    
    // Check console after navigation
    const errorsAfterNav = consoleMessages.filter(m => m.type === 'error' && !m.text.includes('401'));
    console.log(`  Console errors: ${errorsAfterNav.length}\n`);

    // Step 2: Scroll to Plan Templates section
    console.log('STEP 2: Scroll to "Plan Templates" section');
    const templateHeading = await page.locator('text=/Plan Templates|Template Gallery/i').count();
    console.log(`  "Plan Templates" heading found: ${templateHeading > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (templateHeading > 0) {
      await page.locator('text=/Plan Templates|Template Gallery/i').first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(1000);
      console.log('  ✓ Scrolled to templates section\n');
    }

    // Step 3: Take screenshot of template cards
    console.log('STEP 3: Take screenshot of template cards');
    await page.screenshot({ path: 'template-1-cards-view.png' });
    console.log('  ✓ Screenshot saved: template-1-cards-view.png');
    
    // Count template cards
    const templateCards = await page.locator('[class*="cursor-pointer"]').filter({ hasText: /Launch|Campaign|Fundraising|MVP|Event/i }).count();
    console.log(`  Template cards visible: ${templateCards}\n`);
    
    // List visible template names
    console.log('  Visible templates:');
    const templateNames = await page.locator('h3, h4').filter({ hasText: /Launch|Campaign|Fundraising|MVP|Event|Playbook|Store|Legal|Compliance/i }).allTextContents();
    templateNames.slice(0, 10).forEach((name, i) => {
      console.log(`    ${i + 1}. ${name.trim()}`);
    });

    // Step 4: Click on a template card
    console.log('\nSTEP 4: Click on a template card');
    
    // Try to find specific templates
    const templateSelectors = [
      'text="Startup Launch Playbook"',
      'text="Fundraising Round"',
      'text="Build & Ship MVP"',
      'text="Marketing Campaign Launch"',
    ];
    
    let clickedTemplate = null;
    let templateClicked = false;
    
    for (const selector of templateSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        clickedTemplate = await page.locator(selector).first().textContent();
        console.log(`  Attempting to click: "${clickedTemplate.trim()}"`);
        
        try {
          // Find the card container and click it
          const card = page.locator(selector).first().locator('xpath=ancestor::div[contains(@class, "cursor-pointer") or contains(@class, "card")]').first();
          await card.click({ timeout: 5000 });
          templateClicked = true;
          console.log('  ✓ Template card clicked');
          break;
        } catch (e) {
          console.log(`  ✗ Could not click card: ${e.message}`);
        }
      }
    }
    
    if (!templateClicked) {
      // Try generic approach - click any card-like element
      console.log('  Trying generic card click...');
      const anyCard = await page.locator('[class*="cursor-pointer"]').filter({ hasText: /Launch|Campaign|Fundraising/i }).first();
      const cardCount = await anyCard.count();
      if (cardCount > 0) {
        await anyCard.click();
        templateClicked = true;
        console.log('  ✓ Template card clicked (generic)');
      }
    }
    
    await page.waitForTimeout(2000);
    
    // Check console after click
    const errorsAfterClick = consoleMessages.filter(m => 
      m.type === 'error' && 
      !m.text.includes('401') &&
      new Date(m.timestamp) > new Date(Date.now() - 3000)
    );
    console.log(`  Console errors after click: ${errorsAfterClick.length}\n`);

    // Step 5: Check if preview dialog opened
    console.log('STEP 5: Check for preview dialog');
    await page.waitForTimeout(1000);
    
    const dialogOpen = await page.locator('[role="dialog"]').count();
    console.log(`  Dialog detected: ${dialogOpen > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (dialogOpen > 0) {
      await page.screenshot({ path: 'template-2-preview-dialog.png', fullPage: true });
      console.log('  ✓ Screenshot saved: template-2-preview-dialog.png\n');
      
      // Step 6: Analyze dialog content
      console.log('STEP 6: Analyze dialog content');
      
      const dialogContent = await page.locator('[role="dialog"]').first().textContent();
      
      // Check for template name/title
      const dialogTitle = await page.locator('[role="dialog"] h2, [role="dialog"] h3').first().textContent().catch(() => 'Not found');
      console.log(`  Template name/title: "${dialogTitle.trim()}"`);
      
      // Check for description
      const hasDescription = dialogContent.length > 100;
      console.log(`  Description present: ${hasDescription ? '✓ YES' : '✗ NO'}`);
      if (hasDescription) {
        const preview = dialogContent.substring(0, 200).replace(/\s+/g, ' ').trim();
        console.log(`    Preview: "${preview}..."`);
      }
      
      // Check for phases breakdown
      const hasPhases = dialogContent.toLowerCase().includes('phase') || 
                       dialogContent.toLowerCase().includes('week') ||
                       dialogContent.toLowerCase().includes('milestone');
      console.log(`  Phases breakdown: ${hasPhases ? '✓ YES' : '✗ NO'}`);
      
      // Check for task counts
      const taskCountMatch = dialogContent.match(/(\d+)\s*(task|Task)/);
      console.log(`  Task counts: ${taskCountMatch ? `✓ YES (${taskCountMatch[0]})` : '✗ NO'}`);
      
      // Check for deploy/apply button
      const deployButtons = await page.locator('[role="dialog"] button:has-text("Deploy"), [role="dialog"] button:has-text("Apply"), [role="dialog"] button:has-text("Use Template")').count();
      console.log(`  Deploy/Apply/Use Template button: ${deployButtons > 0 ? '✓ YES' : '✗ NO'}`);
      
      // List all buttons in dialog
      const allButtons = await page.locator('[role="dialog"] button').allTextContents();
      console.log(`\n  All buttons in dialog (${allButtons.length}):`);
      allButtons.forEach((btn, i) => {
        const text = btn.trim();
        if (text) console.log(`    ${i + 1}. "${text}"`);
      });
      
      // Step 7: Click deploy button if present
      if (deployButtons > 0) {
        console.log('\nSTEP 7: Click deploy button');
        
        const deployButton = page.locator('[role="dialog"] button:has-text("Deploy"), [role="dialog"] button:has-text("Apply"), [role="dialog"] button:has-text("Use Template")').first();
        const buttonText = await deployButton.textContent();
        console.log(`  Clicking button: "${buttonText.trim()}"`);
        
        await deployButton.click();
        console.log('  ✓ Button clicked');
        
        // Step 8: Wait for result
        console.log('\nSTEP 8: Wait for result (up to 20 seconds)');
        console.log('  Waiting...');
        
        // Check for loading state
        await page.waitForTimeout(2000);
        const loadingState = await page.locator('text=/Deploying|Creating|Generating|Loading/i').count();
        if (loadingState > 0) {
          console.log('  ✓ Loading state detected');
          await page.screenshot({ path: 'template-3-deploying.png' });
          console.log('  ✓ Screenshot saved: template-3-deploying.png');
        }
        
        // Wait additional time
        await page.waitForTimeout(18000);
        
        // Step 9: Take screenshot after deploy
        console.log('\nSTEP 9: Take screenshot after deploy');
        await page.screenshot({ path: 'template-4-after-deploy.png', fullPage: true });
        console.log('  ✓ Screenshot saved: template-4-after-deploy.png');
        
        // Step 10: Analyze result
        console.log('\nSTEP 10: Analyze result');
        
        const currentUrl = page.url();
        console.log(`  Current URL: ${currentUrl}`);
        
        // Check if redirected
        const redirected = !currentUrl.includes('/plan');
        console.log(`  Redirected: ${redirected ? '✓ YES' : '✗ NO'}`);
        if (redirected) {
          console.log(`    New location: ${currentUrl}`);
        }
        
        // Check for success indicators
        const bodyText = await page.locator('body').textContent();
        const hasSuccessMessage = bodyText.toLowerCase().includes('success') || 
                                 bodyText.toLowerCase().includes('created') ||
                                 bodyText.toLowerCase().includes('deployed');
        console.log(`  Success message: ${hasSuccessMessage ? '✓ YES' : '✗ NO'}`);
        
        // Check for error messages
        const hasErrorMessage = bodyText.toLowerCase().includes('error') || 
                               bodyText.toLowerCase().includes('failed');
        console.log(`  Error message: ${hasErrorMessage ? '✗ YES' : '✓ NO'}`);
        
        if (hasErrorMessage) {
          const errorMatch = bodyText.match(/(error|failed)[^.]*\./i);
          if (errorMatch) {
            console.log(`    Error text: "${errorMatch[0]}"`);
          }
        }
        
        // Check if objectives were created
        const objectivesPage = currentUrl.includes('objective');
        const hasObjectiveCards = await page.locator('[class*="objective"]').count();
        console.log(`  On objectives page: ${objectivesPage ? '✓ YES' : '✗ NO'}`);
        console.log(`  Objective cards visible: ${hasObjectiveCards}`);
        
        // Check for toast/notification
        const toastMessage = await page.locator('[class*="toast"], [role="status"], [role="alert"]').count();
        if (toastMessage > 0) {
          const toastText = await page.locator('[class*="toast"], [role="status"], [role="alert"]').first().textContent();
          console.log(`  Toast notification: "${toastText.trim()}"`);
        }
        
        // Check console for errors during deploy
        const deployErrors = consoleMessages.filter(m => 
          m.type === 'error' && 
          !m.text.includes('401') &&
          new Date(m.timestamp) > new Date(Date.now() - 20000)
        );
        console.log(`\n  Console errors during deploy: ${deployErrors.length}`);
        if (deployErrors.length > 0) {
          deployErrors.forEach((err, i) => {
            console.log(`    ${i + 1}. ${err.text.substring(0, 100)}`);
          });
        }
        
      } else {
        console.log('\nSTEP 7-10: SKIPPED (No deploy button found)');
      }
      
    } else {
      console.log('  ⚠️  Dialog did not open');
      await page.screenshot({ path: 'template-no-dialog.png' });
      console.log('  ✓ Screenshot saved: template-no-dialog.png');
    }

    // Final console check
    console.log('\n═══════════════════════════════════════');
    console.log('  CONSOLE SUMMARY');
    console.log('═══════════════════════════════════════');
    
    const totalErrors = consoleMessages.filter(m => m.type === 'error' && !m.text.includes('401'));
    const totalWarnings = consoleMessages.filter(m => m.type === 'warning');
    
    console.log(`Total console errors (excluding 401): ${totalErrors.length}`);
    console.log(`Total console warnings: ${totalWarnings.length}`);
    console.log(`Total page errors: ${pageErrors.length}`);
    
    if (totalErrors.length > 0) {
      console.log('\nConsole errors:');
      totalErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.text.substring(0, 150)}`);
      });
    }
    
    if (pageErrors.length > 0) {
      console.log('\nPage errors:');
      pageErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.message}`);
      });
    }

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: 'template-critical-error.png' });
  }
  
  console.log('\n\nKeeping browser open for 15 seconds for inspection...');
  await page.waitForTimeout(15000);
  await browser.close();
  console.log('\n✓ Testing complete!');
})();
