/**
 * persist-web-fallback.ts — write-back path for the PDF Engine v2 supplier
 * enrichment pipeline.
 *
 * Bug #5 (Tristan 2026-05-18 PM): "I thought the whole purpose is that, as we
 * find these companies, they get added to the database, and so the database
 * organically gets better through every search which we do. This doesn't seem
 * to be happening." Until this module, the web-fallback path inside
 * scripts/enrich-state-with-suppliers.tsx was READ-ONLY — Brave/Tavily results
 * were surfaced in the PDF then discarded. Every next bioreactor brief
 * re-discovered the same companies from scratch.
 *
 * This module provides:
 *   - persistWebFallbackCandidate(): UPSERT a scored web candidate into the
 *     forge-truth.db `companies` table with source='web_fallback_pdf_engine'
 *     and an archetype tag in attributes_json.archetype_matches[].
 *   - queryArchetypeTaggedCandidates(): DB query that matches by archetype tag,
 *     bypassing the CH-verification requirement for web-sourced rows.
 *   - persistArchetypeWebCandidates(): batch helper called once per archetype
 *     after the existing pipeline has scored + extracted capabilities.
 *
 * Coordination: bugs 1-4 (other agent, parallel) own canonical name extraction
 * + dedup. The defensive de-pollute here is a TEMPORARY safety net; once the
 * other agent's cleanup runs reliably populate raw_title + canonical name, the
 * defensive strip can be removed.
 *
 * Defensive choices:
 *   - Min LLM score 6 (= MIN_LLM_SCORE in the main script) — below-threshold
 *     candidates are noise and stay out of the DB.
 *   - Name de-pollute pass: split on " | " / " - " / " – " separators, prefer
 *     the segment that overlaps with the URL's apex host (canonical brand).
 *     If the segment STILL looks like a page title (verbs, year refs, plural
 *     category nouns), use the host-derived name; if that also looks like
 *     rubbish, skip the row entirely.
 *   - UPSERT preserves CH-verified rows' source — never demote a "pushed"
 *     Companies-House-verified row.
 *   - relevance_score bumps to max(old, new); we don't downgrade.
 */
import { execFileSync } from 'child_process'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'

/** Min Flash-Lite score (0-10) required for a web candidate to be persisted. */
export const MIN_PERSIST_SCORE = 6

/** SQLite source string identifying our writes. Distinct from existing
 *  'brave', 'audit', 'conference', 'manual_brief_v4' so we can audit + roll
 *  back if needed. */
export const WEB_FALLBACK_SOURCE = 'web_fallback_pdf_engine'

/**
 * Shape this module requires from the caller's candidate object. We keep this
 * loose to avoid coupling to the main script's SupplierCandidate interface —
 * the field set we care about is small.
 */
export interface WebFallbackCandidateLike {
  name: string
  source: string  // expected 'web-fallback' for our writes; other sources are skipped
  website_url: string | null
  country: string | null
  city: string | null
  description: string | null
  llm_score: number | null
  llm_reasoning: string | null
  capability_oneliner: string | null
  raw_title?: string | null
}

export interface ArchetypeLike {
  id: string
  label?: string
  preferred_regions: string[]
}

/** CompanyRow shape produced by the existing queryCandidates() in
 *  enrich-state-with-suppliers.tsx — matched here so the caller can flow our
 *  rows through the same downstream scoring + capability extraction pipeline.
 */
export interface CompanyRowLike {
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

function sqlEscape(s: string): string {
  return (s ?? '').replace(/'/g, "''")
}

function quoteList(items: string[]): string {
  if (items.length === 0) return "''"
  return items.map((i) => `'${sqlEscape(i)}'`).join(',')
}

/**
 * Extract the apex host from a URL. Returns empty string when parsing fails.
 * "https://www.sartorius.com/en/products/foo" → "sartorius.com"
 */
export function apexHostFromUrl(url: string | null | undefined): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return ''
  }
}

/**
 * Derive a probable company name from a hostname. Drops the public-suffix-ish
 * trailing parts, title-cases the remainder. amprius.com → "Amprius".
 *
 * Mirrors the deriveNameFromHostname() in the main script. Duplicated here so
 * this module is self-contained and doesn't have to import from the script
 * being edited concurrently by another agent.
 */
