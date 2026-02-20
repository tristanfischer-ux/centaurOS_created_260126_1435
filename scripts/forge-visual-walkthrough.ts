/**
 * @file forge-visual-walkthrough.ts
 * 
 * @description Automated visual walkthrough of The Forge section.
 * Takes screenshots of all Forge pages and generates a report.
 * 
 * Usage:
 *   npx tsx scripts/forge-visual-walkthrough.ts
 */

import { chromium, type Browser, type Page } from 'playwright'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

const LOGIN_URL = 'http://localhost:3000/login'
const EMAIL = 'demo.founder@forgeos.io'
const PASSWORD = 'DemoFounder2026!'

interface PageReport {
  url: string
  title: string
  screenshotPath: string
  description: string
  issues: string[]
  hasContent: boolean
  looksProfessional: boolean
  sidebarVisible: boolean
  errorMessages: string[]
}

const PAGES_TO_TEST = [
  { url: '/the-forge', name: 'Forge Landing' },
  { url: '/the-forge/cad-lab', name: 'CAD Lab' },
  { url: '/the-forge/cad-lab/build', name: 'CAD Lab - Build' },
  { url: '/the-forge/cad-lab/analysis', name: 'CAD Lab - Analysis' },
  { url: '/the-forge/cad-lab/procurement', name: 'CAD Lab - Procurement' },
  { url: '/the-forge/cad-lab/review', name: 'CAD Lab - Review' },
  { url: '/the-forge/cad-lab/mashup', name: 'CAD Lab - Mashup' },
  { url: '/the-forge/cad-lab/templates', name: 'CAD Lab - Templates' },
  { url: '/the-forge/assembly-builder', name: 'Assembly Builder' },
  { url: '/the-forge/components', name: 'Component Library' },
]

async function login(page: Page): Promise<void> {
  console.log('🔐 Logging in...')
  await page.goto(LOGIN_URL)
  await page.waitForLoadState('networkidle')
  
  // Wait for form to be visible
  await page.waitForSelector('input[name="email"]', { timeout: 10000 })
  
  // Fill in login form
  await page.fill('input[name="email"]', EMAIL)
  await page.fill('input[name="password"]', PASSWORD)
  
  // Click login button (uses formAction, not type="submit")
  await page.click('button:has-text("Enter the Forge")')
  
  // Wait for navigation to complete
  await page.waitForURL('**/today', { timeout: 15000 })
  console.log('✅ Login successful')
}

