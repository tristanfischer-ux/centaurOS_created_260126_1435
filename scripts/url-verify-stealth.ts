/**
 * @file url-verify-stealth.ts — Verify part-URL validity by opening each
 * URL in a real headless Chromium with the stealth plugin (bypasses
 * Cloudflare / Akamai bot detection that breaks naive HEAD checks).
 *
 * Tristan directive 2026-05-16: "Don't we have other browsers or access to
 * websites which use anonymity, so you don't know that you are not a human?"
 *
 * Implementation:
 *   - playwright-extra + puppeteer-extra-plugin-stealth
 *   - Realistic browser fingerprint (UA, viewport, Accept-Language)
 *   - Navigate, wait for network-idle, grace period for JS challenges
 *   - Extract: final URL, page title, body excerpt
 *   - Verdict: real_product_page / waf_resolved / wrong_product / dead /
 *     waf_unresolved
 */

import { chromium as playwrightChromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

// Apply the stealth plugin to playwright's chromium
playwrightChromium.use(stealth())

export type UrlVerdict =
  | 'real_product_page'   // Page loaded, body contains expected terms
  | 'waf_resolved'        // Initial WAF challenge then real page
  | 'wrong_product'       // Page loaded but doesn't reference the expected part
  | 'dead'                // 404 or hard error
  | 'waf_unresolved'      // WAF challenge never cleared in time
  | 'timeout'             // Took >30s

export interface UrlVerifyResult {
  url: string
  verdict: UrlVerdict
  status_code: number | null
  final_url: string | null
  page_title: string | null
  body_snippet: string | null
  expected_terms_found: string[]
  ms_elapsed: number
  screenshot_path?: string
  error?: string
}

interface VerifyOpts {
  expectedTerms?: string[]  // strings expected to appear on the real page
  timeoutMs?: number
  screenshotDir?: string  // if set, save screenshot for inspection
}

const NAV_TIMEOUT_MS = 25_000
const WAF_GRACE_MS = 4_000  // wait this long after networkidle for slow JS challenges

const WAF_BODY_SIGNATURES = [
  'Just a moment',
  'Checking your browser',
  'Verifying you are human',
  'Please verify you are human',
  'cf-mitigated',
  'cf-challenge',
  'Access denied',
  '/cdn-cgi/challenge',
  'Ray ID',
  'enable JavaScript and cookies',
  'Distil Networks',
  'PerimeterX',
  'akamai-bm-block',
]

const DEAD_BODY_SIGNATURES = [
  'page not found',
  '404 not found',
  'sorry, page not found',
  'we couldn\'t find',
  'product not found',
  'product was not found',
  'this page no longer exists',
  'item not available',
]

export async function verifyUrlsStealth(
  inputs: Array<{ url: string; expectedTerms?: string[] }>,
  opts: VerifyOpts = {},
): Promise<UrlVerifyResult[]> {
  const browser = await playwrightChromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'en-GB',
    timezoneId: 'Europe/London',
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1',
    },
  })

  const results: UrlVerifyResult[] = []

  for (const input of inputs) {
    const t0 = Date.now()
    const expected = (input.expectedTerms ?? []).map(t => t.toLowerCase())
    const page = await context.newPage()
    let result: UrlVerifyResult = {
      url: input.url,
      verdict: 'dead',
      status_code: null,
      final_url: null,
      page_title: null,
      body_snippet: null,
      expected_terms_found: [],
      ms_elapsed: 0,
    }
    try {
      const response = await page.goto(input.url, {
        waitUntil: 'domcontentloaded',
        timeout: opts.timeoutMs ?? NAV_TIMEOUT_MS,
      })
      result.status_code = response?.status() ?? null

      // Wait for network-idle (max 8s) for the page to fully render
      try {
        await page.waitForLoadState('networkidle', { timeout: 8_000 })
      } catch {
        // Some pages keep websockets open — that's fine
      }

      // Grace period for JS-based WAF challenges to resolve
      await page.waitForTimeout(WAF_GRACE_MS)

      result.final_url = page.url()
      result.page_title = (await page.title()).slice(0, 200)

      // Extract body text (innerText of <body>)
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 6000) ?? '')
      result.body_snippet = bodyText.slice(0, 800)
      const bodyLower = bodyText.toLowerCase()

      // Check for expected part-number/manufacturer terms
      const found = expected.filter(t => t.length >= 3 && (bodyLower.includes(t) || result.page_title?.toLowerCase().includes(t)))
      result.expected_terms_found = found

      // Verdict logic
      const wafHit = WAF_BODY_SIGNATURES.some(sig => bodyText.includes(sig))
      const deadHit = DEAD_BODY_SIGNATURES.some(sig => bodyLower.includes(sig))

      if (deadHit && found.length === 0) {
        result.verdict = 'dead'
      } else if (wafHit && found.length === 0) {
        result.verdict = 'waf_unresolved'
      } else if (wafHit && found.length > 0) {
        // WAF tag present but body also has the part — challenge resolved enough
        result.verdict = 'waf_resolved'
      } else if (found.length >= (expected.length > 0 ? 1 : 0) && result.status_code && result.status_code < 400) {
        result.verdict = 'real_product_page'
      } else if (result.status_code && result.status_code < 400 && expected.length > 0 && found.length === 0) {
        result.verdict = 'wrong_product'
      } else if (result.status_code === 404) {
        result.verdict = 'dead'
      } else {
        result.verdict = 'wrong_product'
      }

      // Optional screenshot
      if (opts.screenshotDir) {
        const fs = await import('fs')
        const path = await import('path')
        fs.mkdirSync(opts.screenshotDir, { recursive: true })
        const slug = input.url.replace(/[^a-z0-9]/gi, '_').slice(-60)
        const shotPath = path.resolve(opts.screenshotDir, slug + '.png')
        await page.screenshot({ path: shotPath, fullPage: false })
        result.screenshot_path = shotPath
      }
    } catch (e) {
      result.error = (e as Error).message.slice(0, 200)
      if (result.error.includes('Timeout')) {
        result.verdict = 'timeout'
      } else if (result.error.includes('Download is starting')) {
        // Playwright throws this when a URL triggers a file download (typically
        // a PDF datasheet). The URL is real and valid — it just doesn't render
        // as HTML. Treat as a real product reference rather than dead.
        result.verdict = 'real_product_page'
      }
    } finally {
      await page.close()
      result.ms_elapsed = Date.now() - t0
      results.push(result)
    }
  }

  await context.close()
  await browser.close()
  return results
}

