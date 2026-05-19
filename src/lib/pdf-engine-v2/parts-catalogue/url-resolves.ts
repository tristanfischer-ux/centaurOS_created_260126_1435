/**
 * @file url-resolves.ts — HEAD-check a URL to confirm it actually resolves.
 *
 * Tristan rule (2026-05-16): every URL shipping to the user MUST be HEAD-
 * checked before treating it as verified. Broken links are worse than no
 * links. Verified 2026-05-16 ground-truth test: 0/4 LLM-emitted "grounded"
 * URLs resolved; 4/4 Mouser URLs resolved. Distributor APIs return real
 * catalogue pages by construction; LLM-emitted URLs are training-data
 * memory and frequently dead.
 *
 * Approach: HEAD first (cheap, no body transfer). On 403/405 retry with GET
 * (some WAFs and CDNs block HEAD; DigiKey was an observed offender). Time
 * out at 8s to avoid stalling the pipeline on slow servers. Accept 200-399
 * (200 OK, 301/302 redirects, 304 Not Modified). Reject 4xx (real "not
 * found" after the 403/405 retry), 5xx (server error — treat as unreliable),
 * and network errors (DNS/TLS/timeout).
 *
 * Second layer (2026-05-18, Track D audit): when HEAD returns 200, also do a
 * GET to read the page <title> and check for soft-404 / deprecated-page
 * signals. Soft-404 pages (e.g. "Page Not Found" in title, noindex meta tag)
 * are treated as not-found even though the HTTP status is 200. This catches
 * CDN-served 200s for removed product pages — a known failure mode for
 * Cisco / Bosch product pages that return 200 with "This page has been
 * discontinued" content.
 */

const HEAD_TIMEOUT_MS = 8_000
const GET_TIMEOUT_MS = 12_000  // GET takes longer (full body) but we abort early
const TITLE_GET_TIMEOUT_MS = 10_000  // title-check GET; aborts after first ~10 KB

/** Phrases in the page <title> that indicate a soft-404 / deprecated page. */
const SOFT_404_TITLE_PHRASES: string[] = [
  'page not found',
  '404',
  '403',
  'access denied',
]

interface ResolveResult {
  ok: boolean
  status: number | null  // null = network error
  method: 'HEAD' | 'GET'  // which method finally established the verdict
  reason?: string  // present when ok=false
}

/**
 * Returns true if the URL points at a real, reachable page.
 *
 * Costs: one network round-trip per call (HEAD ≈ free; GET fallback rare).
 * No bandwidth — HEAD doesn't transfer the body; GET fallback aborts after
 * the first chunk.
 *
 * Use case: gate every source_url before saving to state.json AND every
 * cached URL on read from the parts catalogue if it's >30 days old.
 */
export async function urlResolves(url: string): Promise<boolean> {
  const r = await urlResolvesDetailed(url)
  return r.ok
}

