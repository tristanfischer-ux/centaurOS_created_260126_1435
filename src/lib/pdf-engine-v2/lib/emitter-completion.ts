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
import { createHash } from 'node:crypto'
import { runEmitterCompletenessGate } from './emitter-completeness-gate'
import { callFastExtract, GROK_4_3, GEMINI_3_1_FLASH_LITE } from './openrouter-models'

// ── Embedding (text-embedding-3-small, 1536-d, Float32LE BLOB) ───────────────
// MUST match the read side (Stage 17.6 cosine RAG) + the other write paths
// (background-enrichment.ts, library-writeback.ts, _ingest-co2-harvest.mjs) so an
// emitter-completion row is retrievable the moment it is written. Without this an
// LLM-completed part grows the row count but stays invisible to the embedding RAG
// — the audited 2026-06-04 gap (emitter_completion:llm 383 rows / 0 embedded).
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMS = 1536

/** sha256(embed_source) prefix — same idempotency convention as the corpus. */
function embedHashOf(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}

/** Embed one string → Float32LE Buffer, or null on any failure (graceful). */
async function embedText(text: string): Promise<Buffer | null> {
  if (!OPENAI_KEY) return null
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: text.slice(0, 4096), model: EMBEDDING_MODEL, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    const vec = data.data?.[0]?.embedding
    if (!vec || vec.length !== EMBEDDING_DIMS) return null
    const buf = Buffer.alloc(EMBEDDING_DIMS * 4)
    for (let i = 0; i < EMBEDDING_DIMS; i++) buf.writeFloatLE(vec[i], i * 4)
    return buf
  } catch {
    return null
  }
}

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
  /** Short summary of the overall product design (typically the brief's product
   *  description) so the LLM-generate fallback picks parts CONSISTENT with the
   *  design — e.g. no slip rings on a direct-drive PMSG, the right refrigerant,
   *  the right voltage/power class. Default '' (no context). */
  designContext?: string
  /** Optional sink for human-readable progress lines (defaults to console.error). */
  log?: (line: string) => void
  /** Override the LLM model for the generate fallback. Default Grok 4.3
   *  (joint-lowest hallucination, honest workhorse). */
  model?: string
  /** Path to forge-truth.db. Default ~/.forge-truth/forge-truth.db. */
  dbPath?: string
  /** macro_assembly_prices word_names — a sub_module whose word is macro-anchored
   *  is NOT a gap (the macro IS its priced part), so no branded duplicate is
   *  injected for it (task #34). Default empty → prior behaviour. */
  macroWordNames?: Set<string>
}

// ── Honest-descriptor MPN for unverified LLM completions ─────────────────────
//
// MUST stay non-structured (no [A-Z0-9]{3,}[-_/]… pattern) AND ideally contain
// a gate-20 skip token ("specify"). This guarantees fictional-pn-audit treats
// it as a commodity/unverifiable descriptor (LOW/MED, never HIGH / exit 20).
function honestDescriptorMpn(): string {
  // Short + gate-20-safe (non-structured, contains 'TBD' commodity token so
  // fictional-pn-audit skips it). The `form` modifier carries the full
  // "manufacturer — confirm at detailed design" sentence; the part_number
  // column only needs a terse deferral marker that does not spill the column.
  return 'TBD (detailed design)'
}

// ── Catalogue-vs-structure discriminator (coding-council 2026-06-01) ──────────
//
// "Does this word represent a PURCHASED catalogue component (needs a real part
// number) or a FABRICATED structure (costed by material £/kg, no part number)?"
// The council rejected reusing material-prices.isMaterialDominated() — that is
// an integrated-assembly COST signal, not a structure signal, and misfires
// (passes `motor_pylon_mount` via "motor"; skips `flight computer`/`connector`).
// This dedicated classifier scored 8/8 on the council's test-names.
const STRUCTURAL_TOKENS =
  /\b(spar|laminate|skin|panel|rib|bulkhead|frame|strut|mount|pylon|boom|keel|mast|shell|fairing|cowl|shroud|enclosure|chassis|housing|bracket|casing|ballast|foundation|tower|nacelle|hull|fuselage|airframe|structure|structural|monocoque|honeycomb|prepreg|layup|weldment)\b/i
