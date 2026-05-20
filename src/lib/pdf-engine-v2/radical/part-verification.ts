/**
 * @file part-verification.ts — Per-item search-verify every (manufacturer,
 * part_number) pair in the design, strip the fakes, surface the uncertain
 * ones for human review.
 *
 * Background (iter-59/iter-60b audits + Tristan directive 2026-05-16):
 * the previous architecture put fact-checking on the single R4 sweep, which
 * gets handed 200+ items and 65K output tokens — quality degrades when the
 * model has to verify everything in one breath. Worse, R4 emits *patches*
 * not a verification report, so it has to choose between fixing prose,
 * adding modifiers, AND verifying SKUs in the same output stream. Empirically
 * R4 verifies almost nothing.
 *
 * The fix is structural: a dedicated stage that LOOPS over each item. One
 * focused Flash-Lite call per (manufacturer, part_number) pair. Each call
 * is ~500 input + ~150 output tokens, parallelisable. Output is a
 * verification report keyed by word.id; stripping is deterministic.
 *
 * Architecture mirrors design-decisions.ts (same per-item-LLM pattern).
 *
 * Cost: 200 items × ~£0.0005/call ≈ £0.10/run. Cheap.
 */

import type { ModuleSpec } from '../types/module-decomposition'
import { normaliseKind } from './universal-grammar-gates'
import { urlResolves } from '../parts-catalogue/url-resolves'

export interface PartCandidate {
  /** Stable id: module::sub_module::word::part_number for cross-referencing. */
  id: string
  module: string
  sub_module_id: string
  word_id: string
  word_name: string
  manufacturer: string
  part_number: string
}

export type VerificationStatus = 'verified' | 'unverified' | 'uncertain' | 'skip'

export interface PartVerification extends PartCandidate {
  status: VerificationStatus
  /** high | medium | low — how confident the LLM is in the status. */
  confidence: 'high' | 'medium' | 'low'
  /** One-sentence reasoning behind the verdict. */
  reasoning: string
  /** URL to a page (datasheet, distributor listing, manufacturer catalogue) that
   * shows the exact part. Null when not verified or no URL captured.
   * Tristan directive 2026-05-16: surface the link so the user can see the
   * source themselves — honest by design, no "trust us this is real". */
  source_url: string | null
  /** Title of the source page (helps user understand what they're clicking). */
  source_title: string | null
  /** Which path produced the verdict:
   *   "lm-only"  — Flash-Lite pattern-match from training data (URL likely
   *                hallucinated; never trust without HEAD-check; render WITHOUT
   *                a clickable Link).
   *   "tavily"   — Tavily web search + Flash-Lite judge (URL real but check).
   *   "brave"    — Brave Search + Flash-Lite judge.
   *   "mouser"   — Mouser distributor API match (authoritative).
   *   "digikey"  — DigiKey distributor API match (authoritative).
   *   "farnell"  — Farnell distributor API match (authoritative).
   *   "gemini"   — Gemini grounded via Google native API (authoritative, paid).
   *   "db-cache" — Parts catalogue DB hit (previously verified, still fresh).
   *   "skip"     — Verifier call failed (transport/parse).
   *
   * Render-time rule: only methods in {mouser, digikey, farnell, brave, tavily,
   * gemini, db-cache} can produce a clickable Link. lm-only renders plain.
   */
  source_method?: 'lm-only' | 'tavily' | 'brave' | 'mouser' | 'digikey' | 'farnell' | 'gemini' | 'db-cache' | 'skip' | 'grounded'
  /** When tier 3 (distributor) finds the part: current price + availability. */
  distributor_price_gbp?: number | null
  distributor_availability?: string | null
  distributor_datasheet_url?: string | null
  /** LLM model + timestamp for traceability. */
  generated_by: string
  generated_at: string
}

/**
 * Recommendation generated AFTER a part_number is stripped. Tristan honesty
 * rule (2026-05-16): "better to be honest and say we are not sure than have
 * a false claim of accuracy". The recommendation MUST carry its own
 * confidence tag — if the LLM doesn't know a verified real alternative, it
 * says "uncertain — manual sourcing needed" rather than guessing a SKU.
 *
 * Never trade one fabrication for another.
 */
export interface PartRecommendation {
  /** Stable id matching the PartVerification that triggered this recommendation. */
  id: string
  module: string
  sub_module_id: string
  word_id: string
  word_name: string
  /** What the design needs (kind of part, key technical requirements). */
  application_summary: string
  /** Engine's confidence in the recommendation itself, NOT in the part. */
  confidence: 'high' | 'medium' | 'low' | 'unknown'
  /** Suggested manufacturer + part_number, OR explicit "uncertain — manual sourcing" tag. */
  recommended_manufacturer: string | null
  recommended_part_number: string | null
  /** Plain-English explanation of why this is suggested OR why the engine can't recommend. */
  reasoning: string
  /** URL the user can click to see the recommended part on a datasheet/distributor page. */
  source_url: string | null
  /** Title of the source page. */
  source_title: string | null
  generated_by: string
  generated_at: string
}

/**
 * Walk every word in every sub-module of every module. For each word that
 * has BOTH a manufacturer AND a part_number modifier, emit a PartCandidate.
 * Skip words tagged "custom fabrication" / "custom PCBA" / "custom machined"
 * — those are honest "no vendor" declarations, no verification needed.
 */
export function extractPartCandidates(modules: ModuleSpec[]): PartCandidate[] {
  const out: PartCandidate[] = []
  for (const m of modules ?? []) {
    for (const sm of ((m as any).sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const mods = Array.isArray(w?.modifier_characters) ? w.modifier_characters : []
        const mfr = mods.find((mc: any) => normaliseKind(String(mc?.kind ?? '')) === 'manufacturer')
        const pn  = mods.find((mc: any) => normaliseKind(String(mc?.kind ?? '')) === 'part_number')
        if (!mfr || !pn) continue
        const mfrV = String(mfr.value ?? '').trim()
        const pnV = String(pn.value ?? '').trim()
        if (!mfrV || !pnV) continue
        // Skip honest "no vendor" declarations
        if (/^(custom|in[-_]?house|bespoke|own[-_]?design)/i.test(mfrV)) continue
        out.push({
          id: `${m.module}::${sm.id}::${w.id ?? '?'}::${pnV}`,
          module: m.module,
          sub_module_id: sm.id,
          word_id: String(w.id ?? '?'),
          word_name: String(w.name_human ?? w.content_character?.name_human ?? w.id ?? '?'),
          manufacturer: mfrV,
          part_number: pnV,
        })
      }
    }
  }
  return out
}

