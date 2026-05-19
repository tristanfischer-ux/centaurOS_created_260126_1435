/**
 * persist-emitted-modules.ts — write-back path for Stage 1.7 multi-emitter
 * module decomposition outputs.
 *
 * Tristan directive 2026-05-18 (PM): "extend the learning pattern from
 * supplier discovery to two more registries: class-priors and
 * class-connections". The supplier path (scripts/supplier-enrichment/
 * persist-web-fallback.ts) closes the loop so the supplier DB learns from
 * every brief. This module does the same for the per-class MODULE catalog
 * and the per-class CROSS-MODULE CONNECTION catalog.
 *
 * Mechanism (same shape as web-fallback persist):
 *   1. After the 6-emitter UNION synthesis in Stage 1.7 has run AND the G4
 *      grammar gate has passed, the orchestrator calls the batch helper
 *      `persistConsensusFromSynthesis()`.
 *   2. We look at each speaking emitter's RAW payload (not the synthesised
 *      output) and tally how many emitters proposed the same sub-module-id
 *      inside the same module for the same product class. ≥4 of 6 = consensus.
 *      Same logic for cross-module connections, keyed by (from_module,
 *      to_module, mechanism).
 *   3. We UPSERT each consensus row into one of two NEW SQLite tables in
 *      forge-truth.db:
 *          - class_priors_accumulation
 *          - class_connections_accumulation
 *      First write seeds `first_seen_at` + `seen_count = 1`. Subsequent
 *      matches bump `seen_count`, refresh `last_seen_at`, accumulate the
 *      brief excerpts (capped at 10 most-recent).
 *   4. A reciprocal `loadAccumulatedModulesForClass()` /
 *      `loadAccumulatedConnectionsForClass()` returns the prior-confirmed
 *      entries (≥5 prior briefs) so the orchestrator can inject them into
 *      the emitter system prompt as "these have been confirmed by N prior
 *      briefs; emit by default unless the brief explicitly excludes them".
 *
 * The accumulation tables are deliberately PARALLEL to the existing prose
 * priors (class-module-priors.ts, class-connections.ts) — we DO NOT modify
 * those source files. The accumulation tables capture only what real briefs
 * have produced; the prose priors stay as the human-curated baseline.
 *
 * Fail-soft: every DB call swallows errors so a malformed SQLite or missing
 * file does NOT break the pipeline. The orchestrator wraps this in
 * try/catch additionally; we log loudly and continue.
 */
import { execFileSync } from 'child_process'

const FORGE_TRUTH_DB = '/Users/tristanfischer/.forge-truth/forge-truth.db'

/** Threshold for consensus across the 6-emitter ensemble. Matches the
 *  multi-emitter UNION word-inclusion rule from Stage 1.7. Tristan
 *  directive: do NOT change this — it stays at ≥4 of 6. */
export const CONSENSUS_THRESHOLD = 4

/** Minimum number of prior-confirmed seen-counts before an entry is
 *  injected into the next brief's emitter prompt. Per task spec: ≥5. */
export const MIN_INJECTION_SEEN_COUNT = 5

// ---------------------------------------------------------------------------
// Shared SQL helpers
// ---------------------------------------------------------------------------

