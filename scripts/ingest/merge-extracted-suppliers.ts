#!/usr/bin/env -S npx tsx
/**
 * @file scripts/ingest/merge-extracted-suppliers.ts
 *
 * Dedupes the 1,698 rows in pretraining_extracted_suppliers against the
 * companies table (27,997 rows) and identifies genuinely new real suppliers
 * worth adding to the companies directory.
 *
 * Deduplication logic:
 *   1. Exact case/whitespace-insensitive match on name vs companies.name
 *   2. Exact match on name vs companies.name_normalized
 *   3. "Parent-brand" match: extracted name starts with a known company's name
 *      (e.g. "ABB Oy Drives" → parent "ABB" already in companies)
 *      Uses a prefix threshold of >= 4 chars to avoid false positives.
 *
 * Noise detection heuristics (flags likely non-company entities):
 *   - Name contains: institute / association / authority / bureau / commission /
 *     council / agency / federation / society / organisation / university / college
 *   - Known noise list: CHEMTREC, ODVA, AFBMA, ADEME, VfW, AT&T, AWS, AMD,
 *     ASTM, IEEE, NFPA, IEC, ISO, UL, 3GPP, ANSI, ASHRAE, BSI, CEN, CENELEC,
 *     ITU, MPI, worldsteel, Google, Intel, NVIDIA, Samsung, Microsoft, Apple
 *   - Names that match a standards body abbreviation pattern (2-6 uppercase chars)
 *
 * Usage:
 *   npx tsx scripts/ingest/merge-extracted-suppliers.ts            # dry-run (default)
 *   npx tsx scripts/ingest/merge-extracted-suppliers.ts --dry-run  # explicit
 *   npx tsx scripts/ingest/merge-extracted-suppliers.ts --write    # HUMAN ONLY
 *
 * In --write mode: inserts genuinely-new rows into companies with:
 *   discovery_source = 'pretraining_extracted_suppliers'
 *   status = 'discovered'
 *   enrichment_quality = 0   (un-enriched — clearly needs follow-up)
 *   source = 'pretraining_extracted_suppliers'
 *
 * Does NOT delete or modify the source pretraining_extracted_suppliers table.
 *
 * British spelling throughout.
 * Pre-change mempalace search: supplier dedupe companies merge -> 0 drawers loaded
 */

import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import BetterSqlite3 from 'better-sqlite3'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')
const DISCOVERY_SOURCE = 'pretraining_extracted_suppliers'

// Noise keywords — entities matching these are likely standards bodies,
// trade associations, research institutes, or government bodies rather than
// commercial suppliers.
const NOISE_KEYWORDS = [
  'institute',
  'association',
  'authority',
  'bureau',
  'commission',
  'council',
  'agency',
  'federation',
  'society',
  'organisation',
  'organization',
  'university',
  'college',
  'government',
  'ministry',
  'department of',
  'sig,',           // Bluetooth SIG, Inc. etc.
  '(pno)',
  'worldsteel',
  'environment protection',
]

// Known exact-match noise names (acronyms / platforms / utilities / standards orgs)
const NOISE_EXACT = new Set([
  'chemtrec',   // emergency phone service
  'odva',       // industrial fieldbus body
  'afbma',      // bearing standards org
  'ademe',      // French energy agency
  'vfw',        // Veterans of Foreign Wars
  'at&t',       // telecom — not an industrial supplier
  'aws',        // cloud — not a product supplier
  'amd',        // silicon — not an industrial product supplier
  'astm',       // standards body
  'ieee',       // standards body
  'nfpa',       // standards body
  'iec',        // standards body
  'iso',        // standards body
  'ul',         // testing / certification body
  '3gpp',       // standards body
  'ansi',       // standards body
  'ashrae',     // standards body
  'bsi',        // standards body
  'cen',        // standards body
  'cenelec',    // standards body
  'itu',        // standards body
  'mpi',        // research
  'worldsteel', // industry association
  'sd association', // standards body
  'google',     // platform — not an industrial supplier
  'intel',      // silicon — context-dependent but not a hardware supplier
  'nvidia',     // silicon
  'samsung',    // consumer — oversimplified; flag as noise
  'microsoft',  // software platform
  'apple',      // consumer platform
])