const VERIFIER_SYSTEM = `You are a procurement verification specialist with Google search grounding enabled. For each (manufacturer, part number) pair the user gives you, ACTIVELY SEARCH for the part on the web before answering — manufacturer datasheets, distributor listings (Mouser, DigiKey, Farnell, RS, Newark), or catalogue PDFs. Anchor your verdict in what the search returns, not in pattern-matching on the part-number format.

Be honest — if your search returns datasheet / distributor pages confirming the exact part, say "verified" high confidence. If the search returns nothing for the exact part number but the manufacturer's product family is listed (close suffixes only), say "uncertain". If the search returns explicit evidence the manufacturer doesn't make this category, OR returns no hits anywhere, say "unverified".

STRICT MATCHING — "verified" requires the EXACT part_number you were given to appear verbatim (or with only whitespace / capitalisation difference) in a returned datasheet, distributor page, or manufacturer catalogue. "The manufacturer makes parts like this" is NOT sufficient for verified — that's "uncertain". Only mark verified when you can quote the URL or page title that contains the exact SKU.

URL CAPTURE — whenever you mark a part "verified", you MUST include the source_url and source_title fields pointing at the page where the SKU appears. The user will click these to see the part themselves. If you cannot produce a URL, your status MUST be "uncertain" not "verified" — refuse to verify without source.

IMPORTANT: do NOT mark a part "unverified" just because the format looks unusual — search first. Many real industrial parts have non-obvious naming conventions (Phoenix Contact "ST 35-200" with a space, NXP "i.MX8" abbreviated families, Intel CPU codes with suffixes like "-12100E"). Hyphenation and abbreviations are common in real catalogues.

Output JSON only (no preamble, no markdown):
{
  "status": "verified" | "unverified" | "uncertain",
  "confidence": "high" | "medium" | "low",
  "reasoning": "<1 sentence>",
  "source_url": "<URL of page where exact part appears — required when status=verified>" | null,
  "source_title": "<title of source page>" | null
}

status guide:
  "verified"   — you are confident this part number exists in this manufacturer's catalogue / datasheet / distributor listings
  "unverified" — you are confident this part number is FAKE (vendor doesn't make this category, SKU format doesn't match vendor convention, brief-specific suffix, etc.)
  "uncertain"  — you can't determine either way from training data; manufacturer is real and SKU format is plausible but you cannot confirm

confidence guide:
  "high"   — you'd bet on it (Verified: you've seen the datasheet; Unverified: you can prove the SKU is wrong)
  "medium" — strong signal but not certain
  "low"    — best guess

reasoning: ONE short factual sentence. Examples:
  • "Verified — Bussmann 170M-series is a known HRC DC fuse family; 170M6017 is a real 1600A 1000VDC variant."
  • "Unverified — Unex (Spanish manufacturer Unex Aparatos) makes cable trays and trunking, not battery rack frames."
  • "Uncertain — Tata Steel does supply steel sections but CP-1200-5MM is not a SKU format Tata uses; could be a customer-specific code."`

const VERIFIER_MODEL = 'google/gemini-3.1-flash-lite'

/**
 * Verify one part candidate. Returns null on transport / parse failure;
 * caller treats null as "could not verify, defer" (status: skip).
 */
export async function verifyPart(
  candidate: PartCandidate,
  apiKey: string,
  model: string = VERIFIER_MODEL,
): Promise<PartVerification | null> {
  const userContent = `MANUFACTURER: ${candidate.manufacturer}
PART NUMBER: ${candidate.part_number}
APPLICATION CONTEXT: ${candidate.word_name} (used in ${candidate.module}::${candidate.sub_module_id})

Is this a real product? Output JSON only.`

  // ⚠️ LM-ONLY VERIFICATION — NO ACTUAL WEB SEARCH happens here.
  // Verified 2026-05-16: OpenRouter silently ignores `google_search_grounding`
  // for Gemini Flash-Lite. The model responds from its January-2025 training
  // cutoff data, NOT from a fresh search. Use this verifier as a quick first-
  // pass classification ONLY (e.g. "does this part_number look like the right
  // format for this manufacturer?"). NEVER trust the source_url it emits
  // without HEAD-checking — those URLs are training-data memory, often dead.
  // Authoritative URLs come from distributor APIs (Mouser/DigiKey/Farnell)
  // and Brave/Tavily search results.
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 500,
        thinking_level: 'low',
        messages: [
          { role: 'system', content: VERIFIER_SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (!response.ok) return null
    const json = await response.json() as any
    const text = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return null
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    let parsed: any
    try { parsed = JSON.parse(cleaned) } catch { return null }
    const status = String(parsed.status ?? '').toLowerCase() as VerificationStatus
    const confidence = String(parsed.confidence ?? '').toLowerCase() as 'high' | 'medium' | 'low'
    const reasoning = String(parsed.reasoning ?? '').trim()
    if (!['verified', 'unverified', 'uncertain'].includes(status)) return null
    if (!['high', 'medium', 'low'].includes(confidence)) return null
    const rawSourceUrl = typeof parsed.source_url === 'string' && parsed.source_url.startsWith('http') ? parsed.source_url : null
    const rawSourceTitle = typeof parsed.source_title === 'string' && parsed.source_title.trim().length > 0 ? parsed.source_title.trim() : null

    // HEAD-check the URL. If it doesn't resolve, drop it AND downgrade
    // status — the model gave a plausible-looking but probably dead URL from
    // training memory. We won't ship dead links.
    let sourceUrl: string | null = rawSourceUrl
    let sourceTitle: string | null = rawSourceTitle
    let urlResolveFailed = false
    if (sourceUrl) {
      const ok = await urlResolves(sourceUrl)
      if (!ok) {
        urlResolveFailed = true
        sourceUrl = null
        sourceTitle = null
      }
    }

    // Honesty enforcement: "verified" without a URL is downgraded to "uncertain".
    // Either the prompt was ignored (no URL emitted) OR the URL failed HEAD-check
    // (URL was dead). Either way, can't claim verified.
    const finalStatus: VerificationStatus = (status === 'verified' && !sourceUrl) ? 'uncertain' : status
    let finalReasoning = reasoning
    if (status === 'verified' && !sourceUrl) {
      finalReasoning = urlResolveFailed
        ? `Downgraded: model gave a URL but HEAD-check failed (likely dead link from training memory). Original reasoning: ${reasoning}`
        : `Downgraded: model marked verified but provided no source URL. Original reasoning: ${reasoning}`
    }

    return {
      ...candidate,
      status: finalStatus,
      confidence,
      reasoning: finalReasoning,
      source_url: sourceUrl,
      source_title: sourceTitle,
      // ⚠️ "lm-only" — model has no fresh web access; URL is pattern-matched
      // from training-data memory. Render-time guard MUST treat this as
      // non-clickable.
      source_method: 'lm-only',
      generated_by: model,
      generated_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

// ─── Tavily fallback ──────────────────────────────────────────────────────────
//
// Cascade Option C (Tristan 2026-05-16): when grounded Flash-Lite returns
// status≠'verified' OR confidence≠'high', do a second pass via Tavily search
// + Flash-Lite judge. Tavily's catalogue index is denser for industrial parts
// than Google's general index — catches niche components grounded Flash-Lite
// might mark uncertain.

export async function tavilySearchForPart(manufacturer: string, partNumber: string): Promise<{ url: string | null; title: string | null; content: string }> {
  // Tavily key path matches the rest of the codebase secrets layout.
  let tavilyKey = process.env.TAVILY_API_KEY ?? ''
  if (!tavilyKey) {
    try {
      const fs = await import('fs')
      const env = fs.readFileSync('/Users/tristanfischer/.claude/secrets/tavily.env', 'utf8')
      tavilyKey = env.match(/TAVILY_API_KEY=(.+)/)?.[1].trim() ?? ''
    } catch {}
  }
  if (!tavilyKey) return { url: null, title: null, content: '' }
  const query = `"${manufacturer}" "${partNumber}" datasheet OR distributor OR catalogue`
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: false,
        include_raw_content: false,
      }),
    })
    if (!res.ok) return { url: null, title: null, content: '' }
    const j: any = await res.json()
    const results = (j.results ?? []) as any[]
    if (results.length === 0) return { url: null, title: null, content: '' }
    const top = results[0]
    const content = results.map(r => `${r.title || ''}\n${r.url || ''}\n${(r.content || '').slice(0, 250)}`).join('\n\n---\n\n')
    return { url: top.url || null, title: top.title || null, content }
  } catch {
    return { url: null, title: null, content: '' }
  }
}