export async function urlResolvesDetailed(url: string): Promise<ResolveResult> {
  if (!url || typeof url !== 'string') return { ok: false, status: null, method: 'HEAD', reason: 'no url' }
  if (!/^https?:\/\//i.test(url)) return { ok: false, status: null, method: 'HEAD', reason: 'not http(s)' }

  // HEAD attempt
  const head = await tryFetch(url, 'HEAD', HEAD_TIMEOUT_MS)
  if (head.ok) {
    // HEAD returned 200 — run the second-layer title/noindex check.
    const titleCheck = await checkPageTitle(url)
    if (!titleCheck.ok) {
      return { ok: false, status: head.status, method: 'GET', reason: titleCheck.reason }
    }
    return { ok: true, status: head.status, method: 'HEAD' }
  }
  if (head.status !== null && head.status !== 403 && head.status !== 405) {
    // Definitive non-OK status (4xx other than 403/405, or 5xx). Don't retry.
    return { ok: false, status: head.status, method: 'HEAD', reason: `HEAD ${head.status}` }
  }

  // HEAD failed with 403/405 (WAF-blocking method) OR network error — retry
  // with GET. Aborts after 12 s to avoid stalls on huge resources.
  const get = await tryFetch(url, 'GET', GET_TIMEOUT_MS)
  if (get.ok) {
    // GET also returned 200 — run the title/noindex check on the same response.
    // (We already consumed the body in tryFetch via cancel(); fetch again for title.)
    const titleCheck = await checkPageTitle(url)
    if (!titleCheck.ok) {
      return { ok: false, status: get.status, method: 'GET', reason: titleCheck.reason }
    }
    return { ok: true, status: get.status, method: 'GET' }
  }
  return {
    ok: false,
    status: get.status ?? head.status,
    method: 'GET',
    reason: get.status !== null ? `GET ${get.status}` : (head.reason ?? 'network error'),
  }
}

/**
 * Fetch up to ~10 KB of the page body and inspect the <title> tag and
 * <meta name="robots"> tag for soft-404 / deprecated-page signals.
 *
 * Returns { ok: true } when the page looks like a real, indexed product page.
 * Returns { ok: false, reason } when a soft-404 or noindex signal is detected.
 *
 * Deliberately lenient: if the fetch fails (network / timeout / WAF) we return
 * ok=true so that a transient failure doesn't incorrectly reject a valid URL.
 */
async function checkPageTitle(url: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), TITLE_GET_TIMEOUT_MS)
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForgeOS-engine/1.0; verifier)' },
    })
    clearTimeout(to)

    if (!res.ok) {
      try { res.body?.cancel() } catch {}
      return { ok: true }  // HTTP error handled upstream; don't double-reject
    }

    // Read only the first 10 KB to keep this cheap.
    const reader = res.body?.getReader()
    if (!reader) return { ok: true }
    let html = ''
    const MAX_BYTES = 10_240
    while (html.length < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done || !value) break
      html += new TextDecoder().decode(value)
    }
    try { reader.cancel() } catch {}

    // ── Check <title> ────────────────────────────────────────────────────────
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    if (titleMatch) {
      const title = titleMatch[1].toLowerCase().trim()
      for (const phrase of SOFT_404_TITLE_PHRASES) {
        if (title.includes(phrase)) {
          return { ok: false, reason: `soft-404: page title contains "${phrase}" ("${title.slice(0, 80)}")` }
        }
      }
    }

    // ── Check <meta name="robots" content="noindex"> ─────────────────────────
    // A noindex tag is a soft signal that the page has been deprecated or
    // removed. Treat as not-found.
    const noindexMatch = html.match(/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex[^"']*["']/i)
      ?? html.match(/<meta[^>]+content=["'][^"']*noindex[^"']*["'][^>]+name=["']robots["']/i)
    if (noindexMatch) {
      return { ok: false, reason: 'soft-404: page has <meta name="robots" content="noindex"> (deprecated/removed)' }
    }

    return { ok: true }
  } catch {
    // Timeout or network error on the title GET — don't reject the URL on this alone.
    return { ok: true }
  }
}

async function tryFetch(url: string, method: 'HEAD' | 'GET', timeoutMs: number): Promise<{ ok: boolean; status: number | null; reason?: string }> {
  try {
    const controller = new AbortController()
    const to = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      // Some CDNs reject requests without a User-Agent. Use a generic one.
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ForgeOS-engine/1.0; verifier)' },
    })
    clearTimeout(to)
    if (method === 'GET') {
      // Don't actually consume the body. Cancel the read.
      try { res.body?.cancel() } catch {}
    }
    return { ok: res.status >= 200 && res.status < 400, status: res.status }
  } catch (e) {
    const msg = (e as Error).message ?? 'fetch error'
    return { ok: false, status: null, reason: msg.slice(0, 80) }
  }
}

/**
 * Batch HEAD-check many URLs in parallel with a concurrency cap. Returns a
 * Map keyed by the original URL. Useful for re-verifying parts catalogue
 * entries on a maintenance pass.
 */
export async function urlsResolveBatch(urls: string[], concurrency = 10): Promise<Map<string, ResolveResult>> {
  const out = new Map<string, ResolveResult>()
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency)
    const results = await Promise.all(batch.map(u => urlResolvesDetailed(u).then(r => [u, r] as const)))
    for (const [u, r] of results) out.set(u, r)
  }
  return out
}
