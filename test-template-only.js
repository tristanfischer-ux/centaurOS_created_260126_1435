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
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('401')) {
      consoleErrors.push(msg.text());
      console.log(`[ERROR] ${msg.text()}`);
    }
  });

  try {
    // Login
    console.log('═══════════════════════════════════════');
    console.log('    TEMPLATE GALLERY TEST');
    console.log('═══════════════════════════════════════\n');
    
    await page.goto('http://localhost:3000/login');
    await page.fill('input[type="email"]', 'demo.founder@forgeos.io');
    await page.fill('input[type="password"]', 'DemoFounder2026!');
    await page.locator('button:has-text("Access Foundry")').click();
    await page.waitForTimeout(4000);
    console.log('✓ Logged in\n');

    // Navigate to plan
    console.log('Step 1: Navigate to /plan');
    await page.goto('http://localhost:3000/plan');
    await page.waitForTimeout(3000);
    
    // AGGRESSIVELY close all dialogs
    console.log('  Closing all dialogs...');
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }
    await page.waitForTimeout(2000);
    console.log('  ✓ Dialogs closed\n');
    
    // Check for dialog overlays
    const overlayCheck = await page.locator('[class*="fixed inset-0"][class*="z-50"]').count();
    console.log(`  Dialog overlays remaining: ${overlayCheck}`);
    
    // Step 2: Scroll to templates
    console.log('\nStep 2: Scroll to Plan Templates');
    const templateHeading = page.locator('text="Plan Templates"');
    await templateHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    console.log('  ✓ Scrolled to templates\n');
    
    // Step 3: Screenshot of template cards
    console.log('Step 3: Screenshot of template cards');
    await page.screenshot({ path: 'templates-cards-view.png' });
    console.log('  ✓ Screenshot: templates-cards-view.png');
    
    // List templates
    const templates = await page.locator('h3, h4').filter({ hasText: /Launch|Campaign|Fundraising|MVP|Event|Playbook|Store|Legal|Compliance|Hires/i }).allTextContents();
    console.log(`\n  Visible templates (${templates.length}):`);
    templates.forEach((t, i) => console.log(`    ${i + 1}. ${t.trim()}`));
    
    // Step 4: Click template card
    console.log('\nStep 4: Click on template card');
    console.log('  Attempting to click "Startup Launch Playbook"...');
    
    // Try direct click on the card
    const startupCard = page.locator('text="Startup Launch Playbook"').locator('xpath=ancestor::div[contains(@class, "group")]').first();
    
    try {
      await startupCard.click({ force: true, timeout: 3000 });
      console.log('  ✓ Card clicked (force)');
    } catch (e) {
      console.log(`  ✗ Force click failed: ${e.message.substring(0, 100)}`);
      
      // Try clicking the text directly
      try {
        await page.locator('text="Startup Launch Playbook"').first().click({ force: true, timeout: 3000 });
        console.log('  ✓ Text clicked (force)');
      } catch (e2) {
        console.log(`  ✗ Text click failed: ${e2.message.substring(0, 100)}`);
      }
    }
    
    await page.waitForTimeout(3000);
    
    // Step 5: Check for preview dialog
    console.log('\nStep 5: Check for preview dialog');
    const dialog = page.locator('[role="dialog"]');
    const dialogCount = await dialog.count();
    console.log(`  Dialog detected: ${dialogCount > 0 ? '✓ YES' : '✗ NO'}`);
    
    if (dialogCount > 0) {
      await page.screenshot({ path: 'template-preview-dialog.png', fullPage: true });
      console.log('  ✓ Screenshot: template-preview-dialog.png\n');
      
      // Step 6: Analyze dialog
      console.log('Step 6: Analyze dialog content');
      
      const dialogText = await dialog.first().textContent();
      
      // Get title
      const title = await dialog.locator('h2, h3, [class*="dialog-title"]').first().textContent().catch(() => 'Not found');
      console.log(`  a) Template name: "${title.trim()}"`);
      
      // Check for description
      const descMatch = dialogText.match(/(.{50,200})/);
      const hasDesc = dialogText.length > 200;
      console.log(`  b) Description: ${hasDesc ? '✓ YES' : '✗ NO'}`);
      if (hasDesc && descMatch) {
        console.log(`     Preview: "${descMatch[0].substring(0, 100).trim()}..."`);
      }
      
      // Check for phases
      const phaseMatch = dialogText.match(/Phase \d+|Week \d+|Milestone/i);
      console.log(`  c) Phases breakdown: ${phaseMatch ? `✓ YES (${phaseMatch[0]})` : '✗ NO'}`);
      
      // Check for task counts
      const taskMatch = dialogText.match(/(\d+)\s*task/i);
      console.log(`  d) Task counts: ${taskMatch ? `✓ YES (${taskMatch[0]})` : '✗ NO'}`);
      
      // Check for deploy button
      const deployBtn = await dialog.locator('button:has-text("Deploy"), button:has-text("Use Template"), button:has-text("Apply")').count();
      console.log(`  e) Deploy/Use Template button: ${deployBtn > 0 ? '✓ YES' : '✗ NO'}`);
      
      // List all buttons
      const buttons = await dialog.locator('button').allTextContents();
      console.log(`\n  All dialog buttons (${buttons.length}):`);
      buttons.forEach((btn, i) => {
        const text = btn.trim();
        if (text) console.log(`    ${i + 1}. "${text}"`);
      });
      
      // Step 7-10: Deploy template
      if (deployBtn > 0) {
        console.log('\nStep 7: Click deploy button');
        const deployButton = dialog.locator('button:has-text("Deploy"), button:has-text("Use Template"), button:has-text("Apply")').first();
        const btnText = await deployButton.textContent();
        console.log(`  Clicking: "${btnText.trim()}"`);
        
        await deployButton.click();
        console.log('  ✓ Button clicked');
        
        console.log('\nStep 8: Wait up to 20 seconds');
        await page.waitForTimeout(3000);
        
        // Check for loading
        const loading = await page.locator('text=/Deploying|Creating|Generating/i').count();
        if (loading > 0) {
          console.log('  ✓ Loading state detected');
          await page.screenshot({ path: 'template-deploying.png' });
          console.log('  ✓ Screenshot: template-deploying.png');
          await page.waitForTimeout(15000);
        } else {
          await page.waitForTimeout(5000);
        }
        
        console.log('\nStep 9: Screenshot after deploy');
        await page.screenshot({ path: 'template-after-deploy.png', fullPage: true });
        console.log('  ✓ Screenshot: template-after-deploy.png');
        
        console.log('\nStep 10: Analyze result');
        const newUrl = page.url();
        console.log(`  Current URL: ${newUrl}`);
        console.log(`  Redirected: ${!newUrl.includes('/plan') ? '✓ YES' : '✗ NO'}`);
        
        if (!newUrl.includes('/plan')) {
          console.log(`    New location: ${newUrl}`);
        }
        
        // Check for success/error
        const bodyText = await page.locator('body').textContent();
        const success = bodyText.toLowerCase().includes('success') || bodyText.toLowerCase().includes('created');
        const error = bodyText.toLowerCase().includes('error') || bodyText.toLowerCase().includes('failed');
        
        console.log(`  Success indicator: ${success ? '✓ YES' : '✗ NO'}`);
        console.log(`  Error indicator: ${error ? '✗ YES' : '✓ NO'}`);
        
        // Check if objectives created
        const onObjectivesPage = newUrl.includes('objective');
        const objectiveCards = await page.locator('[class*="objective-card"], h3, h4').count();
        
        console.log(`  On objectives page: ${onObjectivesPage ? '✓ YES' : '✗ NO'}`);
        console.log(`  New objective cards: ${objectiveCards}`);
        
        // Check for toast
        const toast = await page.locator('[class*="sonner"], [role="status"]').count();
        if (toast > 0) {
          const toastText = await page.locator('[class*="sonner"], [role="status"]').first().textContent();
          console.log(`  Toast message: "${toastText.trim()}"`);
        }
        
        console.log('\n  ═══════════════════════════════════');
        if (success || onObjectivesPage) {
          console.log('  RESULT: ✅ OBJECTIVES CREATED');
        } else if (error) {
          console.log('  RESULT: ❌ ERROR OCCURRED');
        } else {
          console.log('  RESULT: ⚠️  UNCLEAR (no redirect)');
        }
        console.log('  ═══════════════════════════════════');
      }
      
    } else {
      console.log('  ❌ Dialog did not open - cannot test deploy');
      
      // Check if there's still an overlay
      const stillBlocked = await page.locator('[class*="fixed inset-0"][class*="z-50"]').count();
      console.log(`  Dialog overlay still present: ${stillBlocked > 0 ? 'YES (blocking clicks)' : 'NO'}`);
    }

    console.log('\n═══════════════════════════════════════');
    console.log(`Console errors: ${consoleErrors.length}`);
    console.log('═══════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    await page.screenshot({ path: 'template-error.png' });
  }
  
  console.log('\nKeeping browser open for 15 seconds...');
  await page.waitForTimeout(15000);
  await browser.close();
})();
