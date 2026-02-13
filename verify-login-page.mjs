import { chromium } from '@playwright/test';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3000/login');
  await page.waitForLoadState('networkidle');
  
  // Take screenshot
  await page.screenshot({ 
    path: 'login-page-verification.png',
    fullPage: true 
  });
  
  // Check for key elements
  const checks = {
    heroCarousel: await page.locator('[data-testid="hero-carousel"]').isVisible().catch(() => false),
    brandLabel: await page.locator('text=Fractional Forge').isVisible().catch(() => false),
    welcomeHeadline: await page.locator('text=Welcome back, builder.').isVisible().catch(() => false),
    subtext: await page.locator('text=Your foundry is waiting.').isVisible().catch(() => false),
    emailField: await page.locator('input[type="email"]').isVisible().catch(() => false),
    passwordField: await page.locator('input[type="password"]').isVisible().catch(() => false),
    submitButton: await page.locator('button:has-text("Enter the Forge")').isVisible().catch(() => false),
    socialProof: await page.locator('text=/Trusted by.*founding members/i').isVisible().catch(() => false),
  };
  
  console.log('Login Page Verification:');
  console.log(JSON.stringify(checks, null, 2));
  
  await browser.close();
})();