export async function judgeFromTavily(candidate: PartCandidate, apiKey: string, searchContent: string, topUrl: string | null, topTitle: string | null, model: string): Promise<{ status: VerificationStatus; confidence: 'high' | 'medium' | 'low'; reasoning: string; sourceUrl: string | null; sourceTitle: string | null } | null> {
  const prompt = `You are judging whether a real industrial part exists. Web search results for "${candidate.manufacturer} ${candidate.part_number}":

${searchContent.slice(0, 4000)}

The user's part is:
  MANUFACTURER: ${candidate.manufacturer}
  PART NUMBER:  ${candidate.part_number}
  APPLICATION:  ${candidate.word_name}

Rules:
- "verified" — search returned a page that contains BOTH the manufacturer AND the EXACT part_number (or only-whitespace/capitalisation variant). You MUST quote the URL.
- "unverified" — search returned no support for this part_number (manufacturer may exist, but no catalogue/datasheet match the exact SKU).
- "uncertain" — search results are inconclusive.

Return JSON only:
{ "status": "verified"|"unverified"|"uncertain", "confidence": "high"|"medium"|"low", "reasoning": "<one sentence — quote URL or title>", "source_url": "<url or null>", "source_title": "<title or null>" }`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    }),
  })
  if (!res.ok) return null
  const j: any = await res.json()
  const text = (j.choices?.[0]?.message?.content ?? '').trim()
  if (!text) return null
  let parsed: any
  try { parsed = JSON.parse(text) } catch { return null }
  const status = String(parsed.status ?? '').toLowerCase() as VerificationStatus
  const confidence = String(parsed.confidence ?? '').toLowerCase() as 'high' | 'medium' | 'low'
  if (!['verified', 'unverified', 'uncertain'].includes(status)) return null
  if (!['high', 'medium', 'low'].includes(confidence)) return null
  let sourceUrl: string | null = typeof parsed.source_url === 'string' && parsed.source_url.startsWith('http') ? parsed.source_url : (status === 'verified' ? topUrl : null)
  let sourceTitle: string | null = typeof parsed.source_title === 'string' && parsed.source_title.length > 0 ? parsed.source_title : (status === 'verified' ? topTitle : null)

  // HEAD-check the URL — Tavily returned a real URL but the page might still
  // be 404 (manufacturer reorganised their catalogue, etc.). Distributor
  // APIs are exempt from this check (their URLs are catalogue-canonical),
  // but Tavily-emitted URLs MUST resolve.
  if (sourceUrl) {
    const ok = await urlResolves(sourceUrl)
    if (!ok) {
      sourceUrl = null
      sourceTitle = null
    }
  }

  // After HEAD-check, if we have no URL but the judgment was "verified",
  // downgrade to "uncertain" — can't ship a verified-no-receipt claim.
  let finalStatus: VerificationStatus = status
  let finalReasoning = String(parsed.reasoning ?? '')
  if (status === 'verified' && !sourceUrl) {
    finalStatus = 'uncertain'
    finalReasoning = `Downgraded: Tavily-found URL did not resolve (HEAD-check failed). Original judgement: ${finalReasoning}`
  }

  return {
    status: finalStatus,
    confidence,
    reasoning: finalReasoning,
    sourceUrl,
    sourceTitle,
  }
}

// ─── Mouser distributor tier ──────────────────────────────────────────────────
//
// Tristan directive 2026-05-16: extend cascade to a third tier that queries
// distributor APIs (Mouser first, then DigiKey, Farnell). Distributor hits are
// the strongest possible signal — the part exists in a real catalogue with a
// price, stock level, and authoritative product page. Mouser's API is the
// simplest of the three (just an API key, POST JSON).

export async function mouserLookup(manufacturer: string, partNumber: string): Promise<{
  found: boolean
  sku?: string
  manufacturer?: string
  description?: string
  product_url?: string
  datasheet_url?: string
  price_gbp?: number
  availability?: string
} | null> {
  let mouserKey = process.env.MOUSER_API_KEY ?? ''
  if (!mouserKey) {
    try {
      const fs = await import('fs')
      const env = fs.readFileSync('/Users/tristanfischer/.claude/secrets/distributor-apis.env', 'utf8')
      mouserKey = env.match(/MOUSER_API_KEY=(.+)/)?.[1].trim() ?? ''
    } catch {}
  }
  if (!mouserKey) return null

  // Mouser keyword search returns more matches when the query is just the
  // part_number (with descriptive suffix stripped). Try two queries: the full
  // (manufacturer + pn) first, then fall back to a cleaned pn-only search.
  const extractCorePartNumber = (pn: string): string => {
    // Take first whitespace-separated token (drops trailing descriptions like
    // "5055700801 Micro-Fit 8-pin" → "5055700801"). Then keep if it has at
    // least 4 alphanumeric chars.
    const first = pn.trim().split(/\s+/)[0]
    return first && first.replace(/[^a-z0-9]/gi, '').length >= 4 ? first : pn
  }
  const queries = [
    `${manufacturer} ${partNumber}`,
    extractCorePartNumber(partNumber),  // PN only — many Mouser hits index this way
  ]
  let parts: any[] = []
  try {
    for (const q of queries) {
      const res = await fetch(`https://api.mouser.com/api/v1/search/keyword?apiKey=${mouserKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          SearchByKeywordRequest: {
            keyword: q,
            records: 5,
            startingRecord: 0,
          },
        }),
      })
      if (!res.ok) continue
      const j: any = await res.json()
      const found: any[] = j?.SearchResults?.Parts ?? []
      if (found.length > 0) {
        parts = found
        break
      }
    }
    if (parts.length === 0) return { found: false }

    // Match strategy (tiered, most→least strict):
    // T1. Strict equality on normalised PN + loose manufacturer contains.
    // T2. Mouser PN starts-with or includes our PN (covers "5055700801" vs
    //     "5055700801-CUT", or our PN with descriptive suffix). Min PN length 5.
    // T3. Alphanumeric-only prefix match (strips hyphens, slashes, dots —
    //     handles "ABM3B-24.000MHZ" vs "ABM3B24000MHZ").
    const stripPunct = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()
    const normPn = partNumber.replace(/\s+/g, '').toLowerCase()
    const normPnAlnum = stripPunct(partNumber)
    const normMfr = manufacturer.toLowerCase()
    const mfrMatch = (pMfr: string) => {
      const m = pMfr.toLowerCase()
      if (m === normMfr) return true
      if (m.includes(normMfr) || normMfr.includes(m.split(' ')[0])) return true
      // Token-level overlap (e.g. "TDK Electronics" should match "TDK")
      const tokens = normMfr.split(/\s+/)
      return tokens.some(t => t.length >= 3 && m.includes(t))
    }
    // T1: strict
    let match = parts.find((p: any) => {
      const pPn = String(p.ManufacturerPartNumber || '').replace(/\s+/g, '').toLowerCase()
      return pPn === normPn && mfrMatch(String(p.Manufacturer || ''))
    })
    // T2: includes / starts-with (only if min length OK)
    if (!match && normPn.length >= 5) {
      match = parts.find((p: any) => {
        const pPn = String(p.ManufacturerPartNumber || '').replace(/\s+/g, '').toLowerCase()
        return (pPn.startsWith(normPn) || normPn.startsWith(pPn) || pPn.includes(normPn) || normPn.includes(pPn))
          && pPn.length >= 5
          && mfrMatch(String(p.Manufacturer || ''))
      })
    }
    // T3: alphanumeric-only (strips punctuation differences)
    if (!match && normPnAlnum.length >= 5) {
      match = parts.find((p: any) => {
        const pPnAlnum = stripPunct(String(p.ManufacturerPartNumber || ''))
        return (pPnAlnum.startsWith(normPnAlnum) || normPnAlnum.startsWith(pPnAlnum))
          && pPnAlnum.length >= 5
          && mfrMatch(String(p.Manufacturer || ''))
      })
    }
    if (!match) return { found: false }

    // Extract first GBP price (priceBreaks list, lowest tier).
    let priceGbp: number | undefined
    const breaks: any[] = match.PriceBreaks ?? []
    const gbpBreak = breaks.find((b: any) => String(b.Currency || '').toUpperCase().includes('GBP'))
    if (gbpBreak) {
      const raw = String(gbpBreak.Price || '').replace(/[^\d.]/g, '')
      const n = parseFloat(raw)
      if (!isNaN(n)) priceGbp = n
    }

    return {
      found: true,
      sku: match.MouserPartNumber || match.ManufacturerPartNumber,
      manufacturer: match.Manufacturer,
      description: match.Description,
      product_url: match.ProductDetailUrl,
      datasheet_url: match.DataSheetUrl,
      price_gbp: priceGbp,
      availability: match.Availability || match.AvailabilityInStock,
    }
  } catch {
    return null
  }
}

// ─── DigiKey distributor tier (OAuth client_credentials) ─────────────────────
//
// Tier 4 of the cascade. DigiKey indexes denser than Mouser for some niche
// electronics; complements Mouser. OAuth tokens last ~10 min so we cache
// at module scope.

let digikeyTokenCache: { token: string; expiresAt: number } | null = null

async function getDigikeyToken(): Promise<string | null> {
  if (digikeyTokenCache && digikeyTokenCache.expiresAt > Date.now() + 30_000) {
    return digikeyTokenCache.token
  }
  let clientId = process.env.DIGIKEY_CLIENT_ID ?? ''
  let clientSecret = process.env.DIGIKEY_CLIENT_SECRET ?? ''
  if (!clientId || !clientSecret) {
    try {
      const fs = await import('fs')
      const env = fs.readFileSync('/Users/tristanfischer/.claude/secrets/distributor-apis.env', 'utf8')
      clientId = env.match(/DIGIKEY_CLIENT_ID=(.+)/)?.[1].trim() ?? ''
      clientSecret = env.match(/DIGIKEY_CLIENT_SECRET=(.+)/)?.[1].trim() ?? ''
    } catch {}
  }
  if (!clientId || !clientSecret) return null
  try {
    const res = await fetch('https://api.digikey.com/v1/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}`,
    })
    if (!res.ok) return null
    const j: any = await res.json()
    if (!j.access_token) return null
    digikeyTokenCache = { token: j.access_token, expiresAt: Date.now() + (j.expires_in - 30) * 1000 }
    return j.access_token
  } catch {
    return null
  }
}

