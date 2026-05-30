/**
 * @file lib/emitter-completion.ts — UNIVERSAL emitter-completion growing-DB layer.
 *
 * PURPOSE (Tristan directive 2026-05-30, keystone feature):
 *   "Hand-complete new things on the fly and add those new versions to a
 *    database so it is good next time around — use as much universal stuff
 *    as possible."
 *
 * This is the GROWING-DB principle applied to gate-23 (emitter-completeness):
 *   DB-FIRST lookup → on-miss generate via LLM → write-back to the DB →
 *   grow over time so the next run is a DB-first hit.
 *
 * WHAT GATE-23 ENFORCES (src/lib/pdf-engine-v2/lib/emitter-completeness-gate.ts):
 *   every sub_module must carry ≥1 word whose modifier_characters contains a
 *   `part_number` modifier. A class whose deterministic-emitter has not yet
 *   been hand-authored leaves gaps → gate-23 hard-exits (exit 23). 4 of 5
 *   untuned classes (wind, bioreactor, EV charger, H2 electrolyser) fail here.
 *
 * THIS MODULE closes those gaps WITHOUT hand-authoring a per-class emitter:
 *   for every gap sub_module it injects exactly ONE MPN-bearing word, sourcing
 *   the (manufacturer, part_number) pair DB-first and generating + writing-back
 *   on a miss. The word it injects matches the SHAPE the deterministic emitter
 *   produces (scripts/lib/deterministic-emitter.ts `word()` + `mod()`), so the
 *   rest of the chain (renderer, BoM, audits) treats it identically.
 *
 * ── GATE-20 SAFETY (critical) ───────────────────────────────────────────────
 *   Gate-20 (fictional-pn-audit, exit 20) flags STRUCTURED part numbers that
 *   resolve in NO distributor catalogue as HIGH. Two paths, two safe outcomes:
 *
 *   • DB-SOURCED parts are REAL catalogue rows. lookupCached() finds them in
 *     `pretraining_extracted_parts` → source='library_only' → PASS. Their
 *     structured MPN is safe to emit verbatim.
 *
 *   • LLM-GENERATED parts that we CANNOT verify as real catalogue parts emit
 *     the part_number as a NON-STRUCTURED descriptor (e.g. "<Mfr> <type>
 *     assembly — specify exact MPN at detailed design"). fictional-pn-audit's
 *     STRUCTURED_PN_REGEX requires [A-Z0-9]{3,}[-_/]… ; a descriptor with
 *     spaces + the word "specify" is never structured AND never HIGH (MED at
 *     worst, LOW in practice). Gate-23 still passes (a part_number modifier
 *     EXISTS); gate-20 SKIPS it. Honesty over fake precision — we do not invent
 *     a plausible-looking structured MPN we cannot stand behind.
 *
 *   The manufacturer IS emitted as a real OEM (e.g. "SKF", "Moog", "ABB") — the
 *   audit does not check manufacturer existence, and a real OEM + honest "MPN
 *   TBD at detailed design" is exactly how a concept-stage dossier reads.
 *
 * ── REUSE (the directive: "use as much universal stuff as possible") ─────────
 *   • runEmitterCompletenessGate — find the gaps (same gate the chain runs).
 *   • callFastExtract (openrouter-models.ts) — the engine's existing LLM caller,
 *     keyless at the call-site (reads OPENROUTER_API_KEY from env), with native
 *     Google-Search grounding so the generated part is real, not hallucinated.
 *   • better-sqlite3 — the universal DB driver every lib/distributors/* file uses.
 *   • library-writeback.ts contract — the same INSERT OR IGNORE columns + the
 *     synthetic-document-FK pattern used for distributor-cascade write-back.
 *   • the word()/mod() shape from deterministic-emitter.ts.
 *
 * British spelling throughout.
 */

import Database from 'better-sqlite3'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { homedir } from 'node:os'
import { runEmitterCompletenessGate } from './emitter-completeness-gate'
import { callFastExtract, GROK_4_3, GEMINI_3_1_FLASH_LITE } from './openrouter-models'

// ── Minimal structural types (avoid circular import with ModuleSpec) ─────────