const CATALOGUE_TOKENS =
  /\b(sensor|driver|controller|computer|processor|board|ic|chip|connector|cable|harness|antenna|transceiver|receiver|radio|motor|servo|actuator|esc|regulator|converter|inverter|relay|switch|fuse|capacitor|resistor|inductor|diode|transistor|mosfet|battery|cell|pump|valve|fan|gps|imu|gyro|accelerometer|magnetometer|altimeter|camera|lidar|sonar|encoder|amplifier|oscillator|led|display|gimbal|bearing|gearbox|coupling|compressor|chiller|heater|thermocouple|solenoid)\b/i

/**
 * True when a word is a purchased catalogue component worth attaching a part
 * number to. False for fabricated structures (material-costed) and for words
 * with no clear signal (conservative — never pin an MPN on something uncertain).
 * Ambiguous compounds (catalogue + structural tokens both present, e.g.
 * `motor_pylon_mount`, `battery_pack_enclosure`) are decided by the HEAD noun
 * (last token): a structural head ⇒ structure.
 */
export function isCatalogueComponent(name: string): boolean {
  const hay = String(name ?? '').toLowerCase()
  const structural = STRUCTURAL_TOKENS.test(hay)
  const catalogue = CATALOGUE_TOKENS.test(hay)
  if (catalogue && !structural) return true
  if (structural && !catalogue) return false
  if (catalogue && structural) {
    const lastTok = hay.trim().split(/[^a-z0-9]+/).filter(Boolean).pop() ?? ''
    return !STRUCTURAL_TOKENS.test(lastTok)
  }
  return false
}

/**
 * True when a word's part_number is absent or a deferral placeholder (so it
 * renders as a generic/unbranded BoM line). Deliberately conservative: ONLY
 * empty or explicit deferral text — never second-guesses a real-looking MPN, so
 * a genuine catalogue part number (FIT1036, BD62012BFS-E2) is never overwritten.
 */
export function isBlankOrPlaceholderMpn(pn: string | undefined | null): boolean {
  const s = String(pn ?? '').trim()
  if (!s) return true
  return /\b(specify|tbd|to\s+be\s+(confirmed|selected|determined|advised)|detailed\s+design|n\/?a|placeholder|unknown)\b/i.test(s)
}