async function analyzePage(page: Page, url: string, name: string): Promise<PageReport> {
  console.log(`\n📸 Analyzing: ${name}`)
  console.log(`   URL: ${url}`)
  
  await page.goto(`http://localhost:3000${url}`)
  await page.waitForLoadState('networkidle')
  
  // Wait a bit for any animations/loading
  await page.waitForTimeout(1000)
  
  // Take screenshot
  const screenshotDir = join(process.cwd(), 'screenshots', 'forge-walkthrough')
  await mkdir(screenshotDir, { recursive: true })
  const screenshotPath = join(screenshotDir, `${name.toLowerCase().replace(/\s+/g, '-')}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true })
  console.log(`   📷 Screenshot saved: ${screenshotPath}`)
  
  // Analyze page
  const title = await page.title()
  
  // Check for content
  const bodyText = await page.textContent('body')
  const hasContent = bodyText ? bodyText.trim().length > 100 : false
  
  // Check for sidebar
  const sidebarVisible = await page.isVisible('nav[aria-label="Main navigation"]').catch(() => false)
  
  // Check for error messages
  const errorMessages: string[] = []
  const errorElements = await page.locator('[role="alert"], .error, .text-destructive').all()
  for (const el of errorElements) {
    const text = await el.textContent()
    if (text) errorMessages.push(text.trim())
  }
  
  // Check for console errors
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text())
    }
  })
  
  // Visual analysis
  const description = await generateDescription(page)
  const issues = await detectIssues(page)
  const looksProfessional = issues.length === 0 && hasContent
  
  return {
    url,
    title,
    screenshotPath,
    description,
    issues,
    hasContent,
    looksProfessional,
    sidebarVisible,
    errorMessages,
  }
}

async function generateDescription(page: Page): Promise<string> {
  // Get page header
  const h1 = await page.locator('h1').first().textContent().catch(() => null)
  
  // Count major elements
  const cardCount = await page.locator('[class*="card"]').count()
  const buttonCount = await page.locator('button').count()
  const linkCount = await page.locator('a').count()
  
  // Check for empty state
  const hasEmptyState = await page.locator('text=/no.*yet|empty|get started/i').count() > 0
  
  let description = ''
  if (h1) description += `Page header: "${h1}". `
  description += `Contains ${cardCount} cards, ${buttonCount} buttons, ${linkCount} links. `
  if (hasEmptyState) description += 'Shows empty state. '
  
  return description
}

async function detectIssues(page: Page): Promise<string[]> {
  const issues: string[] = []
  
  // Check for overlapping elements (simplified check)
  const overlapping = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'))
    // This is a simplified check - real overlap detection is complex
    return elements.length > 1000 ? ['Too many DOM elements (>1000)'] : []
  })
  issues.push(...overlapping)
  
  // Check for broken images
  const brokenImages = await page.locator('img[alt]').evaluateAll((imgs) => {
    return imgs.filter((img: any) => !img.complete || img.naturalHeight === 0).length
  })
  if (brokenImages > 0) {
    issues.push(`${brokenImages} broken images`)
  }
  
  // Check for missing alt text
  const missingAlt = await page.locator('img:not([alt])').count()
  if (missingAlt > 0) {
    issues.push(`${missingAlt} images missing alt text`)
  }
  
  // Check for very small text
  const tinyText = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('*'))
    return elements.filter((el) => {
      const style = window.getComputedStyle(el)
      const fontSize = parseFloat(style.fontSize)
      return fontSize < 10
    }).length
  })
  if (tinyText > 0) {
    issues.push(`${tinyText} elements with text smaller than 10px`)
  }
  
  return issues
}

async function generateReport(reports: PageReport[]): Promise<string> {
  let markdown = '# The Forge Visual Walkthrough Report\n\n'
  markdown += `**Date:** ${new Date().toISOString()}\n`
  markdown += `**Pages Tested:** ${reports.length}\n\n`
  
  markdown += '## Summary\n\n'
  const totalIssues = reports.reduce((sum, r) => sum + r.issues.length, 0)
  const pagesWithContent = reports.filter(r => r.hasContent).length
  const pagesWithSidebar = reports.filter(r => r.sidebarVisible).length
  const professionalPages = reports.filter(r => r.looksProfessional).length
  
  markdown += `- ✅ Pages with content: ${pagesWithContent}/${reports.length}\n`
  markdown += `- ✅ Pages with sidebar: ${pagesWithSidebar}/${reports.length}\n`
  markdown += `- ✅ Professional appearance: ${professionalPages}/${reports.length}\n`
  markdown += `- ⚠️ Total issues found: ${totalIssues}\n\n`
  
  markdown += '---\n\n'
  
  for (const report of reports) {
    markdown += `## ${report.url}\n\n`
    markdown += `**Title:** ${report.title}\n\n`
    markdown += `**Screenshot:** \`${report.screenshotPath}\`\n\n`
    
    markdown += '### Visual Analysis\n\n'
    markdown += `${report.description}\n\n`
    
    markdown += '### Checklist\n\n'
    markdown += `- [${report.hasContent ? 'x' : ' '}] Has content\n`
    markdown += `- [${report.sidebarVisible ? 'x' : ' '}] Sidebar visible\n`
    markdown += `- [${report.looksProfessional ? 'x' : ' '}] Looks professional\n`
    markdown += `- [${report.errorMessages.length === 0 ? 'x' : ' '}] No error messages\n`
    markdown += `- [${report.issues.length === 0 ? 'x' : ' '}] No visual issues\n\n`
    
    if (report.issues.length > 0) {
      markdown += '### Issues Found\n\n'
      for (const issue of report.issues) {
        markdown += `- ⚠️ ${issue}\n`
      }
      markdown += '\n'
    }
    
    if (report.errorMessages.length > 0) {
      markdown += '### Error Messages\n\n'
      for (const msg of report.errorMessages) {
        markdown += `- ❌ ${msg}\n`
      }
      markdown += '\n'
    }
    
    markdown += '---\n\n'
  }
  
  return markdown
}

async function main(): Promise<void> {
  console.log('🚀 Starting Forge Visual Walkthrough\n')
  
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  })
  const page = await context.newPage()
  
  try {
    // Login
    await login(page)
    
    // Test each page
    const reports: PageReport[] = []
    for (const { url, name } of PAGES_TO_TEST) {
      const report = await analyzePage(page, url, name)
      reports.push(report)
    }
    
    // Generate report
    console.log('\n📝 Generating report...')
    const reportMarkdown = await generateReport(reports)
    const reportPath = join(process.cwd(), 'FORGE_VISUAL_WALKTHROUGH_RESULTS.md')
    await writeFile(reportPath, reportMarkdown)
    console.log(`✅ Report saved: ${reportPath}`)
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('WALKTHROUGH COMPLETE')
    console.log('='.repeat(60))
    console.log(`\n📊 Results:`)
    console.log(`   - Pages tested: ${reports.length}`)
    console.log(`   - Total issues: ${reports.reduce((sum, r) => sum + r.issues.length, 0)}`)
    console.log(`   - Screenshots: screenshots/forge-walkthrough/`)
    console.log(`   - Report: ${reportPath}\n`)
    
  } catch (error) {
    console.error('❌ Error during walkthrough:', error)
    throw error
  } finally {
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