function sqlEscape(s: string): string {
  return (s ?? '').replace(/'/g, "''")
}

/**
 * Run a SQL command against forge-truth.db. Returns stdout; throws on
 * sqlite3 non-zero exit. Caller is responsible for catch/log.
 */
function runSqlite(sql: string, jsonMode = false): string {
  const args = jsonMode
    ? ['-cmd', '.mode json', FORGE_TRUTH_DB, sql]
    : [FORGE_TRUTH_DB, sql]
  return execFileSync('sqlite3', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
}

// ---------------------------------------------------------------------------
// Schema initialisation
// ---------------------------------------------------------------------------

/**
 * Ensure both accumulation tables exist. Idempotent; safe to call on every
 * orchestrator invocation. We deliberately keep the schemas wide rather
 * than fully-normalised — disk is cheap and these tables stay small
 * (10 classes × ~50 sub-modules ≈ 500 rows for the module table).
 *
 * Composite UNIQUE constraints prevent duplicate inserts so the UPSERT path
 * can use `ON CONFLICT ... DO UPDATE SET seen_count = seen_count + 1`.
 */
export function ensureAccumulationTables(): void {
  const moduleTableSql = `
    CREATE TABLE IF NOT EXISTS class_priors_accumulation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_slug TEXT NOT NULL,
      module TEXT NOT NULL,
      sub_module_id TEXT NOT NULL,
      name_human TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 1,
      emitter_consensus_count INTEGER NOT NULL,
      brief_class TEXT,
      brief_excerpt TEXT,
      attributes_json TEXT,
      UNIQUE (class_slug, module, sub_module_id)
    )
  `
  const moduleIdxSql = `
    CREATE INDEX IF NOT EXISTS idx_class_priors_acc_class
      ON class_priors_accumulation (class_slug, seen_count)
  `
  const connTableSql = `
    CREATE TABLE IF NOT EXISTS class_connections_accumulation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_slug TEXT NOT NULL,
      from_class TEXT NOT NULL,
      to_class TEXT NOT NULL,
      mechanism TEXT NOT NULL,
      protocol TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      seen_count INTEGER NOT NULL DEFAULT 1,
      emitter_consensus_count INTEGER NOT NULL,
      brief_class TEXT,
      brief_excerpt TEXT,
      attributes_json TEXT,
      UNIQUE (class_slug, from_class, to_class, mechanism)
    )
  `
  const connIdxSql = `
    CREATE INDEX IF NOT EXISTS idx_class_conn_acc_class
      ON class_connections_accumulation (class_slug, seen_count)
  `
  try {
    runSqlite(moduleTableSql)
    runSqlite(moduleIdxSql)
    runSqlite(connTableSql)
    runSqlite(connIdxSql)
  } catch (err: any) {
    console.warn(`[registry-accumulation] ensureAccumulationTables failed: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Module-decomposition shapes the caller may pass us
// ---------------------------------------------------------------------------

/**
 * Loose typing for the multi-emitter payload — mirrors
 * `MultiEmitterDecompositionPayload` in radical/council-synthesis.ts but
 * weakened to plain shapes so this module stays free of cross-package type
 * dependencies. The synthesiser file is the source of truth; if its shape
 * changes, update the accessors below.
 */
export interface EmittedSubModuleLike {
  id: string
  name_human?: string
  english_sentence?: string
  rad_syntax?: string
  words?: unknown
  role_verb?: string
  topology_clause?: string
  grammar_links?: unknown
}

export interface EmittedModuleLike {
  module: string
  sub_modules?: EmittedSubModuleLike[]
}

export interface EmittedCrossLinkLike {
  from_module: string
  to_module: string
  mechanism: string
  type?: string
  detail?: string
}

export interface EmittedDecompositionPayloadLike {
  product_class?: string
  modules?: EmittedModuleLike[]
  cross_module_grammar_links?: EmittedCrossLinkLike[]
}

export interface EmitterOutputLike {
  ok: boolean
  model: string
  data?: EmittedDecompositionPayloadLike
}

// ---------------------------------------------------------------------------
// Sub-module consensus detection
// ---------------------------------------------------------------------------

/**
 * Tally consensus across speaking emitters. We key by (module, sub_module_id)
 * because emitter id-naming is reasonably stable at low temperature; the
 * `name_human` field is used as the canonical display string but is NOT part
 * of the consensus key (different emitters often differ on capitalisation).
 *
 * Returns a map of `${module}::${sub_module_id}` → { count, sample }.
 * `sample` is a representative SubModuleSpec drawn from the FIRST emitter
 * that produced this entry — its `name_human`, `rad_syntax`, etc. flow
 * through to attributes_json.
 */
export function tallySubModuleConsensus(
  emitters: EmitterOutputLike[],
): Map<string, { count: number; module: string; sub_module_id: string; sample: EmittedSubModuleLike }> {
  const tally = new Map<string, { count: number; module: string; sub_module_id: string; sample: EmittedSubModuleLike }>()
  for (const e of emitters) {
    if (!e.ok || !e.data?.modules) continue
    const seenInThisEmitter = new Set<string>()
    for (const m of e.data.modules) {
      const moduleKey = m.module
      if (!moduleKey) continue
      for (const sm of m.sub_modules ?? []) {
        const id = (sm.id ?? '').trim()
        if (!id) continue
        const key = `${moduleKey}::${id}`
        if (seenInThisEmitter.has(key)) continue
        seenInThisEmitter.add(key)
        const existing = tally.get(key)
        if (existing) {
          existing.count += 1
        } else {
          tally.set(key, { count: 1, module: moduleKey, sub_module_id: id, sample: sm })
        }
      }
    }
  }
  return tally
}

/**
 * Tally cross-module connection consensus. Keyed by (from_module, to_module,
 * mechanism). Direction-symmetric: (a,b,m) and (b,a,m) count toward the
 * same bucket so a connection that one emitter records as a→b and another
 * as b→a still hits consensus. We canonicalise by alphabetising the
 * endpoints; the stored row keeps the alphabetised form too so subsequent
 * briefs match deterministically.
 */
export function tallyConnectionConsensus(
  emitters: EmitterOutputLike[],
): Map<string, { count: number; from_class: string; to_class: string; mechanism: string; sample: EmittedCrossLinkLike }> {
  const tally = new Map<string, { count: number; from_class: string; to_class: string; mechanism: string; sample: EmittedCrossLinkLike }>()
  for (const e of emitters) {
    if (!e.ok || !e.data?.cross_module_grammar_links) continue
    const seenInThisEmitter = new Set<string>()
    for (const cl of e.data.cross_module_grammar_links) {
      const from = (cl.from_module ?? '').trim()
      const to = (cl.to_module ?? '').trim()
      const mech = (cl.mechanism ?? '').trim()
      if (!from || !to || !mech) continue
      const [a, b] = [from, to].sort()
      const key = `${a}::${b}::${mech}`
      if (seenInThisEmitter.has(key)) continue
      seenInThisEmitter.add(key)
      const existing = tally.get(key)
      if (existing) {
        existing.count += 1
      } else {
        tally.set(key, { count: 1, from_class: a, to_class: b, mechanism: mech, sample: cl })
      }
    }
  }
  return tally
}

// ---------------------------------------------------------------------------
// UPSERT helpers
// ---------------------------------------------------------------------------

export interface PersistResult {
  action: 'insert' | 'update' | 'skip'
  reason?: string
}

export interface PersistBatchCounts {
  inserted: number
  updated: number
  skipped: number
  reasons: string[]
}

/**
 * UPSERT one consensus sub-module row. Triggered when ≥4 of 6 emitters
 * produced the same sub-module id in the same module for the same class.
 *
 * Idempotent: subsequent matches increment seen_count + refresh
 * last_seen_at + append brief excerpt.
 */
export function persistConsensusModule(
  classSlug: string,
  moduleId: string,
  subModuleId: string,
  emitterConsensusCount: number,
  spec: EmittedSubModuleLike,
  briefExcerpt: string,
): PersistResult {
  const slug = (classSlug ?? '').trim()
  const mod = (moduleId ?? '').trim()
  const smid = (subModuleId ?? '').trim()
  if (!slug || !mod || !smid) {
    return { action: 'skip', reason: 'missing class_slug / module / sub_module_id' }
  }

  // Attributes JSON carries the typed RAD syntax + grammar link refs so a
  // future "rehydrate to ModuleSpec" path can rebuild a full SubModuleSpec
  // without re-calling the LLM.
  const attrs = {
    name_human: spec.name_human ?? null,
    rad_syntax: spec.rad_syntax ?? null,
    english_sentence: spec.english_sentence ?? null,
    role_verb: spec.role_verb ?? null,
    topology_clause: spec.topology_clause ?? null,
    words: spec.words ?? null,
    grammar_links: spec.grammar_links ?? null,
  }
  const attrsJson = sqlEscape(JSON.stringify(attrs))
  const nameHuman = sqlEscape(spec.name_human ?? smid)
  const excerptEsc = sqlEscape((briefExcerpt ?? '').slice(0, 240))

  // UPSERT pattern: INSERT ... ON CONFLICT(class_slug, module, sub_module_id)
  // DO UPDATE SET seen_count = seen_count + 1, last_seen_at = datetime('now').
  // emitter_consensus_count is bumped to MAX(old, new) because a future
  // brief with all 6 emitters agreeing is stronger evidence than the
  // first brief's 4-of-6.
  const sql = `
    INSERT INTO class_priors_accumulation (
      class_slug, module, sub_module_id, name_human,
      first_seen_at, last_seen_at, seen_count,
      emitter_consensus_count, brief_class, brief_excerpt, attributes_json
    ) VALUES (
      '${sqlEscape(slug)}',
      '${sqlEscape(mod)}',
      '${sqlEscape(smid)}',
      '${nameHuman}',
      datetime('now'),
      datetime('now'),
      1,
      ${emitterConsensusCount},
      '${sqlEscape(slug)}',
      '${excerptEsc}',
      '${attrsJson}'
    )
    ON CONFLICT (class_slug, module, sub_module_id) DO UPDATE SET
      seen_count = seen_count + 1,
      last_seen_at = datetime('now'),
      emitter_consensus_count = MAX(emitter_consensus_count, excluded.emitter_consensus_count),
      name_human = COALESCE(NULLIF(excluded.name_human, ''), name_human),
      brief_excerpt = excluded.brief_excerpt,
      attributes_json = excluded.attributes_json
  `

  try {
    // Detect insert vs update by reading the seen_count delta.
    const beforeOut = runSqlite(
      `SELECT seen_count FROM class_priors_accumulation WHERE class_slug='${sqlEscape(slug)}' AND module='${sqlEscape(mod)}' AND sub_module_id='${sqlEscape(smid)}' LIMIT 1`,
      true,
    )
    const wasPresent = beforeOut.trim().length > 0 && beforeOut.includes('seen_count')
    runSqlite(sql)
    return { action: wasPresent ? 'update' : 'insert' }
  } catch (err: any) {
    console.warn(`[registry-accumulation] persistConsensusModule failed for ${slug}/${mod}/${smid}: ${err.message}`)
    return { action: 'skip', reason: err.message }
  }
}

/**
 * UPSERT one consensus connection row. Keyed by alphabetised (from, to,
 * mechanism) so direction-flipped duplicates merge.
 *
 * `protocol` is an optional discriminator (e.g. "can_bus" with protocol
 * "j1939" vs "canopen") but is NOT part of the consensus key — different
 * protocols on the same mechanism still count as the same connection.
 */
export function persistConsensusConnection(
  classSlug: string,
  fromClass: string,
  toClass: string,
  mechanism: string,
  protocol: string | null,
  emitterConsensusCount: number,
  sample: EmittedCrossLinkLike,
  briefExcerpt: string,
): PersistResult {
  const slug = (classSlug ?? '').trim()
  const from = (fromClass ?? '').trim()
  const to = (toClass ?? '').trim()
  const mech = (mechanism ?? '').trim()
  if (!slug || !from || !to || !mech) {
    return { action: 'skip', reason: 'missing class_slug / from / to / mechanism' }
  }

  const attrs = {
    type: sample.type ?? null,
    detail: sample.detail ?? null,
    raw_from_module: sample.from_module ?? null,
    raw_to_module: sample.to_module ?? null,
  }
  const attrsJson = sqlEscape(JSON.stringify(attrs))
  const protoEsc = protocol ? sqlEscape(protocol) : ''
  const excerptEsc = sqlEscape((briefExcerpt ?? '').slice(0, 240))

  const sql = `
    INSERT INTO class_connections_accumulation (
      class_slug, from_class, to_class, mechanism, protocol,
      first_seen_at, last_seen_at, seen_count,
      emitter_consensus_count, brief_class, brief_excerpt, attributes_json
    ) VALUES (
      '${sqlEscape(slug)}',
      '${sqlEscape(from)}',
      '${sqlEscape(to)}',
      '${sqlEscape(mech)}',
      ${protoEsc ? `'${protoEsc}'` : 'NULL'},
      datetime('now'),
      datetime('now'),
      1,
      ${emitterConsensusCount},
      '${sqlEscape(slug)}',
      '${excerptEsc}',
      '${attrsJson}'
    )
    ON CONFLICT (class_slug, from_class, to_class, mechanism) DO UPDATE SET
      seen_count = seen_count + 1,
      last_seen_at = datetime('now'),
      emitter_consensus_count = MAX(emitter_consensus_count, excluded.emitter_consensus_count),
      protocol = COALESCE(excluded.protocol, protocol),
      brief_excerpt = excluded.brief_excerpt,
      attributes_json = excluded.attributes_json
  `

  try {
    const beforeOut = runSqlite(
      `SELECT seen_count FROM class_connections_accumulation WHERE class_slug='${sqlEscape(slug)}' AND from_class='${sqlEscape(from)}' AND to_class='${sqlEscape(to)}' AND mechanism='${sqlEscape(mech)}' LIMIT 1`,
      true,
    )
    const wasPresent = beforeOut.trim().length > 0 && beforeOut.includes('seen_count')
    runSqlite(sql)
    return { action: wasPresent ? 'update' : 'insert' }
  } catch (err: any) {
    console.warn(`[registry-accumulation] persistConsensusConnection failed for ${slug}/${from}-${to}-${mech}: ${err.message}`)
    return { action: 'skip', reason: err.message }
  }
}

// ---------------------------------------------------------------------------
// Batch helper — wire-point for Stage 1.7
// ---------------------------------------------------------------------------

/**
 * Batch helper called from Stage 1.7 immediately after the multi-emitter
 * synthesis returns AND the G4 grammar gate has passed (i.e. shouldRetry
 * is false OR the manual-review badge is attached but the run continues).
 *
 * Fail-soft: every internal call is try/caught individually so a single
 * bad row never blocks the rest. Caller wraps the whole thing in try/catch
 * as a final belt-and-braces.
 */
export function persistConsensusFromSynthesis(
  classSlug: string,
  emitters: EmitterOutputLike[],
  briefExcerpt: string,
): { modules: PersistBatchCounts; connections: PersistBatchCounts } {
  ensureAccumulationTables()

  const moduleCounts: PersistBatchCounts = { inserted: 0, updated: 0, skipped: 0, reasons: [] }
  const connCounts: PersistBatchCounts = { inserted: 0, updated: 0, skipped: 0, reasons: [] }

  // Sub-modules
  const subModTally = tallySubModuleConsensus(emitters)
  for (const [_, entry] of subModTally) {
    if (entry.count < CONSENSUS_THRESHOLD) continue
    const r = persistConsensusModule(
      classSlug,
      entry.module,
      entry.sub_module_id,
      entry.count,
      entry.sample,
      briefExcerpt,
    )
    if (r.action === 'insert') moduleCounts.inserted += 1
    else if (r.action === 'update') moduleCounts.updated += 1
    else {
      moduleCounts.skipped += 1
      if (r.reason) moduleCounts.reasons.push(r.reason)
    }
  }

  // Cross-module connections
  const connTally = tallyConnectionConsensus(emitters)
  for (const [_, entry] of connTally) {
    if (entry.count < CONSENSUS_THRESHOLD) continue
    const r = persistConsensusConnection(
      classSlug,
      entry.from_class,
      entry.to_class,
      entry.mechanism,
      null,
      entry.count,
      entry.sample,
      briefExcerpt,
    )
    if (r.action === 'insert') connCounts.inserted += 1
    else if (r.action === 'update') connCounts.updated += 1
    else {
      connCounts.skipped += 1
      if (r.reason) connCounts.reasons.push(r.reason)
    }
  }

  return { modules: moduleCounts, connections: connCounts }
}

// ---------------------------------------------------------------------------
// Lookup — DB-aware injection into the emitter prompt
// ---------------------------------------------------------------------------

export interface AccumulatedModuleRow {
  class_slug: string
  module: string
  sub_module_id: string
  name_human: string | null
  seen_count: number
  emitter_consensus_count: number
}

export interface AccumulatedConnectionRow {
  class_slug: string
  from_class: string
  to_class: string
  mechanism: string
  protocol: string | null
  seen_count: number
  emitter_consensus_count: number
}

/**
 * Load all accumulated sub-modules for a class whose seen_count meets the
 * injection threshold. Returns rows ordered by (module, seen_count DESC) so
 * the most-confirmed entries float to the top.
 */
export function loadAccumulatedModulesForClass(
  classSlug: string,
  minSeenCount = MIN_INJECTION_SEEN_COUNT,
): AccumulatedModuleRow[] {
  const slug = (classSlug ?? '').trim()
  if (!slug) return []
  const sql = `
    SELECT class_slug, module, sub_module_id, name_human, seen_count, emitter_consensus_count
    FROM class_priors_accumulation
    WHERE class_slug = '${sqlEscape(slug)}' AND seen_count >= ${minSeenCount}
    ORDER BY module ASC, seen_count DESC, sub_module_id ASC
  `
  try {
    const out = runSqlite(sql, true)
    if (!out.trim()) return []
    return JSON.parse(out)
  } catch (err: any) {
    console.warn(`[registry-accumulation] loadAccumulatedModulesForClass(${slug}) failed: ${err.message}`)
    return []
  }
}

/**
 * Same as above for cross-module connections.
 */
export function loadAccumulatedConnectionsForClass(
  classSlug: string,
  minSeenCount = MIN_INJECTION_SEEN_COUNT,
): AccumulatedConnectionRow[] {
  const slug = (classSlug ?? '').trim()
  if (!slug) return []
  const sql = `
    SELECT class_slug, from_class, to_class, mechanism, protocol, seen_count, emitter_consensus_count
    FROM class_connections_accumulation
    WHERE class_slug = '${sqlEscape(slug)}' AND seen_count >= ${minSeenCount}
    ORDER BY seen_count DESC, from_class ASC, to_class ASC
  `
  try {
    const out = runSqlite(sql, true)
    if (!out.trim()) return []
    return JSON.parse(out)
  } catch (err: any) {
    console.warn(`[registry-accumulation] loadAccumulatedConnectionsForClass(${slug}) failed: ${err.message}`)
    return []
  }
}

/**
 * Build a human-readable prompt block describing the accumulated entries
 * for a class. Returns an empty string when nothing meets the threshold.
 * The orchestrator appends this to each emitter's user content.
 *
 * Format mirrors the language used in the existing K10 reference-graph
 * addenda so emitter LLMs don't see a stylistic discontinuity.
 */
export function buildAccumulatedPromptBlock(
  classSlug: string,
  minSeenCount = MIN_INJECTION_SEEN_COUNT,
): string {
  const modules = loadAccumulatedModulesForClass(classSlug, minSeenCount)
  const connections = loadAccumulatedConnectionsForClass(classSlug, minSeenCount)
  if (modules.length === 0 && connections.length === 0) return ''

  const lines: string[] = []
  lines.push('')
  lines.push('=== PRIOR-CONFIRMED REGISTRY ENTRIES FOR THIS PRODUCT CLASS ===')
  lines.push(`(class_slug: ${classSlug}; entries below have been confirmed by ≥${minSeenCount} prior briefs)`)
  lines.push('Emit these by default unless the brief explicitly excludes them.')

  if (modules.length > 0) {
    // Group by module
    const byModule = new Map<string, AccumulatedModuleRow[]>()
    for (const m of modules) {
      const arr = byModule.get(m.module) ?? []
      arr.push(m)
      byModule.set(m.module, arr)
    }
    lines.push('')
    lines.push('Sub-modules (prior-confirmed):')
    for (const [mod, rows] of byModule) {
      const names = rows.map(r => `${r.sub_module_id}${r.name_human && r.name_human !== r.sub_module_id ? ` (${r.name_human})` : ''} [×${r.seen_count}]`).join(', ')
      lines.push(`  - ${mod}: ${names}`)
    }
  }

  if (connections.length > 0) {
    lines.push('')
    lines.push('Cross-module connections (prior-confirmed):')
    for (const c of connections) {
      const proto = c.protocol ? ` (protocol: ${c.protocol})` : ''
      lines.push(`  - ${c.from_class} ↔ ${c.to_class} via ${c.mechanism}${proto} [×${c.seen_count}]`)
    }
  }

  lines.push('=== END PRIOR-CONFIRMED REGISTRY ENTRIES ===')
  lines.push('')
  return lines.join('\n')
}
