/**
 * @file public-investor-preview.ts
 *
 * @description Public-safe investor preview for the marketing homepage.
 * Two modes:
 * 1. Default preview — aggregate stats + sample cards (existing)
 * 2. Search — keyword-matched anonymized results for conversion
 *
 * @security Uses admin client. Search results are ANONYMIZED — no firm names,
 * contact emails, websites, LinkedIn, investment_thesis, or portfolio company
 * names. Only exposes: subcategory, firm_type, hq_city, stage_focus (first 2),
 * sectors (first 3), is_active_deploying, fund_tier, cheque_min (partial),
 * portfolio_themes (sector aggregation only — no company names), and a coarse
 * team_reachability bucket derived from email_tier counts (never the tier or
 * email itself).
 */

"use server"

import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { embedQuery } from '@/lib/embeddings'
import { scoreFirmDashboard } from '@/lib/investor-match-dashboard'
import type { InvestorFirm } from '@/actions/investors'

// ─── Types ───────────────────────────────────────────────────────────────────

export type PublicInvestorCard = {
  id: string
  title: string
  subcategory: string
  firm_type: string | null
  hq_city: string | null
  stage_focus: string[]
  is_active_deploying: boolean
  fund_tier: string | null
}

export type PublicInvestorPreview = {
  investors: PublicInvestorCard[]
  totalCount: number
  activeDeployingCount: number
}

export type TeamReachability = 'strong' | 'limited' | 'none'

export type AnonymizedInvestorResult = {
  /** "Investor A", "Investor B", … assigned by composite-score rank. */
  placeholder: string
  /** 0-100 dashboard composite score. */
  composite: number
  /** Four pillar values (0-100 each) — thesis 25% / stage 25% / geography 25% / cheque 25%. */
  pillars: { thesis: number; stage: number; geography: number; cheque: number }
  subcategory: string
  firm_type: string | null
  /** Country-level only — never specific city/address. */
  geo_summary: string | null
  stage_focus: string[]
  sectors: string[]
  is_active_deploying: boolean
  fund_tier: string | null
  /** Cheque range like "£500K – £5M" or null. */
  cheque_range_label: string | null
  /** First sentence (max ~80 chars) of the investor's thesis — flavour without identification. */
  thesis_excerpt: string | null
  /**
   * Top portfolio sectors (max 3, deduplicated, "Unknown"-stripped) aggregated
   * from this firm's portfolio_companies JSONB. Never includes a portfolio
   * company name — only the sector taxonomy values, which are generic enough
   * to be safe (e.g. "FinTech", "Healthcare", "Robotics"). Empty array when
   * the firm has no portfolio data or every sector is null/blank/Unknown.
   */
  portfolio_themes: string[]
  /**
   * Coarse derived signal from vc_pe_contacts.email_tier — surfaces whether
   * the firm has reachable contacts WITHOUT exposing email addresses, the
   * tier vocabulary, or counts.
   *  - "strong"  → at least one decision-maker / partner / principal /
   *                managing director / director with a sendable tier
   *                (corresponded, hunter_verified, neverbounce_valid,
   *                neverbounce_catchall).
   *  - "limited" → some contacts on file but only uncertain tiers
   *                (neverbounce_unknown, unverified, generic_blocked) OR
   *                sendable contacts that aren't senior.
   *  - "none"    → no contacts, or only invalid / disposable / bounced.
   * Sendable / uncertain vocabulary mirrors InvestorContact.email_tier docs
   * in src/actions/investors.ts.
   */
  team_reachability: TeamReachability
  /** TODO: deep dossier excerpt — currently lives on the forge-capital-app
   * Supabase project (kgkajatjyqfetdtbzmwg) in the investor_deep_profiles
   * table. Wire here once that data is mirrored / pushed to ForgeOS
   * (jyarhvinengfyrwgtskq). When added, must run through redactFirmNames()
   * and trim to ≤140 chars. */
}

