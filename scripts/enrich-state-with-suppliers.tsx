#!/usr/bin/env -S npx tsx
/**
 * enrich-state-with-suppliers.tsx — augment a pipeline state.json with
 * `state.suppliers` by querying ~/.forge-truth/forge-truth.db, then SCORING
 * each candidate via Flash-Lite for fit-to-brief. Per Tristan 2026-05-17
 * critique: "suppliers complete disaster... TPI Composites (wind turbine
 * blades) for battery storage is ridiculous". Fix: generate a supplier brief
 * per archetype, ask Flash-Lite 0-10 score + "why this fits" reasoning,
 * reject candidates that don't make sense.
 *
 * Usage:
 *   npx tsx scripts/enrich-state-with-suppliers.tsx <state.json> [--write]
 *
 * Reads state.json, identifies the product_class, looks up CLASS_SUPPLIERS,
 * for each archetype queries forge-truth.db `companies` table with the
 * archetype's `search_profiles` and `preferred_regions`. Picks top 3
 * candidates per archetype, ranked by Companies House verification + relevance
 * score. Writes back to state.json under `suppliers`.
 *
 * Confidence rule:
 *   high   = status in (approved, pushed) AND ch_company_number IS NOT NULL
 *   medium = status in (enriched, approved) AND ch_company_number IS NOT NULL
 *            OR status in (approved, pushed) without CH
 *   low    = status = enriched without CH
 *
 * MVP: no LLM-generated reasoning per supplier. Description from
 * forge-truth.db description column is used verbatim. Future iteration can
 * generate per-candidate "why this fits the brief" reasoning via Flash-Lite.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { resolve } from 'path'
import { CLASS_SUPPLIERS, type SupplierArchetype } from '../src/lib/pdf-engine-v2/class-suppliers'
// Bug #5 (Tristan 2026-05-18): persist web-fallback candidates back to
// forge-truth.db. See module for details on the architectural gap this closes.
import {
  persistArchetypeWebCandidates,
  queryArchetypeTaggedCandidates,
} from './supplier-enrichment/persist-web-fallback'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'
const CANDIDATES_PER_ARCHETYPE = 3
const POOL_PER_ARCHETYPE = 15  // Query 5× the final count so the LLM scorer has options
const MIN_LLM_SCORE = 6  // Reject candidates that score below this

const OPENROUTER_KEY = (() => {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  // Try ~/secrets/openrouter.env
  const candidates = [
    '/Users/tristanfischer/.claude/secrets/openrouter.env',
    '/Users/tristanfischer/secrets/openrouter.env',
    '/Users/tristanfischer/.openrouter',
  ]
  for (const f of candidates) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(/OPENROUTER_API_KEY=([^\s]+)/)
      if (m) return m[1]
    }
  }
  // Last resort: try shell
  try {
    return execFileSync('zsh', ['-ic', 'echo $OPENROUTER_API_KEY'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
})()

if (!OPENROUTER_KEY) {
  console.error('[enrich-suppliers] WARNING: OPENROUTER_API_KEY not found — LLM scoring disabled, will fall back to keyword filter only')
}

/**
 * Brave Search API key for web-fallback supplier lookup.
 * Loaded the same way as OPENROUTER_KEY — env first, then secrets files. We
 * never commit the literal key; the script reads from disk at runtime.
 */
const BRAVE_KEY = (() => {
  if (process.env.BRAVE_API_KEY) return process.env.BRAVE_API_KEY
  const candidates = [
    '/Users/tristanfischer/.claude/secrets/brave.env',
    '/Users/tristanfischer/Developer/Forge-Capital/.env',
    '/Users/tristanfischer/secrets/brave.env',
  ]
  for (const f of candidates) {
    if (existsSync(f)) {
      const content = readFileSync(f, 'utf-8')
      const m = content.match(/BRAVE_API_KEY=([^\s]+)/)
      if (m) return m[1]
    }
  }
  return ''
})()

if (!BRAVE_KEY) {
  console.error('[enrich-suppliers] WARNING: BRAVE_API_KEY not found — web-fallback search disabled')
}

/** Brave free tier: ~1 req/sec. Cap concurrency at 1 with a 1.1s wait between calls. */
const BRAVE_INTER_CALL_MS = 1100
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'
const BRAVE_RESULTS_PER_QUERY = 15
/** Domains that aggregate or list people/companies but rarely surface a supplier landing page. */
const WEB_FALLBACK_DOMAIN_BLOCKLIST = new Set([
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'glassdoor.co.uk',
  'wikipedia.org',
  'en.wikipedia.org',
  'pinterest.com',
  'pinterest.co.uk',
  'facebook.com',
  'twitter.com',
  'x.com',
  'youtube.com',
  'reddit.com',
  // Phase22 fix C2: trade publications / news sites that cover suppliers but
  // are NOT suppliers themselves. Without this, the name-host reconciliation
  // falls back to the host-derived name ("Modbs" for modbs.co.uk = Modern
  // Building Services trade publication) instead of rejecting the result.
  'modbs.co.uk',
  'hydrocarbons21.com',
  'archive.hydrocarbons21.com',
  'r744.com',
  'ammonia21.com',
  'coolingpost.com',
  'rac.uk.com',
  'rac-magazine.co.uk',
  'thinkgeoenergy.com',
  'renewableenergymagazine.com',
  'just-auto.com',
  'electrive.com',
  'electrive.net',
  'pv-magazine.com',
  'pv-tech.org',
  'cleantechnica.com',
  'bloomberg.com',
  'reuters.com',
  'ft.com',
  'forbes.com',
  'theguardian.com',
  'theverge.com',
  'techcrunch.com',
  'engadget.com',
  'wired.com',
  'arstechnica.com',
  'newatlas.com',
  'medium.com',
  'substack.com',
  'researchgate.net',
  'scribd.com',
  'slideshare.net',
  'amazon.co.uk',
  'amazon.com',
  'ebay.co.uk',
  'ebay.com',
  'alibaba.com',
  'aliexpress.com',
  'made-in-china.com',
  'thomasnet.com',
  'midsummerwholesale.co.uk',
  'screwfix.com',
  'screwfix.co.uk',
  'toolstation.com',
  // 2026-05-18 PM re-audit fix #4: trade-directory aggregators that slipped
  // through earlier audits. "buildingservicesindex.co.uk" surfaced as a
  // hvac_integrator candidate for vertical-farm; the others are common B2B
  // directory hosts that surface listicle-style category pages rather than
  // actual supplier landing pages.
  'buildingservicesindex.co.uk',
  'europages.com',
  'europages.co.uk',
  'yelp.com',
  'yelp.co.uk',
  'bizcommunity.com',
  'companyhunter.com',
  'companyhunter.co.uk',
  'enviropro.co.uk',
  'enviropro.com',
  'kompass.com',
  'kompass.co.uk',
  'bloomberg.com',  // duplicate-safe (already above) — keep set semantics
])

/**
 * 2026-05-18 PM re-audit fix #4: regex path patterns that mark a URL as a
 * directory / aggregator / listicle page regardless of the host. Examples:
 *   /category/heat-pumps/  /companies/  /directory/uk-suppliers  /listings/
 * Used as a secondary gate in isAcceptableWebResult — a URL like
 * `goodhost.co.uk/directory/widget-suppliers` is still likely an aggregator
 * page even though the host isn't on the blocklist.
 */
const AGGREGATOR_PATH_REGEX = /\/(category|companies|directory|listings?|providers|suppliers-list|manufacturer-directory|companylist)(\/|$|\?)/i

interface BraveResult {
  name: string
  url: string
  description: string
}

interface WebSourcedCandidate {
  name: string
  raw_title: string
  url: string
  description: string | null
  source: 'web-fallback'
  ch_verified: false
  confidence: 'high' | 'medium' | 'low'
  score: number
  reasoning: string
  /** Inferred city / country from snippet regex (preferred) or URL TLD heuristic (fallback). Null when neither yields anything. */
  city: string | null
  country: string | null
  /** True when city/country was inferred ONLY from the URL TLD — flagged so downstream readers know the confidence band. False when sourced from the Brave snippet address / "based in" phrasing. */
  location_inferred_from_tld?: boolean
}

interface ArchetypeProvenance {
  archetype: string
  source: 'web-fallback'
  brave_query: string
  brave_results: number
  accepted_count: number
}

/** Module-level provenance log — populated as web-fallback fires per archetype. */
const provenanceLog: ArchetypeProvenance[] = []

/** Module-level call counters for the cost report. */
const callCounters = { brave: 0, flashLite: 0, nameCleanup: 0, capability: 0 }

/**
 * Per-class extra Brave keyword phrases. Used when an archetype's default
 * keyword set is too generic and surfaces aggregator listings rather than
 * heat-pump-specific OEMs. Tristan 2026-05-17: heat pump principal_oem in
 * particular needs broader query terms ("monobloc R290 heat pump
 * manufacturer UK", "air-to-water heat pump OEM") so the renderer doesn't
 * ship blank archetypes. The script merges these into the archetype's
 * existing search_keywords before constructing the Brave query.
 */
const CLASS_EXTRA_KEYWORDS: Record<string, Record<string, string[]>> = {
  heatpump: {
    principal_oem: [
      'monobloc R290 heat pump manufacturer UK',
      'air-to-water heat pump OEM',
      'propane heat pump manufacturer UK',
      'commercial heat pump OEM UK',
    ],
    compressor_supplier: [
      'R290 propane scroll compressor',
      'heat-pump compressor distributor UK',
      'hermetic scroll compressor manufacturer',
      'rotary compressor R290 heat pump',
    ],
    sheet_metal_enclosure: [
      'outdoor weatherproof enclosure fabricator UK',
      'IP55 sheet metal cabinet manufacturer',
      'acoustic louvre heat pump enclosure',
      'powder-coated outdoor cabinet manufacturer UK',
    ],
  },
  // 2026-05-18 PM re-audit fix #5: drone final_qa shipped 2/3 in the audit
  // (only WholeShip + Edinburgh Drone Co survived dedup). Broader keyword
  // formulations — UAV operator services, calibration houses, drone-specific
  // EMC/RF labs — give the primary query more shots at returning UK-based
  // QA-capable companies.
  consumer_cinematography_drone: {
    final_qa: [
      'UAV flight test services UK',
      'drone calibration laboratory UK',
      'UAV airworthiness testing services',
      'commercial drone QA partner UK',
      'unmanned aerial system test house UK',
      'drone EMC RF test laboratory UK',
      'ISO 9001 drone test calibration UK',
    ],
  },
}

/**
 * Strip page-title suffixes (" | Sartorius", " - Sartorius", " — Sartorius")
 * to expose the canonical company name. Used by canonicaliseNameForDedup so
 * three different product pages on the same domain ("Single-Use Bioreactors
 * | Sartorius" / "Fermentation & Bioreactors | Sartorius" / etc.) collapse
 * to the same canon, even when the LLM-cleaned name disagrees on which
 * sub-brand to surface.
 *
 * The HEURISTIC: the RIGHTMOST segment of a "|"/"-"/"—" split is usually the
 * parent brand (e.g. "Single-Use Bioreactors | Sartorius" → "Sartorius",
 * "PRESSURE VESSELS | Gilwood Ltd" → "Gilwood Ltd"). Returns the rightmost
 * non-empty segment when at least 2 segments are present; otherwise returns
 * the trimmed input.
 */
function stripPageTitleSuffix(raw: string): string {
  if (!raw) return ''
  const segments = raw.split(/\s+[|–—]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean)
  if (segments.length < 2) return raw.trim()
  // Rightmost segment is the company; longer left side is usually the page subject.
  return segments[segments.length - 1]
}

/**
 * Stronger canonicaliser for cross-result dedup. Strips page-title suffixes
 * first, then applies the company-suffix + non-alphanumeric stripping rules
 * canonicaliseName uses. Two web results "Single-Use Bioreactors | Sartorius"
 * and "Fermentation & Bioreactors | Sartorius" both collapse to "sartorius".
 */
function canonicaliseNameForDedup(raw: string): string {
  return canonicaliseName(stripPageTitleSuffix(raw))
}

/**
 * Extract the registrable apex (e.g. "sartorius.com" from
 * "www.sartorius.com", "shop.sartorius.com", "sartorius.co.uk"). Used as the
 * primary dedup key when the same company surfaces multiple product pages.
 * Returns '' on parse failure.
 */
function extractRegistrableDomain(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase()
    if (!host) return ''
    const parts = host.split('.')
    if (parts.length <= 2) return host
    // Two-label public suffixes commonly seen in our results.
    const twoLabelSuffixes = new Set(['co.uk', 'com.au', 'co.nz', 'co.jp', 'com.cn', 'co.in', 'co.za', 'org.uk', 'ac.uk', 'gov.uk', 'ne.jp', 'or.jp'])
    const lastTwo = parts.slice(-2).join('.')
    if (twoLabelSuffixes.has(lastTwo)) {
      return parts.slice(-3).join('.')
    }
    return parts.slice(-2).join('.')
  } catch {
    return ''
  }
}

/**
 * 2026-05-18 PM re-audit fix #2: gate proposed city values against obvious
 * garbage (page-title fragments, brand fragments, sentence fragments, part
 * numbers, country tokens). Returns true when `city` looks like a real city
 * name; false when it should be discarded.
 *
 * Examples that should be rejected:
 *   "UAVTEK"          — competing brand name picked up from page text
 *   "UK. Design"      — sentence fragment ("UK. Design and manufacturing...")
 *   "BotsanddroneS"   — host-derived rubbish
 *   "X"               — too short
 *   "Heat Pump 2026"  — contains digits
 *
 * The gate is intentionally STRICT: when in doubt we discard. A blank city
 * field renders as "country only" which is acceptable; a wrong city renders
 * as founder-visible nonsense.
 *
 * @param city The proposed city string (already trimmed).
 * @param companyName The candidate's company name — city must not equal it.
 */