function deriveNameFromHostname(host: string): string {
  if (!host) return ''
  const stripped = host.replace(/^www\./, '').toLowerCase()
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
  return apex
    .split('-')
    .map((seg) => (seg ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg))
    .join(' ')
    .trim()
}

/**
 * Pattern check for things that look like page titles, part numbers, or
 * listicle prose rather than a real company name. Returns a reason string
 * when the name should be rejected, or null when it looks like a real company.
 *
 * Compact version of the main script's looksLikeNonCompanyName() — covers the
 * same major rejection categories (year refs, listicle starters, part numbers,
 * verb phrases, no-letter strings, generic-descriptor-only).
 */
function looksLikePageTitle(name: string): string | null {
  if (!name) return 'empty'
  const trimmed = name.trim()
  if (!trimmed) return 'empty'
  if (/\b20\d{2}\b/.test(trimmed)) return 'contains year'
  if (/^(Best|Top|How|What|Why|Where|When)\s/i.test(trimmed)) return 'listicle starter'
  if (!/[a-zA-Z]/.test(trimmed)) return 'no letters'
  if (/[A-Z]{2,}-?\d{3,}/.test(trimmed)) return 'part-number pattern'
  if (/\d{3,}-?[A-Z]{2,}/.test(trimmed)) return 'part-number pattern'
  if (/\b(Manufacturers|Suppliers|Companies|Brands|Vendors)\b/i.test(trimmed)) return 'listicle category word'
  if (/\s(is|are|was|were|will|has|have|provides|offers|delivers|designs|builds|makes)\s/i.test(trimmed)) return 'contains verb'
  const wordCount = trimmed.split(/\s+/).length
  if (wordCount > 7) return `too long (${wordCount} words)`
  return null
}

/**
 * Generate a stable text id for the companies table. Domain is the most stable
 * identity signal — prefer it when available, else slug the name. Prefix
 * "wfp_" (web fallback persisted) makes our writes visible at a glance.
 */
export function buildPersistId(websiteUrl: string | null | undefined, name: string): string {
  const host = apexHostFromUrl(websiteUrl)
  if (host) {
    return `wfp_${host.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`
  }
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60)
  return slug ? `wfp_n_${slug}` : ''
}

/**
 * Defensive page-title strip. The other agent (bugs 1-4) owns the proper
 * canonical-name extraction. This is a safety net for the case where the
 * candidate.name still looks like a raw Brave page title — we MUST NOT pollute
 * the DB with rows like "Single-Use Bioreactors | Sartorius".
 *
 * Strategy:
 *   1. Split on separators (| – — " - "). Prefer the segment that overlaps
 *      with the apex host (canonical brand). Else take the LAST segment.
 *   2. Run looksLikePageTitle() on the candidate — if it flags, try the
 *      host-derived name.
 *   3. If too long (>5 words), prefer the host-derived name.
 *
 * Returns empty string when the input looks unusable as a company name.
 */
export function defensivelyCleanName(rawName: string, websiteUrl: string | null | undefined): string {
  if (!rawName) return ''
  const host = apexHostFromUrl(websiteUrl)
  const hostName = host ? deriveNameFromHostname(host) : ''
  const trimmed = rawName.trim()

  // Listicle / year-ref check on the WHOLE input: when the original is clearly
  // a listicle title, the page is about a category, not a company, so even
  // host-derived names mustn't slip through. (e.g. "Top 10 Bioreactor
  // Manufacturers 2026" hosted on a directory site → reject outright.)
  // We only check year + listicle-starter here; other rules still allow
  // segment-level recovery (e.g. "Pressure Vessels | Gilwood Ltd").
  if (/\b20\d{2}\b/.test(trimmed)) return ''
  if (/^(Best|Top|How|What|Why|Where|When)\s/i.test(trimmed)) return ''
  if (/\b(Manufacturers|Suppliers|Companies|Brands|Vendors)\b\s*$/i.test(trimmed)) return ''

  const segments = trimmed.split(/\s+[|–—]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean)

  let candidate = trimmed
  if (segments.length > 1) {
    let best = ''
    if (hostName) {
      const hostLower = hostName.toLowerCase().replace(/\s+/g, '')
      for (const seg of segments) {
        const segLower = seg.toLowerCase().replace(/[^a-z0-9]/g, '')
        if (segLower.includes(hostLower) || hostLower.includes(segLower)) {
          best = seg
          break
        }
      }
    }
    if (!best) best = segments[segments.length - 1]
    candidate = best
  }

  // Strip company-form suffixes for the length-evaluation, but keep them on
  // the returned name (display fidelity — "Acme Power Ltd" is fine).
  const evaluable = candidate
    .replace(/\b(Ltd|Limited|PLC|plc|Inc\.?|LLC|GmbH|S\.A\.|SA|S\.r\.l\.|SRL|Co\.|Company)\b\.?/gi, '')
    .trim()

  if (looksLikePageTitle(candidate)) {
    if (hostName && !looksLikePageTitle(hostName)) return hostName
    return ''
  }

  if (evaluable.split(/\s+/).filter(Boolean).length > 5) {
    if (hostName && !looksLikePageTitle(hostName)) return hostName
    return ''
  }

  return candidate
}