export async function digikeyLookup(manufacturer: string, partNumber: string): Promise<{
  found: boolean
  sku?: string
  manufacturer?: string
  description?: string
  product_url?: string
  datasheet_url?: string
  price_gbp?: number
  availability?: string
} | null> {
  const token = await getDigikeyToken()
  if (!token) return null
  let clientId = process.env.DIGIKEY_CLIENT_ID ?? ''
  if (!clientId) {
    try {
      const fs = await import('fs')
      const env = fs.readFileSync('/Users/tristanfischer/.claude/secrets/distributor-apis.env', 'utf8')
      clientId = env.match(/DIGIKEY_CLIENT_ID=(.+)/)?.[1].trim() ?? ''
    } catch {}
  }
  const stripPunct = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const extractCorePartNumber = (pn: string): string => {
    const first = pn.trim().split(/\s+/)[0]
    return first && first.replace(/[^a-z0-9]/gi, '').length >= 4 ? first : pn
  }
  const queries = [`${manufacturer} ${partNumber}`, extractCorePartNumber(partNumber)]
  let products: any[] = []
  try {
    for (const q of queries) {
      const res = await fetch('https://api.digikey.com/products/v4/search/keyword', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-DIGIKEY-Client-Id': clientId,
          'X-DIGIKEY-Locale-Site': 'UK',
          'X-DIGIKEY-Locale-Currency': 'GBP',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ Keywords: q, Limit: 5, Offset: 0 }),
      })
      if (!res.ok) continue
      const j: any = await res.json()
      const found = j.Products ?? []
      if (found.length > 0) {
        products = found
        break
      }
    }
    if (products.length === 0) return { found: false }
    const normPn = partNumber.replace(/\s+/g, '').toLowerCase()
    const normPnAlnum = stripPunct(partNumber)
    const normMfr = manufacturer.toLowerCase()
    const mfrMatch = (pMfr: string) => {
      const m = pMfr.toLowerCase()
      if (m === normMfr || m.includes(normMfr) || normMfr.includes(m.split(' ')[0])) return true
      const tokens = normMfr.split(/\s+/)
      return tokens.some(t => t.length >= 3 && m.includes(t))
    }
    let match = products.find((p: any) => {
      const pPn = String(p.ManufacturerProductNumber || '').replace(/\s+/g, '').toLowerCase()
      return pPn === normPn && mfrMatch(String(p.Manufacturer?.Name || ''))
    })
    if (!match && normPn.length >= 5) {
      match = products.find((p: any) => {
        const pPn = String(p.ManufacturerProductNumber || '').replace(/\s+/g, '').toLowerCase()
        return (pPn.startsWith(normPn) || normPn.startsWith(pPn) || pPn.includes(normPn) || normPn.includes(pPn))
          && pPn.length >= 5 && mfrMatch(String(p.Manufacturer?.Name || ''))
      })
    }
    if (!match && normPnAlnum.length >= 5) {
      match = products.find((p: any) => {
        const pPnAlnum = stripPunct(String(p.ManufacturerProductNumber || ''))
        return (pPnAlnum.startsWith(normPnAlnum) || normPnAlnum.startsWith(pPnAlnum))
          && pPnAlnum.length >= 5 && mfrMatch(String(p.Manufacturer?.Name || ''))
      })
    }
    if (!match) return { found: false }
    const price = typeof match.UnitPrice === 'number' ? match.UnitPrice : (typeof match.UnitPrice === 'string' ? parseFloat(match.UnitPrice) : undefined)
    return {
      found: true,
      sku: match.ManufacturerProductNumber || match.DigiKeyPartNumber,
      manufacturer: match.Manufacturer?.Name,
      description: match.Description?.ProductDescription || match.Description?.DetailedDescription,
      product_url: match.ProductUrl,
      datasheet_url: match.DatasheetUrl,
      price_gbp: typeof price === 'number' && !isNaN(price) ? price : undefined,
      availability: typeof match.QuantityAvailable === 'number' ? `${match.QuantityAvailable} in stock` : undefined,
    }
  } catch {
    return null
  }
}

// ─── Farnell distributor tier (UK Element14 catalogue) ───────────────────────
//
// Tier 5. Farnell/element14 has strong UK + EU industrial coverage, often
// catalogues Phoenix Contact / Wago / Hirschmann / Hammond / Schneider items
// that Mouser may miss. The API uses manuPartNum: prefix as a structured
// search; responseGroup=Large is required to return prices + descriptions.