// A name that is only 2-6 uppercase letters with NO vowels is very likely a
// standards-body abbreviation (IEC, ISO, UL, NEC, ITU, etc.) — treat as noise.
// Deliberately excludes vowel-containing names like SICK, FLEX, SICK — those are
// real companies. Rule: uppercase only + no vowels + 2-6 chars.
const ABBREV_PATTERN = /^[B-DF-HJ-NP-TV-Z0-9]{2,6}$/i
// Note: above is consonant-only (no A, E, I, O, U). Simpler alternative:
// ^[A-Z0-9]{2,6}$ but only when the token contains no vowels.
const hasNoVowels = (s: string): boolean => !/[aeiou]/i.test(s)
function isAbbreviation(name: string): boolean {
  const t = name.trim()
  return /^[A-Z0-9]{2,6}$/.test(t) && hasNoVowels(t)
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExtractedSupplier {
  id: number
  company_name: string
  role: string | null
  website: string | null
  raw_excerpt: string | null
}

type Category =
  | 'already_in_companies'
  | 'parent_brand_in_companies'
  | 'noise'
  | 'genuinely_new'

interface ClassifiedSupplier {
  name: string
  canonical: string   // lower-trimmed
  role: string | null
  website: string | null
  category: Category
  matchReason: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalise(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isNoise(name: string): boolean {
  const lower = normalise(name)
  if (NOISE_EXACT.has(lower)) return true
  if (isAbbreviation(name.trim())) return true
  return NOISE_KEYWORDS.some(kw => lower.includes(kw))
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const writeMode = args.includes('--write')
  const dryRun = !writeMode

  console.log(`[merge-extracted-suppliers] mode=${dryRun ? 'DRY-RUN (no writes)' : 'WRITE'}`)
  console.log(`[merge-extracted-suppliers] DB: ${DB_PATH}`)
  console.log()

  // Open read-only for dry-run; only open read-write in write mode.
  const db = new BetterSqlite3(DB_PATH, { readonly: dryRun })

  // Load all distinct supplier names from the source table.
  const rawRows = db
    .prepare(
      `SELECT id, company_name, role, website, raw_excerpt
       FROM pretraining_extracted_suppliers
       WHERE company_name IS NOT NULL AND trim(company_name) != ''`,
    )
    .all() as ExtractedSupplier[]

  const totalRaw = rawRows.length

  // Build a canonical name → first-seen row map (deduplication within the source table).
  const byCanonical = new Map<string, ExtractedSupplier>()
  for (const row of rawRows) {
    const c = normalise(row.company_name)
    if (!byCanonical.has(c)) byCanonical.set(c, row)
  }
  const distinctCount = byCanonical.size

  // Load companies lookup sets.
  const companiesNames = new Set<string>(
    (db.prepare(`SELECT name FROM companies WHERE name IS NOT NULL`).all() as { name: string }[]).map(
      r => normalise(r.name),
    ),
  )
  const companiesNormalized = new Set<string>(
    (
      db.prepare(`SELECT name_normalized FROM companies WHERE name_normalized IS NOT NULL`).all() as { name_normalized: string }[]
    ).map(r => normalise(r.name_normalized)),
  )

  // Build a sorted list of known company names (for parent-brand prefix matching).
  // Only bother with entries that are >= 4 chars to avoid false positives like "ABB" matching "Abbey".
  const companiesNamesSorted: string[] = [...companiesNames]
    .filter(n => n.length >= 4)
    .sort((a, b) => b.length - a.length) // longest first for greedy match

  // Classify each distinct supplier.
  const classified: ClassifiedSupplier[] = []

  for (const [canonical, row] of byCanonical.entries()) {
    const name = row.company_name.trim()

    // 1. Exact match in companies.name or companies.name_normalized? Check FIRST
    //    so known-real companies like "ABB" are never reclassified as noise
    //    even if they superficially resemble an abbreviation.
    if (companiesNames.has(canonical) || companiesNormalized.has(canonical)) {
      classified.push({ name, canonical, role: row.role, website: row.website, category: 'already_in_companies', matchReason: 'exact name match' })
      continue
    }

    // 2. Noise? (runs after exact-match so canonical real companies are preserved)
    if (isNoise(name)) {
      classified.push({ name, canonical, role: row.role, website: row.website, category: 'noise', matchReason: 'noise heuristic' })
      continue
    }

    // 3. Parent-brand prefix match: e.g. "ABB Oy Drives" → parent "abb" already in companies.
    let parentMatch: string | null = null
    for (const knownName of companiesNamesSorted) {
      if (knownName.length < 4) continue
      if (canonical.startsWith(knownName + ' ') || canonical === knownName) {
        parentMatch = knownName
        break
      }
    }
    if (parentMatch) {
      classified.push({ name, canonical, role: row.role, website: row.website, category: 'parent_brand_in_companies', matchReason: `parent brand "${parentMatch}" in companies` })
      continue
    }

    // 4. Genuinely new.
    classified.push({ name, canonical, role: row.role, website: row.website, category: 'genuinely_new', matchReason: null })
  }

  const counts = {
    total_raw: totalRaw,
    distinct: distinctCount,
    already_in_companies: classified.filter(c => c.category === 'already_in_companies').length,
    parent_brand_in_companies: classified.filter(c => c.category === 'parent_brand_in_companies').length,
    noise: classified.filter(c => c.category === 'noise').length,
    genuinely_new: classified.filter(c => c.category === 'genuinely_new').length,
  }
  const dupes = counts.already_in_companies + counts.parent_brand_in_companies

  // -------------------------------------------------------------------------
  // DRY-RUN report
  // -------------------------------------------------------------------------
  if (dryRun) {
    console.log('=== DRY-RUN REPORT ===')
    console.log()
    console.log(`Total raw rows in pretraining_extracted_suppliers : ${counts.total_raw}`)
    console.log(`Distinct company_name values                      : ${counts.distinct}`)
    console.log()
    console.log('Category breakdown:')
    console.log(`  Already in companies (exact name match)         : ${counts.already_in_companies}`)
    console.log(`  Parent brand already in companies (prefix match): ${counts.parent_brand_in_companies}`)
    console.log(`  Total duplicates                                 : ${dupes}`)
    console.log(`  Likely noise / non-supplier                     : ${counts.noise}`)
    console.log(`  Genuinely new real suppliers                    : ${counts.genuinely_new}`)
    console.log()

    // Sample ~15 genuinely new.
    const sample = classified.filter(c => c.category === 'genuinely_new').slice(0, 15)
    console.log(`Sample of ${sample.length} genuinely-new real suppliers (would be inserted in --write mode):`)
    for (const s of sample) {
      const ws = s.website ? ` | ${s.website}` : ''
      const role = s.role ? ` [${s.role}]` : ''
      console.log(`  ${s.name}${role}${ws}`)
    }
    console.log()

    // Sample noise entries.
    const noiseSample = classified.filter(c => c.category === 'noise').slice(0, 10)
    console.log(`Sample of ${noiseSample.length} noise/non-supplier entries (flagged, NOT inserted):`)
    for (const s of noiseSample) {
      console.log(`  ${s.name}  (reason: ${s.matchReason})`)
    }
    console.log()

    // Sample parent-brand entries.
    const parentSample = classified.filter(c => c.category === 'parent_brand_in_companies').slice(0, 8)
    console.log(`Sample of ${parentSample.length} parent-brand duplicates (NOT inserted — parent already in companies):`)
    for (const s of parentSample) {
      console.log(`  ${s.name}  (${s.matchReason})`)
    }
    console.log()

    console.log('In --write mode: genuinely-new rows would be INSERT OR IGNORE into companies with:')
    console.log(`  discovery_source = '${DISCOVERY_SOURCE}'`)
    console.log(`  status = 'discovered'`)
    console.log(`  enrichment_quality = 0`)
    console.log(`  source = '${DISCOVERY_SOURCE}'`)
    console.log()
    console.log('pretraining_extracted_suppliers will NOT be deleted or modified.')
    console.log()
    console.log('Re-run with --write to perform the actual insert (human only).')
    db.close()
    return
  }

  // -------------------------------------------------------------------------
  // WRITE MODE — human-only.
  // -------------------------------------------------------------------------

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const stmtInsert = db.prepare(`
    INSERT OR IGNORE INTO companies
      (id, name, website_url, source, discovery_source, status, enrichment_quality,
       name_normalized, created_at, updated_at)
    VALUES
      (@id, @name, @website_url, @source, @discovery_source, 'discovered', 0,
       @name_normalized, datetime('now'), datetime('now'))
  `)

  const newEntries = classified.filter(c => c.category === 'genuinely_new')

  const insertAll = db.transaction(() => {
    let inserted = 0
    let skipped = 0
    for (const s of newEntries) {
      const websiteUrl = s.website && s.website.trim() !== '' ? s.website.trim() : null
      const res = stmtInsert.run({
        id: randomUUID(),
        name: s.name,
        website_url: websiteUrl,
        source: DISCOVERY_SOURCE,
        discovery_source: DISCOVERY_SOURCE,
        name_normalized: s.canonical,
      })
      if (res.changes > 0) {
        inserted++
      } else {
        skipped++
      }
    }
    return { inserted, skipped }
  })

  const result = insertAll()
  db.close()

  console.log()
  console.log(
    `[merge-extracted-suppliers] DONE` +
    ` — inserted=${result.inserted}` +
    ` skipped=${result.skipped}` +
    ` (noise=${counts.noise} parent_dupes=${counts.parent_brand_in_companies} exact_dupes=${counts.already_in_companies})`,
  )

  // ---------------------------------------------------------------------------
  // AUTO-FIRE: kick off enrichment for the just-inserted rows.
  //
  // Runs enrich-new-suppliers.ts --write immediately after merge so newly-added
  // rows get website discovery + LLM capability extraction without any manual
  // follow-up.  We pass --limit equal to the number just inserted so this run
  // is scoped to the fresh batch (idempotent — already-enriched rows are skipped
  // by the enricher anyway).
  //
  // Uses spawnSync (blocking) so the enrichment completes before this process
  // exits.  On a large batch (800+) this will take several minutes — that is
  // expected and intentional.
  // ---------------------------------------------------------------------------
  if (result.inserted > 0) {
    const enricherPath = resolve(__dirname, 'enrich-new-suppliers.ts')
    console.log()
    console.log(`[merge-extracted-suppliers] Auto-firing enrichment for ${result.inserted} new rows…`)
    const enrichResult = spawnSync(
      'npx',
      ['tsx', enricherPath, '--write', '--limit', String(result.inserted)],
      { stdio: 'inherit', encoding: 'utf-8' },
    )
    if (enrichResult.status !== 0) {
      console.error(`[merge-extracted-suppliers] WARNING: enrichment exited with code ${enrichResult.status}`)
      console.error('  Run manually: npx tsx scripts/ingest/enrich-new-suppliers.ts --write --limit', result.inserted)
    } else {
      console.log('[merge-extracted-suppliers] Enrichment complete.')
    }
  }
}

main().catch(err => {
  console.error('[merge-extracted-suppliers] FATAL:', err)
  process.exit(1)
})
