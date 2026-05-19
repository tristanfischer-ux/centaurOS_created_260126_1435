/**
 * @file verify-state-urls-stealth.tsx — Task #156: stealth content-verification
 * pass over every URL the PDF surfaces (from state.json files).
 *
 * The existing urlResolves() helper does HEAD only — it misses:
 *   - 200 OK login-walls / paywalls
 *   - 200 OK "this product is no longer available" pages
 *   - redirects that land on a marketing homepage instead of the specific page
 *
 * This script:
 *   1. Reads the URL list at /tmp/state-urls-extracted.json
 *   2. Opens each URL in the stealth Chromium (playwright-extra + stealth)
 *   3. Extracts page title, body snippet, final URL
 *   4. Flags suspicious pages: 404 / discontinued / login-walled / redirect-domain-change
 *   5. Writes /tmp/url-verification-2026-05-18.md report + raw JSON
 *
 * Read-only: never mutates the state.json files.
 */

import { readFileSync, writeFileSync } from 'fs'
import { chromium as playwrightChromium } from 'playwright-extra'
import stealth from 'puppeteer-extra-plugin-stealth'

playwrightChromium.use(stealth())

interface UrlInput {
  url: string
  expectedTerms: string[]
  bucket: string
  source_file: string
  context: string
}

type Flag =
  | 'ok'                      // looks healthy
  | 'broken_404'              // explicit not-found
  | 'discontinued'            // "no longer available" etc.
  | 'login_wall'              // requires auth to see content
  | 'paywall'                 // paid-content gate
  | 'redirect_off_domain'     // landed on different domain
  | 'redirect_to_homepage'    // landed on bare root (lost the deep link)
  | 'waf_unresolved'          // bot-detection challenge never cleared
  | 'timeout'                 // page never loaded
  | 'error'                   // network / playwright error

const NAV_TIMEOUT_MS = 25_000
const WAF_GRACE_MS = 4_000

const SIG_404 = [
  '404 not found', 'page not found', 'sorry, page not found',
  "we couldn't find", 'this page no longer exists', "couldn't be found",
  'no such page', 'page does not exist', 'oops! page not found',
]
const SIG_DISCONTINUED = [
  'discontinued', 'no longer available', 'no longer manufactured',
  'end of life', 'end-of-life', 'product not available',
  'item is no longer', 'has been replaced', 'has been superseded',
  'product was not found', 'not for new design', 'obsolete',
]
const SIG_LOGIN_WALL = [
  'sign in to continue', 'please sign in', 'log in to continue',
  'please log in', 'login required', 'authentication required',
  'create a free account to view', 'sign up to view', 'register to view',
  'sign in with your', 'access denied — sign in',
]
const SIG_PAYWALL = [
  'subscribe to read', 'subscribe to continue', 'this article is for subscribers',
  'unlock this article', 'premium subscribers', 'become a member to read',
  'paywall', 'subscription required',
]
const SIG_WAF = [
  'just a moment', 'checking your browser', 'verifying you are human',
  'please verify you are human', 'cf-mitigated', 'cf-challenge',
  '/cdn-cgi/challenge', 'ray id', 'enable javascript and cookies',
  'distil networks', 'perimeterx', 'akamai-bm-block',
]

function getHost(u: string): string {
  try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' }
}
function isRoot(u: string): boolean {
  try {
    const url = new URL(u)
    return url.pathname === '/' || url.pathname === ''
  } catch { return false }
}

interface VerifyResult {
  url: string
  bucket: string
  context: string
  final_url: string | null
  status_code: number | null
  page_title: string | null
  body_snippet: string | null
  expected_terms_found: string[]
  flag: Flag
  flag_evidence: string
  ms_elapsed: number
  error?: string
}