export async function farnellLookup(manufacturer: string, partNumber: string): Promise<{
  found: boolean
  sku?: string
  manufacturer?: string
  description?: string
  product_url?: string
  datasheet_url?: string
  price_gbp?: number
  availability?: string
} | null> {
  let farnellKey = process.env.FARNELL_API_KEY ?? ''
  if (!farnellKey) {
    try {
      const fs = await import('fs')
      const env = fs.readFileSync('/Users/tristanfischer/.claude/secrets/distributor-apis.env', 'utf8')
      farnellKey = env.match(/FARNELL_API_KEY=(.+)/)?.[1].trim() ?? ''
    } catch {}
  }
  if (!farnellKey) return null
  const stripPunct = (s: string) => s.replace(/[^a-z0-9]/gi, '').toLowerCase()
  const extractCorePartNumber = (pn: string): string => {
    const first = pn.trim().split(/\s+/)[0]
    return first && first.replace(/[^a-z0-9]/gi, '').length >= 4 ? first : pn
  }
  // Farnell requires manuPartNum: prefix. Try full PN first, then core only.
  const queries = [
    `manuPartNum:${partNumber.replace(/\s+/g, '')}`,
    `manuPartNum:${extractCorePartNumber(partNumber)}`,
  ]
  let products: any[] = []
  try {
    for (const q of queries) {
      const url = `https://api.element14.com/catalog/products?term=${encodeURIComponent(q)}&storeInfo.id=uk.farnell.com&versionNumber=1.2&callInfo.responseDataFormat=JSON&callInfo.apiKey=${farnellKey}&resultsSettings.responseGroup=Large&resultsSettings.numberOfResults=5`
      const res = await fetch(url)
      if (!res.ok) continue
      const j: any = await res.json()
      const found = j?.manufacturerPartNumberSearchReturn?.products ?? []
      if (found.length > 0) {
        products = found
        break
      }
    }
    if (products.length === 0) return { found: false }
    const normPn = partNumber.replace(/\s+/g, '').toLowerCase()
    const normPnAlnum = stripPunct(partNumber)
    const normMfr = manufacturer.toLowerCase()
    const mfrMatch = (pMfr: string) => {
      const m = (pMfr || '').toLowerCase()
      if (!m) return true  // Farnell sometimes returns null brandName; let PN match carry it
      if (m === normMfr || m.includes(normMfr) || normMfr.includes(m.split(' ')[0])) return true
      const tokens = normMfr.split(/\s+/)
      return tokens.some(t => t.length >= 3 && m.includes(t))
    }
    let match = products.find((p: any) => {
      const pPn = String(p.translatedManufacturerPartNumber || '').replace(/\s+/g, '').toLowerCase()
      return pPn === normPn && mfrMatch(String(p.brandName || p.vendorName || ''))
    })
    if (!match && normPn.length >= 5) {
      match = products.find((p: any) => {
        const pPn = String(p.translatedManufacturerPartNumber || '').replace(/\s+/g, '').toLowerCase()
        return (pPn.startsWith(normPn) || normPn.startsWith(pPn) || pPn.includes(normPn) || normPn.includes(pPn))
          && pPn.length >= 5 && mfrMatch(String(p.brandName || p.vendorName || ''))
      })
    }
    if (!match && normPnAlnum.length >= 5) {
      match = products.find((p: any) => {
        const pPnAlnum = stripPunct(String(p.translatedManufacturerPartNumber || ''))
        return (pPnAlnum.startsWith(normPnAlnum) || normPnAlnum.startsWith(pPnAlnum))
          && pPnAlnum.length >= 5 && mfrMatch(String(p.brandName || p.vendorName || ''))
      })
    }
    if (!match) return { found: false }
    // First price tier (qty 1) — Farnell returns prices as [{from, to, cost}]
    const firstPrice = (match.prices ?? [])[0]
    const priceGbp = typeof firstPrice?.cost === 'number' ? firstPrice.cost : undefined
    const sku = match.sku
    const slugify = (s: string): string => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    const brandSlug = slugify(match.brandName || match.vendorName || '')
    const pnSlug = slugify(match.translatedManufacturerPartNumber || '')
    // Farnell URL pattern requires THREE slug segments + /dp/{sku}:
    //   /{brand-slug}/{pn-slug}/{description-slug}/dp/{sku}
    // Two segments returns 404 (gotcha confirmed 2026-05-16 with curl probe of
    // STM32F427VGT6 and Molex 5057-9416). The description slug can be any
    // non-empty value — even '-' routes correctly. Prefer extracting from
    // displayName ("BRAND - PN - description, more text") for human-readable
    // URLs; fall back to '-' if extraction yields nothing usable.
    const extractDescriptionSlug = (displayName: string, pn: string): string => {
      const parts = String(displayName || '').split(' - ')
      // Drop brand (parts[0]) and PN (parts[1] if it contains the PN);
      // keep the remainder. If parsing fails, use '-' filler.
      let desc = ''
      if (parts.length >= 3) {
        desc = parts.slice(2).join(' ').split(',')[0]  // first comma-clause only
      }
      const slug = slugify(desc).slice(0, 60)
      return slug || '-'
    }
    const descSlug = extractDescriptionSlug(match.displayName ?? '', match.translatedManufacturerPartNumber ?? '')
    const productUrl = sku && brandSlug && pnSlug
      ? `https://uk.farnell.com/${brandSlug}/${pnSlug}/${descSlug}/dp/${sku}`
      : (sku ? `https://uk.farnell.com/dp/${sku}` : undefined)
    return {
      found: true,
      sku: match.translatedManufacturerPartNumber || sku,
      manufacturer: match.brandName || match.vendorName,
      description: match.displayName || match.productDescription,
      product_url: productUrl,
      datasheet_url: (match.datasheets ?? [])[0]?.url,
      price_gbp: priceGbp,
      availability: typeof match.inv === 'number' ? `${match.inv} in stock` : (match.inStock ? `${match.inStock} in stock` : (match.onOrder ? `${match.onOrder} on order` : undefined)),
    }
  } catch {
    return null
  }
}

/**
 * Cascade verifier (Option C tier-3-4-5): grounded Flash-Lite → Tavily → Mouser → DigiKey → Farnell.
 * Highest-precedence wins. Mouser match means we have an authoritative SKU
 * + price + datasheet URL, so it short-circuits to verified-high.
 */
export async function verifyPartCascade(
  candidate: PartCandidate,
  apiKey: string,
  model: string = VERIFIER_MODEL,
): Promise<PartVerification | null> {
  const first = await verifyPart(candidate, apiKey, model)
  if (first && first.status === 'verified' && first.confidence === 'high' && first.source_url) {
    // Even when grounded says verified-high, try distributor APIs to upgrade
    // the source URL + capture price. Mouser → DigiKey → Farnell in order;
    // first hit wins. Non-blocking — falls through to grounded result if no
    // distributor finds it.
    const m = await mouserLookup(candidate.manufacturer, candidate.part_number)
    if (m?.found && m.product_url) {
      return {
        ...first,
        source_url: m.product_url,
        source_title: m.description ?? first.source_title,
        source_method: 'mouser',
        distributor_price_gbp: m.price_gbp ?? null,
        distributor_availability: m.availability ?? null,
        distributor_datasheet_url: m.datasheet_url ?? null,
        reasoning: `Mouser catalogue match: ${m.sku} (${m.description ?? 'matching part'}). ${first.reasoning}`,
      }
    }
    const d = await digikeyLookup(candidate.manufacturer, candidate.part_number)
    if (d?.found && d.product_url) {
      return {
        ...first,
        source_url: d.product_url,
        source_title: d.description ?? first.source_title,
        source_method: 'digikey',
        distributor_price_gbp: d.price_gbp ?? null,
        distributor_availability: d.availability ?? null,
        distributor_datasheet_url: d.datasheet_url ?? null,
        reasoning: `DigiKey catalogue match: ${d.sku} (${d.description ?? 'matching part'}). ${first.reasoning}`,
      }
    }
    const f = await farnellLookup(candidate.manufacturer, candidate.part_number)
    if (f?.found && f.product_url) {
      return {
        ...first,
        source_url: f.product_url,
        source_title: f.description ?? first.source_title,
        source_method: 'farnell',
        distributor_price_gbp: f.price_gbp ?? null,
        distributor_availability: f.availability ?? null,
        distributor_datasheet_url: f.datasheet_url ?? null,
        reasoning: `Farnell catalogue match: ${f.sku} (${f.description ?? 'matching part'}). ${first.reasoning}`,
      }
    }
    return first
  }

  // Tier 2: Tavily search + judge
  const { url, title, content } = await tavilySearchForPart(candidate.manufacturer, candidate.part_number)
  let tavilyVerification: PartVerification | null = null
  if (content) {
    const judged = await judgeFromTavily(candidate, apiKey, content, url, title, model)
    if (judged) {
      tavilyVerification = {
        ...candidate,
        status: judged.status,
        confidence: judged.confidence,
        reasoning: judged.reasoning,
        source_url: judged.sourceUrl,
        source_title: judged.sourceTitle,
        source_method: 'tavily',
        generated_by: `${model} (tavily-judged)`,
        generated_at: new Date().toISOString(),
      }
    }
  }

  // Tier 3: Mouser distributor API. If Mouser finds the part, it overrides
  // tier 1/2 because the catalogue is the authoritative source.
  const m = await mouserLookup(candidate.manufacturer, candidate.part_number)
  if (m?.found && m.product_url) {
    return {
      ...candidate,
      status: 'verified',
      confidence: 'high',
      reasoning: `Mouser catalogue match: ${m.sku} (${m.description ?? 'matching part'}).`,
      source_url: m.product_url,
      source_title: m.description ?? null,
      source_method: 'mouser',
      distributor_price_gbp: m.price_gbp ?? null,
      distributor_availability: m.availability ?? null,
      distributor_datasheet_url: m.datasheet_url ?? null,
      generated_by: `${model} (mouser)`,
      generated_at: new Date().toISOString(),
    }
  }

  // Tier 4: DigiKey. Complements Mouser; indexes denser for some niche parts.
  const d = await digikeyLookup(candidate.manufacturer, candidate.part_number)
  if (d?.found && d.product_url) {
    return {
      ...candidate,
      status: 'verified',
      confidence: 'high',
      reasoning: `DigiKey catalogue match: ${d.sku} (${d.description ?? 'matching part'}).`,
      source_url: d.product_url,
      source_title: d.description ?? null,
      source_method: 'digikey',
      distributor_price_gbp: d.price_gbp ?? null,
      distributor_availability: d.availability ?? null,
      distributor_datasheet_url: d.datasheet_url ?? null,
      generated_by: `${model} (digikey)`,
      generated_at: new Date().toISOString(),
    }
  }

  // Tier 5: Farnell / Element14. Strong UK/EU industrial coverage.
  const f = await farnellLookup(candidate.manufacturer, candidate.part_number)
  if (f?.found && f.product_url) {
    return {
      ...candidate,
      status: 'verified',
      confidence: 'high',
      reasoning: `Farnell catalogue match: ${f.sku} (${f.description ?? 'matching part'}).`,
      source_url: f.product_url,
      source_title: f.description ?? null,
      source_method: 'farnell',
      distributor_price_gbp: f.price_gbp ?? null,
      distributor_availability: f.availability ?? null,
      distributor_datasheet_url: f.datasheet_url ?? null,
      generated_by: `${model} (farnell)`,
      generated_at: new Date().toISOString(),
    }
  }

  // No distributor hit. Return the best of tier 1 / tier 2.
  if (!first) return tavilyVerification
  if (!tavilyVerification) return first
  // Prefer the one with a source URL; prefer verified-high.
  if (first.status === 'verified' && first.confidence === 'high' && first.source_url) return first
  return tavilyVerification
}