export type InvestorSearchResult = {
  results: AnonymizedInvestorResult[]
  totalMatches: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Formats a cheque value for partial display (e.g. 250000 -> "£250K")
 */
function formatChequeMin(value: number | null | undefined): string | null {
  if (!value || value <= 0) return null
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (value >= 1_000) return `£${Math.round(value / 1_000)}K`
  return `£${value}`
}

function formatChequeRange(min: number | null | undefined, max: number | null | undefined): string | null {
  const lo = formatChequeMin(min ?? undefined)
  const hi = formatChequeMin(max ?? undefined)
  if (!lo && !hi) return null
  return `${lo ?? '—'} – ${hi ?? '—'}`
}

/** Bucket a city / region string to a country-level label. Falls back to the
 * raw value if no rule matches. Never returns specific addresses. */
function geoSummary(geoFocus: string[], hqCity: string | null): string | null {
  const text = [...geoFocus, hqCity].filter(Boolean).join(' ').toLowerCase()
  if (!text) return null
  const RULES: Array<[RegExp, string]> = [
    [/\b(uk|united kingdom|britain|england|scotland|wales|london|manchester|cambridge|oxford|edinburgh|bristol)\b/, 'United Kingdom'],
    [/\b(germany|berlin|munich|hamburg)\b/, 'Germany'],
    [/\b(france|paris)\b/, 'France'],
    [/\b(switzerland|swiss|zurich|geneva)\b/, 'Switzerland'],
    [/\b(netherlands|amsterdam)\b/, 'Netherlands'],
    [/\b(spain|madrid|barcelona)\b/, 'Spain'],
    [/\b(italy|milan|rome)\b/, 'Italy'],
    [/\b(sweden|stockholm|nordics)\b/, 'Nordics'],
    [/\b(europe|european|eu|emea)\b/, 'Europe'],
    [/\b(israel|tel aviv)\b/, 'Israel'],
    [/\b(canada|toronto|vancouver|montreal)\b/, 'Canada'],
    [/\b(us|usa|united states|america|san francisco|new york|boston|chicago|los angeles|seattle|austin|miami|silicon valley)\b/, 'United States'],
    [/\b(india|mumbai|bangalore)\b/, 'India'],
    [/\b(china|beijing|shanghai)\b/, 'China'],
    [/\b(japan|tokyo)\b/, 'Japan'],
    [/\b(singapore)\b/, 'Singapore'],
    [/\b(australia|sydney|melbourne)\b/, 'Australia'],
    [/\b(global|worldwide|international)\b/, 'Global'],
  ]
  for (const [re, label] of RULES) if (re.test(text)) return label
  return null
}

/** Firm-type suffixes that identify a proper-noun run as an investor firm name. */
const FIRM_SUFFIX = '(?:Capital|Ventures|Venture|Partners|Fund|Funds|House|Group|Holdings|Investments|Advisors|Advisers|Equity|Bank|Labs|Studio|Foundry|Accelerator|Trust|Management|Council|Corporation)'

/** Redact firm names from free text. Covers:
 *  - leading "NAME is/are/invests/…" patterns
 *  - "An ideal company for NAME is" / "The ideal NAME portfolio company" templates from Forge Capital's synthesiser
 *  - mid-sentence "at NAME", "by NAME", "with NAME", "for NAME"
 *  - possessives "NAME's" / "NAME's portfolio"
 *  - any capitalised run ending in Capital/Ventures/Partners/Fund/etc.
 *  Result may be rougher than the source, but keeps all the DOMAIN signal
 *  (sectors, stages, cheque size) while stripping identification. */
function redactFirmNames(s: string): string {
  // 1. Common Forge Capital template prefixes
  s = s.replace(
    /^An ideal\s+(?:company|investment|candidate|target)\s+(?:for|with|at)\s+[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,5}\s+is\b/i,
    'An ideal target is',
  )
  s = s.replace(
    /^The ideal\s+[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,5}\s+(portfolio|target)\s+(company|business|startup|investment)\b/i,
    'The ideal $1 $2',
  )

  // 2. "At NAME, we …" → "We …"
  s = s.replace(/^At\s+[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,5},?\s+(we|our)\b/i, '$1')
  s = s.replace(/^At\s+[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,5},\s*/i, '')

  // 3. Any capitalised run ending in a firm-type suffix → "this firm"
  const firmRe = new RegExp(
    `\\b[A-Z][\\w&'\\-.]+(?:\\s+[A-Z][\\w&'\\-.]+){0,5}\\s+${FIRM_SUFFIX}\\b`,
    'g',
  )
  s = s.replace(firmRe, 'this firm')

  // 4. Possessives like "Gresham House's portfolio" (missed by step 3 if Name already
  //    lacks suffix, e.g. "Octopus's")
  s = s.replace(/\b[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,3}(?:'s|'s)/g, 'their')

  // 5. Leading single/double-word firm name (no suffix) at start of sentence
  s = s.replace(
    /^[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+){0,3}\s+(is|are|invests|focuses|targets|backs|makes|specialises|specializes|partners|supports|funds|seeks|looks)\b/,
    'They $1',
  )

  // 6. "by/for/with/at NAME" mid-sentence when NAME is 2+ capitalised words
  s = s.replace(
    /\b(by|for|with|at)\s+([A-Z][\w&'\-.]+\s+[A-Z][\w&'\-.]+(?:\s+[A-Z][\w&'\-.]+)*)/g,
    '$1 this firm',
  )

  // 7. Parentheticals "(at NAME)" / "(NAME)"
  s = s.replace(/\s?\((?:at\s+)?[A-Z][\w&'\-.\s]{1,60}\)/g, '')

  return s.replace(/\s+/g, ' ').trim()
}

/** Anonymised flavour sentence. Prefers fields that describe target founders over
 * the firm's own thesis, then aggressively redacts any firm-name leakage. */
function thesisExcerpt(attrs: Record<string, unknown>): string | null {
  const pick = (k: string): string | null => {
    const v = attrs[k]
    return typeof v === 'string' && v.trim().length >= 20 ? v.trim() : null
  }
  const source = pick('ideal_company_profile') ?? pick('investment_pattern') ?? pick('value_add') ?? pick('investment_thesis')
  if (!source) return null

  const cleaned = redactFirmNames(source)
  const firstSentence = cleaned.split(/[.!?]\s/)[0] ?? cleaned
  return firstSentence.length > 140 ? firstSentence.slice(0, 138).trimEnd() + '…' : firstSentence
}

/** Generate a stable placeholder name from an index. A..Z, then "Investor #27" etc. */
function placeholderName(index: number): string {
  if (index < 26) return `Investor ${String.fromCharCode(65 + index)}`
  return `Investor #${index + 1}`
}

// ─── Portfolio sector aggregation (anonymous) ───────────────────────────────

/** Strip generic placeholder values that leak no signal. */
const PORTFOLIO_SECTOR_BLOCKLIST = new Set([
  '', 'unknown', 'other', 'n/a', 'na', 'none', 'tbd', 'misc',
])

/**
 * Normalise a sector label for de-duplication keys.
 * Keep "FinTech" / "CleanTech" / "BioTech" / "AI" / "SaaS" / "IoT" intact when
 * the source already uses that casing — title-case only the all-lowercase
 * inputs ("fintech" → "Fintech"). Aggregation key is the canonical lowercase
 * value so casing variants still collapse.
 */
function canonicaliseSector(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  // Already mixed-case (FinTech, CleanTech, BioTech) or all-caps acronym (AI,
  // SaaS, IoT) — preserve the source casing.
  if (/[A-Z]/.test(t)) return t
  // All-lowercase / numeric only — title-case for display.
  return t.replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Extracts top-3 portfolio sector themes from the portfolio_companies JSONB.
 *
 * @security Reads ONLY the `sector` field from each entry — never `company_name`,
 * `description`, `amount_usd`, `stage`, or `why_appealing`. Returns generic
 * sector labels (FinTech, Healthcare, AI, Robotics) which carry no firm or
 * portfolio-company identity.
 */
function portfolioThemes(attrs: Record<string, unknown>): string[] {
  const raw = attrs.portfolio_companies
  if (!Array.isArray(raw)) return []

  // Map<lowercase-key, { display, count }> so "FinTech" / "Fintech" / "fintech"
  // collapse into one entry while preserving the first display casing seen.
  const buckets = new Map<string, { display: string; count: number }>()
  for (const entry of raw as Array<Record<string, unknown>>) {
    if (!entry || typeof entry !== 'object') continue
    const sectorField = entry.sector
    if (typeof sectorField !== 'string') continue
    // Some records store comma-delimited multi-sector strings ("Health Plans, Behavioral Economics").
    for (const piece of sectorField.split(/[,/|]/)) {
      const display = canonicaliseSector(piece)
      if (!display) continue
      const key = display.toLowerCase()
      if (PORTFOLIO_SECTOR_BLOCKLIST.has(key)) continue
      const existing = buckets.get(key)
      if (existing) {
        existing.count += 1
      } else {
        buckets.set(key, { display, count: 1 })
      }
    }
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count || a.display.localeCompare(b.display))
    .slice(0, 3)
    .map((b) => b.display)
}

// ─── Team reachability (derived from email_tier — never exposes the tier) ───

/** Tiers we consider sendable. Mirrors src/actions/investors.ts InvestorContact.email_tier docs. */
const SENDABLE_TIERS = new Set([
  'corresponded',
  'hunter_verified',
  'neverbounce_valid',
  'neverbounce_catchall',
])

/** Tiers we treat as uncertain (not bad, not confirmed). */
const UNCERTAIN_TIERS = new Set([
  'neverbounce_unknown',
  'unverified',
  'generic_blocked',
])

/** Seniority values that count as "senior" (decision-making) when is_decision_maker is null/false. */
const SENIOR_SENIORITY = new Set([
  'partner',
  'principal',
  'managing_director',
  'director',
])

type ContactRow = {
  listing_id: string
  is_decision_maker: boolean | null
  seniority: string | null
  email_tier: string | null
}

/**
 * Classifies a listing's contact pool into a coarse reachability bucket.
 *
 * @security Returns ONLY the bucket label ("strong" | "limited" | "none").
 * Never exposes counts, the email_tier vocabulary, or any contact identity.
 */
function teamReachability(contacts: ContactRow[]): TeamReachability {
  if (contacts.length === 0) return 'none'

  let hasSeniorSendable = false
  let hasAnySendable = false
  let hasAnyUncertain = false

  for (const c of contacts) {
    const tier = c.email_tier ?? ''
    const sendable = SENDABLE_TIERS.has(tier)
    const uncertain = UNCERTAIN_TIERS.has(tier)
    if (sendable) hasAnySendable = true
    if (uncertain) hasAnyUncertain = true
    if (sendable) {
      const senior = c.is_decision_maker === true || (c.seniority != null && SENIOR_SENIORITY.has(c.seniority))
      if (senior) hasSeniorSendable = true
    }
  }

  if (hasSeniorSendable) return 'strong'
  if (hasAnySendable || hasAnyUncertain) return 'limited'
  return 'none'
}

// ─── Default Preview (no search) ────────────────────────────────────────────

/**
 * Fetches a small sample of investors for the public homepage preview.
 * Cached for 1 hour to avoid hammering the DB on every homepage visit.
 *
 * NOTE: As of 2026-04-23 the homepage component (investor-preview.tsx) only
 * reads `totalCount` from this action's payload — the `investors` cards are
 * not rendered. The new `portfolio_themes` and `team_reachability` fields
 * therefore live ONLY on AnonymizedInvestorResult (search results), to avoid
 * adding two pointless joins to every homepage hit. If/when this preview
 * grows visible cards, mirror the `searchPublicInvestors` 5a contact-fetch
 * + portfolioThemes() / teamReachability() helpers here.
 */
export const getPublicInvestorPreview = unstable_cache(
  async (): Promise<PublicInvestorPreview> => {
    // SECURITY: admin client — public preview of aggregate investor data
    const supabase = createAdminClient()

    // Get total count
    const { count } = await supabase
      .from('marketplace_listings')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'Finance')

    // Get a sample of 8 high-quality investors (sorted by data quality)
    // SECURITY: Only select title, subcategory, attributes — strip everything else
    const { data } = await supabase
      .from('marketplace_listings')
      .select('id, title, subcategory, attributes')
      .eq('category', 'Finance')
      .order('created_at', { ascending: false })
      .limit(100)

    if (!data || data.length === 0) {
      return { investors: [], totalCount: count ?? 0, activeDeployingCount: 0 }
    }

    // Sort by data quality score (highest first) and pick top 8
    const sorted = data
      .filter((r) => {
        const attrs = r.attributes as Record<string, unknown> | null
        return attrs && (attrs as Record<string, unknown>).data_quality_score != null
      })
      .sort((a, b) => {
        const aScore = ((a.attributes as Record<string, unknown>)?.data_quality_score as number) ?? 0
        const bScore = ((b.attributes as Record<string, unknown>)?.data_quality_score as number) ?? 0
        return bScore - aScore
      })
      .slice(0, 8)

    // SECURITY: Strip to safe public fields only
    const investors: PublicInvestorCard[] = sorted.map((row) => {
      const attrs = (row.attributes as Record<string, unknown>) ?? {}
      return {
        id: row.id,
        title: row.title ?? 'Unknown Firm',
        subcategory: row.subcategory ?? 'Investor',
        firm_type: (attrs.firm_type as string) ?? null,
        hq_city: (attrs.hq_city as string) ?? null,
        stage_focus: ((attrs.stage_focus as string[]) ?? []).slice(0, 2),
        is_active_deploying: (attrs.is_active_deploying as boolean) ?? false,
        fund_tier: (attrs.fund_tier as string) ?? null,
      }
    })

    // Count active deploying from full dataset
    const activeDeployingCount = data.filter((r) => {
      const attrs = r.attributes as Record<string, unknown> | null
      return attrs && (attrs as Record<string, unknown>).is_active_deploying === true
    }).length

    return {
      investors,
      totalCount: count ?? data.length,
      activeDeployingCount,
    }
  },
  ['public-investor-preview'],
  { revalidate: 3600 } // Cache for 1 hour
)

// ─── Search (anonymized results) ────────────────────────────────────────────

/**
 * Searches investors by keyword and returns ANONYMIZED results.
 * Used on the public homepage to prove matching investors exist
 * without revealing identities — driving signup conversion.
 *
 * @security NEVER returns: title, firm name, contact_email, linkedin,
 * investment_thesis, portfolio details, website, or any PII.
 * Results are anonymized with random index instead of real IDs.
 *
 * @param query - Free-text search query from the visitor
 * @returns Up to 5 anonymized results + total match count
 */
export const searchPublicInvestors = unstable_cache(
  async (query: string): Promise<InvestorSearchResult> => {
    if (!query || query.trim().length < 6) {
      return { results: [], totalMatches: 0 }
    }
    const cleanQuery = query.trim().slice(0, 500)
    const supabase = createAdminClient()

    // 1. Embed the query with OpenAI text-embedding-3-small (1536-dim) to
    // match marketplace_listings.embedding column type. Was nomicEmbedQuery
    // (768-dim) — silently returned 0 results because pgvector raised on
    // dim mismatch and the try/catch swallowed the error. Fixed 2026-04-23.
    let queryEmbedding: number[]
    try {
      queryEmbedding = await embedQuery(cleanQuery)
    } catch (err) {
      console.error('[publicSearch] embedQuery failed:', err)
      return { results: [], totalMatches: 0 }
    }

    // SECURITY/CORRECTNESS: Defensive RPC-boundary guard. Mirrors searchInvestors
    // — see comment there. Marketplace_listings.embedding is vector(1536); a
    // mismatched query dim must abort loudly rather than silently fall back.
    if (queryEmbedding.length !== 1536) {
      console.error(
        `[publicSearch] Refused to call match_marketplace_listings_v2 with ` +
          `${queryEmbedding.length}-dim embedding (column is vector(1536)).`,
      )
      return { results: [], totalMatches: 0 }
    }

    // 2. Paginated RPC fetch — same pattern as src/actions/investors.ts.
    //    GOTCHA: 8 × 1000-row pgvector scans triggered Postgres statement_timeout
    //    (57014) on production 2026-04-24. Public preview only displays the top
    //    ~12 anonymized cards; 2000 candidates is ample recall.
    const PAGE = 1000
    const PAGES = 8
    const embJson = JSON.stringify(queryEmbedding) as unknown as string
    const pageResults = await Promise.all(
      Array.from({ length: PAGES }, (_, i) =>
        supabase.rpc('match_marketplace_listings_v2', {
          query_embedding: embJson,
          filter_category: 'Finance',
          match_threshold: -1.0,
          match_count: PAGE,
          p_offset: i * PAGE,
        }),
      ),
    )
    const seen = new Set<string>()
    const rows: Array<Record<string, unknown>> = []
    for (const r of pageResults) {
      for (const row of (r.data ?? []) as Array<Record<string, unknown>>) {
        const id = String(row.id)
        if (seen.has(id)) continue
        seen.add(id)
        rows.push(row)
      }
    }
    if (rows.length === 0) return { results: [], totalMatches: 0 }

    // 3. Restrict scope to forge_capital-synced rows (canonical master).
    const fcRows = rows.filter((r) => {
      const a = (r.attributes as Record<string, unknown>) || {}
      return a.data_source === 'forge_capital'
    })

    // 4. Score every row with the same dashboard algorithm the For You tab uses.
    const scored = fcRows.map((row) => {
      const sim = typeof row.similarity === 'number' ? row.similarity : null
      const firm = { id: String(row.id), title: '', attributes: row.attributes } as unknown as InvestorFirm
      const { composite, pillars } = scoreFirmDashboard(firm, cleanQuery, sim)
      return { row, composite, pillars }
    }).sort((a, b) => b.composite - a.composite)

    const strongMatches = scored.filter(s => s.composite >= 50)
    // 5. Anonymize. Show only top 10 to discourage scraping; CTA drives signup.
    const top = scored.slice(0, 10)

    // 5a. Fetch contact-tier rows for the top 10 listings only (≤ a few hundred rows)
    //     to derive the team_reachability badge. SECURITY: select ONLY the four
    //     fields needed for classification — never email, name, linkedin, or tier_at.
    const topListingIds = top.map((t) => String(t.row.id))
    const contactsByListing = new Map<string, ContactRow[]>()
    if (topListingIds.length > 0) {
      const { data: contactRows, error: contactErr } = await supabase
        .from('vc_pe_contacts')
        .select('listing_id, is_decision_maker, seniority, email_tier')
        .in('listing_id', topListingIds)
      if (contactErr) {
        console.error('[publicSearch] contact tier fetch failed:', contactErr.message)
      } else {
        for (const row of (contactRows ?? []) as ContactRow[]) {
          if (!row.listing_id) continue
          const list = contactsByListing.get(row.listing_id) ?? []
          list.push(row)
          contactsByListing.set(row.listing_id, list)
        }
      }
    }

    const anonymized: AnonymizedInvestorResult[] = top.map((entry, idx) => {
      const attrs = (entry.row.attributes as Record<string, unknown>) ?? {}
      const cheque = (attrs.cheque_range_gbp as { min?: number; max?: number } | undefined) ?? null
      const stages = Array.isArray(attrs.stage_focus) ? (attrs.stage_focus as string[]) : []
      const sectors = Array.isArray(attrs.sectors) ? (attrs.sectors as string[]) : []
      const geos = Array.isArray(attrs.geo_focus) ? (attrs.geo_focus as string[]) : []

      return {
        placeholder: placeholderName(idx),
        composite: entry.composite,
        pillars: entry.pillars,
        subcategory: (entry.row.subcategory as string) ?? 'Investor',
        firm_type: (attrs.firm_type as string) ?? null,
        geo_summary: geoSummary(geos, (attrs.hq_city as string) ?? null),
        stage_focus: stages.slice(0, 4),
        sectors: sectors.slice(0, 4),
        is_active_deploying: (attrs.is_active_deploying as boolean) ?? false,
        fund_tier: (attrs.fund_tier as string) ?? null,
        cheque_range_label: formatChequeRange(cheque?.min, cheque?.max),
        thesis_excerpt: thesisExcerpt(attrs),
        portfolio_themes: portfolioThemes(attrs),
        team_reachability: teamReachability(contactsByListing.get(String(entry.row.id)) ?? []),
      }
    })

    return {
      results: anonymized,
      totalMatches: strongMatches.length,
    }
  },
  ['public-investor-search-v3-themes-reachability'],
  { revalidate: 1800 }, // 30 min cache; identical queries reuse the same anon ranking
)