function isValidCityCandidate(city: string | null | undefined, companyName?: string | null): boolean {
  if (!city) return false
  const trimmed = String(city).trim()
  if (trimmed.length < 2) return false
  if (trimmed.length > 40) return false
  // Lower-cased equality / containment check against the company name — city
  // must not BE the company name (or a clear substring of it).
  if (companyName) {
    const cLower = trimmed.toLowerCase()
    const nLower = String(companyName).toLowerCase()
    if (cLower === nLower) return false
    // Drop common company-suffix tokens before substring comparison.
    const nLowerStripped = nLower.replace(/\b(ltd|limited|plc|inc|llc|gmbh|company|group|solutions|services|systems)\b\.?/g, '').replace(/\s+/g, ' ').trim()
    if (cLower === nLowerStripped) return false
    // City fully contained in company name (e.g. proposed city "UAVTEK" inside
    // "UAVTEK Drone Innovation").
    if (nLower.includes(cLower) && cLower.length <= nLower.length / 2) return false
  }
  // Digits other than postcode-like spacing — UK postcodes don't appear in
  // the city field separately, so any digit cluster is rubbish.
  if (/\d/.test(trimmed)) return false
  // Punctuation other than apostrophe, hyphen, space, or period inside
  // abbreviations like "St." (we still strip period below, but allow it in
  // the middle of a token).
  if (/[^A-Za-z .'\-]/.test(trimmed)) return false
  // Reject trailing-period sentence fragments like "UK." or "Design."
  if (/\.$/.test(trimmed)) return false
  // Reject country tokens that the snippet regex sometimes mis-identifies as
  // cities (e.g. "England", "USA").
  const COUNTRY_TOKENS_LOWER = new Set([
    'uk', 'u.k.', 'usa', 'u.s.a.', 'us', 'england', 'scotland', 'wales',
    'britain', 'ireland', 'germany', 'france', 'netherlands', 'italy',
    'spain', 'switzerland', 'sweden', 'norway', 'denmark', 'finland',
    'belgium', 'austria', 'poland', 'portugal', 'canada', 'australia',
    'china', 'japan', 'korea', 'taiwan', 'india', 'eu', 'europe',
  ])
  if (COUNTRY_TOKENS_LOWER.has(trimmed.toLowerCase())) return false
  // Reject prose-y words / verb forms that suggest a sentence fragment.
  if (/\b(design|manufactur(ing|er|ed)?|service|solution|product|company|industry|industrial|the|and|with|from|for)\b/i.test(trimmed)) return false
  // Require at least one letter and a leading capital (most real cities are
  // proper-cased, "ALLCAPS" tokens like "UAVTEK" fail this when stripped to
  // mixed case, but a 2+ token "ALL CAPS NAME" can sneak through — extra
  // safety: reject all-caps tokens >4 chars as they look like acronyms/brand
  // names).
  if (!/^[A-Z]/.test(trimmed)) return false
  const tokens = trimmed.split(/\s+/)
  if (tokens.length > 4) return false
  for (const t of tokens) {
    if (t.length >= 5 && t === t.toUpperCase()) return false  // all-caps fragment
  }
  return true
}

/**
 * 2026-05-18 PM re-audit fix #1: known-supplier-locations override table.
 * The previous fallback script `_tmp-backfill-supplier-locations.mjs`
 * (deleted by a prior agent) carried hand-curated city/country pairs for the
 * 30-odd well-known suppliers that re-appear across pipeline runs. Without
 * this, the script issues a Brave query for every Sartorius / Danfoss /
 * Bitzer it sees, even though we already know their HQs.
 *
 * Keyed by the apex-canonical hostname OR a lowercased company-name token
 * (whichever the caller can produce). When both keys would match different
 * locations, the apex-host match wins.
 *
 * Adding a new entry is cheap — no schema change required, just append.
 */
const KNOWN_SUPPLIER_LOCATIONS: Record<string, { city: string; country: string }> = {
  // Heat pump compressors + components
  'danfoss.com': { city: 'Nordborg', country: 'Denmark' },
  'bitzer.de': { city: 'Sindelfingen', country: 'Germany' },
  'mhi-mth.com': { city: 'Hiroshima', country: 'Japan' },
  // Bioreactors / lab equipment
  'sartorius.com': { city: 'Göttingen', country: 'Germany' },
  // Heat pump OEMs
  'clade-es.com': { city: 'Sheffield', country: 'United Kingdom' },
  'idealheating.com': { city: 'Hull', country: 'United Kingdom' },
  'exindagroup.com': { city: 'Coventry', country: 'United Kingdom' },
  // Drone manufacturers
  'clogworks.com': { city: 'Sheffield', country: 'United Kingdom' },
  'edinburghdronecompany.co.uk': { city: 'Edinburgh', country: 'United Kingdom' },
  'pirancomposites.com': { city: 'Penzance', country: 'United Kingdom' },
  'refitech.eu': { city: 'Helmond', country: 'Netherlands' },
  'junocomposites.com': { city: 'Bristol', country: 'United Kingdom' },
  'botsanddrones.uk': { city: 'Tewkesbury', country: 'United Kingdom' },
  'wholeship.co.uk': { city: 'London', country: 'United Kingdom' },
  // EV chargers
  'rolecserv.com': { city: 'Boston', country: 'United Kingdom' },
  'en-plustech.com': { city: 'Shenzhen', country: 'China' },
  'citaevcharger.co.uk': { city: 'Birmingham', country: 'United Kingdom' },
  'rectifiertechnologies.com': { city: 'Melbourne', country: 'Australia' },
  'infypower.com': { city: 'Shenzhen', country: 'China' },
  'evchargermodule.com': { city: 'Shenzhen', country: 'China' },
  // Vertical farm
  'lettusgrow.com': { city: 'Bristol', country: 'United Kingdom' },
  'verticallyurban.com': { city: 'Leeds', country: 'United Kingdom' },
  // Sheet metal / cabinet fabricators
  'hydram.co.uk': { city: 'Newton Aycliffe', country: 'United Kingdom' },
  'jcmetalworks.co.uk': { city: 'Loughborough', country: 'United Kingdom' },
  'kmf.co.uk': { city: 'Newcastle-under-Lyme', country: 'United Kingdom' },
  'ipenclosures.co.uk': { city: 'Sheffield', country: 'United Kingdom' },
  'eldapoint-group.co.uk': { city: 'Liverpool', country: 'United Kingdom' },
  'ritherdon.co.uk': { city: 'Darwen', country: 'United Kingdom' },
}

/**
 * Look up an apex-host in KNOWN_SUPPLIER_LOCATIONS. Returns null when unknown.
 */
function knownSupplierLocation(apexHost: string | null | undefined): { city: string; country: string } | null {
  if (!apexHost) return null
  const lower = String(apexHost).toLowerCase().replace(/^www\./, '')
  return KNOWN_SUPPLIER_LOCATIONS[lower] ?? null
}

/**
 * Try to extract a city / country from a Brave (or Tavily) result snippet.
 * Tristan 2026-05-18 bug 1: web-sourced supplier candidates carried
 * city=null/country=null because the TLD-only inference returns null for
 * `.com` domains. The Brave description often contains a street address,
 * "headquartered in X", "based in X", or "X, UK" — cheap regex pass picks
 * that up first, free win before falling back to TLD inference.
 *
 * Returns { city, country, source } when something parses; null otherwise.
 * The `source` field is used to flag low-confidence inferences (TLD only)
 * vs higher-confidence ones (explicit address / "based in" phrasing).
 */
function locationFromSnippet(
  description: string | null | undefined,
): { city: string | null; country: string | null; source: 'snippet-address' | 'snippet-based' | 'snippet-tld' } | null {
  if (!description) return null
  // Strip HTML tags Brave sometimes leaves in ("<strong>X</strong>").
  const text = String(description).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (!text) return null

  // Country/region keyword map. Order matters — longer/more specific phrases
  // first so "United Kingdom" wins over "Kingdom" alone.
  const COUNTRY_PHRASES: Array<{ pattern: RegExp; country: string }> = [
    { pattern: /\bUnited Kingdom\b/i, country: 'United Kingdom' },
    { pattern: /\b(?:UK-(?:based|made)|U\.K\.|British)\b/i, country: 'United Kingdom' },
    // "in the UK" / "the UK" / "from UK" — the word boundary catches a bare UK
    // token preceded by a definite article or short preposition, which is the
    // overwhelmingly common pattern in Brave snippets ("engineered in the UK
    // to meet..."). Standalone "UK" is too greedy (matches "UK 2026 awards"),
    // so we require an adjacent connector word.
    { pattern: /\b(?:in|from|across|throughout)\s+(?:the\s+)?UK\b/i, country: 'United Kingdom' },
    { pattern: /\bUK[- ](?:made|manufactured|engineered|designed|based|built)\b/i, country: 'United Kingdom' },
    { pattern: /\bGreat Britain\b/i, country: 'United Kingdom' },
    { pattern: /\b(?:England|Scotland|Wales|Northern Ireland)\b/, country: 'United Kingdom' },
    { pattern: /\bRepublic of Ireland\b/i, country: 'Ireland' },
    { pattern: /\b(?:Irish|Ireland)\b/, country: 'Ireland' },
    { pattern: /\b(?:Germany|German|Deutschland)\b/, country: 'Germany' },
    { pattern: /\b(?:France|French)\b/, country: 'France' },
    { pattern: /\b(?:Netherlands|Dutch|Holland)\b/, country: 'Netherlands' },
    { pattern: /\b(?:Italy|Italian)\b/, country: 'Italy' },
    { pattern: /\b(?:Spain|Spanish)\b/, country: 'Spain' },
    { pattern: /\b(?:Switzerland|Swiss)\b/, country: 'Switzerland' },
    { pattern: /\b(?:Sweden|Swedish)\b/, country: 'Sweden' },
    { pattern: /\b(?:Norway|Norwegian)\b/, country: 'Norway' },
    { pattern: /\b(?:Denmark|Danish)\b/, country: 'Denmark' },
    { pattern: /\b(?:Finland|Finnish)\b/, country: 'Finland' },
    { pattern: /\b(?:Belgium|Belgian)\b/, country: 'Belgium' },
    { pattern: /\b(?:Austria|Austrian)\b/, country: 'Austria' },
    { pattern: /\b(?:Poland|Polish)\b/, country: 'Poland' },
    { pattern: /\b(?:Portugal|Portuguese)\b/, country: 'Portugal' },
    { pattern: /\b(?:United States|USA|U\.S\.A\.|American)\b/, country: 'United States' },
    { pattern: /\b(?:Canada|Canadian)\b/, country: 'Canada' },
    { pattern: /\b(?:Australia|Australian)\b/, country: 'Australia' },
    { pattern: /\b(?:China|Chinese)\b/, country: 'China' },
    { pattern: /\b(?:Japan|Japanese)\b/, country: 'Japan' },
    { pattern: /\b(?:Korea|Korean)\b/, country: 'South Korea' },
    { pattern: /\b(?:Taiwan|Taiwanese)\b/, country: 'Taiwan' },
    { pattern: /\b(?:India|Indian)\b/, country: 'India' },
  ]

  // Try "headquartered in X" / "based in X" / "engineered in X" — high-
  // confidence explicit location statements. Captures city or country.
  // Added "engineered/manufactured/designed/made" 2026-05-18 — "engineered in
  // the UK" is a common Brave-snippet form for British fabricators that the
  // narrower "based in" wording would miss.
  const basedInMatch = text.match(/\b(?:headquartered|based|founded|headquarters|located|operating|engineered|manufactured|designed|made|built)\s+in\s+(?:the\s+)?([A-Z][A-Za-z .'-]{2,40}?|UK)(?:[,.()]|\sand\s|\swith\s|\s—|\sto\s|$)/)
  if (basedInMatch) {
    const phrase = basedInMatch[1].trim().replace(/[,.;:]$/, '')
    // Is the phrase itself a country?
    for (const { pattern, country } of COUNTRY_PHRASES) {
      if (pattern.test(phrase)) return { city: null, country, source: 'snippet-based' }
    }
    // Country tokens that look like cities to the broad-phrase regex above
    // ("UK", "England", "USA") — don't surface them as cities.
    const COUNTRY_TOKENS = new Set([
      'UK', 'U.K.', 'USA', 'U.S.A.', 'US', 'England', 'Scotland', 'Wales',
      'Britain', 'Ireland', 'Germany', 'France', 'Netherlands', 'Italy',
      'Spain', 'Switzerland', 'Sweden', 'Norway', 'Denmark', 'Finland',
      'Belgium', 'Austria', 'Poland', 'Portugal', 'Canada', 'Australia',
      'China', 'Japan', 'Korea', 'Taiwan', 'India',
    ])
    if (COUNTRY_TOKENS.has(phrase)) {
      // The phrase IS a country token — resolve via the full keyword sweep
      // (some tokens like "UK" only match country phrases that require a
      // connector, which we strip when capturing the basedIn phrase).
      let country: string | null = null
      for (const { pattern, country: c } of COUNTRY_PHRASES) {
        if (pattern.test(text)) { country = c; break }
      }
      // Fallbacks for the common tokens when no broader phrase matched.
      if (!country) {
        if (phrase === 'UK' || phrase === 'U.K.') country = 'United Kingdom'
        else if (phrase === 'USA' || phrase === 'U.S.A.' || phrase === 'US') country = 'United States'
        else if (phrase === 'England' || phrase === 'Scotland' || phrase === 'Wales' || phrase === 'Britain') country = 'United Kingdom'
      }
      return { city: null, country, source: 'snippet-based' }
    }
    // Otherwise treat as a city; look up the country elsewhere in the text.
    let country: string | null = null
    for (const { pattern, country: c } of COUNTRY_PHRASES) {
      if (pattern.test(text)) { country = c; break }
    }
    // 2026-05-18 PM re-audit fix #2: gate the proposed city. If it fails the
    // validator (page-title fragment, brand acronym, all-caps token, etc.)
    // discard the city but keep the country.
    const proposedCity = phrase.slice(0, 40)
    if (!isValidCityCandidate(proposedCity)) {
      return { city: null, country, source: 'snippet-based' }
    }
    return { city: proposedCity, country, source: 'snippet-based' }
  }

  // Try a UK-style "Town, UK" pattern — Brave often surfaces a postal address
  // verbatim, e.g. "Empson Road, Eastern Industry, Peterborough, PE1 5UP".
  // Pull the last proper-cased segment before a UK postcode as the city.
  const ukPostcodeMatch = text.match(/\b([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?),\s*[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)
  if (ukPostcodeMatch) {
    const c = ukPostcodeMatch[1].trim()
    // Apply city gate even for postcode-anchored matches (cheap insurance).
    if (isValidCityCandidate(c)) {
      return { city: c, country: 'United Kingdom', source: 'snippet-address' }
    }
    return { city: null, country: 'United Kingdom', source: 'snippet-address' }
  }

  // Try a generic "City, Country" pattern where the right side matches one of
  // our country keywords. Restricts the left side to short Proper-Cased tokens
  // to avoid pulling in random prose.
  for (const { pattern, country } of COUNTRY_PHRASES) {
    const m = text.match(new RegExp(`\\b([A-Z][a-zA-Z]+(?:\\s[A-Z][a-zA-Z]+)?),\\s*(?:${pattern.source.replace(/^\\b|\\b$/g, '')})\\b`))
    if (m) {
      const c = m[1].trim()
      if (isValidCityCandidate(c)) {
        return { city: c, country, source: 'snippet-address' }
      }
      return { city: null, country, source: 'snippet-address' }
    }
  }

  // Fall back to "anywhere in the snippet" country keyword match.
  for (const { pattern, country } of COUNTRY_PHRASES) {
    if (pattern.test(text)) {
      return { city: null, country, source: 'snippet-based' }
    }
  }

  return null
}

/**
 * Some `.com` URLs carry the country in their FIRST path segment ("/uk/", "/us/",
 * "/de/" etc.) — common pattern for multinational suppliers. When the URL host
 * is generic but the path has a country code, treat that as a location signal
 * (low-confidence: it tells us where the company sells, not where it's
 * headquartered, but it's better than nothing).
 *
 * Returns `{country}` when a known 2-letter or country-name path segment is
 * found, null otherwise.
 */
function locationFromUrlPath(url: string): { city: null; country: string } | null {
  try {
    const u = new URL(url)
    const firstPath = u.pathname.split('/').filter(Boolean)[0]?.toLowerCase() ?? ''
    if (!firstPath) return null
    const PATH_TO_COUNTRY: Record<string, string> = {
      'uk': 'United Kingdom',
      'gb': 'United Kingdom',
      'en-gb': 'United Kingdom',
      'us': 'United States',
      'en-us': 'United States',
      'de': 'Germany',
      'de-de': 'Germany',
      'fr': 'France',
      'fr-fr': 'France',
      'nl': 'Netherlands',
      'es': 'Spain',
      'it': 'Italy',
      'ch': 'Switzerland',
      'at': 'Austria',
      'be': 'Belgium',
      'ie': 'Ireland',
      'se': 'Sweden',
      'no': 'Norway',
      'dk': 'Denmark',
      'fi': 'Finland',
      'jp': 'Japan',
      'kr': 'South Korea',
      'cn': 'China',
      'au': 'Australia',
    }
    if (PATH_TO_COUNTRY[firstPath]) {
      return { city: null, country: PATH_TO_COUNTRY[firstPath] }
    }
    return null
  } catch {
    return null
  }
}

/**
 * TLD → display location map for web-fallback rows where the candidate has
 * no city/country from the DB. The 28k-row forge-truth.db never sees these
 * companies, so the only reliable signal is the URL TLD. We map the apex
 * suffix → human-readable region. Returns null when the suffix is generic
 * (`.com` / `.org`) — caller leaves location blank rather than guess.
 */
function locationFromHost(host: string): { city: string | null; country: string | null } | null {
  if (!host) return null
  const lower = host.replace(/^www\./, '').toLowerCase()
  const tldMap: Record<string, { country: string }> = {
    'co.uk': { country: 'United Kingdom' },
    'uk': { country: 'United Kingdom' },
    'de': { country: 'Germany' },
    'fr': { country: 'France' },
    'nl': { country: 'Netherlands' },
    'it': { country: 'Italy' },
    'es': { country: 'Spain' },
    'ie': { country: 'Ireland' },
    'ch': { country: 'Switzerland' },
    'at': { country: 'Austria' },
    'be': { country: 'Belgium' },
    'se': { country: 'Sweden' },
    'no': { country: 'Norway' },
    'dk': { country: 'Denmark' },
    'fi': { country: 'Finland' },
    'pl': { country: 'Poland' },
    'cz': { country: 'Czech Republic' },
    'pt': { country: 'Portugal' },
    'us': { country: 'United States' },
    'com.au': { country: 'Australia' },
    'co.nz': { country: 'New Zealand' },
    'co.jp': { country: 'Japan' },
    'cn': { country: 'China' },
    'tw': { country: 'Taiwan' },
    'kr': { country: 'South Korea' },
  }
  // Try longest match first
  for (const suffix of Object.keys(tldMap).sort((a, b) => b.length - a.length)) {
    if (lower.endsWith('.' + suffix) || lower === suffix) {
      return { city: null, country: tldMap[suffix].country }
    }
  }
  return null
}

/**
 * 2026-05-18 PM re-audit fix #1: cheap per-apex cache so a re-enrichment of
 * the same supplier across two archetypes only spends ONE Brave call on the
 * "headquarters location" query. Keyed by apex host.
 */
const apexLocationCache = new Map<string, { city: string | null; country: string | null }>()

/**
 * 2026-05-18 PM re-audit fix #1: when the standard location waterfall yields
 * a country but no city, fire ONE additional Brave query asking specifically
 * for the company's headquarters location. Parse the first 3 snippets for
 * "City, Country" patterns.
 *
 * Returns { city, country } when something extractable is found. The country
 * may be null (caller already had one) or refined (e.g. the apex host's
 * country was wrong); caller decides which to keep. Returns null when
 * Brave returned nothing usable.
 *
 * Per-apex cached — calling this twice for the same domain costs one call.
 */
async function brave_headquartersLookup(
  companyName: string,
  apexHost: string,
): Promise<{ city: string | null; country: string | null } | null> {
  if (!BRAVE_KEY) return null
  if (!companyName) return null
  if (apexHost && apexLocationCache.has(apexHost)) {
    return apexLocationCache.get(apexHost)!
  }
  const q = `"${companyName}" headquarters location`
  await sleep(BRAVE_INTER_CALL_MS)
  const rows = await braveSearch(q)
  if (rows.length === 0) {
    if (apexHost) apexLocationCache.set(apexHost, { city: null, country: null })
    return null
  }
  // Parse the first 3 snippets for "City, Country" patterns.
  for (const r of rows.slice(0, 3)) {
    const desc = `${r.name} ${r.description}`
    const loc = locationFromSnippet(desc)
    if (loc && loc.city) {
      // locationFromSnippet already gated the city via isValidCityCandidate.
      const result = { city: loc.city, country: loc.country }
      if (apexHost) apexLocationCache.set(apexHost, result)
      return result
    }
  }
  // No city extracted but maybe a country firmed up — return that.
  for (const r of rows.slice(0, 3)) {
    const desc = `${r.name} ${r.description}`
    const loc = locationFromSnippet(desc)
    if (loc && loc.country) {
      const result = { city: null, country: loc.country }
      if (apexHost) apexLocationCache.set(apexHost, result)
      return result
    }
  }
  if (apexHost) apexLocationCache.set(apexHost, { city: null, country: null })
  return null
}

interface CapabilityFit {
  capability_oneliner: string
  fit_bullets: string[]
}

/**
 * Ask Flash-Lite to distil a concrete capability statement plus 2-3 "why this
 * fits" bullets from the candidate's name + description + supplier brief. The
 * goal is a procurement-ready card: the reader should know what the company
 * makes and why it's on the shortlist without clicking through.
 *
 * Output contract: JSON {capability_oneliner: string ≤ 110 chars,
 * fit_bullets: string[2..3], each bullet ≤ 130 chars starting with a verb}.
 *
 * Phase22 fix C1 (Tristan 2026-05-17): replaces the previous "show the raw
 * Brave snippet as the description" pattern, which read like search results.
 */
async function extractCapabilityAndFit(
  candidate: { name: string; description: string | null; country?: string | null; url?: string | null },
  brief: string,
  archetype: SupplierArchetype,
): Promise<CapabilityFit | null> {
  if (!OPENROUTER_KEY) return null
  callCounters.capability += 1
  const prompt = `You are a procurement analyst writing a supplier shortlist card. Given the supplier brief and a candidate company, output ONLY a JSON object:
{
  "capability_oneliner": "<concrete one-line capability claim, max 110 chars; must name a product / service / technology, NOT generic 'industrial supplier'>",
  "fit_bullets": ["<verb-led 2-3 bullets, max 130 chars each, each tying ONE specific candidate strength to ONE specific brief requirement>"]
}

Style rules:
- capability_oneliner names a SPECIFIC product or service (e.g. "R290-compatible scroll compressors, 8-50 kW range" not "compressor manufacturer").
- fit_bullets start with verbs ("Manufactures", "Supplies", "Operates", "Holds", "Distributes").
- If you cannot find a concrete capability from the candidate description, return a best-effort inferred capability from the company name + archetype role. Never return generic filler like "industrial manufacturing".
- British spelling. No marketing fluff. No emojis.

SUPPLIER BRIEF:
${brief}

ARCHETYPE ROLE: ${archetype.label}
ARCHETYPE CAPABILITIES TARGET: ${archetype.capabilities.join('; ')}

CANDIDATE COMPANY:
Name: ${candidate.name}
Country: ${candidate.country ?? 'unknown'}
URL: ${candidate.url ?? 'unknown'}
Description: ${(candidate.description ?? '').slice(0, 1200)}

Return ONLY the JSON, no prose, no code fence.`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS supplier capability extractor',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0.2,
      }),
    })
    if (!res.ok) {
      console.error(`[capability] HTTP ${res.status} for ${candidate.name}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    const cap = String(parsed.capability_oneliner ?? '').trim().slice(0, 140)
    let bullets: string[] = Array.isArray(parsed.fit_bullets) ? parsed.fit_bullets : []
    bullets = bullets
      .map((b) => String(b ?? '').trim())
      .filter((b) => b.length >= 12 && b.length <= 220)
      .slice(0, 3)
    if (!cap || bullets.length === 0) return null
    return { capability_oneliner: cap, fit_bullets: bullets }
  } catch (err: any) {
    console.error(`[capability] error for ${candidate.name}: ${err.message}`)
    return null
  }
}

/**
 * Extract a contact email from a description / page snippet. Returns the
 * first plausible email or null. We never scrape live pages — this is a
 * cheap regex pass over whatever text the DB or Brave snippet already
 * carries.
 */
function extractEmailFromText(text: string | null | undefined): string | null {
  if (!text) return null
  const m = String(text).match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}/i)
  return m ? m[0] : null
}

/**
 * Deterministic pre/post validator for candidate company names. Phase19 audit
 * (2026-05-17) found three classes of bad name leaks that survived the
 * Flash-Lite cleanup:
 *   1. Listicle titles ("Best Air Source Heat Pump Manufacturers UK 2026")
 *   2. Product part numbers ("MXR100050B EV DC Charging Power Supply Module")
 *   3. Page-snippet prose ("UK Space Facilities Zephyr Is A High-Altitude…")
 *
 * Better to drop the slot than to render rubbish. Returns the reason string
 * when the name should be rejected, or null when it looks like a real company.
 *
 * Run BOTH before the Flash-Lite cleanup (against the raw Brave page title — if
 * the title is plainly a listicle, don't waste an LLM call) AND after (against
 * whatever the LLM returned — Flash-Lite still passes some of these through).
 */
function looksLikeNonCompanyName(name: string): string | null {
  if (!name) return 'empty'
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  // Phase22 fix C2: page titles legitimately carry the company name AFTER a
  // separator (e.g. "Heat Pump Compressors | Clade Engineering"). For
  // pre-check purposes, take the LONGEST segment between |/–/—/" - " and
  // check that — if any segment looks like a real name, don't pre-reject.
  // Listicle/year/verb rules still apply to the whole string.
  const segments = trimmed.split(/\s+[|–—]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean)
  // Year references — listicles love "Best X 2026" / "Top X 2027".
  if (/\b20\d{2}\b/.test(trimmed)) return 'contains year'
  // Listicle prose starters anchored at the very start of the title only.
  if (/^(Best|Top|How|What|Why|Where|When)\s/i.test(trimmed)) return 'listicle starter'
  // Hyphen-only / punctuation noise.
  if (!/[a-zA-Z]/.test(trimmed)) return 'no letters'
  // Whole-string-only checks above. Below: at least ONE segment must look
  // like a plausible company name; otherwise reject the whole title.
  const segmentLooksRealName = (seg: string): boolean => {
    if (!seg) return false
    // Strip the company-form suffixes the cleanup function would strip, so
    // "Clade Engineering Ltd" is considered.
    const noSuffix = seg.replace(/\b(Ltd|Limited|PLC|plc|Inc\.?|LLC|GmbH|Co\.?|Company|Group|Solutions|Services|Systems)\b\.?/gi, '').replace(/\s{2,}/g, ' ').trim()
    if (!noSuffix) return false
    // Reject part numbers in the segment itself
    if (/[A-Z]{2,}-?\d{3,}/.test(noSuffix)) return false
    if (/\d{3,}-?[A-Z]{2,}/.test(noSuffix)) return false
    // Plural category nouns standalone — listicle hub, not a brand.
    if (/^(Manufacturers|Suppliers|Companies|Brands|Vendors)$/i.test(noSuffix)) return false
    // Verbs inside the segment — prose, not name.
    if (/\s(is|are|was|were|will|has|have|provides|offers|delivers|designs|builds|makes)\s/i.test(noSuffix)) return false
    const words = noSuffix.split(/\s+/).filter(Boolean)
    // Real brand names are 1-5 words.
    if (words.length === 0 || words.length > 5) return false
    // Reject if every word is generic descriptor with no proper-noun candidate.
    const genericSet = new Set([
      'heat', 'pump', 'pumps', 'source', 'air', 'water', 'monobloc',
      'wholesale', 'mcs', 'certified', 'rated', 'compressors', 'compressor',
      'industrial', 'manufacturing', 'manufacturer', 'system', 'systems',
      'global', 'commercial', 'residential', 'metal', 'sheet', 'fabrication',
      'enclosure', 'enclosures', 'outdoor', 'custom', 'energy', 'solutions',
      'service', 'services', 'group',
    ])
    const properish = words.filter((w) => {
      const norm = w.toLowerCase().replace(/[^a-z]/g, '')
      if (!norm) return false
      // Word starts capital AND isn't a generic descriptor
      return /^[A-Z]/.test(w) && !genericSet.has(norm)
    })
    return properish.length >= 1
  }
  const anySegmentReal = segments.some(segmentLooksRealName)
  if (!anySegmentReal) {
    // Fall back to the older rules for unsegmented titles or titles where no
    // segment yielded a proper-noun-like name.
    if (/[A-Z]{2,}-?\d{3,}/.test(trimmed)) return 'part-number pattern (LETTERS-DIGITS)'
    if (/\d{3,}-?[A-Z]{2,}/.test(trimmed)) return 'part-number pattern (DIGITS-LETTERS)'
    if (/\s(UK\s+20\d{2}|Manufacturers|Suppliers|Companies|Brands|Vendors|Solutions(?:\s+Providers?)?|Reviews?)\b/i.test(trimmed)) {
      return 'listicle category suffix'
    }
    if (/\b(Companies|Manufacturers|Suppliers|Brands|Vendors)\b/i.test(trimmed)) {
      return 'listicle category word'
    }
    if (/\s(is|are|was|were|will|has|have|provides|offers|delivers|designs|builds|makes)\s/i.test(trimmed)) {
      return 'contains verb (prose, not a company name)'
    }
    const wordCount = trimmed.split(/\s+/).length
    if (wordCount > 7) return `too long (${wordCount} words)`
    return 'no segment resembles a company name'
  }
  return null
}

/**
 * Derive a probable company name from a hostname. Phase19 audit blocker #4:
 * cleanCompanyName sometimes pulls the wrong company out of a multi-company
 * snippet (e.g. Brave title "Airbus partners with Amprius" + URL amprius.com →
 * cleanCompanyName returns "Airbus" even though the page belongs to Amprius).
 * The domain rarely lies, so we use it as the tiebreaker.
 *
 * Returns the leading domain label, title-cased, suffix-stripped. amprius.com
 * → "Amprius". sub.example.co.uk → "Example".
 */
function deriveNameFromHostname(host: string): string {
  if (!host) return ''
  const stripped = host.replace(/^www\./, '').toLowerCase()
  // Take the apex label: drop the public-suffix-ish trailing parts.
  // We don't pull in psl; a simple "drop the last 1-2 labels" heuristic works
  // for the vast majority of cases (.com, .co.uk, .de, .com.au, etc.).
  const parts = stripped.split('.')
  let apex = ''
  if (parts.length >= 3 && (parts[parts.length - 2] === 'co' || parts[parts.length - 2] === 'com' || parts[parts.length - 2] === 'org' || parts[parts.length - 2] === 'gov')) {
    apex = parts[parts.length - 3]
  } else if (parts.length >= 2) {
    apex = parts[parts.length - 2]
  } else {
    apex = parts[0]
  }
  if (!apex) return ''
  // Drop hyphens and digits for the comparison form; for display, keep hyphens
  // but title-case each segment.
  return apex
    .split('-')
    .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
    .join(' ')
    .trim()
}

/**
 * Compare a cleaned name against a domain-derived name. Returns:
 *   'match'    → name and host share a substantive token (case-insensitive).
 *                Accept the cleaned name.
 *   'use-host' → name and host share zero meaningful overlap → prefer the
 *                domain-derived name. Domain rarely lies.
 *   'reject'   → both name AND host look like rubbish.
 */
function reconcileNameWithHost(cleanedName: string, host: string): 'match' | 'use-host' | 'reject' {
  if (!host) return 'match'  // no host to reconcile against — trust the cleaned name
  const hostName = deriveNameFromHostname(host)
  if (!hostName) return 'match'
  // Tokenise both, lowercase, strip punctuation.
  const norm = (s: string): Set<string> =>
    new Set(
      s.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/[\s-]+/)
        .filter((t) => t.length >= 3 && !['ltd','plc','inc','llc','llp','gmbh','group','holdings','holding','services','solutions','systems','technology','technologies','energy','power','digital','global','international'].includes(t)),
    )
  const nameToks = norm(cleanedName)
  const hostToks = norm(hostName)
  if (nameToks.size === 0 && hostToks.size === 0) return 'reject'
  // Cheap intersection check
  for (const t of nameToks) {
    if (hostToks.has(t)) return 'match'
    // Substring match (e.g. "Edina" in "edinapowergen")
    for (const h of hostToks) {
      if (t.length >= 4 && h.includes(t)) return 'match'
      if (h.length >= 4 && t.includes(h)) return 'match'
    }
  }
  // No overlap at all — domain is the more trustworthy signal.
  if (hostToks.size > 0) return 'use-host'
  return 'reject'
}

interface CompanyRow {
  id: string
  name: string
  country: string | null
  city: string | null
  website_url: string | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  description: string | null
  status: string
  ch_company_number: string | null
  relevance_score: number
}

interface SupplierCandidate {
  name: string
  /** For web-fallback rows: the raw Brave page title before LLM/heuristic cleanup. null for DB rows. */
  raw_title?: string | null
  country: string | null
  city: string | null
  website_url: string | null
  contact_name: string | null
  contact_title: string | null
  contact_email: string | null
  description: string | null
  ch_verified: boolean
  ch_company_number: string | null
  confidence: 'high' | 'medium' | 'low'
  source: 'forge-truth-db' | 'web-fallback'
  /** Flash-Lite 0-10 fit score against the supplier brief; null if scoring disabled */
  llm_score: number | null
  /** LLM's "why this fits" reasoning; null if scoring disabled */
  llm_reasoning: string | null
  /** Phase22 fix C1: concrete one-line capability claim (≤ 110 chars). Null when extraction failed. */
  capability_oneliner: string | null
  /** Phase22 fix C1: 2-3 verb-led bullets tying candidate strengths to brief requirements. */
  fit_bullets: string[] | null
  /** Phase22 fix C1: contact CTA — best available email pulled from description / DB. */
  contact_email_derived: string | null
}

function sqlEscape(s: string): string {
  return s.replace(/'/g, "''")
}

function quoteList(items: string[]): string {
  if (items.length === 0) return "''"
  return items.map((i) => `'${sqlEscape(i)}'`).join(',')
}

/**
 * Build a keyword filter from archetype.capabilities + search_keywords. Each
 * keyword becomes a substring match against name|description|specialties.
 * OR'd together — a row passes if ANY keyword matches.
 */
function buildKeywordWhere(archetype: SupplierArchetype): string {
  // Extract individual key terms from capabilities + search_keywords.
  // Strip stopwords; keep things like "BESS", "integrator", "carbon fibre", "EPC".
  const stop = new Set(['supplier', 'manufacturer', 'service', 'partner', 'shop', 'company', 'uk', 'china', 'germany', 'and', 'or', 'the', 'of', 'for'])
  const tokens = new Set<string>()
  const phrases: string[] = []
  for (const phrase of [...archetype.capabilities, ...archetype.search_keywords]) {
    phrases.push(phrase.toLowerCase())
    for (const tok of phrase.toLowerCase().split(/\s+/)) {
      const clean = tok.replace(/[^a-z0-9]/g, '')
      if (clean.length > 2 && !stop.has(clean)) tokens.add(clean)
    }
  }
  if (tokens.size === 0 && phrases.length === 0) return ''
  const conds: string[] = []
  // Match either full phrases or individual significant tokens against description, name, specialties
  for (const phrase of phrases) {
    const esc = phrase.replace(/'/g, "''")
    conds.push(`LOWER(COALESCE(name,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(specialties,'')) LIKE '%${esc}%'`)
  }
  // Also fall back to individual tokens, but only those length >= 4 (e.g. 'bess', 'cell', 'pack')
  for (const tok of tokens) {
    if (tok.length < 4) continue
    const esc = tok.replace(/'/g, "''")
    conds.push(`LOWER(COALESCE(name,'') || ' ' || COALESCE(description,'') || ' ' || COALESCE(specialties,'')) LIKE '%${esc}%'`)
  }
  return conds.length > 0 ? ` AND (${conds.join(' OR ')})` : ''
}

function queryCandidates(archetype: SupplierArchetype, limit: number, excludeIds: Set<string>): CompanyRow[] {
  // Try each profile in priority order. Collect candidates with capability
  // keyword match, dedup against excludeIds. Stop when we have N+buffer matches.
  const regionsIn = quoteList(archetype.preferred_regions)
  const keywordWhere = buildKeywordWhere(archetype)
  const excludeClause = excludeIds.size > 0 ? ` AND id NOT IN (${quoteList(Array.from(excludeIds))})` : ''
  const collected: CompanyRow[] = []
  const seenInArchetype = new Set<string>()

  for (const profile of archetype.search_profiles) {
    if (collected.length >= limit * 3) break // enough headroom for dedup later
    const profileEsc = sqlEscape(profile)
    // Strict: require Companies House verification to filter out product-name
    // records (forge-truth.db has some entries where `name` is a product title
    // not a company name; CH-verified rules these out).
    const sql = `
      SELECT
        id, name, country, city, website_url,
        contact_name, contact_title, contact_email,
        description, status, ch_company_number, relevance_score
      FROM companies
      WHERE search_profile_id = '${profileEsc}'
        AND status IN ('enriched', 'approved', 'pushed')
        AND country IN (${regionsIn})
        AND website_url IS NOT NULL AND website_url != ''
        AND ch_company_number IS NOT NULL
        AND ch_company_number != ''
        ${keywordWhere}
        ${excludeClause}
      ORDER BY
        (CASE status WHEN 'pushed' THEN 3 WHEN 'approved' THEN 2 ELSE 1 END) DESC,
        relevance_score DESC,
        name ASC
      LIMIT ${limit * 4}
    `
    let out = ''
    try {
      out = execFileSync('sqlite3', ['-cmd', '.mode json', FORGE_TRUTH_DB, sql], {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
      })
    } catch (err: any) {
      console.error(`[enrich-suppliers] sqlite query failed for ${archetype.id}/${profile}: ${err.message}`)
      continue
    }
    if (!out.trim()) continue
    let rows: CompanyRow[] = []
    try {
      rows = JSON.parse(out)
    } catch (err: any) {
      console.error(`[enrich-suppliers] JSON parse failed for ${archetype.id}/${profile}: ${err.message}`)
      continue
    }
    for (const r of rows) {
      if (seenInArchetype.has(r.id)) continue
      seenInArchetype.add(r.id)
      collected.push(r)
    }
  }

  return collected
}

function classifyConfidence(row: CompanyRow): 'high' | 'medium' | 'low' {
  const chVerified = Boolean(row.ch_company_number)
  if ((row.status === 'approved' || row.status === 'pushed') && chVerified) return 'high'
  if (chVerified || row.status === 'approved' || row.status === 'pushed') return 'medium'
  return 'low'
}

/**
 * Generate a "supplier brief" — a short paragraph describing what the supplier
 * must build. Used as context for the LLM scoring step. Combines the product
 * brief + the archetype role description.
 */
function generateSupplierBrief(productBrief: string, archetype: SupplierArchetype): string {
  return `PRODUCT: ${productBrief}

SUPPLIER ROLE: ${archetype.label}.
WHAT THEY MUST DO: ${archetype.function_description}
KEY CAPABILITIES: ${archetype.capabilities.join('; ')}.
GEOGRAPHIC PREFERENCE: UK first, then EU. Open to East Asia for cell/PCBA-only roles.`
}

interface LLMScore {
  score: number
  reasoning: string
  fit_or_reject: 'fit' | 'reject'
}

/**
 * Ask Flash-Lite to score a company against the supplier brief.
 * Returns score 0-10 + reasoning. Score < MIN_LLM_SCORE → reject.
 *
 * Accepts a generic candidate shape so both DB rows (CompanyRow) and web
 * results (BraveResult) can flow through the same scorer.
 *
 * P10a (Tristan directive 2026-05-17 + engine-flow target diagram §2):
 * accepts an optional `bomContext` block carrying the BoM-derived
 * top-manufacturer + critical-component summary. When present, the scorer is
 * instructed to favour candidates that obviously integrate the specific
 * manufacturers / components named in the BoM (e.g. "candidate is a known CATL
 * integrator" vs the previous brief-only mode). This is the diff between
 * "suppliers informed by brief + archetype" and "suppliers informed by BoM".
 */
async function scoreCandidate(
  brief: string,
  candidate: { name: string; country?: string | null; description: string | null },
  bomContext?: string,
): Promise<LLMScore | null> {
  if (!OPENROUTER_KEY) return null
  const bomBlock = bomContext && bomContext.trim().length > 0
    ? `\nBoM CONTEXT (specific manufacturers + critical components in this design):\n${bomContext}\n`
    : ''
  const bomScoringRule = bomContext && bomContext.trim().length > 0
    ? `- BoM-informed boost: if the candidate's description shows ANY of the named manufacturers as a partner/integrator, OR work on the specific critical components above, add +1 to the score band you'd otherwise assign.\n`
    : ''
  const prompt = `You are an engineering procurement specialist. Score this supplier candidate's fit for the role described below. Return ONLY a JSON object with shape: {"score": 0-10, "fit_or_reject": "fit"|"reject", "reasoning": "<one or two sentences explaining your decision; be specific about WHY this company fits or doesn't fit the role; reference a named manufacturer/component from the BoM context if relevant>"}.

ROLE BRIEF:
${brief}${bomBlock}
CANDIDATE COMPANY:
Name: ${candidate.name}
Country: ${candidate.country ?? 'unknown'}
Description: ${(candidate.description ?? '').slice(0, 1200)}

Score rules:
- 9-10: company's core business obviously matches the role; would be a top recommendation
- 7-8: company plausibly does this kind of work, even if not their headline business
- 5-6: tangentially related; would need investigation
- 0-4: company does something different; reject
${bomScoringRule}
Default to "reject" if uncertain or if the company's core business is clearly unrelated. Better to recommend fewer real fits than many irrelevant ones.

Return ONLY the JSON, no prose.`

  callCounters.flashLite += 1
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS supplier scorer',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 350,
        temperature: 0.2,
      }),
    })
    if (!res.ok) {
      console.error(`[score] HTTP ${res.status} for ${candidate.name}: ${(await res.text()).slice(0, 200)}`)
      return null
    }
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    // Extract JSON from possible code fence or surrounding text
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    return {
      score: typeof parsed.score === 'number' ? parsed.score : Number(parsed.score) || 0,
      reasoning: String(parsed.reasoning ?? '').trim(),
      fit_or_reject: parsed.fit_or_reject === 'fit' || parsed.fit_or_reject === 'reject' ? parsed.fit_or_reject : 'reject',
    }
  } catch (err: any) {
    console.error(`[score] error for ${candidate.name}: ${err.message}`)
    return null
  }
}

/**
 * Normalise a company name for cross-source dedup. Strips suffixes ("ltd",
 * "limited", "plc", "inc", "gmbh"), punctuation, and casing — so a Brave
 * result "Acme Power Ltd." won't get added when the DB already holds "Acme
 * Power Limited".
 */
function canonicaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|plc|inc|inc\.|llc|gmbh|s\.a\.|sa|s\.r\.l\.|srl|co\.|company)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

/**
 * Sleep helper for the Brave rate-limit gate. Tristan's free tier allows
 * roughly 1 query per second.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Build a single Brave query string for an archetype. Combines the archetype's
 * search_keywords (joined with OR-style spacing — Brave does not require
 * explicit operators) with a product-class context hint and a UK preference
 * suffix. Kept short — Brave truncates very long queries.
 *
 * Phase22 fix C2: for product classes flagged in CLASS_EXTRA_KEYWORDS, we
 * surface a roster of widened queries (the original + one per extra phrase).
 * Caller uses the roster to run a small Brave query batch and dedup the
 * combined Brave result pool before scoring.
 */
function buildBraveQuery(archetype: SupplierArchetype, productClass: string): string {
  const top = archetype.search_keywords.slice(0, 2).join(' ')
  const hint = productClass.replace(/_/g, ' ')
  return `${top} ${hint} supplier UK manufacturer`.replace(/\s+/g, ' ').trim()
}

function buildBraveQueryRoster(archetype: SupplierArchetype, productClass: string): string[] {
  const base = buildBraveQuery(archetype, productClass)
  const extra = CLASS_EXTRA_KEYWORDS[productClass]?.[archetype.id] ?? []
  if (extra.length === 0) return [base]
  // Each extra is a self-contained query — Brave handles each independently.
  // Cap at 4 total to keep wall-clock + free-tier rate-limit reasonable.
  return [base, ...extra].slice(0, 4)
}

/**
 * Skip Brave results whose URL points at a directory / aggregator / social
 * site. Returns true if the result is acceptable.
 */
function isAcceptableWebResult(url: string): boolean {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (WEB_FALLBACK_DOMAIN_BLOCKLIST.has(host)) return false
    // Also catch the LinkedIn personal-profile path explicitly per brief
    if (host.endsWith('linkedin.com') && u.pathname.includes('/in/')) return false
    // 2026-05-18 PM re-audit fix #4: directory / listing path heuristic.
    // Catches goodhost.co.uk/directory/widget-suppliers and similar — host
    // looks legit but the path is a category page, not a real supplier page.
    if (AGGREGATOR_PATH_REGEX.test(u.pathname)) return false
    return true
  } catch {
    return false
  }
}

/**
 * Call Brave Search and return parsed result rows. Increments the global call
 * counter regardless of success so the cost summary stays honest.
 */
async function braveSearch(query: string): Promise<BraveResult[]> {
  if (!BRAVE_KEY) return []
  callCounters.brave += 1
  const params = new URLSearchParams({
    q: query,
    country: 'GB',
    count: String(BRAVE_RESULTS_PER_QUERY),
  })
  try {
    const res = await fetch(`${BRAVE_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': BRAVE_KEY,
      },
    })
    if (!res.ok) {
      console.error(`[brave] HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
      return []
    }
    const j: any = await res.json()
    const rows: any[] = j?.web?.results ?? []
    const cleaned: BraveResult[] = []
    for (const r of rows) {
      const url = String(r?.url ?? '').trim()
      if (!url) continue
      if (!isAcceptableWebResult(url)) continue
      const name = String(r?.title ?? '').trim()
      const description = String(r?.description ?? '').trim()
      if (!name) continue
      cleaned.push({ name, url, description })
    }
    return cleaned
  } catch (err: any) {
    console.error(`[brave] fetch error: ${err.message}`)
    return []
  }
}

/**
 * Map a Flash-Lite score (6-10) to a confidence band for web-sourced
 * candidates. CH-verified DB rows use a different rule (see classifyConfidence).
 */
function classifyWebConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 9) return 'high'
  if (score >= 8) return 'medium'
  return 'low'
}

/**
 * Heuristic fallback for company-name cleanup when the LLM returns null or an
 * unusable value. Takes the leading segment of the raw title before the first
 * `|` or ` - ` separator, lower-cases, strips company-form suffixes via the
 * existing canonicaliseName logic (but preserves spacing), then title-cases.
 *
 * Examples:
 *   "Edina - UK Total Energy Solutions" → "Edina"
 *   "AceOn Group | UK Battery Energy Storage" → "Aceon Group"
 *   "Rolec Services Ltd | EV Charging" → "Rolec Services"
 */
function fallbackCleanFromRawTitle(rawTitle: string): string {
  // Take leading segment before |, –, —, " - " (a bare hyphen inside a word
  // shouldn't split — only spaced or em/en dashes).
  const lead = rawTitle.split(/\s+[|–—]\s+|\s+-\s+/)[0].trim()
  if (!lead) return rawTitle.trim()
  // Strip company-form suffixes (mirrors canonicaliseName's suffix list but
  // keeps word boundaries readable).
  const stripped = lead
    .replace(/\b(Ltd|Limited|PLC|plc|Inc\.?|LLC|GmbH|S\.A\.|SA|S\.r\.l\.|SRL|Co\.|Company)\b\.?/gi, '')
    .replace(/[,;:]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!stripped) return lead
  // Title-case word by word, preserving internal capitals (e.g. "AceOn").
  return stripped
    .split(/\s+/)
    .map((w) => {
      if (/[A-Z].*[A-Z]/.test(w)) return w // already has internal capitals — keep
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    })
    .join(' ')
}

/**
 * Ask Flash-Lite to normalise a Brave page title to a bare UK company name.
 * Returns null when the model says the result is a directory listing rather
 * than a single company, or when the model returns nothing usable. Caller
 * falls back to fallbackCleanFromRawTitle in that case.
 */
async function cleanCompanyName(
  rawTitle: string,
  snippet: string,
  url: string,
): Promise<string | null> {
  if (!OPENROUTER_KEY) return null
  callCounters.nameCleanup += 1
  const prompt = `You are normalising web search results to UK company names. Given a page title and snippet, output ONLY the canonical company name (no slogans, no separators, no product/category descriptors, no "Ltd"/"Limited"/"plc"). If the result is a directory listing rather than a single company, return null.

Input: ${rawTitle} — ${snippet}
URL: ${url}

Output JSON: {"company_name": "Edina" } or {"company_name": null}`
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        'HTTP-Referer': 'https://fractionalforge.com',
        'X-Title': 'ForgeOS supplier name cleanup',
      },
      body: JSON.stringify({
        model: 'google/gemini-3.1-flash-lite-preview',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.1,
      }),
    })
    if (!res.ok) {
      console.error(`[name-cleanup] HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`)
      return null
    }
    const j: any = await res.json()
    const text: string = j.choices?.[0]?.message?.content ?? ''
    const jsonMatch = text.match(/\{[\s\S]*?\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    const v = parsed.company_name
    if (v === null || v === undefined) return null
    const s = String(v).trim()
    if (!s) return null
    return s
  } catch (err: any) {
    console.error(`[name-cleanup] error: ${err.message}`)
    return null
  }
}

/**
 * Run an async mapper over `items` with a hard concurrency cap. Lightweight
 * substitute for p-map / p-limit — we don't want to add a dependency for one
 * caller.
 */
async function pMap<T, R>(items: T[], concurrency: number, mapper: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let cursor = 0
  const workers: Promise<void>[] = []
  const n = Math.min(concurrency, items.length)
  for (let w = 0; w < n; w++) {
    workers.push(
      (async () => {
        while (true) {
          const idx = cursor++
          if (idx >= items.length) return
          results[idx] = await mapper(items[idx], idx)
        }
      })(),
    )
  }
  await Promise.all(workers)
  return results
}

/**
 * Take a list of accepted Brave candidates and produce cleaned company names
 * for each. Tries Flash-Lite first (concurrency 8); falls back to a heuristic
 * leading-segment + suffix-strip + title-case pass when the LLM returns null,
 * empty, or a value shorter than 3 chars.
 *
 * Phase19 audit (2026-05-17) additions:
 *   - Deterministic pre-check on the raw Brave title: if it's clearly a
 *     listicle / part number / prose snippet, skip the Flash-Lite call and
 *     mark the row rejected (cleanName=''). Saves an LLM call AND prevents
 *     Flash-Lite from sometimes accepting bad inputs.
 *   - Post-validator on whatever the LLM (or fallback) returned: if it STILL
 *     looks like a non-company, mark rejected.
 *   - Domain reconciliation: if the cleaned name shares zero tokens with the
 *     hostname, prefer the domain-derived name (or reject if both rubbish).
 */
async function cleanAcceptedNames(
  rows: { row: BraveResult; cleanName: string; rejectReason?: string }[],
): Promise<void> {
  await pMap(rows, 8, async (r) => {
    // PRE-CHECK: reject obvious non-companies before spending a Flash-Lite call.
    const preReason = looksLikeNonCompanyName(r.row.name)
    if (preReason) {
      r.cleanName = ''
      r.rejectReason = `pre-check: ${preReason}`
      return
    }
    const llm = await cleanCompanyName(r.row.name, r.row.description, r.row.url)
    const trimmed = (llm ?? '').trim()
    let candidate: string
    if (trimmed && trimmed.length >= 3 && trimmed.toLowerCase() !== 'null') {
      candidate = trimmed
    } else {
      candidate = fallbackCleanFromRawTitle(r.row.name)
    }
    // POST-VALIDATOR: even the LLM occasionally returns rubbish. Re-check.
    const postReason = looksLikeNonCompanyName(candidate)
    if (postReason) {
      r.cleanName = ''
      r.rejectReason = `post-check: ${postReason}`
      return
    }
    // DOMAIN RECONCILIATION: blocker #4 — when name and host disagree, the
    // domain is the more trustworthy signal.
    let host = ''
    try {
      host = new URL(r.row.url).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      host = ''
    }
    const verdict = reconcileNameWithHost(candidate, host)
    if (verdict === 'reject') {
      r.cleanName = ''
      r.rejectReason = `name/host: both look like rubbish (name="${candidate}", host="${host}")`
      return
    }
    if (verdict === 'use-host') {
      const hostDerived = deriveNameFromHostname(host)
      const hostPostReason = looksLikeNonCompanyName(hostDerived)
      if (hostPostReason || !hostDerived) {
        r.cleanName = ''
        r.rejectReason = `name/host: name "${candidate}" doesn't match host "${host}" and host-derived name is unusable`
        return
      }
      console.log(`  [name-url] mismatch warning — using domain-derived "${hostDerived}" instead of cleaned "${candidate}" (host=${host})`)
      r.cleanName = hostDerived
      return
    }
    r.cleanName = candidate
  })
}

/**
 * Top up an archetype's candidate list from the open web when the DB pool fell
 * short. Single Brave query → score each result with the SAME Flash-Lite scorer
 * the DB path uses → filter score ≥ MIN_LLM_SCORE & fit → dedup against
 * globalExclude (canonical-name compare) → return up to `needed` accepted rows.
 *
 * Brave free-tier rate limit: serialise calls with a 1.1s wait. We only ever
 * fire one Brave query per archetype, so the wait gates the *next* archetype's
 * call. Flash-Lite scoring of the 15 returned results runs in parallel — cheap
 * and not rate-limited.
 */
async function webFallbackSearch(
  archetype: SupplierArchetype,
  brief: string,
  productClass: string,
  globalExclude: Set<string>,
  globalExcludeNames: Set<string>,
  needed: number,
  bomContext?: string,
): Promise<WebSourcedCandidate[]> {
  if (!BRAVE_KEY) {
    console.log(`  [${archetype.id}] web-fallback skipped — BRAVE_API_KEY missing`)
    return []
  }
  const queryRoster = buildBraveQueryRoster(archetype, productClass)
  const query = queryRoster[0]  // primary, recorded in provenance
  console.log(`  [${archetype.id}] web-fallback: ${queryRoster.length} Brave query(ies) (need ${needed})`)
  // Gate against Brave rate limit BEFORE each call. Cheap to wait even on
  // first call — keeps the contract uniform across archetypes.
  const aggregated: BraveResult[] = []
  const seenUrl = new Set<string>()
  for (const q of queryRoster) {
    await sleep(BRAVE_INTER_CALL_MS)
    const batch = await braveSearch(q)
    for (const r of batch) {
      if (seenUrl.has(r.url)) continue
      seenUrl.add(r.url)
      aggregated.push(r)
    }
    console.log(`    [${archetype.id}] "${q}" → ${batch.length} hits (cumulative ${aggregated.length})`)
  }
  const rows = aggregated
  if (rows.length === 0) {
    provenanceLog.push({
      archetype: archetype.id,
      source: 'web-fallback',
      brave_query: queryRoster.join(' || '),
      brave_results: 0,
      accepted_count: 0,
    })
    console.log(`  [${archetype.id}] web-fallback: 0 results from Brave`)
    return []
  }

  // Drop anything whose canonical name is already in globalExclude (DB pick
  // for another archetype) — saves an LLM call.
  const dedupedRows: BraveResult[] = []
  const seenInBatch = new Set<string>()
  for (const r of rows) {
    const canon = canonicaliseName(r.name)
    if (!canon) continue
    if (globalExcludeNames.has(canon)) continue
    if (seenInBatch.has(canon)) continue
    seenInBatch.add(canon)
    dedupedRows.push(r)
  }

  console.log(`  [${archetype.id}] web-fallback: ${rows.length} Brave hits, ${dedupedRows.length} after dedup; scoring via Flash-Lite…`)

  // Score in parallel — Flash-Lite is cheap and parallel-safe.
  const scored = await Promise.all(
    dedupedRows.map(async (r) => {
      const score = await scoreCandidate(brief, {
        name: r.name,
        country: 'unknown',
        description: r.description,
      }, bomContext)
      return { row: r, score }
    }),
  )

  // Pull a generous pool of fit-passing results BEFORE the cleanup pass —
  // multiple Brave results can resolve to the same company (e.g. an Edina
  // product page + an Edina case-study page), and we only see that after the
  // cleanup step. needed × 3 gives headroom for the post-cleanup dedup.
  const acceptedPoolRaw = scored
    .filter((s) => s.score !== null && s.score.fit_or_reject === 'fit' && s.score.score >= MIN_LLM_SCORE)
    .sort((a, b) => (b.score!.score) - (a.score!.score))
    .slice(0, Math.max(needed * 4, needed + 6))

  // Phase23 fix B2 (Tristan 2026-05-18): PRE-cleanup dedup by registrable
  // domain. Multiple Brave hits for the same company (e.g. three Sartorius
  // product pages on sartorius.com) need to collapse BEFORE the LLM cleanup
  // pass, otherwise the dedup-by-name step later sees three different cleaned
  // names ("Sartorius Stedim", "Sartorius", "Sartorius Bioprocess") and lets
  // all three through. Keeping the highest-scored entry per apex domain.
  const acceptedPool: typeof acceptedPoolRaw = []
  const seenApex = new Set<string>()
  let preDedupSkipped = 0
  for (const a of acceptedPoolRaw) {
    const apex = extractRegistrableDomain(a.row.url)
    if (!apex) {
      // No apex domain — keep but don't add to the dedup key set.
      acceptedPool.push(a)
      continue
    }
    if (seenApex.has(apex)) {
      preDedupSkipped += 1
      continue
    }
    seenApex.add(apex)
    acceptedPool.push(a)
  }
  if (preDedupSkipped > 0) {
    console.log(`  [${archetype.id}] web-fallback: ${preDedupSkipped} candidate(s) collapsed by apex-domain pre-dedup (e.g. multiple product pages on the same company domain)`)
  }
  acceptedPool.length = Math.min(acceptedPool.length, Math.max(needed * 3, needed + 3))

  // Flash-Lite cleanup pass: normalise the raw Brave page title to a bare
  // company name (concurrency 8). Falls back to a heuristic when the LLM
  // returns null / empty / too short. raw_title is kept for audit.
  // Phase19 audit additions inside cleanAcceptedNames: pre-check, post-check,
  // and domain reconciliation — any of which can mark the row rejected by
  // setting cleanName = '' and recording rejectReason.
  const cleanupTargets: { row: BraveResult; cleanName: string; rejectReason?: string }[] =
    acceptedPool.map((a) => ({ row: a.row, cleanName: '' }))
  if (cleanupTargets.length > 0) {
    await cleanAcceptedNames(cleanupTargets)
  }

  let rejectedCount = 0
  for (const t of cleanupTargets) {
    if (!t.cleanName && t.rejectReason) {
      rejectedCount += 1
      console.log(`  [${archetype.id}] web-fallback rejected: "${t.row.name}" → ${t.rejectReason}`)
    }
  }
  if (rejectedCount > 0) {
    console.log(`  [${archetype.id}] web-fallback: ${rejectedCount} candidate(s) rejected by validators (listicle / part-number / name/url mismatch)`)
  }

  // Post-cleanup dedup: collapse rows whose cleaned name canonicalises to the
  // same value, OR that share an apex domain (e.g. sartorius.com surfacing
  // twice with two different cleaned names). Keep the highest-scored entry.
  // Skip any row whose cleanName is empty (rejected by the validators above).
  //
  // Phase23 fix B2: switched the name canonicaliser to canonicaliseNameForDedup
  // (strips page-title suffixes first) so "Single-Use Bioreactors | Sartorius"
  // and "Sartorius Bioprocess" both reduce to "sartorius". Also folds in the
  // dedup against the previously-seen apex set so any duplicates that
  // slipped through pre-dedup still collapse.
  const seenCanon = new Set<string>()
  const seenApexPost = new Set<string>()
  // Also dedup against the raw title's stripped-suffix canon — catches the
  // case where the LLM cleanup returned different names for the same
  // company.
  const seenRawTitleCanon = new Set<string>()
  const accepted: typeof acceptedPool = []
  const acceptedCleanup: typeof cleanupTargets = []
  for (let i = 0; i < acceptedPool.length; i++) {
    if (accepted.length >= needed) break
    const ct = cleanupTargets[i]
    if (!ct.cleanName) continue  // rejected by validators — skip
    const cleanCanon = canonicaliseNameForDedup(ct.cleanName)
    const rawTitleCanon = canonicaliseNameForDedup(acceptedPool[i].row.name)
    const apex = extractRegistrableDomain(acceptedPool[i].row.url)
    if (!cleanCanon) continue
    if (seenCanon.has(cleanCanon)) continue
    if (rawTitleCanon && seenRawTitleCanon.has(rawTitleCanon)) continue
    if (apex && seenApexPost.has(apex)) continue
    seenCanon.add(cleanCanon)
    if (rawTitleCanon) seenRawTitleCanon.add(rawTitleCanon)
    if (apex) seenApexPost.add(apex)
    accepted.push(acceptedPool[i])
    acceptedCleanup.push(ct)
  }

  const candidates: WebSourcedCandidate[] = accepted.map((a, i) => {
    const score = a.score!
    let host = ''
    try {
      host = new URL(a.row.url).hostname.replace(/^www\./, '').toLowerCase()
    } catch {
      host = ''
    }
    // Phase23 fix B1 (Tristan 2026-05-18): location resolution waterfall —
    // (0) KNOWN_SUPPLIER_LOCATIONS hand-curated apex lookup (re-audit fix #1) →
    //     highest confidence;
    // (1) Brave snippet address / "based in" → high confidence;
    // (2) URL path country code ("/uk/", "/us/", "/de/" — multinational
    //     suppliers often namespace by country) → medium confidence,
    //     flagged location_inferred_from_tld;
    // (3) URL TLD inference (.co.uk → UK, .de → Germany) → low confidence,
    //     same flag.
    // Falls through to null/null when nothing yields anything (rare for
    // archetypes with a UK-bias query).
    const apexHost = extractRegistrableDomain(a.row.url)
    const knownLoc = knownSupplierLocation(apexHost)
    const snippetLoc = locationFromSnippet(a.row.description)
    const pathLoc = locationFromUrlPath(a.row.url)
    const tldLoc = host ? locationFromHost(host) : null
    let city: string | null = null
    let country: string | null = null
    let inferredFromTld = false
    if (knownLoc) {
      city = knownLoc.city
      country = knownLoc.country
    } else if (snippetLoc) {
      city = snippetLoc.city
      country = snippetLoc.country
    } else if (pathLoc) {
      city = pathLoc.city
      country = pathLoc.country
      inferredFromTld = true
    } else if (tldLoc) {
      city = tldLoc.city
      country = tldLoc.country
      inferredFromTld = true
    }
    // 2026-05-18 PM re-audit fix #2: final gate — discard city if it fails
    // the validator (e.g. snippet matched "UK. Design" or a brand acronym).
    // We keep country in that case.
    const candidateName = acceptedCleanup[i].cleanName || a.row.name
    if (city && !isValidCityCandidate(city, candidateName)) {
      city = null
    }
    return {
      name: candidateName,
      raw_title: a.row.name,
      url: a.row.url,
      description: a.row.description || null,
      source: 'web-fallback',
      ch_verified: false,
      confidence: classifyWebConfidence(score.score),
      score: score.score,
      reasoning: score.reasoning,
      city,
      country,
      location_inferred_from_tld: inferredFromTld,
    }
  })

  // Note: a final brave_headquartersLookup() sweep runs in enrichSuppliers
  // over ALL candidates (both DB + web) where country is set but city is
  // missing. Doing it there (rather than here) lets the per-apex cache cover
  // DB rows too — so the same Brave call is amortised across DB and web hits.

  for (const c of candidates) {
    // Use the strong canonicaliser so a page-title-suffix variant of the
    // same company can't slip through later archetypes.
    globalExcludeNames.add(canonicaliseNameForDedup(c.name))
    // No DB id, so we cannot add to globalExclude (id-keyed); name-keyed set
    // is the only protection across archetypes for web candidates.
  }

  provenanceLog.push({
    archetype: archetype.id,
    source: 'web-fallback',
    brave_query: queryRoster.join(' || '),
    brave_results: rows.length,
    accepted_count: candidates.length,
  })
  console.log(`  [${archetype.id}] web-fallback: accepted ${candidates.length}/${dedupedRows.length}`)

  // Phase23 fix B3 (Tristan 2026-05-18): if the dedup collapsed too many
  // duplicate-domain hits and we ended up under `needed`, fire a wider Brave
  // re-query and merge the results. Cheap — Brave is free up to ~1 qps, and
  // Flash-Lite scoring is parallel.
  //
  // 2026-05-18 PM re-audit fix #5: the original re-query formulation
  // (`<keyword> UK manufacturer "<productClass>"`) was still too narrow for
  // archetypes like drone final_qa where the UK QA-services market is thin.
  // Now we drop the UK geographic constraint and bias toward services /
  // certifications. The widened query is more permissive — we rely on the
  // Flash-Lite scorer downstream to reject any non-UK candidate that doesn't
  // fit the archetype.
  if (candidates.length < needed && BRAVE_KEY) {
    const baseKw = archetype.search_keywords[0] ?? archetype.label
    const fallbackQuery = `${baseKw} services ISO 9001 "${productClass.replace(/_/g, ' ')}"`.replace(/\s+/g, ' ').trim()
    console.log(`  [${archetype.id}] web-fallback re-query: have ${candidates.length}/${needed}, firing "${fallbackQuery}"`)
    await sleep(BRAVE_INTER_CALL_MS)
    const reBatch = await braveSearch(fallbackQuery)
    // Filter against already-seen apex domains and previously accepted names.
    const reCandidates: BraveResult[] = []
    const alreadySeenApex = new Set(seenApex)
    for (const c of candidates) {
      const apex = extractRegistrableDomain(c.url)
      if (apex) alreadySeenApex.add(apex)
    }
    for (const r of reBatch) {
      const apex = extractRegistrableDomain(r.url)
      if (apex && alreadySeenApex.has(apex)) continue
      const canon = canonicaliseNameForDedup(r.name)
      if (canon && globalExcludeNames.has(canon)) continue
      reCandidates.push(r)
      if (apex) alreadySeenApex.add(apex)
    }
    if (reCandidates.length > 0) {
      // Score the re-query candidates and accept the best-fitting ones up to `needed`.
      const reScored = await Promise.all(
        reCandidates.map(async (r) => {
          const score = await scoreCandidate(brief, {
            name: r.name,
            country: 'unknown',
            description: r.description,
          }, bomContext)
          return { row: r, score }
        }),
      )
      const reAccepted = reScored
        .filter((s) => s.score !== null && s.score.fit_or_reject === 'fit' && s.score.score >= MIN_LLM_SCORE)
        .sort((a, b) => (b.score!.score) - (a.score!.score))
        .slice(0, needed - candidates.length)
      if (reAccepted.length > 0) {
        // Run name cleanup on the re-query winners.
        const reCleanup: { row: BraveResult; cleanName: string; rejectReason?: string }[] =
          reAccepted.map((a) => ({ row: a.row, cleanName: '' }))
        await cleanAcceptedNames(reCleanup)
        let addedCount = 0
        for (let i = 0; i < reAccepted.length; i++) {
          const ct = reCleanup[i]
          if (!ct.cleanName) continue
          const a = reAccepted[i]
          let host = ''
          try {
            host = new URL(a.row.url).hostname.replace(/^www\./, '').toLowerCase()
          } catch {
            host = ''
          }
          const apexHost = extractRegistrableDomain(a.row.url)
          const knownLoc = knownSupplierLocation(apexHost)
          const snippetLoc = locationFromSnippet(a.row.description)
          const pathLoc = locationFromUrlPath(a.row.url)
          const tldLoc = host ? locationFromHost(host) : null
          let city: string | null = null
          let country: string | null = null
          let inferredFromTld = false
          if (knownLoc) { city = knownLoc.city; country = knownLoc.country }
          else if (snippetLoc) { city = snippetLoc.city; country = snippetLoc.country }
          else if (pathLoc) { city = pathLoc.city; country = pathLoc.country; inferredFromTld = true }
          else if (tldLoc) { city = tldLoc.city; country = tldLoc.country; inferredFromTld = true }
          // 2026-05-18 PM re-audit fix #2: city validator gate.
          const reCandName = ct.cleanName || a.row.name
          if (city && !isValidCityCandidate(city, reCandName)) {
            city = null
          }
          // 2026-05-18 PM re-audit fix #1: per-apex headquarters Brave query
          // when city is missing but country is set.
          if (!city && country && BRAVE_KEY) {
            const hq = await brave_headquartersLookup(reCandName, apexHost)
            if (hq && hq.city && isValidCityCandidate(hq.city, reCandName)) {
              city = hq.city
              if (hq.country && !knownLoc) country = hq.country
            }
          }
          candidates.push({
            name: reCandName,
            raw_title: a.row.name,
            url: a.row.url,
            description: a.row.description || null,
            source: 'web-fallback',
            ch_verified: false,
            confidence: classifyWebConfidence(a.score!.score),
            score: a.score!.score,
            reasoning: a.score!.reasoning,
            city,
            country,
            location_inferred_from_tld: inferredFromTld,
          })
          globalExcludeNames.add(canonicaliseNameForDedup(ct.cleanName))
          addedCount += 1
        }
        console.log(`  [${archetype.id}] web-fallback re-query: added ${addedCount} candidate(s)`)
      } else {
        console.log(`  [${archetype.id}] web-fallback re-query: 0 candidate(s) passed scoring`)
      }
    }
  }

  return candidates
}

function dedupAndPick(rows: CompanyRow[], n: number): CompanyRow[] {
  // Deduplicate by normalised name + domain (rough)
  const seen = new Set<string>()
  const picked: CompanyRow[] = []
  for (const r of rows) {
    if (picked.length >= n) break
    const key = (r.name || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    picked.push(r)
  }
  return picked
}

function rowToCandidate(row: CompanyRow, llmScore: LLMScore | null): SupplierCandidate {
  // 2026-05-18 PM re-audit fix #1/#2: a previously-persisted DB row may carry
  // garbage city values (e.g. "UAVTEK", "UK. Design") that were written by an
  // earlier web-fallback persistence pass before the validator existed. Apply
  // the same sanitiser at read time so we never surface them in the PDF.
  // Also try KNOWN_SUPPLIER_LOCATIONS as a free upgrade — if the DB has no
  // city/country but we know the apex, use ours.
  const apex = extractRegistrableDomain(row.website_url || '')
  const known = knownSupplierLocation(apex)
  let city: string | null = row.city
  let country: string | null = row.country
  if (city && !isValidCityCandidate(city, row.name)) {
    city = null  // discard prior-persisted rubbish
  }
  if (known) {
    if (!city) city = known.city
    if (!country) country = known.country
  }
  return {
    name: row.name,
    country,
    city,
    website_url: row.website_url,
    contact_name: row.contact_name,
    contact_title: row.contact_title,
    contact_email: row.contact_email,
    description: row.description,
    ch_verified: Boolean(row.ch_company_number),
    ch_company_number: row.ch_company_number,
    confidence: classifyConfidence(row),
    source: 'forge-truth-db',
    llm_score: llmScore?.score ?? null,
    llm_reasoning: llmScore?.reasoning ?? null,
    capability_oneliner: null,
    fit_bullets: null,
    contact_email_derived: null,
  }
}

/**
 * Map the state.json product_class string to a CLASS_SUPPLIERS registry key.
 * State.json product_class is inconsistent across runs — some are snake_case
 * keys ("consumer_cinematography_drone"), others are display strings with
 * acronyms ("Battery Energy Storage System (BESS)"). Normalise to registry key.
 */
function normaliseProductClass(raw: string): string {
  const s = raw.toLowerCase().replace(/[_-]/g, ' ')
  // P10a fix 2026-05-18: Stage 1.7 emits product_class="energy_storage" (the
  // class-standards canonical key) which doesn't match CLASS_SUPPLIERS' "bess"
  // archetype key. Without this branch, the enricher silently no-ops for
  // every BESS run sourced from the post-A1 pipeline.
  if (s === 'energy storage') return 'bess'
  if (s.includes('bess') || s.includes('battery energy storage')) return 'bess'
  if (s.includes('cinematography') || s.includes('drone') || s.includes('quad')) return 'consumer_cinematography_drone'
  if (s.includes('heat pump') || s.includes('heatpump')) return 'heatpump'
  if (s.includes('ev charger') || s.includes('vehicle charger') || s.includes('charger')) return 'ev_charger'
  if (s.includes('edge ai') || s.includes('edge inference') || s.includes('inference appliance') || s.includes('rack mount')) return 'edge_ai'
  if (s.includes('bioreactor')) return 'bioreactor'
  if (s.includes('vertical farm')) return 'vertical_farm'
  if (s.includes('continuous glucose') || s.includes('cgm') || s.includes('glucose monitor') || s.includes('wearable medical')) return 'cgm'
  if (s.includes('auv') || s.includes('autonomous underwater')) return 'auv'
  if (s.includes('haps') || s.includes('high altitude') || s.includes('stratospheric') || s.includes('pseudo satellite')) return 'haps'
  // Last resort: strip non-alpha, lowercase, replace spaces with underscore
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
}

interface SupplierArchetypeOutput {
  archetype_id: string
  archetype_label: string
  function_description: string
  brief: string
  candidates: SupplierCandidate[]
  notes?: string
  /**
   * 2026-05-18 PM re-audit fix #5: surfaced by the renderer as "fewer
   * candidates than typical" when an archetype ends with < CANDIDATES_PER_ARCHETYPE
   * even after the wider re-query fallback. Sales team can then broaden the
   * search.
   */
  candidate_shortfall?: boolean
}

/**
 * P10a (Tristan directive 2026-05-17 + target engine-flow §2):
 * walk `state.moduleDecomposition.modules[].sub_modules[].words[]` and
 * `state.partVerifications` to derive a BoM-grounded context block. Returns
 * an object with two fields:
 *
 *   top_manufacturers   — up to 10 frequency-ranked manufacturer names cited
 *                          across the BoM (e.g. CATL, Sungrow, Daikin,
 *                          Siemens). Sourced from PartVerification rows
 *                          (preferred when available) and from modifier_
 *                          character regulatory/named-manufacturer values.
 *   critical_components — up to 10 high-level component descriptors built
 *                          from content_character.name_human + selected
 *                          quantity / capacity / form modifiers, picked from
 *                          the most-populated sub-modules (likely the design's
 *                          architectural pivots). Examples:
 *                              "LFP prismatic cell 280Ah ×3920"
 *                              "1500V SiC inverter"
 *                              "cell-to-cell copper busbar 350A"
 *
 * Output is a single ~600-char prompt block ready to drop into
 * scoreCandidate's BoM CONTEXT slot. Empty string when state has no BoM data
 * (early-stage runs before Stage 1.7 has emitted modules).
 */
interface BomContext {
  top_manufacturers: string[]
  critical_components: string[]
  prompt_block: string
}

function buildBomContext(state: any): BomContext {
  const manufacturerCounts = new Map<string, number>()
  const componentList: string[] = []

  // 1. Walk partVerifications first when available — these carry verified
  //    manufacturer strings that are higher signal than raw modifier tokens.
  const verifications: any[] = Array.isArray(state?.partVerifications) ? state.partVerifications : []
  for (const v of verifications) {
    const mfr = String(v?.manufacturer ?? '').trim()
    if (!mfr) continue
    // Skip generic placeholders that the verifier sometimes emits
    if (/^(unknown|generic|tbd|n\/a|none)$/i.test(mfr)) continue
    manufacturerCounts.set(mfr, (manufacturerCounts.get(mfr) ?? 0) + 1)
  }

  // 2. Walk moduleDecomposition.modules[].sub_modules[].words[] for both
  //    component descriptors and manufacturer hints inside modifier values.
  const modules: any[] = state?.moduleDecomposition?.modules ?? []
  // Sort modules by population so we surface components from the most-
  // populated sub-modules first — these are typically the architectural pivots.
  const subModulesWithPopulation: Array<{ subModule: any; populationScore: number }> = []
  for (const m of modules) {
    const subs: any[] = m?.sub_modules ?? []
    for (const sm of subs) {
      const words: any[] = sm?.words ?? []
      let qtyTotal = 0
      for (const w of words) {
        const mods: any[] = w?.modifier_characters ?? []
        for (const mod of mods) {
          if (!mod || !mod.value) continue
          const raw = String(mod.value).trim()
          // manufacturer modifier kind (when emitted) or named_manufacturer string
          if (mod.kind === 'manufacturer' || mod.kind === 'named_manufacturer') {
            manufacturerCounts.set(raw, (manufacturerCounts.get(raw) ?? 0) + 1)
          }
          if (mod.kind === 'quantity') {
            // Extract numeric portion (e.g. "×3920" → 3920) to bias population score
            const n = Number(raw.replace(/[^\d.]/g, ''))
            if (Number.isFinite(n)) qtyTotal += Math.min(n, 10000)
          }
        }
      }
      subModulesWithPopulation.push({ subModule: sm, populationScore: qtyTotal + words.length })
    }
  }
  subModulesWithPopulation.sort((a, b) => b.populationScore - a.populationScore)

  // 3. Build the critical-component descriptors from the top-N sub-modules.
  const MAX_COMPONENTS = 10
  for (const { subModule } of subModulesWithPopulation) {
    if (componentList.length >= MAX_COMPONENTS) break
    const words: any[] = subModule?.words ?? []
    for (const w of words) {
      if (componentList.length >= MAX_COMPONENTS) break
      const name = String(w?.content_character?.name_human ?? '').trim()
      if (!name) continue
      const mods: any[] = w?.modifier_characters ?? []
      // Pick at most 3 modifiers from the "shape-defining" kinds
      const interestingKinds = new Set(['capacity', 'quantity', 'form', 'topology', 'dimension'])
      const tokens: string[] = []
      for (const mod of mods) {
        if (tokens.length >= 3) break
        if (!interestingKinds.has(mod?.kind)) continue
        const v = String(mod?.value ?? '').trim()
        if (!v) continue
        tokens.push(mod.unit ? `${v} ${mod.unit}` : v)
      }
      const descriptor = tokens.length ? `${name} (${tokens.join(', ')})` : name
      componentList.push(descriptor)
    }
  }

  // 4. Frequency-rank the manufacturers
  const topManufacturers = Array.from(manufacturerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([n]) => n)

  // 5. Compose the prompt block — empty string when nothing was extracted.
  let promptBlock = ''
  if (topManufacturers.length > 0 || componentList.length > 0) {
    const mfrs = topManufacturers.length > 0
      ? `Top manufacturers cited in BoM: ${topManufacturers.join(', ')}.`
      : 'No specific manufacturers named in BoM.'
    const comps = componentList.length > 0
      ? `Critical components in this design:\n  - ${componentList.join('\n  - ')}`
      : 'No critical components extracted from BoM.'
    promptBlock = `${mfrs}\n${comps}`
  }

  return {
    top_manufacturers: topManufacturers,
    critical_components: componentList,
    prompt_block: promptBlock,
  }
}

async function enrichSuppliers(state: any): Promise<SupplierArchetypeOutput[]> {
  const productClassRaw: string | undefined =
    state?.moduleDecomposition?.product_class ?? state?.parsedBrief?.product_class
  if (!productClassRaw) {
    console.error('[enrich-suppliers] no product_class found in state — cannot pick archetypes')
    return []
  }
  const productClass = normaliseProductClass(productClassRaw)
  if (productClass !== productClassRaw) {
    console.log(`[enrich-suppliers] normalised "${productClassRaw}" → "${productClass}"`)
  }

  const cls = CLASS_SUPPLIERS[productClass]
  if (!cls || cls.archetypes.length === 0) {
    console.error(
      `[enrich-suppliers] no archetypes defined for product class "${productClass}" — supplier section will be empty for this product. Add archetypes to src/lib/pdf-engine-v2/class-suppliers.ts.`,
    )
    return []
  }

  // Build product brief for LLM scoring (description + key constraints)
  const productBrief = String(
    state?.parsedBrief?.product_description ??
      state?.moduleDecomposition?.brief_overview_prose?.overview_and_context?.split('\n')[0] ??
      productClass,
  ).slice(0, 500)

  // P10a: walk the BoM (moduleDecomposition.modules[].sub_modules[].words[] +
  // partVerifications) and surface top manufacturers + critical components
  // as scorer context. With this, Flash-Lite can preferentially score
  // candidates that obviously integrate the named parts.
  const bomContext = buildBomContext(state)
  if (bomContext.prompt_block) {
    console.log(`[enrich-suppliers] BoM context:`)
    if (bomContext.top_manufacturers.length > 0) {
      console.log(`  • top manufacturers: ${bomContext.top_manufacturers.join(', ')}`)
    }
    if (bomContext.critical_components.length > 0) {
      console.log(`  • critical components (top ${bomContext.critical_components.length}):`)
      for (const c of bomContext.critical_components) console.log(`      - ${c}`)
    }
  } else {
    console.log(`[enrich-suppliers] BoM context: empty — Stage 1.7 has not emitted modules + no partVerifications. Scoring will fall back to brief-only mode.`)
  }

  const outputs: SupplierArchetypeOutput[] = []
  // Track companies picked across archetypes — don't recommend same company for two roles
  const globalExclude = new Set<string>()
  // Web candidates have no DB id, so the cross-archetype dedup for them is name-keyed.
  // Seed with canonical names of every DB pick so web fallback can't duplicate them.
  const globalExcludeNames = new Set<string>()

  for (const archetype of cls.archetypes) {
    const brief = generateSupplierBrief(productBrief, archetype)
    // Pull a LARGER pool than we need so the LLM scorer has options to filter from
    const rows = queryCandidates(archetype, POOL_PER_ARCHETYPE, globalExclude)
    // Bug #5 (Tristan 2026-05-18): ALSO pull previously-persisted web-fallback
    // rows tagged with this archetype. The standard queryCandidates() requires
    // ch_company_number which excludes web-sourced rows; queryArchetypeTaggedCandidates
    // bypasses that. Without this, every bioreactor brief re-discovers Sartorius via
    // Brave even after we've persisted them. Concat + let dedupAndPick collapse.
    const archetypeTaggedRows = queryArchetypeTaggedCandidates(archetype, POOL_PER_ARCHETYPE, globalExclude) as CompanyRow[]
    if (archetypeTaggedRows.length > 0) {
      console.log(`  [${archetype.id}] +${archetypeTaggedRows.length} archetype-tagged row(s) from prior web-fallback persistence`)
    }
    const dedupedPool = dedupAndPick([...archetypeTaggedRows, ...rows], POOL_PER_ARCHETYPE)

    // Score each candidate via Flash-Lite — pass BoM context so the scorer
    // can reason about integration fit (P10a, 2026-05-17).
    const scored: { row: CompanyRow; score: LLMScore | null }[] = []
    if (OPENROUTER_KEY) {
      console.log(`  [${archetype.id}] scoring ${dedupedPool.length} candidates via Flash-Lite…`)
      // Score in parallel (small concurrency) — Flash-Lite is cheap
      const scoringPromises = dedupedPool.map(async (row) => {
        const score = await scoreCandidate(brief, row, bomContext.prompt_block)
        return { row, score }
      })
      const results = await Promise.all(scoringPromises)
      scored.push(...results)
    } else {
      // No LLM key — fall back to no scoring, take top 3 by relevance/CH-verification
      for (const row of dedupedPool) scored.push({ row, score: null })
    }

    // Filter to fit + score >= MIN_LLM_SCORE; sort by score desc; take top N
    const accepted = scored
      .filter((s) => s.score === null || (s.score.fit_or_reject === 'fit' && s.score.score >= MIN_LLM_SCORE))
      .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))
      .slice(0, CANDIDATES_PER_ARCHETYPE)

    for (const a of accepted) {
      globalExclude.add(a.row.id)
      globalExcludeNames.add(canonicaliseName(a.row.name))
    }
    const dbCandidates = accepted.map((a) => rowToCandidate(a.row, a.score))
    const dbAcceptedCount = dbCandidates.length
    const dbRejectedCount = scored.length - accepted.length

    // Web fallback: fires only when the DB path didn't fill 3 slots.
    const webCandidates: SupplierCandidate[] = []
    const webNeeded = CANDIDATES_PER_ARCHETYPE - dbAcceptedCount
    let webAttempted = false
    if (webNeeded > 0) {
      webAttempted = true
      const webSourced = await webFallbackSearch(
        archetype,
        brief,
        productClass,
        globalExclude,
        globalExcludeNames,
        webNeeded,
        bomContext.prompt_block,
      )
      for (const w of webSourced) {
        webCandidates.push({
          name: w.name,
          raw_title: w.raw_title,
          country: w.country,
          city: w.city,
          website_url: w.url,
          contact_name: null,
          contact_title: null,
          contact_email: null,
          description: w.description,
          ch_verified: false,
          ch_company_number: null,
          confidence: w.confidence,
          source: 'web-fallback',
          llm_score: w.score,
          llm_reasoning: w.reasoning,
          capability_oneliner: null,
          fit_bullets: null,
          contact_email_derived: null,
        })
      }
    }

    const candidates: SupplierCandidate[] = [...dbCandidates, ...webCandidates]

    // Phase22 fix C1: capability + fit-bullet extraction. Run AFTER dedup so we
    // only pay for the cards that survive into the PDF. Concurrency 8 — Flash-
    // Lite is parallel-safe and we keep the wall-clock under 3-4s per archetype.
    if (OPENROUTER_KEY && candidates.length > 0) {
      await pMap(candidates, 8, async (c) => {
        const cf = await extractCapabilityAndFit(
          { name: c.name, description: c.description, country: c.country, url: c.website_url },
          brief,
          archetype,
        )
        if (cf) {
          c.capability_oneliner = cf.capability_oneliner
          c.fit_bullets = cf.fit_bullets
        }
        // Cheap email derivation — regex over whatever description text is on the row.
        const email = extractEmailFromText(c.description) || extractEmailFromText(c.contact_email)
        if (email && !c.contact_email) c.contact_email_derived = email
      })
    }

    // Bug #5 (Tristan 2026-05-18): persist web-fallback candidates back to
    // forge-truth.db. Only persist AFTER capability extraction so the DB carries
    // the procurement-card capability_oneliner, not just the raw Brave snippet.
    // Non-fatal — failures don't block PDF rendering.
    if (webCandidates.length > 0) {
      const persistCounts = persistArchetypeWebCandidates(candidates, archetype, brief, productClass)
      if (persistCounts.inserted > 0 || persistCounts.updated > 0 || persistCounts.skipped > 0) {
        console.log(`  [${archetype.id}] persisted web candidates → inserted: ${persistCounts.inserted}, updated: ${persistCounts.updated}, skipped: ${persistCounts.skipped}${persistCounts.skipReasons.length ? ' (' + persistCounts.skipReasons.slice(0, 3).join('; ') + ')' : ''}`)
      }
    }

    let note: string | undefined
    if (candidates.length === 0) {
      note = webAttempted
        ? `No suitable matches in forge-truth.db (${dbRejectedCount} rejected) and web fallback returned 0 acceptable candidates.`
        : `No suitable matches in forge-truth.db after LLM scoring (${dbRejectedCount} rejected as poor fit).`
    } else if (dbAcceptedCount < CANDIDATES_PER_ARCHETYPE && webCandidates.length > 0) {
      note = `${dbAcceptedCount} from forge-truth.db (${dbRejectedCount} rejected); ${webCandidates.length} added via web-fallback.`
    } else if (candidates.length < CANDIDATES_PER_ARCHETYPE) {
      note = `Only ${candidates.length} of ${CANDIDATES_PER_ARCHETYPE} candidates passed LLM relevance scoring (DB ${dbRejectedCount} rejected; web-fallback added ${webCandidates.length}).`
    }

    outputs.push({
      archetype_id: archetype.id,
      archetype_label: archetype.label,
      function_description: archetype.function_description,
      brief,
      candidates,
      notes: note,
    })
  }

  // 2026-05-18 PM re-audit fix #1: post-loop sweep over ALL candidates (DB +
  // web) where country is set but city is missing. Use the per-apex cache so
  // the same Brave call is amortised across archetypes and source types.
  // Skipped entirely when BRAVE_KEY is missing.
  if (BRAVE_KEY) {
    let hqUpdated = 0
    for (const out of outputs) {
      for (const c of out.candidates) {
        if (c.city || !c.country || !c.website_url) continue
        const apexHost = extractRegistrableDomain(c.website_url)
        // First try KNOWN_SUPPLIER_LOCATIONS again (cheap, no I/O) — DB rows
        // may have an empty city we can fill from our hand-curated table.
        const knownHere = knownSupplierLocation(apexHost)
        if (knownHere) {
          c.city = knownHere.city
          if (!c.country) c.country = knownHere.country
          hqUpdated += 1
          continue
        }
        const hq = await brave_headquartersLookup(c.name, apexHost)
        if (hq && hq.city && isValidCityCandidate(hq.city, c.name)) {
          c.city = hq.city
          if (hq.country && !knownSupplierLocation(apexHost)) {
            c.country = hq.country
          }
          hqUpdated += 1
        }
      }
    }
    if (hqUpdated > 0) {
      console.log(`  [headquarters-lookup] populated city on ${hqUpdated} candidate(s) via known-locations + Brave HQ query`)
    }
  }

  // 2026-05-18 PM re-audit fix #3: cross-archetype dedup pass. The dedup that
  // runs WITHIN each archetype's enrichment doesn't catch a company that
  // legitimately matches multiple archetypes (e.g. Edinburgh Drone Co does
  // both build + final_qa). Founder reads the same supplier card twice across
  // archetypes = copy-paste-bug impression.
  //
  // Strategy: group candidates by registrable apex domain. For each group
  // appearing in 2+ archetypes, keep the candidate in the archetype where it
  // has the highest llm_score; drop from the others. Mark any archetype that
  // drops below CANDIDATES_PER_ARCHETYPE with candidate_shortfall = true so
  // the renderer can show a "fewer candidates than typical" note.
  const domainToOccurrences = new Map<string, Array<{ outputIdx: number; candIdx: number; score: number }>>()
  for (let i = 0; i < outputs.length; i++) {
    const out = outputs[i]
    for (let j = 0; j < out.candidates.length; j++) {
      const c = out.candidates[j]
      const apex = extractRegistrableDomain(c.website_url || '')
      if (!apex) continue
      const score = c.llm_score ?? 0
      const arr = domainToOccurrences.get(apex) ?? []
      arr.push({ outputIdx: i, candIdx: j, score })
      domainToOccurrences.set(apex, arr)
    }
  }

  // Build a set of (outputIdx, candIdx) to drop.
  const dropSet = new Set<string>()
  let crossDedupDrops = 0
  for (const [apex, occs] of domainToOccurrences.entries()) {
    if (occs.length < 2) continue
    // Sort by score desc; keep the FIRST, drop the rest.
    const sorted = occs.slice().sort((a, b) => b.score - a.score)
    const keep = sorted[0]
    for (let k = 1; k < sorted.length; k++) {
      const drop = sorted[k]
      dropSet.add(`${drop.outputIdx}:${drop.candIdx}`)
      crossDedupDrops += 1
      console.log(
        `  [cross-archetype dedup] apex "${apex}" appears in ${occs.length} archetypes — keeping in ` +
          `"${outputs[keep.outputIdx].archetype_id}" (score ${keep.score}), dropping from "${outputs[drop.outputIdx].archetype_id}" (score ${drop.score})`,
      )
    }
  }
  if (crossDedupDrops > 0) {
    // Re-build each output's candidate list excluding the dropped slots.
    for (let i = 0; i < outputs.length; i++) {
      const filtered = outputs[i].candidates.filter((_, j) => !dropSet.has(`${i}:${j}`))
      outputs[i].candidates = filtered
    }
    console.log(`  [cross-archetype dedup] removed ${crossDedupDrops} duplicate candidate slot(s)`)
  }

  // 2026-05-18 PM re-audit fix #5: any archetype that finishes below
  // CANDIDATES_PER_ARCHETYPE (whether due to thin DB pool, web-fallback
  // misses, or cross-archetype dedup above) gets candidate_shortfall = true.
  // The renderer surfaces this as a sales-team note rather than silently
  // shipping a 2-card archetype next to 3-card ones.
  for (const out of outputs) {
    if (out.candidates.length < CANDIDATES_PER_ARCHETYPE) {
      out.candidate_shortfall = true
      const existingNote = out.notes ?? ''
      const shortfallNote = `Only ${out.candidates.length} of ${CANDIDATES_PER_ARCHETYPE} candidates — sales team may want to broaden the search.`
      out.notes = existingNote ? `${existingNote} ${shortfallNote}` : shortfallNote
    }
  }

  return outputs
}

async function main() {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: enrich-state-with-suppliers.tsx <state.json> [--write]')
    process.exit(1)
  }
  const statePath = resolve(args[0])
  const write = args.includes('--write')

  if (!existsSync(statePath)) {
    console.error(`[enrich-suppliers] state file not found: ${statePath}`)
    process.exit(1)
  }

  const state = JSON.parse(readFileSync(statePath, 'utf-8'))
  const suppliers = await enrichSuppliers(state)

  console.log(`[enrich-suppliers] product_class: ${state.moduleDecomposition?.product_class}`)
  for (const out of suppliers) {
    console.log(`  ${out.archetype_id}: ${out.candidates.length} candidate(s)${out.notes ? '  — ' + out.notes : ''}`)
    for (const c of out.candidates) {
      const tag = c.source === 'web-fallback' ? 'web' : 'db'
      console.log(`    • [${tag}] ${c.name} (${c.country || '??'}) — confidence: ${c.confidence}`)
    }
  }

  console.log(`[enrich-suppliers] calls — brave: ${callCounters.brave}, flash-lite (score): ${callCounters.flashLite}, flash-lite (name cleanup): ${callCounters.nameCleanup}, flash-lite (capability): ${callCounters.capability}`)
  console.log(`[enrich-suppliers] provenance (web-fallback): ${provenanceLog.length} archetype(s) hit Brave`)

  if (write) {
    state.suppliers = suppliers
    // Merge provenance: keep any pre-existing records, append this run's web-fallback entries.
    const priorProvenance: any[] = Array.isArray(state.suppliers_provenance) ? state.suppliers_provenance : []
    state.suppliers_provenance = [...priorProvenance, ...provenanceLog]
    writeFileSync(statePath, JSON.stringify(state, null, 2))
    console.log(`[enrich-suppliers] wrote state.suppliers (${suppliers.length} archetypes) + ${provenanceLog.length} provenance record(s) back to ${statePath}`)
  } else {
    console.log('[enrich-suppliers] dry run — pass --write to persist to state.json')
  }
}

main().catch((err) => {
  console.error('[enrich-suppliers] fatal:', err)
  process.exit(1)
})