/**
 * Verify every part candidate. Runs in parallel batches to bound concurrent
 * load on OpenRouter (drawer drawer_forgeos_gotchas_5896fd708eb2b496 —
 * burst-launching too many concurrent calls causes transient failures).
 */
export async function verifyAllParts(
  modules: ModuleSpec[],
  apiKey: string,
  options: { batchSize?: number; model?: string } = {},
): Promise<PartVerification[]> {
  const candidates = extractPartCandidates(modules)
  if (candidates.length === 0) return []
  const batchSize = options.batchSize ?? 10
  const model = options.model ?? VERIFIER_MODEL
  const results: PartVerification[] = []
  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    const batchResults = await Promise.all(batch.map(c => verifyPartCascade(c, apiKey, model)))
    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j]
      if (r) {
        results.push(r)
      } else {
        // Transport / parse failure — record as skip so the count is faithful
        results.push({
          ...batch[j],
          status: 'skip',
          confidence: 'low',
          reasoning: 'Verification call failed (transport / parse). Treat as unknown; do not strip.',
          source_url: null,
          source_title: null,
          source_method: 'skip',
          generated_by: model + ' (skip)',
          generated_at: new Date().toISOString(),
        })
      }
    }
  }
  return results
}

/**
 * Pattern-based "obviously a description, not a SKU" detector. Universal
 * fix 2026-05-20 (iter-8 council finding E — pre-RAG version). VF iter-7
 * BoM had Inventronics part_number = "200 W, 0.9 PF" — that's a power
 * rating + power factor, not a part number. Also "Osram PHYTOVYNE R1500"
 * (search-yields-no-results fabrication). Until SKU verification against
 * Octopart/Mouser RAG ships, this regex pre-pass strips obvious
 * description-as-SKU strings BEFORE the LLM verifier runs (cheaper) AND
 * catches LLM-verifier misses.
 *
 * Returns true when the string is very likely a description not a SKU.
 * Conservative — only fires when one of several strong signals matches.
 */
export function patternLooksLikeDescriptionNotSku(partNumber: string): { fake: boolean; reason: string } {
  const s = String(partNumber ?? '').trim()
  if (!s || s.length < 2) return { fake: false, reason: '' }

  // Pattern 1: starts with number + unit (e.g. "200 W", "120 V, 0.9 PF",
  // "5 kW", "4500 m³/h"). SKUs almost never start with a numeric value
  // followed by a unit symbol.
  if (/^\d+(?:\.\d+)?\s*[A-Za-z]{1,4}(\b|,|\s)/.test(s)) {
    const unitMatch = s.match(/^\d+(?:\.\d+)?\s*([A-Za-z]{1,4})/)
    const unit = unitMatch?.[1] ?? ''
    if (/^(w|kw|mw|v|kv|a|ka|hz|khz|mhz|pa|kpa|bar|psi|nm|cm|mm|m|l|kg|t|c|f|k|m3|ohm|pf|hp|ml|gpm|cfm|lpm)$/i.test(unit)) {
      return { fake: true, reason: `looks like a unit-prefixed value ("${s.slice(0, 30)}"), not a manufacturer SKU` }
    }
  }

  // Pattern 2: comma followed by space-and-letters in middle (description
  // pattern: "Volume X, Property Y"). Real SKUs use comma rarely if ever.
  if (/,\s+[A-Za-z]/.test(s)) {
    return { fake: true, reason: `contains description-style comma ("${s.slice(0, 30)}"), not a SKU pattern` }
  }

  // Pattern 3: three or more consecutive whitespace-separated words made
  // entirely of letters (no digits, no hyphens). Real SKUs almost always
  // contain some numeric or punctuation discriminator.
  if (/^[A-Za-z]+\s+[A-Za-z]+\s+[A-Za-z]+/.test(s)) {
    return { fake: true, reason: `three or more all-alphabetic words ("${s.slice(0, 30)}"), not a SKU pattern` }
  }

  // Pattern 4: explicit descriptor words that real catalogue part numbers
  // don't contain in the SKU string itself ("series", "type", "model",
  // "rating", "grade" + suffix).
  if (/\b(series|type|model|rating|grade)\b\s+[A-Z0-9]/i.test(s)) {
    return { fake: true, reason: `contains descriptor word + suffix ("${s.slice(0, 30)}"), not a SKU` }
  }

  // Pattern 5 (iter-9 Step 6, 2026-05-20): trade-name-without-model-suffix.
  // Real catalogue SKUs almost always carry a model-discriminator code
  // after the brand. "PHYTOVYNE R1500" looked plausible to iter-7 reviewers
  // but doesn't exist in the Osram catalogue; "OR120" returns Orange Amps
  // guitar amp not ORCA Grow LED reflector. Heuristic: an all-caps trade
  // name (≥5 letters, no digits) followed by a single short alphanumeric
  // code (3-6 chars), separated by a space. Real SKUs typically have more
  // discriminating structure (suffix sub-codes, dashes, mixed case).
  if (/^[A-Z]{5,}\s+[A-Z0-9]{3,6}$/.test(s)) {
    return { fake: true, reason: `trade-name + short code without manufacturer-typical discriminator ("${s.slice(0, 30)}"); likely hallucinated SKU` }
  }

  // Pattern 6 (iter-9 Step 6): model-prefix-only patterns like "HC-40-ISO-2024"
  // — descriptive dimensions used as a fake SKU. Real container manufacturer
  // SKUs use codes like "CIMC-D03-02B" not "HC-40-ISO-2024".
  // Heuristic: an all-uppercase code containing a 4-digit year (≥1990 ≤2099).
  if (/\b(19[9]\d|20\d{2})\b/.test(s) && /^[A-Z]/.test(s) && s.length <= 30 && /-/.test(s)) {
    return { fake: true, reason: `contains a year suffix in what looks like a SKU ("${s.slice(0, 30)}"); manufacturers rarely encode year in SKU` }
  }

  // Pattern 7 (iter-9 Step 6): rating-as-SKU like "18K Compressor" or
  // "30A 500V DC Fuse" — capacity + part-type strings used as model number.
  if (/^\d+[a-zA-Z]{1,3}\s+[A-Z]/i.test(s) && /\b(compressor|driver|relay|breaker|fuse|sensor|valve|pump|motor|battery|cell|panel|coil|tank)\b/i.test(s)) {
    return { fake: true, reason: `capacity-prefixed component name used as SKU ("${s.slice(0, 30)}"); rating + type ≠ catalogue part number` }
  }

  // Pattern 8 (iter-9 Step 6): obvious misspellings of common brand names.
  // Captures the "BobaCAT 5" iter-7 example. Limited to a few high-signal
  // cases where the LLM mis-capitalised a known brand.
  const misspellings = [
    /\bBobaCAT\b/i,           // Bobcat misspelled
    /\bPheonix\b/i,           // Phoenix misspelled
    /\bSeimens\b/i,           // Siemens misspelled
    /\bDaffoss\b/i,           // Danfoss misspelled
    /\bAllan[-\s]?Bradley\b/, // Allen-Bradley misspelled
    /\bRockville\b.*Automation/i,  // Rockwell Automation misspelled
  ]
  for (const re of misspellings) {
    if (re.test(s)) {
      return { fake: true, reason: `apparent brand-name misspelling ("${s.slice(0, 30)}"); manufacturer catalogue not found under this spelling` }
    }
  }

  return { fake: false, reason: '' }
}