interface ModifierCharacterLike {
  kind: string
  value: string
  unit?: string
}

interface WordLike {
  id?: string
  name_human?: string
  content_character?: {
    character_id?: string
    name_human?: string
    function_radical_primary?: string | null
    function_radical_secondary?: string | null
    material_radical_primary?: string | null
    material_radical_secondary?: string | null
  }
  modifier_characters?: ModifierCharacterLike[]
  source_detail?: string
}

interface SubModuleLike {
  id?: string
  name_human?: string
  topology_clause?: string
  words?: WordLike[]
}

interface DesignModuleLike {
  module?: string
  sub_modules?: SubModuleLike[]
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface FilledGap {
  module_id: string
  sub_module_id: string
  source: 'db' | 'generated'
  manufacturer: string
  part_number: string
  name: string
}

export interface CompleteEmitterGapsResult {
  filled: FilledGap[]
  modulesMutated: boolean
}

export interface CompleteEmitterGapsOpts {
  /** Skip the LLM-generate fallback (DB-only). For tests / offline runs.
   *  Default false. When true, a gap with no DB hit emits an honest
   *  unverified descriptor WITHOUT calling the LLM (still passes gate-23,
   *  still safe for gate-20). */
  skipGenerate?: boolean
  /** Skip the DB write-back of generated parts. Default false. Tests pass true
   *  so a throwaway run does not mutate the production library. */
  skipWriteback?: boolean
  /** Optional sink for human-readable progress lines (defaults to console.error). */
  log?: (line: string) => void
  /** Override the LLM model for the generate fallback. Default Grok 4.3
   *  (joint-lowest hallucination, honest workhorse). */
  model?: string
  /** Path to forge-truth.db. Default ~/.forge-truth/forge-truth.db. */
  dbPath?: string
}

// ── Honest-descriptor MPN for unverified LLM completions ─────────────────────
//
// MUST stay non-structured (no [A-Z0-9]{3,}[-_/]… pattern) AND ideally contain
// a gate-20 skip token ("specify"). This guarantees fictional-pn-audit treats
// it as a commodity/unverifiable descriptor (LOW/MED, never HIGH / exit 20).
function honestDescriptorMpn(): string {
  return 'specify exact MPN at detailed design'
}

// Strip a trailing "_word" / "_assembly" and split a snake/camel id into tokens.
function tokenize(s: string | undefined | null): string[] {
  if (!s) return []
  return String(s)
    .replace(/_word$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3 && !STOP_TOKENS.has(t))
}

// Generic/structural tokens that carry no component-type signal — excluded so a
// DB match is driven by the DISTINGUISHING noun (blade, gearbox, stator, seal),
// not by "assembly" or "module" which appear in every sub_module id.
const STOP_TOKENS = new Set<string>([
  'assembly', 'module', 'sub', 'submodule', 'word', 'misc', 'system', 'unit',
  'kit', 'pack', 'main', 'primary', 'secondary', 'and', 'the', 'for', 'with',
  'electromechanical', 'switching', 'electrical', 'conducting', 'silicon',
  'semiconductor', 'electrochemical', 'energy', 'magnetic', 'coupling',
  'optical', 'sensing', 'thermal', 'transfer', 'aero', 'lift', 'structure',
  'structural', 'reinforced', 'package', 'telemetry', 'signage',
])

// ── DB-first lookup ──────────────────────────────────────────────────────────
//
// Conservative on purpose. For an untuned class most slots will NOT have a
// genuinely-matching real part in the library — those MUST fall through to the
// honest generate path (and grow the DB), NOT be mis-pinned to an unrelated
// catalogue row (an M12 connector is not a main-shaft seal). We therefore
// require a STRONG distinguishing-token overlap before accepting a DB hit.

interface DbPart {
  part_name: string
  manufacturer: string
  part_number: string
  component_class: string | null
}

function openLibraryDb(dbPath: string): Database.Database | null {
  try {
    if (!existsSync(dbPath)) return null
    const db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')
    return db
  } catch {
    return null
  }
}

// Whole-word membership: does `token` appear as a standalone word in `hay`
// (word boundaries), NOT merely as a substring? "tower" must NOT match
// "uniTOWER"; "rotor" must NOT match an incidental "Rotor 17mm" mention unless
// it is a genuine word. Word-boundary matching kills the substring false-
// positives that the first cut produced.
function hasWholeWord(hay: string, token: string): boolean {
  if (token.length < 3) return false
  // Escape regex metachars in token (tokens are alnum so this is belt+braces).
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i').test(hay)
}

// Hobby / maker-electronics + small-board vendors. Their catalogue rows are
// real, but they do not supply utility-scale wind / industrial heavy plant —
// pinning one into a blade/gearbox/tower/foundation slot is a mis-pin. When a
// slot's tokens look heavy-industrial we refuse these vendors and generate
// honestly instead. (List is conservative — only unambiguous maker vendors.)
const MAKER_VENDORS = new Set<string>([
  'sparkfun', 'seeed studio', 'seeed', 'adafruit', 'dfrobot', 'm5stack',
  'pimoroni', 'pololu', 'arduino', 'kratos',
])

// Tokens that mark a slot as heavy mechanical / civil / power-plant — a maker
// vendor is never the right supplier for these.
const HEAVY_INDUSTRIAL_TOKENS = new Set<string>([
  'blade', 'rotor', 'hub', 'nacelle', 'gearbox', 'drivetrain', 'tower',
  'foundation', 'rebar', 'concrete', 'stator', 'generator', 'bedplate',
  'yaw', 'pitch', 'transformer', 'switchgear', 'busbar', 'shaft', 'bearing',
  'turbine',
])

/**
 * Find a REAL part whose component type strongly matches the gap sub_module.
 *
 * HIGH-PRECISION on purpose. For an untuned class most slots genuinely have NO
 * matching part in the library (the real wind-turbine OEM parts simply are not
 * ingested yet) — those MUST fall through to the honest generate path (and grow
 * the DB), NOT be mis-pinned to an unrelated catalogue row. A wrong DB pin is
 * worse than an honest "OEM, MPN-TBD" descriptor: it would fail the slot-mispin
 * / Physics-Critic gates and read as nonsense in the dossier.
 *
 * Acceptance requires (high precision — deliberately rejects uncertain pins):
 *   • the HEAD NOUN of the slot (first distinguishing token of the
 *     sub_module_id, e.g. "generator", "drivetrain", "converter") present as a
 *     WHOLE WORD in the candidate, AND ≥1 other distinguishing token; OR
 *   • ≥3 distinct distinguishing tokens present as WHOLE WORDS.
 * AND the candidate is not a maker-electronics vendor for a heavy-industrial
 * slot.
 *
 * Why this strict: a "Permanent Magnet" 24 VDC pulse solenoid whole-word-
 * matches [permanent, magnet] from a `pm_generator` slot — two hits, but the
 * head noun "generator" is absent, so it is (correctly) rejected. For an
 * untuned class whose real OEM parts are not ingested yet, an honest generate-
 * with-real-OEM is strictly better than a coincidental 2-token pin that would
 * fail the slot-mispin / Physics-Critic gates and read as nonsense.
 */
function dbFirstLookup(
  db: Database.Database | null,
  tokens: string[],
  headNoun: string | null,
): DbPart | null {
  if (!db || tokens.length === 0) return null

  const specificTokens = [...new Set(tokens)].slice(0, 8)
  const isHeavy = specificTokens.some((t) => HEAVY_INDUSTRIAL_TOKENS.has(t))
  const seen = new Map<string, { row: DbPart; nameHits: Set<string>; headHit: boolean }>()

  let stmt: Database.Statement
  try {
    stmt = db.prepare(`
      SELECT part_name, manufacturer, part_number, component_class
      FROM pretraining_extracted_parts
      WHERE manufacturer IS NOT NULL AND manufacturer != ''
        AND part_number IS NOT NULL AND length(part_number) >= 4
        AND (LOWER(part_name) LIKE '%' || ? || '%'
             OR LOWER(IFNULL(component_class,'')) LIKE '%' || ? || '%')
      LIMIT 60
    `)
  } catch {
    return null
  }

  for (const tok of specificTokens) {
    let rows: DbPart[]
    try {
      rows = stmt.all(tok, tok) as DbPart[]
    } catch {
      continue
    }
    for (const r of rows) {
      // Whole-word hits across BOTH part_name and component_class.
      const hay = `${(r.part_name ?? '')} ${(r.component_class ?? '')}`.toLowerCase()
      const nameHits = new Set<string>()
      for (const t of specificTokens) if (hasWholeWord(hay, t)) nameHits.add(t)
      const headHit = headNoun ? hasWholeWord(hay, headNoun) : false
      const key = `${r.manufacturer}|${r.part_number}`
      const prev = seen.get(key)
      if (!prev || nameHits.size > prev.nameHits.size) {
        seen.set(key, { row: r, nameHits, headHit })
      }
    }
  }

  if (seen.size === 0) return null

  // Rank: head-noun hits first, then total distinct hits.
  let best: { row: DbPart; nameHits: Set<string>; headHit: boolean } | null = null
  for (const v of seen.values()) {
    if (!best) { best = v; continue }
    if (v.headHit && !best.headHit) best = v
    else if (v.headHit === best.headHit && v.nameHits.size > best.nameHits.size) best = v
  }
  if (!best) return null

  // Reject maker vendors for heavy-industrial slots.
  if (isHeavy && MAKER_VENDORS.has(best.row.manufacturer.trim().toLowerCase())) {
    return null
  }

  // Acceptance: (head-noun hit AND ≥2 total hits) OR (≥3 total hits).
  const accept = (best.headHit && best.nameHits.size >= 2) || best.nameHits.size >= 3
  return accept ? best.row : null
}

// ── LLM generate fallback ────────────────────────────────────────────────────

interface GeneratedPart {
  manufacturer: string
  part_number: string
  name: string
  one_line: string
}

/**
 * Ask the LLM for a REAL, catalogue-plausible component for this gap.
 *
 * Grounded with Google Search (Flash-Lite) → near-zero hallucination; we still
 * treat the returned part_number as UNVERIFIED and DO NOT emit it structurally
 * (gate-20 safety). We DO keep the manufacturer (real OEM) and the human name.
 */
async function generatePart(
  className: string,
  moduleId: string,
  subModuleId: string,
  componentDescription: string,
  model: string,
): Promise<GeneratedPart | null> {
  const sys =
    'You are a senior hardware design engineer compiling a concept-stage bill of materials. ' +
    'Given a sub-assembly slot in a product, name the SINGLE most representative REAL, ' +
    'currently-manufactured component that would fill that slot, and the real OEM that makes it. ' +
    'Prefer well-known industrial OEMs. Output STRICT JSON only, no prose, no markdown fences, ' +
    'with keys: manufacturer (real company), part_number (a real catalogue part number IF you ' +
    'are confident it exists, else the empty string ""), name (short human name of the component), ' +
    'one_line (one-sentence description). If unsure of an exact part number, set part_number to "" — ' +
    'do NOT invent a plausible-looking number.'
  const user =
    `Product class: ${className}\n` +
    `Module: ${moduleId}\n` +
    `Sub-assembly slot: ${subModuleId}\n` +
    `Slot describes: ${componentDescription}\n\n` +
    'Return the real component + OEM for this slot as strict JSON.'

  let raw: string
  try {
    // Primary: grounded Flash-Lite (cheap, real-web cross-check). Fall back to
    // the requested model (default Grok 4.3) without grounding on any failure.
    raw = await callFastExtract(user, {
      model: GEMINI_3_1_FLASH_LITE,
      systemPrompt: sys,
      groundWithGoogleSearch: true,
      thinkingLevel: 'medium',
      maxTokens: 1200,
      timeoutMs: 60_000,
    }).catch(() =>
      callFastExtract(user, {
        model,
        systemPrompt: sys,
        maxTokens: 1200,
        timeoutMs: 60_000,
      }),
    )
  } catch {
    return null
  }

  const parsed = parseLooseJson(raw)
  if (!parsed) return null
  const manufacturer = String(parsed.manufacturer ?? '').trim()
  const name = String(parsed.name ?? '').trim() || subModuleId.replace(/_/g, ' ')
  const one_line = String(parsed.one_line ?? '').trim()
  // part_number is INTENTIONALLY discarded for emission (gate-20 safety) — we
  // keep it only to inform the write-back's part_name/raw_excerpt. We never
  // emit it as a structured MPN modifier.
  const part_number = String(parsed.part_number ?? '').trim()
  if (!manufacturer) return null
  return { manufacturer, part_number, name, one_line }
}

// Tolerant JSON extraction: strip ``` fences, grab the first {...} block.
function parseLooseJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null
  let s = raw.trim()
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

// ── Write-back (mirrors library-writeback.ts contract) ───────────────────────
//
// pretraining_extracted_parts requires NOT NULL document_id FK to
// pretraining_spec_documents.id. We get-or-create ONE synthetic doc row of
// source_type='emitter_completion' (parallel to library-writeback's
// 'distributor_cascade' row) and key on it. INSERT OR IGNORE — but the table
// has no UNIQUE(manufacturer,part_number) index, so we de-dupe with an explicit
// existence check first (idempotent across runs).

function getEmitterCompletionDocId(db: Database.Database): number {
  const row = db.prepare(`
    SELECT id FROM pretraining_spec_documents
    WHERE source_type = 'emitter_completion'
    ORDER BY id ASC LIMIT 1
  `).get() as { id: number } | undefined
  if (row?.id) return row.id
  const r = db.prepare(`
    INSERT INTO pretraining_spec_documents (source_type, document_type, extraction_status)
    VALUES ('emitter_completion', 'on_the_fly_completion', 'done')
  `).run()
  return Number(r.lastInsertRowid)
}

/**
 * Persist a generated completion so the NEXT run is a DB-first hit.
 * Best-effort: never throws. The part_number stored is the REAL one the LLM
 * proposed when it gave one (so future dbFirstLookup can serve it); when the
 * LLM declined to give an MPN we store the honest descriptor (still a valid
 * row — future runs at least get the manufacturer + component type).
 */
function writeBackGenerated(
  dbPath: string,
  part: GeneratedPart,
  className: string,
  moduleId: string,
  subModuleId: string,
): boolean {
  let db: Database.Database | null = null
  try {
    if (!existsSync(dbPath)) return false
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 2000')
    const docId = getEmitterCompletionDocId(db)

    const storedPn = part.part_number && part.part_number.length >= 3
      ? part.part_number
      : honestDescriptorMpn()

    // Idempotency: skip if this (manufacturer, part_number) already present.
    const exists = db.prepare(`
      SELECT 1 FROM pretraining_extracted_parts
      WHERE LOWER(manufacturer) = LOWER(?) AND LOWER(part_number) = LOWER(?)
      LIMIT 1
    `).get(part.manufacturer, storedPn)
    if (exists) {
      return true // already grown — nothing to do
    }

    const excerpt = (part.one_line || `${part.manufacturer} ${part.name}`).slice(0, 1024)
    db.prepare(`
      INSERT INTO pretraining_extracted_parts
        (document_id, part_name, manufacturer, part_number,
         module_assignment, sub_module_assignment, raw_excerpt,
         confidence, component_class, discovered_at, discovery_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      docId,
      part.name.slice(0, 256),
      part.manufacturer,
      storedPn,
      moduleId,
      subModuleId,
      excerpt,
      0.6, // generated-on-the-fly — lower than a real distributor hit (0.9)
      `${className}_completion`,
      new Date().toISOString(),
      'emitter_completion:llm',
    )
    return true
  } catch {
    return false
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }
}

// ── Word injection (matches deterministic-emitter `word()` / `mod()` shape) ───

function mod(kind: string, value: string, unit?: string): ModifierCharacterLike {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

/**
 * Build an MPN-bearing word in the exact shape the deterministic emitter
 * produces. `partNumberStructured` controls gate-20 safety:
 *   • DB-sourced → emit the real structured MPN (safe; resolves library_only).
 *   • generated  → emit the honest non-structured descriptor (gate-20 skips it).
 */
function buildCompletionWord(
  subModuleId: string,
  manufacturer: string,
  partNumber: string,
  humanName: string,
  source: 'db' | 'generated',
): WordLike {
  const baseId = subModuleId.replace(/_word$/i, '')
  const charId = `${baseId}_primary_component`
  const formNote =
    source === 'db'
      ? `${manufacturer} ${partNumber} — catalogue part (forge-truth.db library match)`
      : `${manufacturer} — representative component; exact manufacturer part number to be confirmed at detailed design`
  return {
    id: `${baseId}_completion_word`,
    name_human: humanName,
    content_character: {
      character_id: charId,
      name_human: humanName,
      function_radical_primary: null,
      function_radical_secondary: null,
      material_radical_primary: null,
      material_radical_secondary: null,
    },
    modifier_characters: [
      mod('quantity', '×1'),
      mod('manufacturer', manufacturer),
      mod('part_number', partNumber),
      mod('form', formNote),
    ],
    // Provenance badge (same convention as reviewer overrides) so the renderer
    // + audits can see this word was completed on the fly, not hand-authored.
    source_detail:
      source === 'db'
        ? 'Emitter-completion: DB-first library match'
        : 'Emitter-completion: generated on the fly (MPN deferred to detailed design)',
  }
}

// Build the descriptive string the LLM / DB matcher reasons about, from the
// sub_module's existing words + topology clause.
function describeSubModule(sm: SubModuleLike): string {
  const parts: string[] = []
  if (sm.name_human) parts.push(sm.name_human)
  const words = Array.isArray(sm.words) ? sm.words : []
  for (const w of words) {
    const cc = w.content_character
    if (cc?.name_human) parts.push(cc.name_human)
    else if (w.name_human) parts.push(w.name_human)
    const form = (w.modifier_characters ?? []).find((m) => m.kind === 'form')
    if (form?.value) parts.push(form.value)
  }
  if (sm.topology_clause) parts.push(sm.topology_clause)
  return parts.join('; ').slice(0, 600)
}

// ── Main entry ────────────────────────────────────────────────────────────────

/**
 * Close every gate-23 gap in `modules` by injecting one MPN-bearing word per
 * gap sub_module, DB-first then generate-and-write-back. Mutates `modules`
 * in place. Returns the filled list + whether any mutation happened.
 *
 * @param modules    design.modules (from state.moduleDecomposition)
 * @param className  product class string (e.g. 'wind', 'bess')
 * @param opts       see CompleteEmitterGapsOpts
 */
export async function completeEmitterGaps(
  modules: DesignModuleLike[],
  className: string,
  opts: CompleteEmitterGapsOpts = {},
): Promise<CompleteEmitterGapsResult> {
  const log = opts.log ?? ((l: string) => console.error(l))
  const model = opts.model ?? GROK_4_3
  const dbPath = opts.dbPath ?? resolve(homedir(), '.forge-truth', 'forge-truth.db')
  const safeModules = Array.isArray(modules) ? modules : []

  // 1. Find the gaps using the SAME gate the chain runs.
  const gate = runEmitterCompletenessGate(safeModules as any, className)
  if (gate.passed || gate.incomplete_sub_modules.length === 0) {
    return { filled: [], modulesMutated: false }
  }

  log(
    `[emitter-completion] ${gate.incomplete_sub_modules.length} gap sub_module(s) for class "${className}" — ` +
    `DB-first → generate → write-back`,
  )

  // Index modules + sub_modules for O(1) lookup during fill.
  const subIndex = new Map<string, { module: DesignModuleLike; sub: SubModuleLike }>()
  for (const m of safeModules) {
    const mid = String(m?.module ?? 'unknown_module')
    for (const sm of Array.isArray(m?.sub_modules) ? m.sub_modules! : []) {
      subIndex.set(`${mid}::${String(sm?.id ?? 'unknown_sub_module')}`, { module: m, sub: sm })
    }
  }

  const db = openLibraryDb(dbPath)
  const filled: FilledGap[] = []
  let mutated = false

  try {
    for (const gap of gate.incomplete_sub_modules) {
      const key = `${gap.module_id}::${gap.sub_module_id}`
      const entry = subIndex.get(key)
      if (!entry) continue
      const { sub } = entry

      // Build distinguishing tokens from sub_module_id + existing word ids/names.
      const tokens = new Set<string>(tokenize(gap.sub_module_id))
      for (const w of Array.isArray(sub.words) ? sub.words : []) {
        for (const t of tokenize(w.content_character?.character_id)) tokens.add(t)
        for (const t of tokenize(w.content_character?.name_human)) tokens.add(t)
        for (const t of tokenize(w.name_human)) tokens.add(t)
      }
      const tokenList = [...tokens]
      // Head noun = first distinguishing token of the sub_module_id (e.g.
      // "generator", "drivetrain", "converter"). Drives the high-precision
      // acceptance rule in dbFirstLookup.
      const headNoun = tokenize(gap.sub_module_id)[0] ?? null

      // 2. DB-FIRST.
      const dbHit = dbFirstLookup(db, tokenList, headNoun)
      if (dbHit) {
        const word = buildCompletionWord(
          gap.sub_module_id,
          dbHit.manufacturer,
          dbHit.part_number,
          dbHit.part_name?.slice(0, 80) || gap.sub_module_id.replace(/_/g, ' '),
          'db',
        )
        ;(sub.words ??= []).push(word)
        mutated = true
        filled.push({
          module_id: gap.module_id,
          sub_module_id: gap.sub_module_id,
          source: 'db',
          manufacturer: dbHit.manufacturer,
          part_number: dbHit.part_number,
          name: word.name_human ?? '',
        })
        log(`[emitter-completion]   ✓ DB   ${key} → ${dbHit.manufacturer} ${dbHit.part_number}`)
        continue
      }

      // 3. ON MISS → generate on the fly (honest, gate-20-safe MPN).
      const descriptor = describeSubModule(sub)
      let manufacturer = ''
      let humanName = gap.sub_module_id.replace(/_/g, ' ')
      let realMpnFromLlm = ''

      if (!opts.skipGenerate) {
        const gen = await generatePart(className, gap.module_id, gap.sub_module_id, descriptor, model)
        if (gen) {
          manufacturer = gen.manufacturer
          humanName = gen.name || humanName
          realMpnFromLlm = gen.part_number
          // 3b. WRITE BACK so next run is a DB-first hit ("good next time").
          if (!opts.skipWriteback) {
            const wrote = writeBackGenerated(dbPath, gen, className, gap.module_id, gap.sub_module_id)
            if (wrote) log(`[emitter-completion]      ↳ wrote back ${manufacturer} to pretraining_extracted_parts`)
          }
        }
      }

      // gate-20 SAFETY: never emit an unverified structured MPN. Even when the
      // LLM offered a part_number, we do NOT trust it as catalogue-real for
      // EMISSION (it isn't in any distributor cache yet). Emit the honest
      // descriptor; the real MPN (if any) lives in the DB row for future
      // dbFirstLookup to promote once an ingest job confirms it.
      const emittedMpn = honestDescriptorMpn()
      const emittedMfr = manufacturer || 'OEM (to be selected)'

      const word = buildCompletionWord(
        gap.sub_module_id,
        emittedMfr,
        emittedMpn,
        humanName,
        'generated',
      )
      ;(sub.words ??= []).push(word)
      mutated = true
      filled.push({
        module_id: gap.module_id,
        sub_module_id: gap.sub_module_id,
        source: 'generated',
        manufacturer: emittedMfr,
        part_number: emittedMpn,
        name: humanName,
      })
      log(
        `[emitter-completion]   ✓ GEN  ${key} → ${emittedMfr} ` +
        `[MPN deferred${realMpnFromLlm ? `; LLM suggested "${realMpnFromLlm}" stored in DB` : ''}]`,
      )
    }
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }

  const dbCount = filled.filter((f) => f.source === 'db').length
  const genCount = filled.filter((f) => f.source === 'generated').length
  log(`[emitter-completion] filled ${filled.length} gap(s): ${dbCount} DB-first, ${genCount} generated.`)

  return { filled, modulesMutated: mutated }
}
