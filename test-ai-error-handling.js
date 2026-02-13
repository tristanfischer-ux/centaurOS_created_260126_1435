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

  const consoleMessages = [];
  const toastMessages = [];
  
  page.on('console', msg => {
    const type = msg.type();
    const text = msg.text();
    consoleMessages.push({ type, text, timestamp: new Date().toISOString() });
    
    if (type === 'error' && !text.includes('401') && !text.includes('UpdatesThreadPanel')) {
      console.log(`[${new Date().toISOString()}] CONSOLE ERROR: ${text.substring(0, 150)}`);
    }
  });

  try {
    console.log('═══════════════════════════════════════════════════════');
    console.log('    AI PLAN GENERATOR ERROR HANDLING TEST');
    console.log('═══════════════════════════════════════════════════════\n');
    
    // Login
    console.log('Logging in...');
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Step 1: Navigate to plan page
    console.log('STEP 1: Navigate to /plan');
    await page.goto('http://localhost:3000/plan');
    console.log('  ✓ Navigated\n');
    
    // Step 2: Wait 3 seconds
    console.log('STEP 2: Wait 3 seconds for page load');
    await page.waitForTimeout(3000);
    console.log('  ✓ Page loaded\n');
    
    // Close any dialogs
    console.log('Closing any open dialogs...');
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(1000);
    console.log('  ✓ Dialogs closed\n');
    
    // Step 3: Find the input field
    console.log('STEP 3: Find input field with placeholder about "coffee brand"');
    
    // Look for the One Sentence Planner input
    const inputSelectors = [
      'textarea[placeholder*="coffee"]',
      'textarea[placeholder*="Coffee"]',
      'input[placeholder*="coffee"]',
      'input[placeholder*="Coffee"]',
      'textarea[placeholder*="Describe"]',
      'textarea[placeholder*="describe"]',
    ];
    
    let inputField = null;
    let usedSelector = '';
    
    for (const selector of inputSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        inputField = page.locator(selector).first();
        usedSelector = selector;
        console.log(`  ✓ Found input field using: ${selector}`);
        break;
      }
    }
    
    if (!inputField) {
      console.log('  ✗ Input field not found, trying generic textarea...');
      inputField = page.locator('textarea').first();
      usedSelector = 'textarea (generic)';
    }
    
    const placeholder = await inputField.getAttribute('placeholder');
    console.log(`  Placeholder text: "${placeholder}"`);
    console.log(`  Selector used: ${usedSelector}\n`);
    
    // Step 4: Click on input
    console.log('STEP 4: Click on input field');
    await inputField.click();
    await page.waitForTimeout(500);
    console.log('  ✓ Input focused\n');
    
    // Step 5: Type the text
    console.log('STEP 5: Type "Hire 3 engineers"');
    await inputField.fill('Hire 3 engineers');
    await page.waitForTimeout(500);
    console.log('  ✓ Text entered\n');
    
    // Step 6: Find and click submit button
    console.log('STEP 6: Find and click submit button');
    
    // Look for submit button (arrow icon, sparkles, or "Generate" text)
    const submitSelectors = [
      'button[type="submit"]',
      'button:has(svg.lucide-arrow-right)',
      'button:has(svg.lucide-sparkles)',
      'button:has-text("Generate")',
      'button:has-text("Create")',
      'button[aria-label*="submit"]',
      'button[aria-label*="generate"]',
    ];
    
    let submitButton = null;
    let submitSelector = '';
    
    for (const selector of submitSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        submitButton = page.locator(selector).first();
        submitSelector = selector;
        console.log(`  ✓ Found submit button using: ${selector}`);
        break;
      }
    }
    
    if (!submitButton) {
      console.log('  ⚠️  Submit button not found with standard selectors');
      console.log('  Trying to find button near input field...');
      
      // Try to find button that's a sibling or nearby
      submitButton = page.locator('form button, div:has(textarea) button').first();
      submitSelector = 'form button (fallback)';
    }
    
    console.log(`  Button selector: ${submitSelector}`);
    
    // Take screenshot before clicking
    await page.screenshot({ path: 'ai-error-1-before-submit.png' });
    console.log('  ✓ Screenshot: ai-error-1-before-submit.png');
    
    // Click submit
    await submitButton.click();
    console.log('  ✓ Submit button clicked\n');
    
    // Step 7: IMMEDIATELY screenshot loading state
    console.log('STEP 7: Screenshot loading animation');
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'ai-error-2-loading.png' });
    console.log('  ✓ Screenshot: ai-error-2-loading.png\n');
    
    // Step 8-9: Monitor for 30 seconds
    console.log('STEP 8-9: Monitor for toast notifications and state changes');
    console.log('  Checking every 3 seconds for 30 seconds total...\n');
    
    const startTime = Date.now();
    const checkInterval = 3000; // 3 seconds
    const totalDuration = 30000; // 30 seconds
    let checkCount = 0;
    let toastFound = false;
    let loadingEnded = false;
    
    while (Date.now() - startTime < totalDuration) {
      checkCount++;
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      
      console.log(`  [${elapsed}s] Check #${checkCount}:`);
      
      // Check for toast notifications (Sonner toasts)
      const toastSelectors = [
        '[data-sonner-toast]',
        '[role="status"]',
        '[class*="sonner"]',
        '[class*="toast"]',
        'li[data-sonner-toast]',
      ];
      
      for (const selector of toastSelectors) {
        const toasts = await page.locator(selector).all();
        if (toasts.length > 0) {
          toastFound = true;
          console.log(`    🔔 TOAST FOUND (${selector}): ${toasts.length} toast(s)`);
          
          for (let i = 0; i < toasts.length; i++) {
            const toast = toasts[i];
            const toastText = await toast.textContent();
            const toastVisible = await toast.isVisible().catch(() => false);
            
            if (toastVisible) {
              console.log(`      Toast #${i + 1}: "${toastText.trim()}"`);
              toastMessages.push({
                text: toastText.trim(),
                timestamp: new Date().toISOString(),
                checkNumber: checkCount,
              });
              
              // Check if it's an error toast
              const isError = toastText.toLowerCase().includes('error') ||
                            toastText.toLowerCase().includes('failed') ||
                            toastText.toLowerCase().includes('try again') ||
                            toastText.toLowerCase().includes('something went wrong');
              
              if (isError) {
                console.log(`      ❌ ERROR TOAST DETECTED`);
              }
            }
          }
        }
      }
      
      // Check for loading state
      const loadingIndicators = [
        'svg.animate-spin',
        '[class*="loading"]',
        '[aria-busy="true"]',
        'button:disabled',
        'text=/Generating|Loading|Please wait/i',
      ];
      
      let stillLoading = false;
      for (const selector of loadingIndicators) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          stillLoading = true;
          console.log(`    ⏳ Loading indicator found: ${selector}`);
          break;
        }
      }
      
      if (!stillLoading && !loadingEnded) {
        loadingEnded = true;
        console.log(`    ✓ Loading state ended`);
      }
      
      // Check for error text on screen
      const errorTexts = await page.locator('text=/error|failed|try again|something went wrong/i').all();
      if (errorTexts.length > 0) {
        console.log(`    ⚠️  Error text found on screen (${errorTexts.length} instances)`);
        for (let i = 0; i < Math.min(errorTexts.length, 3); i++) {
          const text = await errorTexts[i].textContent();
          console.log(`      - "${text.trim().substring(0, 80)}"`);
        }
      }
      
      // Take periodic screenshot
      const screenshotNum = checkCount + 2; // +2 because we already have 1 and 2
      await page.screenshot({ path: `ai-error-${screenshotNum}-check-${checkCount}.png` });
      console.log(`    📸 Screenshot: ai-error-${screenshotNum}-check-${checkCount}.png`);
      
      if (!toastFound) {
        console.log(`    ℹ️  No toast notifications yet`);
      }
      
      console.log('');
      
      // Wait for next check
      await page.waitForTimeout(checkInterval);
    }
    
    // Step 10: Final screenshot
    console.log('STEP 10: Final screenshot after 30 seconds');
    await page.screenshot({ path: 'ai-error-final.png', fullPage: true });
    console.log('  ✓ Screenshot: ai-error-final.png\n');
    
    // Summary
    console.log('═══════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log(`Total monitoring time: 30 seconds`);
    console.log(`Total checks performed: ${checkCount}`);
    console.log(`Toast notifications found: ${toastFound ? 'YES ✓' : 'NO ✗'}`);
    console.log(`Loading state ended: ${loadingEnded ? 'YES ✓' : 'NO ✗'}`);
    
    if (toastMessages.length > 0) {
      console.log(`\nToast messages captured: ${toastMessages.length}`);
      toastMessages.forEach((toast, i) => {
        console.log(`  ${i + 1}. [${toast.timestamp}] Check #${toast.checkNumber}: "${toast.text}"`);
      });
    } else {
      console.log('\n⚠️  NO TOAST NOTIFICATIONS DETECTED');
      console.log('This could mean:');
      console.log('  - Error handling is silent (no user feedback)');
      console.log('  - Toast appeared and disappeared before checks');
      console.log('  - Toast uses different markup than expected');
      console.log('  - Request succeeded (no error occurred)');
    }
    
    // Check console for API errors
    const apiErrors = consoleMessages.filter(m => 
      m.type === 'error' && 
      (m.text.includes('fetch') || m.text.includes('API') || m.text.includes('500') || m.text.includes('400'))
    );
    
    if (apiErrors.length > 0) {
      console.log(`\nAPI errors in console: ${apiErrors.length}`);
      apiErrors.forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.text.substring(0, 120)}`);
      });
    }
    
    console.log('\n═══════════════════════════════════════════════════════');
    
    if (toastFound) {
      console.log('  RESULT: ✅ ERROR TOAST APPEARED');
      console.log('  User receives feedback when AI generation fails');
    } else if (loadingEnded) {
      console.log('  RESULT: ⚠️  NO ERROR TOAST (but loading ended)');
      console.log('  Error may be handled silently or succeeded');
    } else {
      console.log('  RESULT: ❌ NO FEEDBACK (still loading after 30s)');
      console.log('  User may be stuck in loading state');
    }
    console.log('═══════════════════════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ CRITICAL ERROR:', error.message);
    console.error('Stack:', error.stack);
    await page.screenshot({ path: 'ai-error-critical.png' });
  }
  
  console.log('\n\nKeeping browser open for 10 seconds for inspection...');
  await page.waitForTimeout(10000);
  await browser.close();
  console.log('\n✓ Test complete!');
})();