/**
 * Mutate modules in-place: strip part_number modifiers from words whose
 * verification status is "unverified" AND confidence is "high". Manufacturer
 * stays — only the SKU is removed (so a Phoenix Contact word loses its fake
 * QUINT-TS-20 SKU but stays a "Phoenix Contact" item).
 *
 * 2026-05-20 iter-8 council fix E (light): ALSO strip part_number when it
 * matches a high-confidence "obvious description-not-SKU" pattern, even if
 * the LLM verifier didn't flag it as unverified+high. This catches the
 * "200 W, 0.9 PF" / "5 kW R290 monobloc" / similar misses that survived
 * verification because the verifier sometimes assumed the LLM was passing
 * descriptive context not a SKU.
 *
 * Returns count of stripped part_numbers + a list of (word_id, removed_pn)
 * for the action log.
 */
export function stripUnverifiedParts(
  modules: ModuleSpec[],
  verifications: PartVerification[],
): { stripped: number; details: Array<{ word_id: string; removed_pn: string; reasoning: string }> } {
  // Build a set of word_ids that should have part_number stripped
  const stripSet = new Map<string, PartVerification>()
  for (const v of verifications) {
    if (v.status === 'unverified' && v.confidence === 'high') {
      stripSet.set(`${v.module}::${v.sub_module_id}::${v.word_id}`, v)
    }
  }
  // Pattern pre-pass added 2026-05-20: also queue any part_number matching
  // the obvious-description pattern, regardless of verifier status.
  const patternStripDetails = new Map<string, string>()
  for (const m of modules ?? []) {
    for (const sm of ((m as any).sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
        const pnMod = mods.find((mc: any) => normaliseKind(String(mc?.kind ?? '')) === 'part_number')
        if (!pnMod) continue
        const pn = String(pnMod.value ?? '')
        const r = patternLooksLikeDescriptionNotSku(pn)
        if (r.fake) {
          const key = `${m.module}::${sm.id}::${w.id ?? '?'}`
          if (!stripSet.has(key)) {
            patternStripDetails.set(key, `${pn} — pattern strip: ${r.reason}`)
          }
        }
      }
    }
  }
  if (stripSet.size === 0 && patternStripDetails.size === 0) return { stripped: 0, details: [] }

  const details: Array<{ word_id: string; removed_pn: string; reasoning: string }> = []
  let stripped = 0
  for (const m of modules ?? []) {
    for (const sm of ((m as any).sub_modules ?? [])) {
      for (const w of (sm.words ?? [])) {
        const key = `${m.module}::${sm.id}::${w.id ?? '?'}`
        const v = stripSet.get(key)
        const patternReason = patternStripDetails.get(key)
        if (!v && !patternReason) continue
        const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : null
        if (!mods) continue
        const pnBefore = String(mods.find((mc: any) => normaliseKind(String(mc?.kind ?? '')) === 'part_number')?.value ?? '')
        const before = mods.length
        const filtered = mods.filter((mc: any) => normaliseKind(String(mc?.kind ?? '')) !== 'part_number')
        if (filtered.length < before) {
          w.modifier_characters = filtered
          stripped++
          details.push({
            word_id: key,
            removed_pn: v?.part_number ?? pnBefore,
            reasoning: v?.reasoning ?? patternReason ?? 'pattern strip',
          })
        }
      }
    }
  }
  return { stripped, details }
}

// ─── Strip + recommend ────────────────────────────────────────────────────────

const RECOMMENDER_SYSTEM = `You are a procurement engineer helping a designer pick a REAL component to replace one that was found to be fabricated in an LLM-generated design.

HONESTY RULE — non-negotiable: if you don't know a real, verifiable manufacturer + part number for the application, say so. NEVER invent a SKU to look helpful. The reader is a real engineer who will try to procure the part — a fabricated suggestion creates a worse problem than admitting uncertainty.

For each stripped part the user gives you:
  1. Read what the part needs to do (application context + technical requirements already in the word's other modifiers).
  2. EITHER recommend a real (manufacturer, part_number) you are confident exists and fits the application
  3. OR explicitly say "uncertain — manual sourcing required" with a one-sentence note about what to search for.

Output JSON ONLY:
{
  "confidence": "high" | "medium" | "low" | "unknown",
  "recommended_manufacturer": "<string>" | null,
  "recommended_part_number": "<string>" | null,
  "reasoning": "<1-2 sentences>",
  "source_url": "<URL where this recommendation can be verified — datasheet/distributor>" | null,
  "source_title": "<title of source page>" | null
}

URL CAPTURE — for high or medium confidence, include source_url + source_title so the engineer can click straight to the datasheet/distributor page. Without a verifiable source URL, drop confidence to "low" or "unknown".

confidence guide:
  "high"    — you've seen the part in catalogues / datasheets; the SKU exists and fits the application
  "medium"  — the manufacturer's product family fits but the specific suffix may differ in production
  "low"     — manufacturer is plausible but you can't vouch for the SKU; the designer should verify
  "unknown" — the engine cannot recommend; manual sourcing required. In this case BOTH manufacturer AND part_number MUST be null.

When confidence is "unknown", the reasoning should describe what the designer should look for (e.g. "uncertain — search for a 1500A 1000VDC HRC fuse from Mersen / Bussmann / Eaton catalogues against IEC 60269-6").`

const RECOMMENDER_MODEL = 'google/gemini-3.1-flash-lite'

/**
 * Generate a recommendation for one stripped part. Returns null on transport
 * / parse failure (caller treats as "no recommendation available").
 */