/**
 * Check if an id or domain already exists in the companies table.
 */
function fetchExistingCompany(idCandidate: string, domain: string): {
  id: string
  name: string
  source: string
  status: string
  relevance_score: number
  attributes_json: string | null
  ch_company_number: string | null
} | null {
  const idEsc = sqlEscape(idCandidate)
  const domainEsc = domain ? sqlEscape(domain) : ''
  const where = domainEsc
    ? `id = '${idEsc}' OR (domain IS NOT NULL AND domain != '' AND domain = '${domainEsc}')`
    : `id = '${idEsc}'`
  const sql = `SELECT id, name, source, status, relevance_score, attributes_json, ch_company_number FROM companies WHERE ${where} LIMIT 1`
  try {
    const out = execFileSync('sqlite3', ['-cmd', '.mode json', FORGE_TRUTH_DB, sql], {
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    })
    if (!out.trim()) return null
    const rows = JSON.parse(out)
    return rows && rows[0] ? rows[0] : null
  } catch (err: any) {
    console.error(`[persist] fetch existing failed: ${err.message}`)
    return null
  }
}

export interface ArchetypeMatch {
  archetype_id: string
  first_matched_at: string
  brief_class: string
  brief_query?: string
}

/**
 * Merge a new archetype match into attributes_json.archetype_matches[] without
 * duplicating an existing entry for the same archetype_id. Accumulates
 * queries_matched[] (deduped, capped at 40 to prevent attributes_json bloat).
 */
export function mergeArchetypeMatch(
  existingAttrsJson: string | null,
  newMatch: ArchetypeMatch,
  newQuery: string,
): { mergedAttrs: any; archetype_matches: ArchetypeMatch[]; queries_matched: string[] } {
  let parsed: any = {}
  if (existingAttrsJson) {
    try {
      parsed = JSON.parse(existingAttrsJson)
      if (!parsed || typeof parsed !== 'object') parsed = {}
    } catch {
      parsed = {}
    }
  }
  const existingMatches: ArchetypeMatch[] = Array.isArray(parsed.archetype_matches) ? parsed.archetype_matches : []
  const hasMatch = existingMatches.some((m) => m && m.archetype_id === newMatch.archetype_id)
  const merged = hasMatch ? existingMatches : [...existingMatches, newMatch]

  const existingQueries: string[] = Array.isArray(parsed.queries_matched) ? parsed.queries_matched.filter((q: any) => typeof q === 'string') : []
  const newQuerySet = new Set(existingQueries)
  if (newQuery) newQuerySet.add(newQuery)
  const mergedQueries = Array.from(newQuerySet).slice(0, 40)

  parsed.archetype_matches = merged
  parsed.queries_matched = mergedQueries
  return { mergedAttrs: parsed, archetype_matches: merged, queries_matched: mergedQueries }
}

export interface PersistResult {
  id: string
  action: 'insert' | 'update' | 'skip'
  reason?: string
}

/**
 * UPSERT a single web-fallback candidate into forge-truth.db.
 *   - On INSERT: source='web_fallback_pdf_engine', status='discovered',
 *     relevance_score=round(llm_score*10), attributes_json carries
 *     archetype_matches[] + queries_matched[].
 *   - On UPDATE: never clobber CH-verified rows' source. Only fill NULL/empty
 *     fields via COALESCE. Bump relevance_score to max(old, new).
 */
