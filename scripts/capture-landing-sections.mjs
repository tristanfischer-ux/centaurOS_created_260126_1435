#!/usr/bin/env node
/**
 * Captures screenshots of each major section of fractionalforge.app landing page.
 * Run: node scripts/capture-landing-sections.mjs
 */

import { chromium } from '@playwright/test';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://fractionalforge.app';
const OUTPUT_DIR = join(process.cwd(), 'landing-screenshots');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Navigating to ${BASE_URL}...`);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });

  const sections = [
    { id: '01-hero', label: 'Hero section', scrollY: 0 },
    { id: '02-problem', label: 'Problem section (Hardware Trap)', scrollY: 900 },
    { id: '03-calculator', label: 'Traditional vs Fractional / savings', scrollY: 1800 },
    { id: '04-solution', label: 'Solution / Fractional Model', scrollY: 2700 },
    { id: '05-how-project-works', label: 'How a project works', scrollY: 3600 },
    { id: '06-metrics', label: 'Platform capabilities / metrics', scrollY: 4500 },
    { id: '07-how-it-works', label: 'How it works 3-step', scrollY: 5400 },
    { id: '08-manufacturing', label: 'Manufacturing network', scrollY: 6300 },
    { id: '09-pricing', label: 'Pricing section', scrollY: 7200 },
    { id: '10-faq', label: 'FAQ section', scrollY: 8100 },
    { id: '11-cta', label: 'Final CTA section', scrollY: 9000 },
    { id: '12-footer', label: 'Footer', scrollY: 9900 },
  ];

  // Full page screenshot first
  await page.screenshot({ path: join(OUTPUT_DIR, '00-full-page.png'), fullPage: true });
  console.log('Saved: 00-full-page.png');

  // Scroll to and capture each section
  for (const { id, label, scrollY } of sections) {
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUTPUT_DIR, `${id}.png`) });
    console.log(`Saved: ${id}.png (${label})`);
  }

  await browser.close();
  console.log(`\nDone. Screenshots saved to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