export async function recommendReplacement(
  stripped: { word_id: string; removed_pn: string; reasoning: string; word_name?: string; module?: string; sub_module_id?: string; technical_summary?: string },
  apiKey: string,
  model: string = RECOMMENDER_MODEL,
): Promise<PartRecommendation | null> {
  // Parse the word_id to recover module / sub_module / word ids if not provided
  const parts = (stripped.word_id || '').split('::')
  const moduleId = stripped.module ?? parts[0] ?? '?'
  const subModuleId = stripped.sub_module_id ?? parts[1] ?? '?'
  const wordId = parts[2] ?? '?'
  const wordName = stripped.word_name ?? wordId.replace(/_word$/, '').replace(/_/g, ' ')

  const userContent = `STRIPPED PART (was fabricated):
  Word:    ${wordName}
  Location: ${moduleId}::${subModuleId}
  Removed manufacturer + part_number: <stripped — was fabricated>
  Why stripped: ${stripped.reasoning}

${stripped.technical_summary ? `Technical requirements from other modifiers on this word:
${stripped.technical_summary}
` : ''}
Recommend a REAL replacement OR say "uncertain — manual sourcing required". Output JSON only.`

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      // ⚠️ LM-ONLY RECOMMENDATION — no fresh web search. Recommender returns
      // (manufacturer, part_number) from training data. URL field is also from
      // training memory. To get a real catalogue URL for the recommendation,
      // the cascade then escalates to Mouser/DigiKey/Farnell lookups (the
      // recMfr+recPn are fed in as the next lookup target). Verified 2026-05-16:
      // OpenRouter's google_search_grounding flag is silently ignored for
      // Gemini Flash-Lite — model responds from January-2025 training cutoff.
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 600,
        thinking_level: 'low',
        messages: [
          { role: 'system', content: RECOMMENDER_SYSTEM },
          { role: 'user', content: userContent },
        ],
      }),
    })
    if (!response.ok) return null
    const json = await response.json() as any
    const text = (json.choices?.[0]?.message?.content ?? '').trim()
    if (!text) return null
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    let parsed: any
    try { parsed = JSON.parse(cleaned) } catch { return null }
    const confidence = String(parsed.confidence ?? '').toLowerCase() as 'high' | 'medium' | 'low' | 'unknown'
    if (!['high', 'medium', 'low', 'unknown'].includes(confidence)) return null
    const recMfr = parsed.recommended_manufacturer === null ? null : String(parsed.recommended_manufacturer ?? '').trim() || null
    const recPn  = parsed.recommended_part_number === null ? null : String(parsed.recommended_part_number ?? '').trim() || null
    const reasoning = String(parsed.reasoning ?? '').trim()
    let sourceUrl: string | null = typeof parsed.source_url === 'string' && parsed.source_url.startsWith('http') ? parsed.source_url : null
    let sourceTitle: string | null = typeof parsed.source_title === 'string' && parsed.source_title.trim().length > 0 ? parsed.source_title.trim() : null
    // Track whether the URL came from a distributor API (trusted) or the LLM
    // (must HEAD-check). Distributor URLs are trusted by construction; LLM
    // URLs are training-data memory and may be dead.
    let urlSource: 'lm' | 'distributor' = 'lm'

    // Honesty enforcement: if confidence is unknown, both fields MUST be null.
    if (confidence === 'unknown' && (recMfr || recPn)) {
      return null
    }
    if (confidence !== 'unknown' && (!recMfr || !recPn)) {
      return null
    }

    // If LLM didn't return a source URL but we have a confident recommendation,
    // escalate to Mouser/DigiKey/Farnell to find a real catalogue page.
    // Distributor URLs are trusted (no HEAD-check needed).
    if (recMfr && recPn && !sourceUrl && (confidence === 'high' || confidence === 'medium')) {
      const m = await mouserLookup(recMfr, recPn)
      if (m?.found && m.product_url) {
        sourceUrl = m.product_url
        sourceTitle = m.description ?? null
        urlSource = 'distributor'
      } else {
        const d = await digikeyLookup(recMfr, recPn)
        if (d?.found && d.product_url) {
          sourceUrl = d.product_url
          sourceTitle = d.description ?? null
          urlSource = 'distributor'
        } else {
          const f = await farnellLookup(recMfr, recPn)
          if (f?.found && f.product_url) {
            sourceUrl = f.product_url
            sourceTitle = f.description ?? null
            urlSource = 'distributor'
          }
        }
      }
    }

    // HEAD-check ONLY LLM-emitted URLs. Distributor URLs are trusted; they're
    // catalogue-canonical and may return 403 to bots while working fine for
    // real users (DigiKey + Farnell both bot-block). LLM URLs are training-
    // memory and need to be confirmed alive.
    if (sourceUrl && urlSource === 'lm') {
      const ok = await urlResolves(sourceUrl)
      if (!ok) {
        sourceUrl = null
        sourceTitle = null
      }
    }

    return {
      id: stripped.word_id,
      module: moduleId,
      sub_module_id: subModuleId,
      word_id: wordId,
      word_name: wordName,
      application_summary: stripped.technical_summary ?? '',
      confidence,
      recommended_manufacturer: recMfr,
      recommended_part_number: recPn,
      reasoning,
      source_url: sourceUrl,
      source_title: sourceTitle,
      generated_by: model,
      generated_at: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/**
 * Generate recommendations for all stripped parts in parallel batches.
 * Returns the recommendations; failures become explicit "engine could not
 * recommend; manual sourcing required" entries so nothing is silently
 * lost.
 */
export async function recommendReplacementsForStripped(
  stripped: Array<{ word_id: string; removed_pn: string; reasoning: string; word_name?: string; module?: string; sub_module_id?: string; technical_summary?: string }>,
  apiKey: string,
  options: { batchSize?: number; model?: string } = {},
): Promise<PartRecommendation[]> {
  if (stripped.length === 0) return []
  const batchSize = options.batchSize ?? 10
  const model = options.model ?? RECOMMENDER_MODEL
  const out: PartRecommendation[] = []
  for (let i = 0; i < stripped.length; i += batchSize) {
    const batch = stripped.slice(i, i + batchSize)
    const results = await Promise.all(batch.map(s => recommendReplacement(s, apiKey, model)))
    for (let j = 0; j < results.length; j++) {
      const r = results[j]
      const s = batch[j]
      const parts = (s.word_id || '').split('::')
      if (r) {
        out.push(r)
      } else {
        out.push({
          id: s.word_id,
          module: s.module ?? parts[0] ?? '?',
          sub_module_id: s.sub_module_id ?? parts[1] ?? '?',
          word_id: parts[2] ?? '?',
          word_name: s.word_name ?? (parts[2] ?? '?').replace(/_word$/, '').replace(/_/g, ' '),
          application_summary: s.technical_summary ?? '',
          confidence: 'unknown',
          recommended_manufacturer: null,
          recommended_part_number: null,
          reasoning: `Engine could not produce a verified recommendation (transport / parse failure). Manual sourcing required against the technical spec listed on this word. Stripped because: ${s.reasoning}`,
          source_url: null,
          source_title: null,
          generated_by: model + ' (fallback)',
          generated_at: new Date().toISOString(),
        })
      }
    }
  }
  return out
}

/**
 * Build a short technical summary for a word from its remaining modifier_characters
 * (post-strip). Used to give the recommender enough context to suggest a real
 * alternative — without it the recommender is guessing blind.
 */
export function buildTechnicalSummary(modules: ModuleSpec[], moduleId: string, subModuleId: string, wordId: string): string {
  for (const m of modules ?? []) {
    if (m.module !== moduleId) continue
    for (const sm of ((m as any).sub_modules ?? [])) {
      if (sm.id !== subModuleId) continue
      for (const w of (sm.words ?? [])) {
        if (String(w.id) !== wordId) continue
        const mods = Array.isArray(w.modifier_characters) ? w.modifier_characters : []
        const parts: string[] = []
        for (const mc of mods) {
          const k = normaliseKind(String(mc?.kind ?? ''))
          // Skip manufacturer (it was just stripped) and quantity/qty (not useful for SKU choice)
          if (k === 'manufacturer' || k === 'part_number' || k === 'quantity') continue
          const v = String(mc?.value ?? '').trim()
          if (!v) continue
          parts.push(`${k}: ${v}`)
        }
        return parts.join('; ')
      }
    }
  }
  return ''
}
