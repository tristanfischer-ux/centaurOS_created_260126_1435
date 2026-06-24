/**
 * @file knowledge/class-standards-db.ts — DB-first overlay for per-class
 * regulatory standards, with the baked class-standards.ts registry as fallback.
 *
 * THE GAP THIS CLOSES (ForgeOS strengthening #2, read-slice):
 *   The G1b compliance gate (stages/3.5-compliance-gate.ts) reads ONLY the baked
 *   TypeScript registry `CLASS_STANDARDS` in class-standards.ts (11 hand-coded
 *   classes). For ANY UNSEEN archetype — satellite_ground_station, gaming_console,
 *   launch_vehicle_upper_stage, building_management_system, distribution_transformer,
 *   … — getClassStandards() returns an EMPTY stub ("Add an entry to
 *   class-standards.ts"), so the rendered §Compliance section is blank and the
 *   compliance gate fails open with WARN. That is the per-class hand-coding the
 *   AIM ("≥8 on ANY unknown archetype") forbids.
 *
 *   The `pretraining_extracted_standards` corpus (4,094 rows, ~2,262 distinct
 *   standard names across ~100 product classes in ~/.forge-truth/forge-truth.db)
 *   ALREADY covers most of those unseen classes — it is purely a wiring gap. This
 *   module makes the compliance gate a DB CONSUMER for the standards it has never
 *   had a baked entry for, mirroring class-reference-graph-db.ts (DB-first with
 *   baked-fallback) and the CHAIN-AS-DB-CONSUMER principle (chain reads the DB,
 *   never the live web — web ingest happens only via lookupStandard()'s writeback
 *   path / scheduled ingest jobs).
 *
 * SAFE-BY-DEFAULT:
 *   - Behind env flag STANDARDS_DB_LIVE (default OFF). When OFF — or when the DB
 *     is missing, or the DB has no standards for the class — this returns the
 *     baked getClassStandards() result UNCHANGED, so production behaviour is
 *     identical until the flag is explicitly enabled.
 *   - BAKED ALWAYS WINS for a class that already has a hand-curated entry. The DB
 *     overlay ONLY fires when the baked registry returns its empty stub — so the
 *     11 curated classes are never overridden by noisier DB rows.
 *   - This is READ-ONLY. No writeback here (lookupStandard() in standards-writeback.ts
 *     already owns the DB-first → web → writeback grow path; the writeback SLICE
 *     that feeds THIS read from the compliance gate's own missing-standard list is
 *     the documented follow-up, gated separately).
 *
 * ANTI-HALLUCINATION VERIFICATION (the specs/standards analogue of the gate-20
 * fictional-part guard the task calls out):
 *   The DB `standard_name` column is NOISY — alongside genuine regulatory codes
 *   it contains interface protocols ("10/100/1000BASE-T", "DVB-S2"), file formats,
 *   and non-standards ("UN Sustainable Development Goals", "Svalbard Act"). The DB
 *   has NO jurisdiction / mandatory / category columns. So a row is promoted into
 *   a RegulatoryStandard ONLY when its name matches a curated STANDARDS-BODY
 *   pattern (IEC / ISO / EN / BS / UL / NFPA / IEEE / MIL-STD / CFR / ANSI / ASME /
 *   ASTM / DIN / VDE / DNV / API / SAE / FCC / CE-directive forms, etc.). Anything
 *   that does not look like a real standards citation is DROPPED. Jurisdiction is
 *   INFERRED from the standards-body prefix; category is INFERRED from the scope
 *   text; `mandatory` defaults to false (an inferred DB standard is advisory, never
 *   asserted as a market-access mandatory — only baked entries assert that). This
 *   keeps the compliance gate's mandatory-coverage maths honest.
 *
 * British spelling throughout.
 *
 * Pre-change mempalace search: specs/standards DB-first read + writeback → see
 * CLAUDE.md "PDF Engine v2 corpus tables" + drawer forgeos_gotchas_25df555e549213ca.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import {
  getClassStandards,
  type ClassStandards,
  type RegulatoryStandard,
  type Jurisdiction,
  type StandardCategory,
} from '../../class-standards'

// ── Constants ──────────────────────────────────────────────────────────────────

const DB_PATH = resolve(homedir(), '.forge-truth', 'forge-truth.db')

/** Hard cap on the number of DB-derived standards promoted for one class. Keeps a
 *  rich class (vfd-motor-drive has 162 distinct names) from flooding the page; the
 *  most-frequently-cited verified rows win. */