async function verifyOne(page: any, input: UrlInput): Promise<VerifyResult> {
  const t0 = Date.now()
  const expected = input.expectedTerms.map(t => t.toLowerCase()).filter(t => t.length >= 3)
  const r: VerifyResult = {
    url: input.url,
    bucket: input.bucket,
    context: input.context,
    final_url: null,
    status_code: null,
    page_title: null,
    body_snippet: null,
    expected_terms_found: [],
    flag: 'error',
    flag_evidence: '',
    ms_elapsed: 0,
  }
  try {
    const response = await page.goto(input.url, {
      waitUntil: 'domcontentloaded',
      timeout: NAV_TIMEOUT_MS,
    })
    r.status_code = response?.status() ?? null

    try {
      await page.waitForLoadState('networkidle', { timeout: 6_000 })
    } catch { /* ignore */ }
    await page.waitForTimeout(WAF_GRACE_MS)

    r.final_url = page.url()
    r.page_title = (await page.title()).slice(0, 200)
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 8000) ?? '')
    r.body_snippet = bodyText.slice(0, 800)

    const lower = (r.page_title + '\n' + bodyText).toLowerCase()
    r.expected_terms_found = expected.filter(t => lower.includes(t))

    // Verdict cascade — order matters
    const titleLower = (r.page_title ?? '').toLowerCase()

    // Explicit 404 in title or body
    if (r.status_code === 404 || SIG_404.some(s => titleLower.includes(s) || lower.includes(s))) {
      r.flag = 'broken_404'
      r.flag_evidence = `status=${r.status_code} title='${r.page_title}'`
      return r
    }

    // Discontinued / unavailable
    const discoHit = SIG_DISCONTINUED.find(s => lower.includes(s))
    if (discoHit) {
      r.flag = 'discontinued'
      r.flag_evidence = `keyword '${discoHit}'`
      return r
    }

    // Login-wall / paywall
    const loginHit = SIG_LOGIN_WALL.find(s => lower.includes(s))
    if (loginHit) {
      r.flag = 'login_wall'
      r.flag_evidence = `keyword '${loginHit}'`
      return r
    }
    const paywallHit = SIG_PAYWALL.find(s => lower.includes(s))
    if (paywallHit) {
      r.flag = 'paywall'
      r.flag_evidence = `keyword '${paywallHit}'`
      return r
    }

    // WAF unresolved
    const wafHit = SIG_WAF.find(s => bodyText.toLowerCase().includes(s))
    if (wafHit && r.expected_terms_found.length === 0) {
      r.flag = 'waf_unresolved'
      r.flag_evidence = `WAF challenge '${wafHit}' not cleared, no expected terms found`
      return r
    }

    // Redirect off domain
    const fromHost = getHost(input.url)
    const finalHost = getHost(r.final_url ?? input.url)
    if (fromHost && finalHost && fromHost !== finalHost) {
      r.flag = 'redirect_off_domain'
      r.flag_evidence = `${fromHost} → ${finalHost}`
      return r
    }

    // Redirect to root (homepage instead of deep link)
    if (!isRoot(input.url) && isRoot(r.final_url ?? input.url)) {
      r.flag = 'redirect_to_homepage'
      r.flag_evidence = `${input.url} → ${r.final_url}`
      return r
    }

    // If we have expected terms and none appeared, mark as redirect/suspicious
    if (expected.length > 0 && r.expected_terms_found.length === 0 && r.status_code && r.status_code < 400) {
      // Soft signal — be cautious. Mark redirect_to_homepage if path looks lost.
      r.flag = 'redirect_to_homepage'
      r.flag_evidence = `expected terms ${JSON.stringify(expected)} not found in title/body`
      return r
    }

    r.flag = 'ok'
    r.flag_evidence = ''
    return r
  } catch (e) {
    const msg = (e as Error).message
    r.error = msg.slice(0, 200)
    if (msg.includes('Timeout')) {
      r.flag = 'timeout'
      r.flag_evidence = `nav timeout >${NAV_TIMEOUT_MS}ms`
    } else if (msg.includes('Download is starting')) {
      // PDF datasheet — treat as OK; URL is live, just doesn't render HTML
      r.flag = 'ok'
      r.flag_evidence = 'pdf-download'
    } else {
      r.flag = 'error'
      r.flag_evidence = msg.slice(0, 120)
    }
    return r
  } finally {
    r.ms_elapsed = Date.now() - t0
  }
}

;(async () => {
  const inputs: UrlInput[] = JSON.parse(readFileSync('/tmp/state-urls-extracted.json', 'utf8'))
  const args = process.argv.slice(2)
  const limitIdx = args.indexOf('--limit')
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity
  const selected = inputs.slice(0, limit)

  console.log(`stealth-verify: ${selected.length}/${inputs.length} URLs, est ${Math.ceil(selected.length * 18 / 60)} min`)
  console.log('')

  const browser = await playwrightChromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
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

  const results: VerifyResult[] = []
  for (let i = 0; i < selected.length; i++) {
    const input = selected[i]
    const page = await context.newPage()
    const r = await verifyOne(page, input)
    await page.close()
    results.push(r)
    const t = (r.page_title ?? r.body_snippet ?? '').replace(/\s+/g, ' ').slice(0, 60)
    console.log(`[${String(i + 1).padStart(3)}/${selected.length}] ${r.flag.padEnd(20)} ${input.bucket.padEnd(18)} ${input.url.slice(0, 70).padEnd(70)} ${t}`)

    // Periodic flush to /tmp for crash-safety
    if (i % 20 === 19) {
      writeFileSync('/tmp/url-verification-raw.json', JSON.stringify(results, null, 2))
    }
  }

  await context.close()
  await browser.close()

  writeFileSync('/tmp/url-verification-raw.json', JSON.stringify(results, null, 2))

  // Tally
  const tally: Record<string, number> = {}
  for (const r of results) tally[r.flag] = (tally[r.flag] ?? 0) + 1

  console.log('\nFlag breakdown:')
  for (const [k, v] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
    const pct = (v / results.length * 100).toFixed(1)
    console.log(`  ${k.padEnd(22)} ${String(v).padStart(4)}  ${pct}%`)
  }
  console.log(`\nRaw JSON: /tmp/url-verification-raw.json`)
})().catch(e => { console.error(e); process.exit(1) })