// Strip a trailing "_word" / "_assembly" and split a snake/camel id into tokens.
export function tokenize(s: string | undefined | null): string[] {
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

export interface DbPart {
  part_name: string
  manufacturer: string
  part_number: string
  component_class: string | null
  // Self-learning price (2026-06-01): pretraining_extracted_parts already carries
  // a real unit_price_gbp on ~83% of MPN-bearing rows. Pull it so a DB-first hit
  // pins the catalogue price (via a list_price_gbp modifier) instead of falling
  // back to the component-class anchor. Null when the ingested row had no price.
  unit_price_gbp: number | null
  // The ingested spec text (JSON desc with flow/capacity/head). Carried so a
  // CAPACITY-aware pin can reject a grossly-undersized flow-machine match (a
  // Grundfos CM3-3 @ 3 m³/h pinned for a 90 m³/h pump — the DB has no capacity
  // column, but the desc string holds "3 m3/h @ 35m head"). Null when absent.
  raw_excerpt?: string | null
}

// Parse a flow capacity (m³/h) from a DB part's ingested spec text + name. The pretraining rows
// have no capacity COLUMN, but raw_excerpt.desc carries it ("3 m3/h @ 35m head"). Returns null
// when no flow figure is present. UNIVERSAL (any pump/blower spec string).
export function partFlowCapacityM3h(p: { part_name?: string | null; raw_excerpt?: string | null }): number | null {
  const hay = `${p.part_name ?? ''} ${p.raw_excerpt ?? ''}`
  const m = hay.match(/(\d+(?:\.\d+)?)\s*m\s*[³3]\s*\/\s*h/i)
  return m ? parseFloat(m[1]) : null
}

// A gap word's flow DUTY (m³/h) when it is a flow machine (pump/blower/compressor/fan/filter), read
// from its rating_primary. Returns null for a non-flow word or no m³/h rating, so capacity-gating
// only ever touches a flow machine with a known duty. UNIVERSAL.
export function wordFlowDutyM3h(w: WordLike): number | null {
  const nm = w.name_human ?? w.content_character?.name_human ?? w.content_character?.character_id ?? ''
  if (!/pump|blower|compressor|\bfan\b|filter|screen|skimmer/i.test(nm)) return null
  for (const mc of w.modifier_characters ?? []) {
    if (mc.kind !== 'rating_primary') continue
    if (!/m\s*[³3]\s*\/\s*h/i.test(String(mc.unit ?? '') + ' ' + String(mc.value ?? ''))) continue
    const v = parseFloat(String(mc.value).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
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
export function dbFirstLookup(
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
      SELECT part_name, manufacturer, part_number, component_class, unit_price_gbp, raw_excerpt
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

// High-precision acceptance for a per-WORD DB pin (stricter than the
// sub_module-gap path). The empirical haps test showed the loose token matcher
// mis-pins (a TI op-amp as an "electronic speed controller"; a hobby DFRobot
// servo on an aerospace control surface; one Abracon crystal on three different
// battery parts). Three guards, council-derived:
//   1. reject hobby/maker vendors (aerospace + industrial ≠ SparkFun/DFRobot);
//   2. MOTION words (motor/servo/esc/drive/…) must resolve to a motion class —
//      kills the op-amp-as-ESC (electronic_ic ≠ motor_actuator); SENSOR words
//      must resolve to a sensor/optical class;
//   3. the component TYPE (a head-noun token) must appear as a whole word in the
//      candidate's name/class.
// (Per-word dedup within a sub_module is enforced by the caller.)
export function dbHitAcceptableForWord(dbHit: DbPart, name: string): boolean {
  const mfr = dbHit.manufacturer.trim().toLowerCase()
  if (MAKER_VENDORS.has(mfr)) return false
  const toks = tokenize(name)
  const cls = (dbHit.component_class ?? '').toLowerCase()
  const MOTION = new Set(['motor', 'servo', 'actuator', 'drive', 'esc', 'speed', 'propeller', 'propulsion', 'thruster'])
  const SENSE = new Set(['sensor', 'imu', 'gyro', 'gyroscope', 'accelerometer', 'magnetometer', 'thermocouple', 'altimeter', 'encoder', 'pitot'])
  if (toks.some((t) => MOTION.has(t)) && cls && !/motor_actuator|mechanical_assembly/.test(cls)) return false
  if (toks.some((t) => SENSE.has(t)) && cls && !/sensor|optical/.test(cls)) return false
  const hay = `${dbHit.part_name ?? ''} ${cls}`
  const headTokens = toks.slice(-3)
  return headTokens.length === 0 || headTokens.some((t) => hasWholeWord(hay, t))
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
  designContext = '',
): Promise<GeneratedPart | null> {
  const sys =
    'You are a senior hardware design engineer compiling a concept-stage bill of materials. ' +
    'Given a sub-assembly slot in a product, name the SINGLE most representative REAL, ' +
    'currently-manufactured component that would fill that slot, and the real OEM that makes it. ' +
    'Prefer well-known industrial OEMs. Output STRICT JSON only, no prose, no markdown fences, ' +
    'with keys: manufacturer (real company), part_number (a real catalogue part number IF you ' +
    'are confident it exists, else the empty string ""), name (short human name of the component), ' +
    'one_line (one-sentence description). If unsure of an exact part number, set part_number to "" — ' +
    'do NOT invent a plausible-looking number. ' +
    'The component MUST be PHYSICALLY CONSISTENT with the overall product design given below — ' +
    'e.g. do not specify slip rings for a direct-drive permanent-magnet generator, do not pick an ' +
    'R410A compressor for an R290 (propane) system, and match the stated voltage, power, and ' +
    'capacity class. If the slot is physically inappropriate for the design, choose the nearest ' +
    'component the design actually needs.'
  const user =
    (designContext
      ? `Overall product design (the component must be consistent with this):\n${designContext.slice(0, 600)}\n\n`
      : '') +
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
async function writeBackGenerated(
  dbPath: string,
  part: GeneratedPart,
  className: string,
  moduleId: string,
  subModuleId: string,
): Promise<boolean> {
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
    // Embed BEFORE the INSERT so the row is retrievable by the Stage 17.6 cosine
    // RAG the moment it lands. Canonical recipe: [part_name, manufacturer,
    // part_number, raw_excerpt].filter(Boolean).join(' ') — identical to
    // background-enrichment.ts + _ingest-co2-harvest.mjs. Degrades to a
    // NULL-embedded row only when OPENAI_API_KEY is absent / the call fails (the
    // idempotent backfill sweeps those); never blocks the row write.
    const embedSource = [part.name.slice(0, 256), part.manufacturer, storedPn, excerpt]
      .filter(Boolean)
      .join(' ')
    const embedding = await embedText(embedSource)
    const embedHash = embedding ? embedHashOf(embedSource) : null
    db.prepare(`
      INSERT INTO pretraining_extracted_parts
        (document_id, part_name, manufacturer, part_number,
         module_assignment, sub_module_assignment, raw_excerpt,
         confidence, component_class, embedding, embed_hash,
         discovered_at, discovery_source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      embedding,                                    // 1536-d Float32LE BLOB (nullable)
      embedHash,                                    // sha256(embed_source) prefix
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
  unitPriceGbp: number | null = null,
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
      // Self-learning price pin (2026-06-01): a DB-first match carries the
      // ingested catalogue unit_price_gbp (present on ~83% of MPN-bearing rows).
      // Emit it as a list_price_gbp modifier so Engine B's pre-step pins it
      // (estimate-missing-prices.tsx ~L953) and BYPASSES the component-class
      // anchor — the price the DB already knows instead of the £130 sensor median.
      // DB hits only: a generated part has no trustworthy price (gate-20 safety).
      ...(source === 'db' && typeof unitPriceGbp === 'number' && unitPriceGbp > 0
        ? [mod('list_price_gbp', String(Math.round(unitPriceGbp * 100) / 100))]
        : []),
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

  // 1. Find the gaps using the SAME gate the chain runs (macro-anchored
  //    sub_modules are NOT gaps → no branded-duplicate injection, task #34).
  const gate = runEmitterCompletenessGate(safeModules as any, className, opts.macroWordNames ?? new Set())
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
          dbHit.unit_price_gbp,
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
        const gen = await generatePart(className, gap.module_id, gap.sub_module_id, descriptor, model, opts.designContext ?? '')
        if (gen) {
          manufacturer = gen.manufacturer
          humanName = gen.name || humanName
          realMpnFromLlm = gen.part_number
          // 3b. WRITE BACK so next run is a DB-first hit ("good next time").
          if (!opts.skipWriteback) {
            const wrote = await writeBackGenerated(dbPath, gen, className, gap.module_id, gap.sub_module_id)
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
      // Never emit the fictional "OEM (to be selected)" (council seat 3: reads as
      // an unfinished template, worse than a category-typed supplier). The
      // grounded LLM almost always returns a real OEM; on the rare empty, derive
      // a category-typed placeholder from the slot's head noun.
      const emittedMfr = manufacturer || `${(humanName.split(/\s+/)[0] || 'component').replace(/_/g, ' ')} supplier`

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

// ── fillBlankWordMpns — discover-on-miss for BLANK CATALOGUE WORDS ─────────────
//
// completeEmitterGaps (above) fills EMPTY sub_modules (gate-23 gaps) by INJECTING
// one word. This sister function fills the orthogonal case the council flagged:
// words that ALREADY EXIST inside populated sub_modules but carry no real
// part_number — the generic/unbranded lines that drag the BoM score down
// (haps: 76 of 82 words). It MUTATES the existing word's modifiers rather than
// injecting a new line.
//
// Tristan's growing-DB flow, the in-chain + gate-20-safe portion:
//   DB-first (cache-real ⇒ real structured MPN) → on miss generate (real OEM +
//   honest deferred MPN) + write-back to grow the DB → take from DB next run.
// The live web-VERIFY leg that promotes a generated MPN to a structured one
// (Part B) is deferred per the council (gate-20 near-match poisoning risk).
//
// SAFETY (council-reviewed):
//   • Only CATALOGUE words (isCatalogueComponent) — fabricated structures
//     (wing_spar, laminate, pylon_mount, enclosure) are SKIPPED and left to
//     material £/kg costing.
//   • A structured MPN is emitted ONLY from a cache-real DB hit (dbFirstLookup),
//     and is .trim()'d so gate-20's re-read of its own source row cannot miss on
//     stray whitespace. A generate-on-miss never emits a structured MPN.
//   • Never overwrites an existing real part_number (isBlankOrPlaceholderMpn is
//     empty-or-deferral-only).

function setWordMpn(
  word: WordLike,
  manufacturer: string,
  partNumber: string,
  source: 'db' | 'generated',
): void {
  const mods = Array.isArray(word.modifier_characters) ? word.modifier_characters : []
  const kept = mods.filter((m) => m.kind !== 'part_number' && m.kind !== 'manufacturer')
  kept.push(mod('manufacturer', manufacturer.trim()))
  kept.push(mod('part_number', partNumber.trim()))
  word.modifier_characters = kept
  word.source_detail =
    source === 'db'
      ? 'Discover-on-miss: DB-first library match'
      : 'Discover-on-miss: generated on the fly (MPN deferred to detailed design)'
}

export interface FillBlankWordsResult {
  filled: FilledGap[]
  modulesMutated: boolean
  skipped_structural: number
  candidates: number
}

export interface FillBlankWordsOpts extends CompleteEmitterGapsOpts {
  /** Cap on the number of generate-on-miss LLM calls (cost guard). DB-first hits
   *  are unlimited (no network). Default 40. */
  maxGenerate?: number
}

/**
 * Attach a real (or honestly-deferred) part number to every BLANK CATALOGUE word
 * in `modules`. Mutates in place. Returns what was filled + how many structural
 * words were (correctly) skipped.
 *
 * Run AFTER Phase 2 + the emitter-identity re-assert (so the reviewer has had
 * its chance to fill words and nothing later reverts our writes), BEFORE render.
 */
export async function fillBlankWordMpns(
  modules: DesignModuleLike[],
  className: string,
  opts: FillBlankWordsOpts = {},
): Promise<FillBlankWordsResult> {
  const log = opts.log ?? ((l: string) => console.error(l))
  const model = opts.model ?? GROK_4_3
  const dbPath = opts.dbPath ?? resolve(homedir(), '.forge-truth', 'forge-truth.db')
  const maxGenerate = opts.maxGenerate ?? 40
  const safeModules = Array.isArray(modules) ? modules : []

  // Collect blank CATALOGUE-word candidates (skip structures + real-MPN words).
  interface Candidate { module: DesignModuleLike; sub: SubModuleLike; word: WordLike; name: string; subId: string; moduleId: string }
  const candidates: Candidate[] = []
  let skippedStructural = 0
  for (const m of safeModules) {
    const moduleId = String(m?.module ?? 'unknown_module')
    for (const sm of Array.isArray(m?.sub_modules) ? m.sub_modules! : []) {
      const subId = String(sm?.id ?? 'unknown_sub_module')
      for (const w of Array.isArray(sm?.words) ? sm.words! : []) {
        const pn = (w.modifier_characters ?? []).find((mc) => mc.kind === 'part_number')?.value
        if (!isBlankOrPlaceholderMpn(pn)) continue // already has a real MPN — leave it
        const name = w.content_character?.name_human || w.name_human || w.content_character?.character_id || subId
        if (!isCatalogueComponent(`${name} ${subId}`)) { skippedStructural++; continue }
        candidates.push({ module: m, sub: sm, word: w, name, subId, moduleId })
      }
    }
  }

  if (candidates.length === 0) {
    return { filled: [], modulesMutated: false, skipped_structural: skippedStructural, candidates: 0 }
  }
  log(
    `[fill-blank-mpn] ${candidates.length} blank catalogue word(s) for class "${className}" ` +
    `(${skippedStructural} structural skipped) — DB-first → generate → write-back`,
  )

  const db = openLibraryDb(dbPath)
  const filled: FilledGap[] = []
  let mutated = false
  let generates = 0
  // Never pin the SAME part to two words in one sub_module — a part that matches
  // multiple slots is a generic over-match (an Abracon crystal "matching" busbar +
  // sensor + harness on the shared token "battery"). Keyed by sub_module id.
  const usedInSub = new Map<string, Set<string>>()

  try {
    for (const cand of candidates) {
      const tokens = new Set<string>([...tokenize(cand.subId), ...tokenize(cand.name)])
      for (const t of tokenize(cand.word.content_character?.character_id)) tokens.add(t)
      const tokenList = [...tokens]
      const headNoun = tokenize(cand.name)[0] ?? tokenize(cand.subId)[0] ?? null

      // 1. DB-FIRST — cache-real structured MPN (gate-20-safe). Per-word matching
      //    needs a TIGHTER precision bar than sub_module-gap matching (council
      //    seat 1): a loose token overlap mis-pins (Abracon crystal → "battery
      //    busbar"). Require the word's HEAD NOUN — the component TYPE, which in a
      //    natural-language name is the LAST token (busbar/sensor/controller), not
      //    the first — to appear as a whole word in the candidate, AND never reuse
      //    a part within the sub_module.
      const dbHit = dbFirstLookup(db, tokenList, headNoun)
      if (dbHit) {
        // CAPACITY VALIDATION (Tristan 2026-06-27): a flow-machine pin must not be grossly
        // undersized vs the engine's own computed duty. A 'Grundfos CM3-3' (3 m³/h) pinned for a
        // 90 m³/h pump is a ~30× mis-pin (the DB name-match ignores capacity). When the gap word is
        // a flow machine with a known m³/h duty AND the candidate's parsed flow capacity is < 50% of
        // it, SKIP the pin entirely — keep the engine's honest generic spec ("90 m³/h @ 3.5 bar
        // end-suction, exact MPN at detailed design") rather than ship a known-undersized part. The
        // generate path is NOT used either (it could hallucinate another wrong pump). UNIVERSAL.
        const duty = wordFlowDutyM3h(cand.word)
        const cap = duty ? partFlowCapacityM3h(dbHit) : null
        if (duty && cap !== null && cap < duty * 0.5) {
          log(`[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): DB ${dbHit.manufacturer} ${dbHit.part_number} ~${cap} m³/h << duty ${duty} m³/h — keeping generic spec`)
          continue
        }
        const typeOk = dbHitAcceptableForWord(dbHit, cand.name)
        const key = `${dbHit.manufacturer}|${dbHit.part_number}`.toLowerCase()
        let used = usedInSub.get(cand.subId)
        if (!used) { used = new Set<string>(); usedInSub.set(cand.subId, used) }
        if (typeOk && !used.has(key)) {
          used.add(key)
          setWordMpn(cand.word, dbHit.manufacturer, dbHit.part_number, 'db')
          mutated = true
          filled.push({ module_id: cand.moduleId, sub_module_id: cand.subId, source: 'db', manufacturer: dbHit.manufacturer, part_number: dbHit.part_number, name: cand.name })
          log(`[fill-blank-mpn]   ✓ DB   ${cand.moduleId}::${cand.subId} (${cand.name}) → ${dbHit.manufacturer} ${dbHit.part_number}`)
          continue
        }
        // type mismatch or duplicate → treat as a MISS (fall through to generate).
      }

      // 2. ON MISS → generate (real OEM + honest deferred MPN) + write-back to
      //    grow the DB. Capped (cost guard); skippable for offline/test runs.
      if (opts.skipGenerate || generates >= maxGenerate) continue
      generates++
      const gen = await generatePart(className, cand.moduleId, cand.subId, `${cand.name}; ${describeSubModule(cand.sub)}`, model, opts.designContext ?? '')
      if (!gen || !gen.manufacturer) continue
      if (!opts.skipWriteback) {
        const wrote = await writeBackGenerated(dbPath, gen, className, cand.moduleId, cand.subId)
        if (wrote) log(`[fill-blank-mpn]      ↳ wrote back ${gen.manufacturer} to pretraining_extracted_parts`)
      }
      // gate-20 SAFETY: emit the honest non-structured descriptor, NOT gen's
      // unverified MPN (it isn't in any distributor cache yet). The real MPN (if
      // any) lives in the DB row for a future ingest job to promote.
      setWordMpn(cand.word, gen.manufacturer, honestDescriptorMpn(), 'generated')
      mutated = true
      filled.push({ module_id: cand.moduleId, sub_module_id: cand.subId, source: 'generated', manufacturer: gen.manufacturer, part_number: honestDescriptorMpn(), name: cand.name })
      log(`[fill-blank-mpn]   ✓ GEN  ${cand.moduleId}::${cand.subId} (${cand.name}) → ${gen.manufacturer} [MPN deferred${gen.part_number ? `; LLM suggested "${gen.part_number}" stored in DB` : ''}]`)
    }
  } finally {
    try { db?.close() } catch { /* no-op */ }
  }

  const dbCount = filled.filter((f) => f.source === 'db').length
  const genCount = filled.filter((f) => f.source === 'generated').length
  log(`[fill-blank-mpn] filled ${filled.length}/${candidates.length} blank word(s): ${dbCount} DB-first (real MPN), ${genCount} generated (real OEM, MPN deferred); ${skippedStructural} structural skipped.`)

  return { filled, modulesMutated: mutated, skipped_structural: skippedStructural, candidates: candidates.length }
}