const MAX_DB_STANDARDS = 24

/** Whether the DB-first overlay is enabled. Default OFF (env unset) — the baked
 *  stub is returned unchanged so production is unaffected until opt-in. */
export function standardsDbLiveEnabled(): boolean {
  const v = String(process.env.STANDARDS_DB_LIVE ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

// ── Standards-body verification (anti-hallucination) ────────────────────────────
// A DB standard_name is promoted ONLY when it matches one of these families. Each
// entry carries the inferred jurisdiction the family is enforced under. Ordered
// most-specific first (BS EN before EN, MIL-STD before generic, etc.).
interface StandardsFamily {
  /** RegExp the standard_name must match (case-insensitive, applied to a trimmed name). */
  rx: RegExp
  jurisdiction: Jurisdiction
}

const STANDARDS_FAMILIES: ReadonlyArray<StandardsFamily> = [
  // UK
  { rx: /^bs\s*en\b/i,            jurisdiction: 'UK' },
  { rx: /^bs\s*\d/i,              jurisdiction: 'UK' },
  { rx: /^pas\s*\d/i,            jurisdiction: 'UK' },
  { rx: /^g\d{2,3}\b/i,           jurisdiction: 'UK' }, // G99 / G98 / G100 ENA codes
  { rx: /\bENA\b/i,               jurisdiction: 'UK' },
  // EU directives + EN
  { rx: /^en\s*\d/i,              jurisdiction: 'EU' },
  { rx: /\b\d{4}\/\d{1,3}\/(ec|eu|eec)\b/i, jurisdiction: 'EU' }, // 2014/30/EU etc
  { rx: /^cenelec\b/i,            jurisdiction: 'EU' },
  { rx: /^etsi\b/i,               jurisdiction: 'EU' },
  { rx: /^din\b/i,                jurisdiction: 'EU' },
  { rx: /^vde\b/i,                jurisdiction: 'EU' },
  { rx: /\brohs\b/i,              jurisdiction: 'EU' },
  { rx: /\breach\b/i,             jurisdiction: 'EU' },
  // US
  { rx: /^ul\s*\d/i,              jurisdiction: 'US' },
  { rx: /^nfpa\s*\d/i,            jurisdiction: 'US' },
  { rx: /^nec\b/i,                jurisdiction: 'US' },
  { rx: /^ansi\b/i,               jurisdiction: 'US' },
  { rx: /^asme\b/i,               jurisdiction: 'US' },
  { rx: /^astm\b/i,               jurisdiction: 'US' },
  { rx: /^api\s*\d/i,             jurisdiction: 'US' },
  { rx: /^fcc\b/i,                jurisdiction: 'US' },
  { rx: /^mil[-\s]?std\b/i,       jurisdiction: 'US' },
  { rx: /^\d{1,3}\s*cfr\b/i,      jurisdiction: 'US' }, // 14 CFR Part 89 etc
  // International bodies (apply everywhere)
  { rx: /^iec\s*\d/i,             jurisdiction: 'IEC' },
  { rx: /^iso\s*\d/i,             jurisdiction: 'ISO' },
  { rx: /^ieee\s*\d/i,            jurisdiction: 'global' },
  { rx: /^dnv\b/i,                jurisdiction: 'global' },
  { rx: /^sae\s*j?\d/i,           jurisdiction: 'global' },
  { rx: /^un\s*\d{2}\.\d/i,       jurisdiction: 'global' }, // UN 38.3 etc
  { rx: /^un\s*ece\b/i,           jurisdiction: 'global' },
  { rx: /^ipc[-\s]?\d/i,          jurisdiction: 'global' },
]

/**
 * Classify a raw DB standard_name. Returns the inferred jurisdiction when the
 * name matches a genuine standards-body family, or null when it does NOT look
 * like a regulatory standard (interface protocol, file format, marketing
 * boilerplate, etc.) — those rows are DROPPED, never rendered as compliance.
 *
 * Exported for the smoke test.
 */
export function classifyStandardName(rawName: string): Jurisdiction | null {
  const name = String(rawName ?? '').trim()
  if (name.length < 3 || name.length > 80) return null
  for (const fam of STANDARDS_FAMILIES) {
    if (fam.rx.test(name)) return fam.jurisdiction
  }
  return null
}

/** Infer a coarse StandardCategory from the DB scope text. Conservative — defaults
 *  to 'sector_specific' so an unmatched scope still renders without claiming a
 *  category it cannot support. */
function inferCategory(scope: string): StandardCategory {
  const s = String(scope ?? '').toLowerCase()
  if (/\bemc\b|electromagnetic|emission|immunity/.test(s)) return 'emc'
  if (/radio|\brf\b|wireless|antenna|spectrum/.test(s)) return 'radio'
  if (/transport|shipping|dangerous goods|un 38/.test(s)) return 'transport'
  if (/rohs|reach|weee|environment|f-gas|recycl/.test(s)) return 'environmental'
  if (/quality management|iso 9001|gmp|haccp/.test(s)) return 'quality_management'
  if (/functional safety|sil\b|asil|61508/.test(s)) return 'functional_safety'
  if (/software|62304|do-178/.test(s)) return 'software'
  if (/usability|62366|human factors/.test(s)) return 'usability'
  if (/risk management|14971/.test(s)) return 'risk_management'
  if (/data protection|gdpr|hipaa|privacy/.test(s)) return 'data_protection'
  if (/grid|interconnect|voltage|electrical|earthing|switchgear/.test(s)) return 'electrical'
  if (/cell|chemistry|refrigerant|battery safety/.test(s)) return 'cell_safety'
  if (/lifecycle|ecodesign|erp|end[-\s]?of[-\s]?life|seasonal/.test(s)) return 'system_safety'
  if (/safety|fire|installation|machinery|pressure/.test(s)) return 'system_safety'
  return 'sector_specific'
}

// ── Module-scoped DB handle (lazy, singleton, read-only) ────────────────────────

let dbHandle: Database.Database | null | undefined = undefined
let warnedMissing = false
let stmtClassStandards: Database.Statement | null = null

function getDb(): Database.Database | null {
  if (dbHandle !== undefined) return dbHandle
  if (process.env.NODE_ENV === 'test') {
    dbHandle = null
    return null
  }
  try {
    if (!existsSync(DB_PATH)) {
      if (!warnedMissing) {
        console.warn(`[class-standards-db] forge-truth.db not found at ${DB_PATH} — DB overlay disabled`)
        warnedMissing = true
      }
      dbHandle = null
      return null
    }
    const db = new Database(DB_PATH, { readonly: true })
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')

    // Aggregate the distinct standards for a product_class, most-cited first.
    // GROUP BY normalised name so "100BASE-TX" / "100Base-TX" collapse, taking the
    // longest non-empty scope as the representative description.
    stmtClassStandards = db.prepare(`
      SELECT st.standard_name AS standard_name,
             MAX(COALESCE(st.scope, ''))       AS scope,
             MAX(COALESCE(st.raw_excerpt, '')) AS raw_excerpt,
             COUNT(*)                          AS cite_count
      FROM pretraining_extracted_standards st
      JOIN pretraining_spec_documents d ON st.document_id = d.id
      WHERE LOWER(d.product_class) = LOWER(?)
        AND st.standard_name IS NOT NULL
        AND TRIM(st.standard_name) != ''
      GROUP BY LOWER(TRIM(st.standard_name))
      ORDER BY cite_count DESC, LENGTH(st.standard_name) ASC
    `)

    dbHandle = db
    return db
  } catch (err) {
    if (!warnedMissing) {
      console.warn(`[class-standards-db] init failed: ${(err as Error).message} — DB overlay disabled`)
      warnedMissing = true
    }
    dbHandle = null
    return null
  }
}

interface StandardsRow {
  standard_name: string
  scope: string
  raw_excerpt: string
  cite_count: number
}

/**
 * Build a ClassStandards block for a product_class purely from the DB corpus.
 * Returns null when the DB is unavailable or yields no VERIFIED standards.
 *
 * Exported for the smoke test (so it can be exercised independently of the flag).
 */
export function buildClassStandardsFromDB(productClass: string): ClassStandards | null {
  const db = getDb()
  if (!db || !stmtClassStandards) return null

  let rows: StandardsRow[]
  try {
    rows = stmtClassStandards.all(productClass) as StandardsRow[]
  } catch (err) {
    console.warn(`[class-standards-db] query failed for "${productClass}": ${(err as Error).message}`)
    return null
  }
  if (!rows.length) return null

  const standards: RegulatoryStandard[] = []
  for (const row of rows) {
    if (standards.length >= MAX_DB_STANDARDS) break
    const jurisdiction = classifyStandardName(row.standard_name)
    if (!jurisdiction) continue // anti-hallucination: drop non-standards rows
    const scope = (row.scope || row.raw_excerpt || '').trim()
    standards.push({
      code: row.standard_name.trim(),
      // No title column in the DB — use the scope as the title surrogate so the
      // rendered row is not blank; falls back to the code.
      title: scope || row.standard_name.trim(),
      jurisdiction,
      category: inferCategory(scope),
      // Inferred DB standards are ADVISORY, never asserted as market-access
      // mandatories (no DB column supports that claim). Keeps the gate's
      // mandatory-coverage maths driven only by baked, hand-verified entries.
      mandatory: false,
      // Unknown from the DB — emit 0 rather than a fabricated estimate.
      typical_compliance_cost_gbp: 0,
      typical_lead_time_weeks: 0,
      applies_because: scope
        ? `Cited in ${row.cite_count} reference document(s) for this class: ${scope.slice(0, 160)}`
        : `Cited in ${row.cite_count} reference document(s) for this class (DB-derived; verify scope before sale).`,
    })
  }

  if (!standards.length) return null

  return {
    product_class: productClass,
    display_name: productClass,
    standards,
    compliance_summary:
      `Compliance landscape derived from the reference-document corpus for "${productClass}" ` +
      `(${standards.length} verified standards). DB-derived standards are advisory — an engineer ` +
      `must confirm market-access mandatories before sale. Hand-curated mandatory coverage is ` +
      `available once this class is added to class-standards.ts.`,
  }
}

// ── Public API ──────────────────────────────────────────────────────────────────

/**
 * DB-first overlay for getClassStandards().
 *
 *   1. baked: getClassStandards(productClass). If it returns a NON-empty curated
 *      block, return it unchanged (baked always wins — never override the 11
 *      hand-verified classes with noisier DB rows).
 *   2. When the flag STANDARDS_DB_LIVE is OFF — return the baked result (which may
 *      be the empty stub) UNCHANGED. Zero behaviour change vs today.
 *   3. When the flag is ON AND baked returned its empty stub — query the DB. If
 *      VERIFIED standards come back, return a DB-built block; else return the
 *      baked stub unchanged (safe fallback).
 *
 * Never throws. Drop-in replacement for getClassStandards() — same return shape.
 */
export function getClassStandardsDBFirst(productClass: string): ClassStandards {
  const baked = getClassStandards(productClass)

  // Baked curated entry present → it wins, always.
  const bakedHasContent = Array.isArray(baked.standards) && baked.standards.length > 0
  if (bakedHasContent) return baked

  // Flag OFF → return the baked stub unchanged (production behaviour preserved).
  if (!standardsDbLiveEnabled()) return baked

  // Flag ON + baked empty → try the DB overlay.
  try {
    const fromDb = buildClassStandardsFromDB(productClass)
    if (fromDb) {
      console.error(
        `[class-standards-db] ${JSON.stringify({
          product_class: productClass,
          hit: 'db',
          standards: fromDb.standards.length,
        })}`,
      )
      return fromDb
    }
  } catch (err) {
    console.warn(`[class-standards-db] overlay failed for "${productClass}": ${(err as Error).message} — using baked stub`)
  }

  // DB miss / unavailable → baked stub unchanged.
  return baked
}

/** Test-only reset hook — clears the module-scoped DB handle. */
export function _resetForTests(): void {
  if (dbHandle) {
    try { dbHandle.close() } catch { /* no-op */ }
  }
  dbHandle = undefined
  stmtClassStandards = null
  warnedMissing = false
}
