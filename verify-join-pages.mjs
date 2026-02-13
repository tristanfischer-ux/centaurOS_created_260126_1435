import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const pages = [
    { url: 'http://localhost:3000/join/founder', name: 'founder' },
    { url: 'http://localhost:3000/join/executive', name: 'executive' },
    { url: 'http://localhost:3000/join/apprentice', name: 'apprentice' },
  ];
  
  for (const pageInfo of pages) {
    console.log(`\n=== Checking ${pageInfo.name} page ===`);
    await page.goto(pageInfo.url);
    await page.waitForLoadState('networkidle');
    
    // Take screenshot
    await page.screenshot({ 
      path: `join-${pageInfo.name}-verification.png`,
      fullPage: true 
    });
    
    // Check for key elements
    const checks = {
      lightTheme: await page.locator('body').evaluate(el => {
        const bg = window.getComputedStyle(el).backgroundColor;
        return bg.includes('255') || bg.includes('white');
      }),
      heroImage: await page.locator('img[alt*="hero" i], img[alt*="' + pageInfo.name + '" i]').count() > 0,
      foundingCounter: await page.locator('text=/\\d+\\s+of\\s+100\\s+spots/i').isVisible().catch(() => false),
      benefitsList: await page.locator('svg[class*="check"], [class*="check-circle"]').count(),
      ctaButton: await page.locator('button, a').filter({ hasText: /join|apply|get started/i }).count(),
    };
    
    // Check for role-specific headlines
    let headline = '';
    if (pageInfo.name === 'founder') {
      headline = await page.locator('text=/YOUR VISION.*OUR OPERATING SYSTEM/i').isVisible().catch(() => false) ? 'Found' : 'Not found';
    } else if (pageInfo.name === 'executive') {
      headline = await page.locator('text=/YOUR EXPERTISE IS UNDERPRICED/i').isVisible().catch(() => false) ? 'Found' : 'Not found';
    } else if (pageInfo.name === 'apprentice') {
      headline = await page.locator('text=/YOU.*RE NOT JUNIOR/i').isVisible().catch(() => false) ? 'Found' : 'Not found';
    }
    
    // Check for orange colors
    const orangeElements = await page.locator('[class*="orange"], [class*="accent"]').count();
    
    console.log(JSON.stringify({
      ...checks,
      headline,
      orangeElements,
    }, null, 2));
  }
  
  await browser.close();
  console.log('\n✅ All screenshots captured!');
})();
