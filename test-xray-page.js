/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Quick test script to verify Product X-Ray page renders correctly
 */

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  // Set viewport
  await page.setViewport({ width: 1920, height: 1080 });
  
  console.log('Navigating to http://localhost:3000/product-xray...');
  
  try {
    // Navigate and wait for network idle
    await page.goto('http://localhost:3000/product-xray', {
      waitUntil: 'networkidle2',
      timeout: 10000
    });
    
    console.log('✓ Page loaded');
    
    // Check for key elements
    const checks = {
      heading: await page.$('h1::-p-text(Product X-Ray)'),
      tabs: await page.$('[role="tablist"]'),
      scanInput: await page.$('input[type="text"]'),
      modules: await page.$$('[data-module-card]'),
    };
    
    console.log('\n=== Element Checks ===');
    console.log('✓ Heading "Product X-Ray":', checks.heading ? 'FOUND' : 'NOT FOUND');
    console.log('✓ Tab bar:', checks.tabs ? 'FOUND' : 'NOT FOUND');
    console.log('✓ Scan input:', checks.scanInput ? 'FOUND' : 'NOT FOUND');
    console.log('✓ Module cards:', checks.modules.length, 'found');
    
    // Get console messages
    const logs = [];
    const errors = [];
    
    page.on('console', msg => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        errors.push(text);
      } else {
        logs.push(`[${type}] ${text}`);
      }
    });
    
    // Wait a bit for any console messages
    await page.waitForTimeout(2000);
    
    console.log('\n=== Console Messages ===');
    if (errors.length > 0) {
      console.log('ERRORS:');
      errors.forEach(err => console.log('  ❌', err));
    } else {
      console.log('✓ No console errors');
    }
    
    // Take screenshot
    await page.screenshot({ 
      path: 'xray-page-screenshot.png',
      fullPage: true 
    });
    console.log('\n✓ Screenshot saved to xray-page-screenshot.png');
    
    // Get page text content
    const pageText = await page.evaluate(() => document.body.innerText);
    console.log('\n=== Page Text (first 500 chars) ===');
    console.log(pageText.substring(0, 500));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
})();