// ─── CLI ──────────────────────────────────────────────────────────────────
//
// Usage:
//   npx tsx scripts/url-verify-stealth.ts --state <path-to-state.json> --sample 15
//
// Samples N random parts from state.json that have a source_url, verifies
// each in stealth Chromium, prints a per-method summary.

if (require.main === module) {
  ;(async () => {
    const args = process.argv.slice(2)
    const stateIdx = args.indexOf('--state')
    const sampleIdx = args.indexOf('--sample')
    const dirIdx = args.indexOf('--screenshots')
    if (stateIdx < 0) { console.error('Usage: --state <path> [--sample N] [--screenshots <dir>]'); process.exit(1) }
    const statePath = args[stateIdx + 1]
    const sampleN = sampleIdx > 0 ? parseInt(args[sampleIdx + 1], 10) : 15
    const screenshotDir = dirIdx > 0 ? args[dirIdx + 1] : undefined

    const fs = await import('fs')
    const state: any = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const all: Array<{ url: string; mfr: string; pn: string; method: string }> = []
    for (const v of (state.partVerifications || [])) {
      if (v.source_url && v.status === 'verified') {
        all.push({ url: v.source_url, mfr: v.manufacturer, pn: v.part_number, method: v.source_method ?? 'unknown' })
      }
    }
    for (const r of (state.partRecommendations || [])) {
      if (r.source_url) {
        all.push({ url: r.source_url, mfr: r.recommended_manufacturer ?? '?', pn: r.recommended_part_number ?? '?', method: 'recommender' })
      }
    }
    // Stratified-sample: try to get balanced coverage across methods
    const byMethod: Record<string, typeof all> = {}
    for (const u of all) (byMethod[u.method] ??= []).push(u)
    const sample: typeof all = []
    for (const m of Object.keys(byMethod)) {
      const shuffled = byMethod[m].sort(() => Math.random() - 0.5)
      sample.push(...shuffled.slice(0, Math.ceil(sampleN / Object.keys(byMethod).length)))
    }
    const final = sample.slice(0, sampleN)

    console.log(`Verifying ${final.length} URLs across ${Object.keys(byMethod).length} source methods (${all.length} eligible total)\n`)

    const inputs = final.map(s => ({ url: s.url, expectedTerms: [s.mfr, s.pn] }))
    const results = await verifyUrlsStealth(inputs, { screenshotDir })

    console.log('VERDICT     METHOD         MFR / PART                                STATUS TITLE/SNIPPET')
    console.log('-'.repeat(170))
    for (let i = 0; i < results.length; i++) {
      const r = results[i]
      const meta = final[i]
      const verdictColor = r.verdict === 'real_product_page' ? '✓' : (r.verdict === 'waf_resolved' ? '~' : '✗')
      const title = (r.page_title ?? r.body_snippet ?? r.error ?? '').replace(/\s+/g, ' ').slice(0, 60)
      console.log(`${verdictColor} ${r.verdict.padEnd(20)} ${meta.method.padEnd(12)} ${(meta.mfr + ' / ' + meta.pn).slice(0, 40).padEnd(40)} ${String(r.status_code ?? '-').padEnd(4)} ${title}`)
    }

    // Per-method breakdown
    console.log('\nPer-method:')
    const breakdown: Record<string, Record<string, number>> = {}
    for (let i = 0; i < results.length; i++) {
      const m = final[i].method
      breakdown[m] ??= {}
      breakdown[m][results[i].verdict] = (breakdown[m][results[i].verdict] ?? 0) + 1
    }
    for (const [m, verdicts] of Object.entries(breakdown)) {
      const total = Object.values(verdicts).reduce((a, b) => a + b, 0)
      const real = (verdicts.real_product_page ?? 0) + (verdicts.waf_resolved ?? 0)
      console.log(`  ${m.padEnd(15)} ${real}/${total} OK   ${JSON.stringify(verdicts)}`)
    }

    // Overall
    const okCount = results.filter(r => r.verdict === 'real_product_page' || r.verdict === 'waf_resolved').length
    console.log(`\nOVERALL: ${okCount}/${results.length} OK (${Math.round(okCount / results.length * 100)}%)`)

    // Save raw JSON
    fs.writeFileSync(
      statePath.replace(/state\.json$/, 'stealth-url-audit.json'),
      JSON.stringify({ results, sampled: final, summary: breakdown, ok: okCount, total: results.length }, null, 2),
    )
  })().catch(e => { console.error(e); process.exit(1) })
}