export function persistWebFallbackCandidate(
  candidate: WebFallbackCandidateLike,
  archetype: ArchetypeLike,
  brief: string,
  productClass: string,
): PersistResult {
  if (candidate.llm_score == null || candidate.llm_score < MIN_PERSIST_SCORE) {
    return { id: '', action: 'skip', reason: `score ${candidate.llm_score} < ${MIN_PERSIST_SCORE}` }
  }

  const cleanedName = defensivelyCleanName(candidate.name, candidate.website_url)
  if (!cleanedName) {
    return { id: '', action: 'skip', reason: `name "${candidate.name}" failed de-pollute check` }
  }

  const id = buildPersistId(candidate.website_url, cleanedName)
  if (!id) {
    return { id: '', action: 'skip', reason: 'no derivable id from url or name' }
  }

  const domain = apexHostFromUrl(candidate.website_url)
  const existing = fetchExistingCompany(id, domain)

  const newMatch: ArchetypeMatch = {
    archetype_id: archetype.id,
    first_matched_at: new Date().toISOString(),
    brief_class: productClass,
    brief_query: brief.slice(0, 200),
  }
  const sourceQuery = `${archetype.id}: ${brief.slice(0, 200)}`
  const newRelevance = Math.round((candidate.llm_score ?? 0) * 10)  // 0-10 → 0-100

  const descSource = candidate.capability_oneliner || candidate.llm_reasoning || candidate.description || ''
  const description = descSource.slice(0, 800)

  if (existing) {
    const { mergedAttrs } = mergeArchetypeMatch(existing.attributes_json, newMatch, sourceQuery)
    const mergedJson = sqlEscape(JSON.stringify(mergedAttrs))
    const updatedRelevance = Math.max(existing.relevance_score || 0, newRelevance)

    // Never demote provenance on rows that went through proper enrichment.
    // CH-verified rows are obviously protected. Rows with status in
    // ('enriched','approved','pushed') have been through manual / pipeline
    // curation — preserve their source too (e.g. Sartorius source='brave'
    // status='pushed' should stay 'brave').
    const hasCh = Boolean(existing.ch_company_number && existing.ch_company_number.length > 0)
    const isCuratedStatus = ['enriched', 'approved', 'pushed'].includes(existing.status || '')
    const preserveSource = hasCh || isCuratedStatus
    const sets: string[] = [
      `attributes_json = '${mergedJson}'`,
      `relevance_score = ${updatedRelevance}`,
      `updated_at = datetime('now')`,
      `website_url = COALESCE(NULLIF(website_url, ''), '${sqlEscape(candidate.website_url || '')}')`,
      `domain = COALESCE(NULLIF(domain, ''), '${sqlEscape(domain)}')`,
      `country = COALESCE(NULLIF(country, ''), '${sqlEscape(candidate.country || '')}')`,
      `city = COALESCE(NULLIF(city, ''), '${sqlEscape(candidate.city || '')}')`,
      `description = COALESCE(NULLIF(description, ''), '${sqlEscape(description)}')`,
    ]
    if (!preserveSource) sets.push(`source = '${WEB_FALLBACK_SOURCE}'`)

    const updateSql = `UPDATE companies SET ${sets.join(', ')} WHERE id = '${sqlEscape(existing.id)}'`
    try {
      execFileSync('sqlite3', [FORGE_TRUTH_DB, updateSql], { encoding: 'utf8' })
      return { id: existing.id, action: 'update' }
    } catch (err: any) {
      console.error(`[persist] update failed for ${cleanedName}: ${err.message}`)
      return { id: existing.id, action: 'skip', reason: 'update sql error' }
    }
  }

  const { mergedAttrs } = mergeArchetypeMatch(null, newMatch, sourceQuery)
  const mergedJson = sqlEscape(JSON.stringify(mergedAttrs))
  // 2026-05-24 (bess-l7 user-reported): replace the static `web_fallback`
  // search_profile_id with a per-chain stamp so each discovery is traceable
  // back to the specific chain run that surfaced it. Format mirrors the
  // existing per-discovery-run profile tags already in the DB
  // (e.g. `bess-supplier-discovery-20260422`, `space-components-uk`) so the
  // companies table stays uniformly grep-able by profile. Class is normalised
  // to lower-case + non-alphanumerics collapsed to underscores so values like
  // "Wind Turbine" don't break the tag shape.
  const isoDate = new Date().toISOString().slice(0, 10).replace(/-/g, '_')
  const safeClass = (productClass || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'unknown'
  const searchProfileTag = `discovered_${isoDate}_${safeClass}_chain`
  const insertSql = `INSERT OR IGNORE INTO companies (
    id, name, website_url, domain, country, city,
    source, source_url, source_query, raw_snippet,
    description, status, relevance_score, attributes_json,
    search_profile_id, discovery_source,
    created_at, updated_at
  ) VALUES (
    '${sqlEscape(id)}',
    '${sqlEscape(cleanedName)}',
    '${sqlEscape(candidate.website_url || '')}',
    '${sqlEscape(domain)}',
    '${sqlEscape(candidate.country || '')}',
    '${sqlEscape(candidate.city || '')}',
    '${WEB_FALLBACK_SOURCE}',
    '${sqlEscape(candidate.website_url || '')}',
    '${sqlEscape(sourceQuery)}',
    '${sqlEscape((candidate.description || '').slice(0, 800))}',
    '${sqlEscape(description)}',
    'discovered',
    ${newRelevance},
    '${mergedJson}',
    '${sqlEscape(searchProfileTag)}',
    'pdf_engine_web_fallback',
    datetime('now'),
    datetime('now')
  )`
  try {
    execFileSync('sqlite3', [FORGE_TRUTH_DB, insertSql], { encoding: 'utf8' })
    return { id, action: 'insert' }
  } catch (err: any) {
    console.error(`[persist] insert failed for ${cleanedName}: ${err.message}`)
    return { id, action: 'skip', reason: 'insert sql error' }
  }
}

/**
 * Query forge-truth.db for previously-persisted rows tagged with this
 * archetype. Bypasses the CH-verification requirement (the existing
 * queryCandidates() in the main script is too strict for our own writes —
 * web-sourced rows lack a Companies House number).
 *
 * Returns CompanyRow-shaped data so the caller can flow them through the same
 * downstream scoring + capability extraction pipeline as DB-native rows.
 *
 * Requires SQLite JSON1 support (default in macOS / Homebrew sqlite3).
 */
export function queryArchetypeTaggedCandidates(
  archetype: ArchetypeLike,
  limit: number,
  excludeIds: Set<string>,
): CompanyRowLike[] {
  const excludeClause = excludeIds.size > 0 ? ` AND c.id NOT IN (${quoteList(Array.from(excludeIds))})` : ''
  const archetypeEsc = sqlEscape(archetype.id)
  const regionsIn = quoteList(archetype.preferred_regions)
  const sql = `
    SELECT DISTINCT
      c.id, c.name, c.country, c.city, c.website_url,
      c.contact_name, c.contact_title, c.contact_email,
      c.description, c.status, c.ch_company_number, c.relevance_score
    FROM companies c, json_each(COALESCE(c.attributes_json, '{}'), '$.archetype_matches') am
    WHERE json_extract(am.value, '$.archetype_id') = '${archetypeEsc}'
      AND c.website_url IS NOT NULL AND c.website_url != ''
      ${excludeClause}
    ORDER BY
      (CASE WHEN c.country IN (${regionsIn}) THEN 1 ELSE 0 END) DESC,
      c.relevance_score DESC,
      c.name ASC
    LIMIT ${limit * 4}
  `
  try {
    const out = execFileSync('sqlite3', ['-cmd', '.mode json', FORGE_TRUTH_DB, sql], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    })
    if (!out.trim()) return []
    return JSON.parse(out)
  } catch (err: any) {
    console.error(`[persist] archetype-tagged query failed: ${err.message}`)
    return []
  }
}

/**
 * Batch helper: run persistWebFallbackCandidate over every web-sourced
 * candidate in a single archetype's output. Failures are non-fatal — the
 * supplier section still renders normally even if persistence fails.
 *
 * Caller is expected to pass the FINAL candidate list (post dedup, post
 * capability extraction) so we only persist what made it into the PDF.
 */
export function persistArchetypeWebCandidates(
  candidates: WebFallbackCandidateLike[],
  archetype: ArchetypeLike,
  brief: string,
  productClass: string,
): { inserted: number; updated: number; skipped: number; skipReasons: string[] } {
  const counts = { inserted: 0, updated: 0, skipped: 0, skipReasons: [] as string[] }
  for (const c of candidates) {
    if (c.source !== 'web-fallback') continue
    const r = persistWebFallbackCandidate(c, archetype, brief, productClass)
    if (r.action === 'insert') counts.inserted += 1
    else if (r.action === 'update') counts.updated += 1
    else {
      counts.skipped += 1
      if (r.reason) counts.skipReasons.push(r.reason)
    }
  }
  return counts
}
