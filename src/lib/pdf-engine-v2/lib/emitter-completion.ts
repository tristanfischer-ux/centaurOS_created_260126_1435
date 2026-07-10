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
// EXPORTED 2026-07-10: serial-design-chain Stage 10.6 named-imports this, but it was
// module-private — the import silently bound undefined, and the stage's OLD failure
// (the missing verifyProposedParts) threw first and SHIELDED it (the run-16/17
// missing-module-shields-worse-latent-failures pattern, third occurrence). The moment
// verifyProposedParts existed, 10.6 ran far enough to hit "(0, …honestDescriptorMpn)
// is not a function" (run 21).
export function honestDescriptorMpn(): string {
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
const STRUCTURAL_TOKEN_SET = new Set<string>([
  'spar', 'laminate', 'skin', 'panel', 'rib', 'bulkhead', 'frame', 'strut', 'mount',
  'pylon', 'boom', 'keel', 'mast', 'shell', 'fairing', 'cowl', 'shroud', 'enclosure',
  'chassis', 'housing', 'bracket', 'casing', 'ballast', 'foundation', 'tower',
  'nacelle', 'hull', 'fuselage', 'airframe', 'structure', 'structural', 'monocoque',
  'honeycomb', 'prepreg', 'layup', 'weldment',
])
const CATALOGUE_TOKEN_SET = new Set<string>([
  'sensor', 'driver', 'controller', 'computer', 'processor', 'board', 'ic', 'chip',
  'connector', 'cable', 'harness', 'antenna', 'transceiver', 'receiver', 'radio',
  'motor', 'servo', 'actuator', 'esc', 'regulator', 'converter', 'inverter', 'relay',
  'switch', 'fuse', 'contactor', 'breaker', 'capacitor', 'resistor', 'inductor', 'diode', 'transistor',
  'mosfet', 'battery', 'cell', 'pump', 'valve', 'fan', 'gps', 'imu', 'gyro',
  'accelerometer', 'magnetometer', 'altimeter', 'camera', 'lidar', 'sonar', 'encoder',
  'amplifier', 'oscillator', 'led', 'display', 'gimbal', 'bearing', 'gearbox',
  'coupling', 'compressor', 'chiller', 'heater', 'thermocouple', 'solenoid',
  // ── BAR-A LEXICON EXTENSION (2026-07-03). 52 engineered TBD lines on codema
  // v59 while their verified parts sat embedded in forge-truth.db — the candidacy
  // gate refused whole industrial-catalogue families. These are ALL purchased
  // catalogue items (a Rosemount transmitter, an Eaton 9SX UPS, an ABB MCCB, a
  // WEDECO UV unit are bought by MPN, not fabricated). UNIVERSAL nouns — no class
  // table. 'panel'/'enclosure'/'cabinet' stay structural UNLESS qualified as a
  // control/electrical housing (head-noun discipline, see the qualified-housing
  // override below).
  'transmitter', 'transducer', 'analyser', 'analyzer', 'generator', 'genset', 'ups',
  'breaker', 'mccb', 'switchboard', 'transformer', 'softener', 'filter',
  'disinfection', 'plc', 'hmi', 'touchscreen', 'gateway', 'interface', 'scada',
  'dosing', 'doser', 'spd', 'surge', 'button', 'pushbutton',
  // Motor-drive nouns admitted so the DUTY-AWARE drive pin (Bar B, below) can
  // reach a 'Variable-Speed Drive' word at all — the guard isMotorDriveSlot still
  // routes them to the sized-to-motor path, never a loose name match.
  'drive', 'vfd', 'vsd', 'starter',
  // LEXICON ROUND 2 (2026-07-04): 'incomer' is unambiguous (a mains/switchgear
  // incomer breaker or board) — admitted directly, no qualifier needed.
  'incomer',
  // LEXICON ROUND 3 (2026-07-05, the bess-campaign-v10 not-found dissection): five
  // more UNAMBIGUOUS purchased-catalogue nouns admitted bare — each is a real family
  // with a verified DB row (EQ-105 Envicool container AC unit, FS-101 Kidde-Fenwal
  // clean-agent cylinder, X-63 PRM Filtration double-leaf door, I-6/I-15 System
  // Sensor/Apollo thermal + smoke detectors, X-25 Mersen Infini-Cell DC busbar) and
  // NONE collides with a bespoke/fabricated fixture in either the BESS negative set
  // (X-7..X-10 rack sheet-metal, X-62 structural floor reinforcement) or the water-
  // treatment/SAF corpora (checked against out/fischer-codema-v79 + out/oxccu-saf-v21
  // word lists — zero hits for any of the five). Deliberately NOT admitted bare here:
  // 'manifold', 'nozzle', 'plate', 'rod', 'lug', 'casting', 'ct', 'pc', 'vent',
  // 'detector' — each is genuinely ambiguous (water's RO-vessel "Distribution
  // Manifold" / "Inlet Nozzle Set" / "Lower Underdrain / Nozzle Plate" / "Air Scour /
  // Vent" / "Tank Vent / Pressure Relief", BESS's own "compression tie rod set" /
  // "compression plate", BESS's own "weldable lifting point" sharing the
  // `container_lifting_lugs` sub_module id with X-64's grounding lug, SAF's catalyst/
  // adsorbent "charge" AND SAF's own process gas/flame detectors — "H2/CO/hydrocarbon
  // gas detectors", "optical flame detectors", "fixed gas detectors", all correctly
  // bottom-up process safety instrumentation, not a fire-suppression catalogue item —
  // a bare 'detector' admit flipped exactly those three on the cross-class replay, so
  // it was reverted to QUALIFIER-GATED below) are ALL correctly-excluded fabricated/
  // process items that a bare admit would wrongly flip — those are QUALIFIER-GATED
  // below instead (qualifiers decide, generics support). 'louvre' (EQ-103 Rittal
  // 3239.200 louvre vent) is admitted bare — 'vent' is NOT, for exactly that reason.
  'hvac', 'cylinder', 'door', 'busbar', 'louvre',
  // LEXICON ROUND 4 (2026-07-06, the co2-campaign-v5 round-5-parts latent-noun
  // dissection): five more UNAMBIGUOUS purchased-catalogue nouns admitted bare —
  // each is a real family with a verified DB row this round ingested (K-102 CEM
  // BLC-ex ATEX blower, X-102 ANDRITZ ecoOne pusher centrifuge, X-107 Fischbein
  // B2600 band sealer, X-140 Foscott FRD675 heater-cartridge sealer-jaw element,
  // X-133 Hughes Safety Showers L18GS34G combination unit) — checked against the
  // BESS-v15 + water-v79 + SAF-v21 word lists (every word's own name_human,
  // content_character.name_human, character_id and sub_module id) for a hit on
  // 'blower' / 'centrifuge' / 'sealer' / 'shower' / 'eyewash': ZERO hits in any
  // of the three, so none of the five can flip a cross-class verdict. 'access
  // platform' and 'nitrogen blanketing skid' (the other two round-5 latent
  // nouns) are DELIBERATELY NOT admitted bare here — see the COMPOUND_
  // QUALIFIER_GATED_HEADS + QUALIFIER_GATED_HEADS['skid'] entries below for why
  // each needs a tighter, AND-style gate instead of a bare/OR-qualifier admit.
  'blower', 'centrifuge', 'sealer', 'shower', 'eyewash',
])

// English plural→singular fold for TOKEN classification + matching (the f9dfc2918
// stem discipline applied to plurals): 'valves'→'valve', 'switches'→'switch',
// 'batteries'→'battery'. Conservative — never folds short tokens, -ss/-us/-is
// endings (chassis, modbus, stainless) or known non-plurals (UPS, lens, bellows),
// so an acronym/mass noun is never mangled into a false match.
const NEVER_FOLD = new Set<string>(['ups', 'lens', 'bellows', 'scada', 'mains', 'gas'])  // 'mains' is a mass noun (mains power/water), not a plural — folding it to 'main' lands on a STOP token and silently kills the qualifier (EP-102, round 5). 'gas' is a mass noun too (folding would strip to 'ga') — kept in sync with build-excel-export.py::_JOIN_NEVER_FOLD (co2_mineralisation pre-flight family 1, 2026-07-05)
export function foldPluralToken(t: string): string {
  const s = String(t ?? '').toLowerCase()
  if (s.length < 4 || NEVER_FOLD.has(s)) return s
  if (/[^aeiou]ies$/.test(s)) return s.slice(0, -3) + 'y'
  if (/(ches|shes|sses|xes|zes)$/.test(s)) return s.slice(0, -2)
  if (/s$/.test(s) && !/(ss|us|is)$/.test(s)) return s.slice(0, -1)
  return s
}

// 'panel' / 'enclosure' / 'cabinet' are structural (a fabricated skin/housing) —
// UNLESS the name qualifies them as a CONTROL/ELECTRICAL housing (an 'Electrical
// Control Panel', a Rittal 'control panel enclosure', an 'MCC cabinet'), which is
// a purchased catalogue product. Head-noun discipline: the qualifier admits the
// housing head; a bare 'battery_pack_enclosure' / 'access panel' stays structural.
const HOUSING_HEADS = new Set<string>(['panel', 'enclosure', 'cabinet'])
const HOUSING_QUALIFIERS = new Set<string>([
  'control', 'electrical', 'electric', 'instrument', 'instrumentation',
  'distribution', 'junction', 'mcc', 'switchboard', 'switchgear',
  // LEXICON ROUND 3 (2026-07-05): 'releasing' — a fire-suppression RELEASING panel
  // (EQ-106, Kidde ARIES-SLX) is a purchased addressable control panel, exactly the
  // same purchased-housing family as a control/electrical panel. Deliberately does
  // NOT admit 'barrier' (EQ-107 'arc flash barrier panel' stays correctly excluded —
  // an arc-flash barrier is engineered to the specific switchgear compartment, not a
  // standalone catalogue SKU; no credible generic match exists — see the ingest
  // round's disposition notes).
  'releasing',
])

// LEXICON ROUND 2 (2026-07-04, round-3 residual dissection): five more real catalogue
// families that isCatalogueComponent refused to admit as fill-blank candidates AT ALL —
// 'Emergency Stop' (bare, no button/switch head noun), 'Mains Incomer', 'Power Supply
// Unit', 'Ethernet IP Module', 'Overcurrent Protection' — each sits in forge-truth.db but
// the WORD never even reached dbFirstLookup because isCatalogueComponent(name) was false.
// 'incomer' is unambiguous (an electrical switchgear/board incomer) and admitted directly
// below. 'stop' / 'module' / 'protection' / 'supply' are each too GENERIC on their own — a
// bare 'stop', a bare 'module' ('Module Support System' / 'Modular Stack Design' MUST stay
// refused — they are scope words, not catalogue parts), a bare 'protection' or 'supply' —
// so each is QUALIFIER-GATED: the head only counts as catalogue when a qualifying token is
// ALSO present in the same name. UNIVERSAL — no class table; the qualifier lists are the
// same real families the rest of this lexicon already recognises (surge/overcurrent
// protection devices, an ethernet/IP/comms network module, a power supply unit).
// LEXICON ROUND 3 (2026-07-05, bess-campaign-v10 not-found dissection): eight more
// heads that are each real catalogue families ONLY when qualified — a bare admit of
// any of these heads would flip a genuinely bespoke/fabricated/process fixture that
// shares the same head noun (proven against the negative fixtures named per head
// below; verified byte-identical against out/fischer-codema-v79 (water) +
// out/oxccu-saf-v21 (SAF) — no word in either corpus carries both a listed head AND
// its qualifier, so neither class's isCatalogueComponent verdict moves):
//   pc        — EQ-104 'EMS industrial PC' (Beckhoff C6015-0010). A bare 'pc' is too
//               short/generic to admit alone; 'industrial' is the real signal.
//   rod       — X-32 'earth rod' (ABB Furse RC012). A bare 'rod' would wrongly admit
//               X-10 'compression tie rod set' (bespoke rack compression hardware,
//               correctly fabricated/material-costed) — 'earth'/'ground'/'grounding'
//               is the qualifier that makes it an electrode, not a mechanical rod.
//   plate     — CP-101 'cold plate per rack' (Wieland MicroCool CP-E-4009-S3XJ). A
//               bare 'plate' would wrongly admit X-9 'compression plate' (bespoke
//               rack hardware) AND water's 'Base / Floor Plate' / 'Baseplate' / the
//               RO-vessel 'Lower Underdrain / Nozzle Plate' (all correctly fabricated
//               vessel internals) — 'cold'/'cooling' is the liquid-cooling signal.
//   charge    — X-34 'coolant charge' (Dow DOWFROST HD). A bare 'charge' would wrongly
//               admit SAF's process catalyst/adsorbent charges ('shaped iron FT
//               catalyst charge', 'guard-bed adsorbent + deoxo charge', 'hydroprocessing
//               catalyst charge' — all correctly bottom-up process-engineering mass,
//               not a purchased part) — 'coolant'/'glycol'/'refrigerant' is the fluid
//               signal.
//   manifold  — CM-101 'cold plate manifold' (Motivair In-Rack Manifold) + CD-101
//               'coolant distribution manifold' (CoolIT Systems rack manifold). A bare
//               'manifold' would wrongly admit water's RO-vessel 'Distribution
//               Manifold' / 'Inlet / Outlet Manifolds' (fabricated pressure-vessel
//               internals) — 'coolant'/'cooling'/'cold' is the liquid-cooling signal.
//   nozzle    — X-39 'suppression nozzle' (Kidde Fenwal 90-194028). A bare 'nozzle'
//               would wrongly admit water's RO-vessel 'Inlet/Outlet Nozzle Set',
//               'Drain Nozzle', 'Lower Underdrain / Nozzle Plate' (fabricated vessel
//               internals) — 'suppression'/'discharge'/'sprinkler'/'deluge'/'fire' is
//               the fire-protection signal.
//   casting   — X-65 'ISO corner casting' (Tandemloc 243000C). A bare 'casting' risks
//               admitting a bespoke integrated structural casting in an unrelated
//               class (e.g. a turbine hub/nacelle casting costed by weight) —
//               'corner'/'iso' is the ISO-freight-container signal.
//   ct        — X-71 'grid PCC metering CT' (Crompton Instruments MB5Z-2000/5). Bare
//               'ct' is a 2-char token too ambiguous to admit alone — 'metering' /
//               'pcc' / 'grid' is the current-transformer signal.
//   lug       — X-64 'grounding lug set' (Burndy YA292N). A bare 'lug' would wrongly
//               admit BESS's own 'weldable lifting point' (a bespoke welded structural
//               attachment that shares the `container_lifting_lugs` sub_module id,
//               whose own id token folds 'lugs'→'lug') — 'grounding' is the electrical-
//               lug signal.
//   door      — X-63 'door assembly double leaf' (PRM Filtration manway double door).
//               'door' is ALSO admitted bare above (CATALOGUE_TOKEN_SET) — that alone
//               is not enough to REACH X-63, because its sub_module id
//               `iso_container_shell` contributes the STRUCTURAL token 'shell', which
//               wins the ambiguous-compound tie-break below by default (last-token
//               rule). 'assembly'/'leaf' qualify it so the QUALIFIER-GATED override
//               (see the tie-break below) can win instead of the coarse tie-break.
//   detector  — I-6 'thermal detector' (System Sensor 5601P) + I-15 'smoke detector
//               sounder' (Apollo AlarmSense 55000-392), both fire-SUPPRESSION-system
//               detectors. A bare 'detector' was tried first and reverted: it flipped
//               THREE SAF process-safety instrument words on the cross-class replay
//               ("H2/CO/hydrocarbon gas detectors", "optical flame detectors", "fixed
//               gas detectors" — correctly bottom-up process instrumentation, not a
//               fire-suppression catalogue part) from false to true. 'thermal' /
//               'smoke' / 'heat' is the fire-suppression-detector signal that SAF's
//               gas/flame detector names never carry.
// LEXICON ROUND 4 (2026-07-06, co2-campaign-v5 round-5-parts latent-noun dissection):
//   skid — I-105 'nitrogen blanketing skid' (Groth 3011 tank-blanketing regulator). A
//          bare 'skid' is hopelessly generic (23 hits across water-v79's own
//          `mass_fluid_transport_process__ro_membrane_elements` RO skid alone, plus
//          BESS/SAF/CO2 skid-frame words) — nowhere near admittable bare. The obvious
//          qualifiers ('nitrogen', 'blanketing', 'n2') were TRIED FIRST and REJECTED:
//          SAF-v21's own 'nitrogen inerting skid' (name_human, sub_module
//          `utilities_offsites`) carries 'nitrogen' + 'skid' on its ALIAS surface
//          ("nitrogen inerting skid") and 'blanketing' + 'skid' on its PRIMARY-name
//          surface ("N2 generation + inerting/blanketing skid") — never both signal
//          words on the SAME tested string, but isCatalogueComponentByEitherName
//          tests each surface independently, so a single-qualifier OR-admit on
//          EITHER 'nitrogen' or 'blanketing' flips that correctly-excluded SAF word
//          (a real bottom-up process-safety N2 skid, not this round's ownership) from
//          false to true on the cross-class replay. 'exclusion' — from I-105's own
//          alias "MEA-tank nitrogen blanketing skid (O2 exclusion)", the actual
//          engineering PURPOSE of nitrogen blanketing (excluding O2 from the
//          headspace) — is the narrow qualifier that reaches I-105 without reaching
//          SAF's word (checked: 'exclusion' appears nowhere in either SAF-v21 test
//          surface for that skid, or anywhere else in BESS-v15/water-v79/SAF-v21
//          alongside 'skid').
//   detector (unchanged from round 3) stays as-is below.
const QUALIFIER_GATED_HEADS: Record<string, Set<string>> = {
  stop: new Set(['emergency']),
  module: new Set(['ethernet', 'ip', 'comms', 'communication', 'communications']),
  protection: new Set(['overcurrent', 'surge']),
  supply: new Set(['power']),
  pc: new Set(['industrial']),
  rod: new Set(['earth', 'ground', 'grounding']),
  plate: new Set(['cold', 'cooling']),
  charge: new Set(['coolant', 'glycol', 'refrigerant']),
  manifold: new Set(['coolant', 'cooling', 'cold']),
  nozzle: new Set(['suppression', 'discharge', 'sprinkler', 'deluge', 'fire']),
  casting: new Set(['corner', 'iso']),
  ct: new Set(['metering', 'pcc', 'grid']),
  lug: new Set(['grounding']),
  door: new Set(['assembly', 'leaf']),
  detector: new Set(['thermal', 'smoke', 'heat']),
  skid: new Set(['exclusion']),
}

// COMPOUND (AND-of-N) qualifier gate — a stricter sibling of QUALIFIER_GATED_HEADS
// for the rare head noun where a SINGLE qualifier still over-fires and the head only
// becomes safe to admit when TWO OR MORE qualifiers are ALL present together.
//   platform — X-131 'access platform + ladders' (Kee Safety Kee Platform modular
//              access system), sub_module `skid_structure`. A single-qualifier
//              ('access') admit was TRIED FIRST and REJECTED: water-v79's own
//              'Access Ladder & Platform' (a small built-in RO-vessel walkway
//              fixture, sub_module `mass_fluid_transport_process__ro_membrane_
//              elements`, correctly fabricated/material-costed — no catalogue MPN,
//              no DB row) carries BOTH 'access' AND 'platform' on its own name —
//              a single-qualifier OR-admit on 'access' flips it from false to true
//              on the cross-class replay. X-131's OWN sub_module id contributes a
//              THIRD token, 'skid' (from `skid_structure`), that water's RO-vessel
//              word never carries alongside 'access'+'platform' anywhere in
//              BESS-v15/water-v79/SAF-v21 — requiring ALL THREE (head 'platform'
//              AND both qualifiers 'access' + 'skid') present together reaches
//              X-131 without reaching water's word.
const COMPOUND_QUALIFIER_GATED_HEADS: Record<string, string[][]> = {
  platform: [['access', 'skid']],
}

/**
 * The candidate's two independent name surfaces are BOTH tried against the catalogue
 * lexicon (2026-07-05, the bess-campaign-v11 Part-names alias-resolution fix): `name`
 * (the word's primary/display name) and `aliasName` (its OTHER authored name — e.g.
 * `name_human` vs `content_character.name_human`). Returns true iff EITHER resolves
 * catalogue via `isCatalogueComponent`. Exported standalone (rather than left inline in
 * fillBlankWordMpns) so the union rule itself — not just its caller's plumbing — carries
 * a direct regression guard. See isCatalogueComponent's docstring for the lexicon rules.
 */
export function isCatalogueComponentByEitherName(
  name: string, aliasName: string | null | undefined, subId: string,
): boolean {
  // The word's OWN name decides FIRST (2026-07-10, run-36: 'Active Ventilation Fan'
  // hosted in sub_module …__thermal_INSULATION_PANELS — the subId concatenation fed
  // the host's STRUCTURAL tokens into the classifier and vetoed a catalogue fan;
  // 34 'structural skipped' included real purchasable parts). The subId remains a
  // RESCUE context for names ambiguous on their own, never a veto.
  if (isCatalogueComponent(name)) return true
  if (isCatalogueComponent(`${name} ${subId}`)) return true
  if (aliasName && isCatalogueComponent(aliasName)) return true
  return !!aliasName && isCatalogueComponent(`${aliasName} ${subId}`)
}

/**
 * True when a word is a purchased catalogue component worth attaching a part
 * number to. False for fabricated structures (material-costed) and for words
 * with no clear signal (conservative — never pin an MPN on something uncertain).
 * Ambiguous compounds (catalogue + structural tokens both present, e.g.
 * `motor_pylon_mount`, `battery_pack_enclosure`) are decided by the HEAD noun
 * (last token): a structural head ⇒ structure. Tokens are PLURAL-FOLDED first
 * (2026-07-03) so 'Manual Isolation Valves' / 'Pressure Transmitters' classify
 * exactly like their singulars — the singular-only \bvalve\b miss was Bar A of
 * the 52-TBD engineered backlog.
 */
export function isCatalogueComponent(name: string): boolean {
  const toks = String(name ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(foldPluralToken)
  if (toks.length === 0) return false
  const structural = toks.some((t) => STRUCTURAL_TOKEN_SET.has(t))
  const qualifiedHousing =
    toks.some((t) => HOUSING_HEADS.has(t)) && toks.some((t) => HOUSING_QUALIFIERS.has(t))
  // QUALIFIER-GATED heads (LEXICON ROUND 2): a bare 'stop'/'module'/'protection'/'supply' is
  // NOT catalogue evidence — the qualifying token is. Never fires on 'Module Support System'
  // or 'Modular Stack Design' (no ethernet/ip/comms present) — those stay scope words.
  const qualifiedGated = Object.entries(QUALIFIER_GATED_HEADS).some(
    ([head, quals]) => toks.includes(head) && toks.some((t) => quals.has(t)),
  )
  // COMPOUND (AND-of-N) qualifier gate (LEXICON ROUND 4): a head admits only when
  // EVERY token in at least one of its qualifier SETS is present — strictly tighter
  // than QUALIFIER_GATED_HEADS' single-qualifier OR. See COMPOUND_QUALIFIER_GATED_HEADS
  // above for why 'platform' needs this (a single qualifier over-fires on water-v79).
  const compoundGated = Object.entries(COMPOUND_QUALIFIER_GATED_HEADS).some(
    ([head, qualifierSets]) => toks.includes(head) && qualifierSets.some((qs) => qs.every((q) => toks.includes(q))),
  )
  const catalogue = toks.some((t) => CATALOGUE_TOKEN_SET.has(t)) || qualifiedHousing || qualifiedGated || compoundGated
  if (catalogue && !structural) return true
  if (structural && !catalogue) return false
  if (catalogue && structural) {
    const lastTok = toks[toks.length - 1] ?? ''
    if (HOUSING_HEADS.has(lastTok) && qualifiedHousing) return true
    // QUALIFIER-GATED override (LEXICON ROUND 3, 2026-07-05): callers always test
    // `${name} ${subId}` concatenated — so the coarse last-token tie-break below is
    // frequently deciding on the SUB_MODULE's own last token (e.g. `iso_container_
    // shell` contributes 'shell'), not the WORD's own head noun. That silently
    // blocks a genuinely catalogue word merely for living in a structurally-named
    // sub_module (X-64 'grounding lug set' + X-63 'door assembly double leaf', both
    // under `iso_container_shell`). A QUALIFIER_GATED_HEADS hit is already a
    // hand-vetted, narrow (head, qualifier) pair proven against negative fixtures
    // (see the comment block above) — strictly higher-precision evidence than an
    // incidental structural token from elsewhere in the string — so it wins the
    // tie the same way a qualified HOUSING head does. Proven inert on both cross-
    // class corpora checked this round (out/fischer-codema-v79, out/oxccu-saf-v21):
    // every existing qualifiedGated hit in either corpus already resolves catalogue
    // (its sub_module id carries no structural token), so this override changes
    // NEITHER corpus's verdicts — it only reaches words that were previously
    // wrongly blocked. compoundGated (LEXICON ROUND 4) is the same class of
    // evidence — an even narrower, hand-vetted AND-of-N pair — and wins the tie
    // the same way: X-131's 'skid_structure' sub_module contributes the STRUCTURAL
    // token 'structure' as its last token, which would otherwise silently block
    // the qualifying 'platform'+'access'+'skid' word merely for living in a
    // structurally-named sub_module (the same shape of bug the door/lug override
    // above fixed in round 3).
    if (qualifiedGated || compoundGated) return true
    return !STRUCTURAL_TOKEN_SET.has(lastTok)
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
// Tokens are PLURAL-FOLDED (2026-07-03, Bar A) so 'Manual Isolation Valves'
// tokenises to the same distinguishing nouns as 'manual isolation valve' — the
// DB query + whole-word matching then see ONE stem for both surfaces.
export function tokenize(s: string | undefined | null): string[] {
  if (!s) return []
  return String(s)
    .replace(/_word$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .map(foldPluralToken)
    .filter((t) => (t.length >= 3 || SHORT_DOMAIN_TOKENS.has(t)) && !STOP_TOKENS.has(t))
}

// 2-char tokens that ARE distinguishing engineering nouns ('UV Disinfection',
// 'RO Membrane', 'pH Analyser') — the blanket ≥3-char filter silently dropped
// them, so a 'Uv Disinfection' word could never reach the WEDECO UV row on the
// 2-hit acceptance bar.
const SHORT_DOMAIN_TOKENS = new Set<string>(['uv', 'ro', 'ph', 'uf', 'nf', 'mf'])  // membrane fineness family (MF<UF<NF) — 'Uf Module Bank' was unreachable by any honest part (round 5)

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
  // Ranking provenance (2026-07-03 saturation fix): a CLASS-TAGGED verified row
  // (confidence ≥ 0.9, discovery_source 'web_verified_ingest' — the deliberate
  // per-class harvest) outranks a same-strength distributor-sweep row on tie, so
  // the 36k-row generic sweep can never drown the 33 rows ingested FOR this class.
  confidence?: number | null
  discovery_source?: string | null
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

// Electronics-COMPONENT vendors — they make ICs / chips / boards, NOT industrial FIELD instruments.
// A process field switch / transmitter / gauge pinned to one of these (e.g. a Maxim MAX31827A temp-
// sensor IC on a 'Low Pressure Switch') is a wrong-domain mis-pin: the DB is electronics-heavy and a
// loose token match ('switch') lands an IC on a field device. A real field instrument is Endress+
// Hauser / WIKA / Hach / Siemens / Danfoss, etc. Reject the IC-vendor pin → keep the generic spec.
const ELECTRONICS_IC_VENDORS = new Set<string>([
  'analog devices', 'analog devices inc.', 'analog devices inc./maxim integrated', 'maxim integrated',
  'maxim', 'texas instruments', 'ti', 'stmicroelectronics', 'st microelectronics', 'nxp',
  'nxp semiconductors', 'microchip', 'microchip technology', 'infineon', 'on semiconductor',
  'onsemi', 'renesas', 'diodes incorporated', 'vishay', 'rohm', 'nordic semiconductor', 'espressif',
  'intersil',  // Renesas/Intersil ISL-series ICs — an ISL1571IRZ (DSL line-driver IC) was mis-pinned as
               // a 'PLC Controller'; the compound vendor string "Renesas / Intersil" is split + matched below.
])
const _PROCESS_FIELD_INSTRUMENT_RE =
  /\b(pressure|level|flow|temperature|conductivity|turbidity|\bph\b|\borp\b|chlorine)\b.*\b(switch|transmitter|gauge|indicator|sensor|probe|element|meter|analy[sz]er)\b|\b(switch|transmitter|gauge)\b/i

// CONTROL / DISTRIBUTION / CABLING equipment — a PHYSICAL industrial item (a PLC unit, a cable tray, a
// busbar, a switchboard), NEVER a single chip. An IC-vendor pin here is the same wrong-domain mis-pin as
// on a field instrument (a Renesas/Intersil DSL-driver IC landed on a 'PLC Controller' via the loose name
// match). Deliberately EXCLUDES generic 'panel/cabinet/enclosure' (a populated enclosure can legitimately
// carry a board) — only the items that are unambiguously NOT a board-level component.
// NB 'controller' is included GENERALLY (not just 'plc controller') — the LLM names this slot variably
// ('PLC Controller' on one run, 'Dc3 Power Controller' the next), and in a PLANT BoM a *controller* is
// always a physical industrial control UNIT, never a bare chip — so an IC-vendor pin on any '… controller'
// is wrong-domain. (Keying on the exact name 'plc' missed the rename; the general term is robust.)
const _CONTROL_DISTRIBUTION_EQUIP_RE =
  /\b(plc|hmi|scada|rtu|controller|programmable logic|cable tray|cable ladder|ladder rack|cable basket|busbar|bus bar|switchboard|switchgear|distribution board|panelboard|consumer unit|din rail|wireway|trunking)\b/i

// A PROCESS FIELD INSTRUMENT / SWITCH or a CONTROL/DISTRIBUTION item whose ONLY DB candidate is from an
// electronics-component vendor is a wrong-domain mis-pin — keep it generic (specified by range / output /
// connection / size at detailed design), not by an IC part number. UNIVERSAL — keyed on the wrong-domain
// slot vocabulary + the IC-vendor list, no class table. The vendor string is split on '/' so a compound
// "Renesas / Intersil" matches when either house is an IC vendor (substring matching is avoided — it would
// false-match a 2-letter house like 'ti' inside an unrelated name).
export function isElectronicsIcMispin(name: string, manufacturer: string): boolean {
  const n = name || ''
  if (!_PROCESS_FIELD_INSTRUMENT_RE.test(n) && !_CONTROL_DISTRIBUTION_EQUIP_RE.test(n)) return false
  const mfr = (manufacturer || '').trim().toLowerCase()
  if (ELECTRONICS_IC_VENDORS.has(mfr)) return true
  return mfr.split(/\s*[/&,]\s*/).some((house) => ELECTRONICS_IC_VENDORS.has(house.trim()))
}

// A PANEL INDICATOR / PILOT LIGHT (an LED signal lamp — Banner EZ-LIGHT, a beacon, a stack/tower light)
// pinned to a slot that is NOT itself a light/indicator is a wrong-domain mis-pin: a Banner K30LMBXXP
// ("LED Panel Mount Indicators … EZ-LIGHT", DB component_class 'optical') landed on a 'Cable Trays' slot
// via the loose name match. Keyed on the INDICATOR/PILOT-LIGHT vocabulary in the candidate's name/excerpt
// (NOT bare component_class 'optical' — that also covers legitimate optical SENSORS) AND the absence of
// light/indicator words in the slot. UNIVERSAL — no class table.
const _INDICATOR_LIGHT_RE = /\b(indicators?|pilot (?:lights?|lamps?)|signal (?:lights?|lamps?)|ez[-\s]?light|beacons?|stack lights?|tower lights?|panel mount lights?|warning lights?)\b/i
export function isIndicatorLightMispin(slotName: string, p: { part_name?: string | null; raw_excerpt?: string | null }): boolean {
  // Judge the candidate by its LEADING family phrase (2026-07-03): a real SPD /
  // relay whose spec TAIL mentions a 'status indicator' is not an indicator
  // light — the Phoenix Contact Type-2 SPD was falsely skipped on that tail.
  const cand = partNameLeadSegment(p.part_name, 8)
  if (!_INDICATOR_LIGHT_RE.test(cand)) return false       // candidate is NOT an indicator/pilot light
  return !_INDICATOR_LIGHT_RE.test(slotName || '')        // …but the slot is not a light/indicator → mis-pin
}

// A SIMPLE COMMODITY process valve (check / non-return / swing / ball / gate / globe / needle), which
// is specified GENERICALLY at design stage (size + rating + material), NOT by a single MPN — so a
// fill-blank name-token match must not pin an unreliable specific part on it. An ACTUATED / control /
// solenoid / dosing / metering valve is EXCLUDED (it legitimately carries a real MPN). UNIVERSAL.
export function isCommodityProcessValve(name: string): boolean {
  const n = (name || '').toLowerCase()
  if (!/\bvalves?\b|\bnon.?return\b/.test(n)) return false
  if (/actuat|solenoid|motoris|motoriz|\bcontrol\b|dosing|metering|modulat|throttl|pneumatic|electric/.test(n)) return false
  return /\b(check|non.?return|swing|ball|gate|globe|needle|wafer|lift|foot|isolation|isolat)\b/.test(n)
}

// ── UNTETHERED ACCESSORY VALVE — tether-or-suppress at emission (2026-07-05, the
// 0faea5550 routed follow-on: "the completion pass must tether representative
// accessory valve lines to their service at emission (or stop emitting them
// untethered) — stamping [the join] would be guessing"). derive-skeleton.ts /
// universal-contract-sizing.ts mint a commodity-valve word's TEXT before either
// completion function below ever sees it (the "<name> — representative <module>
// component" TIER_C_FLOOR scaffold, or the "(assembly component)" sub-assembly
// explosion); completeEmitterGaps (injecting a brand-new representative word) and
// fillBlankWordMpns (finalising an EXISTING placeholder one) are the ONLY code on
// the emission path that inspects the word's sub_module CONTEXT before it ships
// into the BoM. Left alone, an accessory valve's requirement text is a bare noun
// phrase ("Isolation Valves") the valve spec-join in requirements_bom.py can never
// match to a real line — not a bug in the join (it correctly REFUSES to guess), a
// gap in what gets minted here.
//
// THE TETHER: universal-contract-sizing.ts's `explodeEquipmentSubAssemblies`
// stamps a principal-equipment word "— principal equipment sized from the
// engineering contract" and then APPENDS its exploded children (Casing, Drive
// Motor, ..., Suction Isolation Valve, Discharge Isolation Valve, Non-Return
// Valve, ...) contiguously right after it in the SAME sub_module's `words` array,
// before the next principal's own block begins — verified on v73's REAL shape,
// where one module's entire equipment list (16 distinct principals: pumps,
// vessels, tanks) lives in ONE flat sub_module, so "does a principal-equipment
// sibling exist ANYWHERE in this sub_module" is not enough to identify WHICH one
// hosts a given valve (16 candidates, genuinely ambiguous by presence alone).
// Array ORDER resolves it deterministically: walking BACKWARD from the valve's
// own position, the FIRST principal-equipment word encountered is its direct
// parent (children never precede their own parent, and the next principal's
// block only starts after the previous one's children end) — no guessing, no
// per-class table, just the construction order this design already carries.
//
// When NO principal-equipment word precedes the valve at all (the cross-cutting
// TIER_C_FLOOR catch-all buckets — actuation_kinematics, safety_protection,
// maintenance_serviceability — whose siblings are themselves other generic
// placeholders, never a real tag; verified 2026-07-04 on v70/v73: the sub_module
// id itself is an arbitrary bucket, e.g. 'Isolation Valves' landing under
// maintenance_serviceability__leveling_feet) there is NO real per-row placement
// to join against — inventing one would be exactly the fabrication
// requirements_bom.py's own taxonomy refuses. SUPPRESS the line instead: the
// plant's real valves are already counted in the zoned-distribution kits + the
// process-schedule valve list (draw_process_schedules.py mints one accessory
// valve per real line independently), so an untethered duplicate is noise that
// can never be spec-stamped. UNIVERSAL — keyed on the principal-equipment
// ordering signal, never a per-class table; a non-valve word never reaches this
// code (both call sites gate on isCommodityProcessValve first), so a design with
// no untethered commodity-valve candidates (BESS, SAF) is byte-for-byte
// unaffected.

const _PRINCIPAL_EQUIPMENT_FORM_RE = /principal equipment sized from the engineering contract/i

/**
 * The name of the nearest PRECEDING principal-equipment word in `sub.words`
 * relative to `word`'s own position (the word that hosts it — see the
 * explodeEquipmentSubAssemblies contiguous-append rationale above), or null when
 * no principal-equipment word precedes it at all. `word` may not yet be present
 * in `sub.words` (a brand-new gap-fill word about to be appended) — in that case
 * the scan starts from the END of the array, i.e. "the last principal this
 * sub_module minted so far".
 */
export function hostingPrincipalEquipmentName(sub: SubModuleLike, word: WordLike): string | null {
  const words = Array.isArray(sub.words) ? sub.words : []
  let idx = words.indexOf(word)
  if (idx === -1) idx = words.length
  for (let i = idx - 1; i >= 0; i--) {
    const w = words[i]
    const form = (w.modifier_characters ?? []).find((m) => m.kind === 'form')?.value ?? ''
    if (!_PRINCIPAL_EQUIPMENT_FORM_RE.test(form)) continue
    const nm = w.content_character?.name_human || w.name_human
    if (nm) return nm
  }
  return null
}

/**
 * Tether an accessory-valve word to its hosting principal equipment by naming it
 * in the word's own requirement text (mutates `word` in place — both name_human
 * and content_character.name_human, since either may be read downstream as the
 * BoM row's requirement label), or report that no tether exists so the caller can
 * decline to emit the line at all. Callers gate on `isCommodityProcessValve`
 * first — this function does not re-check that itself.
 */
export function tetherOrSuppressAccessoryValve(
  word: WordLike,
  sub: SubModuleLike,
): { verdict: 'tethered'; hostName: string } | { verdict: 'suppress' } {
  const hostName = hostingPrincipalEquipmentName(sub, word)
  if (!hostName) return { verdict: 'suppress' }
  const base = word.content_character?.name_human || word.name_human || ''
  const tethered = `${base} (on ${hostName})`
  word.name_human = tethered
  if (word.content_character) word.content_character.name_human = tethered
  return { verdict: 'tethered', hostName }
}

/** Remove `word` from `sub.words` in place (splice by reference identity). No-op
 *  if `word` is not present — safe to call defensively. */
function removeWordFromSub(sub: SubModuleLike, word: WordLike): void {
  const words = sub.words
  if (!Array.isArray(words)) return
  const idx = words.indexOf(word)
  if (idx >= 0) words.splice(idx, 1)
}

// ── DUPLICATE-REPRESENTATIVE-POPULATION FOLD (2026-07-05, the round-5 residual: the
// pneumatic-actuated-valve triple-count) — derive-skeleton.ts's Tier-C/GENERIC_FLOOR
// component list can independently mint 2+ near-synonym filler words for the SAME
// physical population: a singular/plural noun pair ("Pneumatic Actuated Valve" /
// "Pneumatic Actuated Valves", "Solenoid Valve" / "Solenoid Valves"), or a valve and
// its own inseparable actuator ("Pneumatic Actuated Valve" / "Pneumatic Actuators").
// Each independently inherits the SAME contract count (e.g.
// actuated_distribution_valve_count=200) via derive-skeleton's fuzzy contractCountFor
// — three WORDS, one real population — and each is a legitimate fillBlankWordMpns
// candidate (isCommodityProcessValve excludes ACTUATED/pneumatic valves, by design,
// because those legitimately carry a real MPN — so the tether-or-suppress path above
// never sees them). Left alone, the BoM prices the population 2-3× over AND the
// process-schedule valve list lists it 2-3× over (Codema v75, 2026-07-04: BoM billed
// 600 actuated valves as 3 separate 200-off lines; the schedule showed 3 separate
// "(×200)" rows — the cross-schedule reconciliation net (630 vs 476) caught the
// SYMPTOM on the schedule side, but the true fault is upstream, in the design tree
// both readers walk).
//
// Fix: fold every GENERIC-REPRESENTATIVE filler (the derive-skeleton "<name> —
// representative <module> component" stamp — never a hand-authored/real-MPN word) to
// a population key = its token set (existing plural-fold) with the small, universal
// {actuator, actuated, valve} family collapsed to one member (an actuated valve's
// actuator is not a separately-purchasable population from the valve itself in a
// generic filler context) + its own quantity. A LATER word in the same sub_module
// that folds to a key already seen is the SAME population restated under a synonym
// — remove it, never re-price or re-list it. UNIVERSAL: keyed on the stamp + a small
// justified noun family, no per-class table; a class with no such duplicate filler
// (BESS, SAF — their actuated valves carry real hand-authored MPNs, never this
// skeleton path) is byte-for-byte unaffected.
const _GENERIC_REPRESENTATIVE_FORM_RE = /representative\s+\S.*\bcomponent\b/i
const _ACTUATOR_VALVE_FAMILY = new Set(['actuator', 'actuated', 'valve'])

function _wordFormText(word: WordLike): string {
  return String((word.modifier_characters ?? []).find((m) => m.kind === 'form')?.value ?? '')
}

/** True for a derive-skeleton Tier-C/GENERIC_FLOOR filler word (the "<name> —
 *  representative <module> component" stamp) — never a hand-authored/real-MPN word. */
export function isGenericRepresentativeFiller(word: WordLike): boolean {
  return _GENERIC_REPRESENTATIVE_FORM_RE.test(_wordFormText(word))
}

/** Parse a '×N' quantity modifier to an integer (1 when absent/unparseable). */
export function wordQuantity(word: WordLike): number {
  const raw = (word.modifier_characters ?? []).find((m) => m.kind === 'quantity')?.value
  const n = parseInt(String(raw ?? '').replace(/[^\d]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** The duplicate-population key for a generic-representative filler: its tokenised,
 *  plural-folded name with the actuator≡actuated-valve family collapsed, plus its
 *  own quantity — so two fillers describing the SAME sized population (regardless of
 *  which family noun they happen to be named after) land on the same key. */
export function representativeDuplicateKey(word: WordLike, name: string): string {
  const toks = tokenize(name)
  const hasFamily = toks.some((t) => _ACTUATOR_VALVE_FAMILY.has(t))
  const rest = [...new Set(toks.filter((t) => !_ACTUATOR_VALVE_FAMILY.has(t)))].sort()
  const base = hasFamily ? `valve:${rest.join(',')}` : `plain:${[...new Set(toks)].sort().join(',')}`
  return `${base}#${wordQuantity(word)}`
}

// A MOTOR DRIVE slot — VFD / variable-speed/-frequency drive / soft-starter / inverter drive / motor
// starter — is power electronics SIZED TO A SPECIFIC MOTOR (the frame is chosen from the driven motor's
// kW / full-load current), so it must NOT be pinned by a loose name-token DB match: that match has no
// knowledge of the motor it serves and WILL mis-size. A DB 'ABB ACS580-01-12A6-4' (12.6 A ≈ 5.5 kW) was
// pinned onto a 'Vfd Controller' whose plant runs a 15 kW irrigation pump + 8 kW dosing pumps — the
// physics-critic HIGH ("severely undersized, will trip under load"). Keep the engine's honest generic
// spec ("VFD — frame sized to the driven motor at detailed design") instead of a known-undersized MPN.
// EXCLUDES non-motor "drive" senses (disk / belt / chain / gear / direct-drive). UNIVERSAL — no table.
export function isMotorDriveSlot(name: string): boolean {
  const n = (name || '').toLowerCase()
  if (/\b(disk|hard|thumb|belt|chain|gear|direct[- ]?)\s*drive\b/.test(n)) return false
  return /\bvfd\b|\bvsd\b|variable[- ]?(?:speed|frequency)[- ]?(?:drive|controller)|soft[- ]?start\w*|motor starter|frequency converter|inverter drive/.test(n)
}

// ── DUTY-AWARE motor-drive pin (Bar B, 2026-07-03) ───────────────────────────
// The blanket isMotorDriveSlot refusal contradicted the engine's own data: the
// contract DOES carry the driven motor's kW on the drive word itself
// (rating_primary, lineage from the pump words — 'drive-train rating reconciled
// to the driven machine'). When that duty is resolvable we CAN size the drive:
// query the DB for a VFD/starter in the duty's kW band and pin it with the basis
// 'sized to driven motor N kW'. Only when NO duty is resolvable does the slot
// stay an honest generic TBD. The original mis-size family (ABB ACS580 5.5 kW on
// a 15 kW pump) stays refused — an out-of-band rating never pins.

/** The drive word's own driven-motor duty in kW (rating_primary), else null. */
export function wordMotorDriveDutyKw(w: WordLike): number | null {
  for (const mc of w.modifier_characters ?? []) {
    if (mc.kind !== 'rating_primary') continue
    if (!/\bkw\b/i.test(`${String(mc.value ?? '')} ${String(mc.unit ?? '')}`)) continue
    const v = parseFloat(String(mc.value).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
}

/** A DB part's power rating (kW) parsed from its name/spec text, else null. */
export function partPowerRatingKw(p: { part_name?: string | null; raw_excerpt?: string | null }): number | null {
  const hay = `${p.part_name ?? ''} ${p.raw_excerpt ?? ''}`
  const m = hay.match(/(\d+(?:\.\d+)?)\s*kW\b/i)
  return m ? parseFloat(m[1]) : null
}

/**
 * Is a candidate drive's rating acceptable for a driven-motor duty? In-band =
 * [0.85×, 3×] the duty: ≥0.85× tolerates IEC-frame rounding (a 4 kW drive on a
 * 4.2 kW nameplate the contract itself rounded), ≤3× refuses a grossly-oversized
 * frame. An undersized drive (the ACS580 5.5 kW on 15 kW — trips under load)
 * NEVER passes. Pure — proveCatch in emitter-mispin-selftest both directions.
 */
export function motorDriveRatingAcceptable(dutyKw: number, ratingKw: number | null): boolean {
  if (ratingKw === null || !Number.isFinite(dutyKw) || dutyKw <= 0) return false
  return ratingKw >= dutyKw * 0.85 && ratingKw <= dutyKw * 3
}

const _DRIVE_FAMILY_SQL_LIKES = [
  '%vfd%', '%variable frequency%', '%variable-frequency%',
  '%variable speed%', '%variable-speed%', '%soft start%', '%soft-start%',
  '%motor starter%', '%frequency converter%', '%inverter drive%',
]

/**
 * DB-first lookup DEDICATED to motor drives: candidates must advertise a drive
 * family in their name AND carry a parseable kW rating INSIDE the duty band.
 * Among in-band rows, the smallest rating ≥ duty wins (the next frame up — real
 * drive selection); rows below duty (≥0.85×, frame-rounding) only win when no
 * row clears the duty. Verified class ingest rows are served first by the same
 * ORDER BY as dbFirstLookup. Returns null when nothing is in band — the slot
 * stays an honest generic TBD (never a mis-size).
 */
// Drive SUBFAMILY coherence: a 'Variable-Speed Drive' word wants a VFD/VSD row,
// never a (thermal-magnetic) motor starter/circuit breaker — the GV2ME22 (a
// TeSys motor circuit breaker whose text carries '11 kW @ 400 V') otherwise
// wins an 11 kW VSD slot on exact-kW proximity. A 'Motor Starter' / 'Soft
// Starter' word conversely wants a starter row, not a VFD.
const _VFD_ROW_RE = /\bvfd\b|\bvsd\b|variable[- ]?(?:speed|frequency)|frequency converter|inverter drive|sinamics|micro ?drive|machinery drive/i
const _STARTER_ROW_RE = /\bstarter\b|soft[- ]?start/i

export function dbFirstMotorDriveLookup(
  db: Database.Database | null,
  dutyKw: number,
  wordName = '',
): DbPart | null {
  if (!db || !Number.isFinite(dutyKw) || dutyKw <= 0) return null
  const n = (wordName || '').toLowerCase()
  const wantsVfd = /\bvfd\b|\bvsd\b|variable|frequency|inverter/.test(n)
  const wantsStarter = !wantsVfd && /soft[- ]?start|starter/.test(n)
  let rows: DbPart[]
  try {
    const stmt = db.prepare(`
      SELECT part_name, manufacturer, part_number, component_class, unit_price_gbp,
             raw_excerpt, confidence, discovery_source
      FROM pretraining_extracted_parts
      WHERE manufacturer IS NOT NULL AND manufacturer != ''
        AND part_number IS NOT NULL AND length(part_number) >= 4
        AND (${_DRIVE_FAMILY_SQL_LIKES.map(() => 'LOWER(part_name) LIKE ?').join(' OR ')})
      ORDER BY (CASE WHEN discovery_source = 'web_verified_ingest'
                      AND IFNULL(confidence, 0) >= 0.9 THEN 1 ELSE 0 END) DESC,
               IFNULL(confidence, 0) DESC, id DESC
      LIMIT 200
    `)
    rows = stmt.all(..._DRIVE_FAMILY_SQL_LIKES) as DbPart[]
  } catch {
    return null
  }
  let best: { row: DbPart; rating: number } | null = null
  for (const r of rows) {
    // Subfamily coherence (see _VFD_ROW_RE above): judged on the LEAD family
    // phrase of the part name, same discipline as dbHitAcceptableForWord.
    const lead = partNameLeadSegment(r.part_name, 10)
    if (wantsVfd && !_VFD_ROW_RE.test(lead)) continue
    if (wantsStarter && !_STARTER_ROW_RE.test(lead)) continue
    // A soft-starter/overload row rated in A only (no kW) never pins here —
    // amps-to-kW needs a voltage assumption this function refuses to make.
    const rating = partPowerRatingKw(r)
    if (!motorDriveRatingAcceptable(dutyKw, rating)) continue
    if (!best) { best = { row: r, rating: rating! }; continue }
    const bestClears = best.rating >= dutyKw
    const candClears = rating! >= dutyKw
    if (candClears && !bestClears) best = { row: r, rating: rating! }
    else if (candClears === bestClears && Math.abs(rating! - dutyKw) < Math.abs(best.rating - dutyKw)) {
      best = { row: r, rating: rating! }
    }
  }
  return best?.row ?? null
}

// A BOARD-MOUNT / PCB SENSOR — a surface-mount component (Honeywell HSC/SSC/ABP/MPR/TBP/NBP/RSC/DLC/DLV
// TruStability series, TE MS5xxx, Amphenol ELVH, Bosch BMP/BMA, ST LPS) costing ~£10-50 — pinned to a
// PROCESS FIELD instrument / switch / transmitter / gauge slot (a panel/field device costing ~£200-600)
// is a wrong-FORM mis-pin: a loose token match ('pressure'/'sensor'/'switch') lands a bare PCB chip on a
// field device. The MANUFACTURER alone cannot catch it — Honeywell makes BOTH the chip AND legitimate
// field DP switches — so this keys on the board-mount-sensor MPN PATTERN. A Honeywell HSCDLNN100MDSA5
// (£39 board sensor) was pinned on a 'Differential-Pressure Switch' and rendered at £420 → gate-21 fired
// (10.7× over the chip's real price). Reject the pin → keep the generic field-device spec. UNIVERSAL —
// keyed on the field-instrument slot vocabulary + the board-sensor MPN family, no class table.
const _BOARD_MOUNT_SENSOR_MPN_RE =
  /^(?:HSC|SSC|ABP|MPR|TBP|NBP|RSC|DLC|DLV|DLLR)[A-Z]|^MS5\d{3}\b|^ELVH[-A-Z]|^BM[AP]\d|^LPS\d/i
export function isBoardMountSensorMispin(name: string, partNumber: string): boolean {
  if (!_PROCESS_FIELD_INSTRUMENT_RE.test(name || '')) return false
  return _BOARD_MOUNT_SENSOR_MPN_RE.test((partNumber || '').trim())
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

/**
 * Classify a DB-open failure as a native-module ABI mismatch (better-sqlite3
 * compiled for a different Node major — the dlopen failure you get running the
 * chain under system Node 25 when node_modules was built under Node 22).
 * Exported for the proveCatch: a wrong-ABI error MUST be recognised so the
 * guard below can shout instead of silently returning a NULL DB (0 fills, no
 * error — the routed residual this fixes).
 */
export function isNodeAbiMismatchError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null
  const msg = String(e?.message ?? err ?? '')
  return (
    e?.code === 'ERR_DLOPEN_FAILED' ||
    /ERR_DLOPEN_FAILED/.test(msg) ||
    /NODE_MODULE_VERSION/.test(msg) ||
    /was compiled against a different Node\.js version/i.test(msg) ||
    /did not self-register/i.test(msg)
  )
}

/** One-line operator-facing description of the ABI failure (names the running
 *  Node + the fix). Pure — unit-testable without a real dlopen failure. */
export function describeNodeAbiMismatch(err: unknown, nodeVersion: string = process.version): string {
  const msg = String((err as { message?: string })?.message ?? err ?? '').split('\n')[0]
  return (
    `[emitter-completion] better-sqlite3 failed to load under Node ${nodeVersion} ` +
    `(native-module ABI mismatch: ${msg.slice(0, 160)}). The parts library is ` +
    `UNAVAILABLE this run — every DB-first lookup will miss (0 fills) and the ` +
    `growing-DB loop is dead. Fix: run under Node 22 (nvm use 22 / ` +
    `/opt/homebrew/opt/node@22/bin) or rebuild the module for this Node ` +
    `(npm rebuild better-sqlite3).`
  )
}

// Warn ONCE per process (per failure family) — openLibraryDb is called per
// lookup path; a per-call warning would spam the chain log without adding
// information.
let _abiWarned = false
let _openWarned = false

function openLibraryDb(dbPath: string): Database.Database | null {
  try {
    if (!existsSync(dbPath)) return null
    const db = new Database(dbPath, { readonly: true })
    db.pragma('busy_timeout = 2000')
    return db
  } catch (err) {
    // FAIL-SOFT stays (a chain run must not crash for a missing library), but a
    // wrong-ABI Node must be LOUD: silently swallowing the dlopen failure gave
    // a NULL DB → 0 DB-first fills → no error anywhere (routed residual,
    // commit e74d4502e). Name the Node version + the fix on stderr.
    if (isNodeAbiMismatchError(err)) {
      if (!_abiWarned) {
        _abiWarned = true
        console.error(describeNodeAbiMismatch(err))
      }
    } else if (!_openWarned) {
      // Any other open failure is also worth one line — a corrupt/locked DB
      // silently degrading to "no fills" is the same invisible-failure family.
      _openWarned = true
      console.error(
        `[emitter-completion] library DB open failed (${String((err as Error)?.message ?? err).slice(0, 160)}) — ` +
        `DB-first lookups will miss this run (fail-soft).`,
      )
    }
    return null
  }
}

// Whole-word membership: does `token` appear as a standalone word in `hay`
// (word boundaries), NOT merely as a substring? "tower" must NOT match
// "uniTOWER"; "rotor" must NOT match an incidental "Rotor 17mm" mention unless
// it is a genuine word. Word-boundary matching kills the substring false-
// positives that the first cut produced.
function hasWholeWord(hay: string, token: string): boolean {
  // 2-char engineering nouns (UV / RO / pH) are real distinguishing tokens —
  // everything else under 3 chars stays banned (substring-noise discipline).
  if (token.length < 3 && !SHORT_DOMAIN_TOKENS.has(token.toLowerCase())) return false
  // Escape regex metachars in token (tokens are alnum so this is belt+braces).
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i').test(hay)
}

/** Plural-tolerant whole-word membership: 'valve' matches 'Valves', 'switch'
 *  matches 'switches' — BOTH sides folded (the Bar-A stem discipline). */
export function hasWholeWordFolded(hay: string, token: string): boolean {
  if (hasWholeWord(hay, token)) return true
  const folded = foldPluralToken(token)
  if (folded !== token && hasWholeWord(hay, folded)) return true
  // Fold the HAY side too: split, fold each token, retest.
  const foldedHay = String(hay ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(foldPluralToken)
    .join(' ')
  return hasWholeWord(foldedHay, folded)
}

/** True for a CLASS-TAGGED verified-ingest DB row (the deliberate per-class
 *  harvest — rounds 1+2). Used as the tie-break signal in candidate ranking. */
export function isVerifiedIngestRow(p: Pick<DbPart, 'confidence' | 'discovery_source'>): boolean {
  return (p.discovery_source ?? '') === 'web_verified_ingest' && (p.confidence ?? 0) >= 0.9
}

// HEAD-NOUN synonym families for type-coherence: a word's component family may
// be written differently in the catalogue row ('Emergency Stop Button' ↔ Eaton's
// 'safety mushroom PUSHBUTTON ... switch station'). DELIBERATELY tiny — only
// true same-family synonyms; 'transmitter' is NEVER a synonym of 'switch'
// (proveCatch: a pressure transmitter must not join a pressure switch).
const HEAD_NOUN_SYNONYMS: Record<string, string[]> = {
  button: ['switch', 'pushbutton'],
  pushbutton: ['button', 'switch'],
  analyser: ['analyzer'],
  analyzer: ['analyser'],
  vsd: ['vfd', 'drive'],
  vfd: ['vsd', 'drive'],
  genset: ['generator'],
  touchscreen: ['hmi'],   // an industrial 'HMI Touchscreen' word ↔ an 'HMI Displays & Panel PCs …' catalogue family
  hmi: ['touchscreen'],
}

/** Does the candidate hay contain the word's HEAD NOUN (fold- and
 *  synonym-tolerant)? The type-coherence primitive (gate-15 spirit). */
export function headNounHit(hay: string, headNoun: string): boolean {
  const head = foldPluralToken(headNoun)
  if (hasWholeWordFolded(hay, head)) return true
  return (HEAD_NOUN_SYNONYMS[head] ?? []).some((syn) => hasWholeWordFolded(hay, syn))
}

/**
 * The LEADING FAMILY SEGMENT of a catalogue part name — its first few tokens.
 * Distributor + ingest rows both LEAD with the component family ('Board Mount
 * Pressure Sensors …', 'Variable Frequency Drives - VFDs …', 'Pressure
 * transmitter — 0-7 bar …'); incidental mentions of OTHER families live in the
 * spec tail ('…24 VDC power input (terminal block connector)' on a panel PC,
 * '…exchangeable connectors' on a flow sensor, '…remote monitoring and control'
 * on a smart-home valve — each a REAL v59 dry-run mis-pin). Type coherence is
 * therefore judged against the lead segment, never the tail.
 */
export function partNameLeadSegment(partName: string | null | undefined, nTokens = 6): string {
  return String(partName ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .slice(0, nTokens)
    .join(' ')
}

/** An ACCESSORY catalogue row ('Circuit Breaker Accessories …', '… Accessory,
 *  REX12 …') must never pin a PRIMARY-equipment word that did not ask for an
 *  accessory. */
export function isAccessoryRow(partName: string | null | undefined): boolean {
  return /\baccessor(?:y|ies)\b/i.test(partNameLeadSegment(partName, 8))
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
export interface DbFirstLookupOpts {
  excludeMakerVendors?: boolean
  /**
   * EXCLUSIVE ASSIGNMENT (2026-07-04, the TDS-vs-conductivity shadowing fix): keys
   * (`manufacturer|part_number`, case-insensitive) to remove from ranking ENTIRELY —
   * not merely from winning. Two real DB rows can shadow each other when a common
   * candidate mentions BOTH families in its own text (an E+H CLS15D listed as
   * "Conductivity / TDS sensor" ranks #1 for both a 'Conductivity Sensor' word AND a
   * distinct 'TDS Sensor' word, permanently hiding the genuinely-distinct Myron L TDS
   * row). Passing the already-claimed keys here lets the SECOND word's query see the
   * candidate pool with the claim already removed, so the next real match — not a
   * fallback GENERATE guess — wins.
   */
  excludeKeys?: Set<string>
}

/**
 * Pure ranking core of dbFirstLookup — given the pre-fetched candidate ROWS (the union
 * of the per-token SQL results), pick the single best-ranked, ACCEPTED row. Extracted
 * from dbFirstLookup (2026-07-04) so the exclusive-assignment retry — and its proveCatch
 * — can drive the exact ranking/acceptance logic with a handful of fixture rows, with no
 * sqlite dependency. Behaviour-preserving: a row appearing more than once (fetched under
 * multiple tokens) collapses to its single best nameHits count, identical to the prior
 * incremental `seen` map (nameHits is a pure function of the row + the full token list,
 * so which query round found the row never changes its score).
 */
export function pickBestDbCandidate(
  rows: DbPart[],
  specificTokens: string[],
  headNoun: string | string[] | null,
  opts: DbFirstLookupOpts = {},
): DbPart | null {
  // ALIAS HEAD NOUNS (2026-07-05): a word may carry >1 legitimate family noun — its
  // primary requirement name's head ('electrode') and an alias's ('rod') — and a
  // catalogue row can be genuinely typed under EITHER vocabulary ('Earth rod — ABB
  // Furse RC012 …' heads with 'rod', not 'electrode'). Accepting an ARRAY here (a
  // single string still works — existing callers untouched) fixes the RANKING, not
  // just the later per-word acceptance check: without this, a stray higher-ranked
  // WRONG-CLASS row that merely happens to head-match the PRIMARY noun (a
  // wind-turbine-completion hallucinated 'Copper-Bonded Grounding Electrode' heading
  // with 'electrode') could out-rank the correct, web-verified row before either
  // name's acceptance check even runs (the v79 earth-rod near-miss).
  const headNouns = (Array.isArray(headNoun) ? headNoun : [headNoun]).filter(
    (h): h is string => !!h,
  )
  const isHeavy = specificTokens.some((t) => HEAVY_INDUSTRIAL_TOKENS.has(t))
  const seen = new Map<string, { row: DbPart; nameHits: Set<string>; headHit: boolean }>()

  for (const r of rows) {
    const key = `${r.manufacturer}|${r.part_number}`
    if (opts.excludeKeys?.has(key.toLowerCase())) continue
    // PER-WORD path (2026-07-03): a maker/hobby vendor can NEVER pass the
    // per-word acceptance (dbHitAcceptableForWord refuses them outright), so
    // letting one win the single-winner rank is a guaranteed silent miss —
    // a Kratos e-stop shaded the verified Eaton safety station on a
    // component_class 4th hit. Exclude them from ranking for that caller.
    if (opts.excludeMakerVendors && MAKER_VENDORS.has((r.manufacturer ?? '').trim().toLowerCase())) continue
    // Whole-word hits across BOTH part_name and component_class (fold-tolerant,
    // so the folded token 'valve' still hits a catalogue 'Valves' row).
    const hay = `${(r.part_name ?? '')} ${(r.component_class ?? '')}`.toLowerCase()
    const nameHits = new Set<string>()
    for (const t of specificTokens) if (hasWholeWordFolded(hay, t)) nameHits.add(t)
    // HEAD HIT = ANY of the head nouns in the LEADING FAMILY SEGMENT of the part name
    // (type coherence, 2026-07-03; alias-widened 2026-07-05) — an incidental tail
    // mention ('…terminal block connector' on a panel PC) is NOT a family match.
    const lead = partNameLeadSegment(r.part_name)
    const headHit = headNouns.some((h) => headNounHit(lead, h))
    const prev = seen.get(key)
    if (!prev || nameHits.size > prev.nameHits.size) {
      seen.set(key, { row: r, nameHits, headHit })
    }
  }

  if (seen.size === 0) return null

  // Rank: head-noun (family) hits first, then non-accessory over accessory, then
  // total distinct hits; on a FULL tie a class-tagged verified-ingest row
  // outranks a distributor-sweep row (the saturation fix's in-memory leg — same
  // signal as the SQL window ordering).
  const rankOf = (v: { row: DbPart; nameHits: Set<string>; headHit: boolean }): number[] => [
    v.headHit ? 1 : 0,
    isAccessoryRow(v.row.part_name) ? 0 : 1,
    v.nameHits.size,
    // Below equal hits: a non-maker vendor outranks a maker/hobby vendor (a
    // Kratos e-stop must not shade the Eaton safety station on a tie — the
    // per-word acceptance refuses maker vendors outright, so letting one win
    // the rank is a guaranteed silent miss), then verified class ingest.
    MAKER_VENDORS.has(v.row.manufacturer.trim().toLowerCase()) ? 0 : 1,
    isVerifiedIngestRow(v.row) ? 1 : 0,
  ]
  let best: { row: DbPart; nameHits: Set<string>; headHit: boolean } | null = null
  for (const v of seen.values()) {
    if (!best) { best = v; continue }
    const a = rankOf(v)
    const b = rankOf(best)
    for (let i = 0; i < a.length; i++) {
      if (a[i] > b[i]) { best = v; break }
      if (a[i] < b[i]) break
    }
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

export function dbFirstLookup(
  db: Database.Database | null,
  tokens: string[],
  headNoun: string | string[] | null,
  opts: DbFirstLookupOpts = {},
): DbPart | null {
  if (!db || tokens.length === 0) return null

  const specificTokens = [...new Set(tokens)].slice(0, 8)

  let stmt: Database.Statement
  try {
    // DETERMINISTIC ORDER (2026-07-03, routed residual commit e74d4502e): the
    // per-token LIMIT 60 previously ran with NO ORDER BY, so SQLite returned
    // rowid (insertion) order — on a common token ('drive' = 778 rows) the 60-row
    // window was locked to the OLDEST ingested rows and a newly-ingested,
    // high-confidence row was permanently UNREACHABLE (the growing-DB loop wrote
    // rows the read side could never serve). Order by verified confidence first,
    // then NEWEST id, so fresh verified ingest displaces stale low-confidence
    // rows inside the window. IFNULL(confidence,0): a NULL-confidence legacy row
    // ranks below any scored row but stays reachable on sparse tokens.
    // SATURATION FIX (2026-07-03): the 60-row per-token window ordered by bare
    // confidence let the 36k-row distributor sweep (conf 0.9-1.0) saturate a
    // common token and lock out the 33 CLASS-TAGGED verified-ingest rows (conf
    // 0.9) harvested FOR this plant — verified-ingest rows now enter the window
    // FIRST, then confidence, then newest.
    stmt = db.prepare(`
      SELECT part_name, manufacturer, part_number, component_class, unit_price_gbp,
             raw_excerpt, confidence, discovery_source
      FROM pretraining_extracted_parts
      WHERE manufacturer IS NOT NULL AND manufacturer != ''
        AND part_number IS NOT NULL AND length(part_number) >= 4
        AND (LOWER(part_name) LIKE '%' || ? || '%'
             OR LOWER(IFNULL(component_class,'')) LIKE '%' || ? || '%')
      ORDER BY (CASE WHEN discovery_source = 'web_verified_ingest'
                      AND IFNULL(confidence, 0) >= 0.9 THEN 1 ELSE 0 END) DESC,
               IFNULL(confidence, 0) DESC, id DESC
      LIMIT 60
    `)
  } catch {
    return null
  }

  const rows: DbPart[] = []
  for (const tok of specificTokens) {
    try {
      rows.push(...(stmt.all(tok, tok) as DbPart[]))
    } catch {
      continue
    }
  }

  return pickBestDbCandidate(rows, specificTokens, headNoun, opts)
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
// RATING-COHERENCE (2026-07-10, run-30: 'Bidirectional PCS Inverter · 11.04 kW' was
// DB-filled with the Sungrow SC2000UD-MV — a 2 MW MEDIUM-VOLTAGE utility PCS. Type
// coherence passed (both are PCS), SCALE did not: the pin then drags utility dims +
// price into the cabinet). When the WORD's own name declares a power rating, a
// candidate whose name/model declares one >5× larger — or carries an MV/kV class
// token against a sub-100 kW word — is the wrong-scale product line. Words with no
// self-declared rating are unchanged (no fabricated inference).
const _WORD_KW_RE = /(\d+(?:\.\d+)?)\s*(mw|mva|kw|kva)\b/i
function _declaredKw(text: string): number | null {
  const m = _WORD_KW_RE.exec(text || '')
  if (!m) return null
  const v = parseFloat(m[1])
  return /^m/i.test(m[2]) ? v * 1000 : v
}
export function dbHitScaleAcceptable(dbHit: DbPart, wordName: string): boolean {
  const wordKw = _declaredKw(wordName)
  if (wordKw == null || wordKw <= 0) return true
  const blob = `${dbHit.part_name ?? ''} ${dbHit.part_number ?? ''}`
  const hitKw = _declaredKw(blob)
  if (hitKw != null && hitKw > wordKw * 5) return false
  if (wordKw < 100 && /-mv\b|\bmv\b|medium[\s-]?voltage|\b(?:11|33)\s*kv\b/i.test(blob)) return false
  return true
}

export function dbHitAcceptableForWord(dbHit: DbPart, name: string): boolean {
  if (!dbHitScaleAcceptable(dbHit, name)) return false
  const mfr = dbHit.manufacturer.trim().toLowerCase()
  if (MAKER_VENDORS.has(mfr)) return false
  const toks = tokenize(name)
  const cls = (dbHit.component_class ?? '').toLowerCase()
  const MOTION = new Set(['motor', 'servo', 'actuator', 'drive', 'esc', 'speed', 'propeller', 'propulsion', 'thruster'])
  const SENSE = new Set(['sensor', 'imu', 'gyro', 'gyroscope', 'accelerometer', 'magnetometer', 'thermocouple', 'altimeter', 'encoder', 'pitot'])
  if (toks.some((t) => MOTION.has(t)) && cls && !/motor_actuator|mechanical_assembly/.test(cls)) return false
  if (toks.some((t) => SENSE.has(t)) && cls && !/sensor|optical/.test(cls)) return false
  // TYPE-COHERENCE (2026-07-03, gate-15 spirit): the word's HEAD NOUN — its
  // component FAMILY, the LAST distinguishing token — must appear in the
  // candidate's LEADING FAMILY SEGMENT (fold/synonym-tolerant). The previous
  // any-of-last-3-anywhere rule let a QUALIFIER carry the match: 'Fertigation
  // Dosing Pump' accepted the Hoogendoorn iSii process COMPUTER on the token
  // 'fertigation' (an lm-only verifier then rubber-stamped it — the part exists,
  // just not as a pump); a panel PC whose spec tail says '(terminal block
  // connector)' matched 'Terminal Blocks'. A candidate whose FAMILY mismatches
  // the head noun is refused; the honest generic spec (or the type-correct row,
  // e.g. the Grundfos fertigation dosing PUMP) wins. An ACCESSORY row never pins
  // a word that did not ask for an accessory.
  if (isAccessoryRow(dbHit.part_name) && !/\baccessor/i.test(name || '')) return false
  const lead = partNameLeadSegment(dbHit.part_name, 6)
  const headTok = toks[toks.length - 1]
  if (headTok && !headNounHit(lead, headTok)) return false
  // QUALIFIER COHERENCE (2026-07-03): a multi-token word must ALSO share ≥1
  // NON-HEAD qualifier with the candidate's family phrase — a generic head noun
  // alone ('element', 'block', 'connector') cross-pins domains (a pneumatic
  // logic ELEMENT on 'Filter Media / Membrane Elements'; an electrical circular
  // CONNECTOR on 'Hydraulic Connectors'; a fuse BLOCK on 'Terminal Blocks' — all
  // real v59 dry-run mis-pins). A single-token word ('sensor', 'connector')
  // passes on its head alone (nothing more to require).
  if (toks.length >= 2) {
    const quals = toks.slice(0, -1)
    const qualHit = quals.some((t) =>
      hasWholeWordFolded(lead, t) ||
      // A word token naming the candidate's MANUFACTURER is a strong coherence
      // signal ('Siemens S7 1200 PLC' ↔ manufacturer Siemens) …
      hasWholeWordFolded(dbHit.manufacturer ?? '', t) ||
      // … and a MODEL-designator token (carries a digit: 's7', '1200') may hit
      // the FULL part name — model numbers legitimately live in the spec tail
      // ('SIMATIC S7-1200 CPU 1212C'), unlike generic family nouns whose tail
      // mentions are exactly the mis-pin vector this guard exists to refuse.
      (/\d/.test(t) && hasWholeWordFolded(dbHit.part_name ?? '', t)))
    if (!qualHit) return false
  }
  return true
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
        // UNTETHERED ACCESSORY VALVE (see the block above isCommodityProcessValve):
        // a commodity valve minted here must be tethered to a real principal-
        // equipment sibling in THIS sub_module, or not emitted at all.
        if (isCommodityProcessValve(word.name_human ?? '')) {
          const tether = tetherOrSuppressAccessoryValve(word, sub)
          if (tether.verdict === 'suppress') {
            log(
              `[emitter-completion]   ⊘ suppress ${key}: untethered accessory valve gap — ` +
              `no principal-equipment sibling in this sub_module to host it (declined DB hit ` +
              `${dbHit.manufacturer} ${dbHit.part_number}); the plant's real valves are already ` +
              `counted in the zoned-distribution kits + process schedule`,
            )
            continue // leave this gap unfilled — never emit an untethered accessory valve
          }
          log(`[emitter-completion]   ✓ DB   ${key} → ${dbHit.manufacturer} ${dbHit.part_number} [tethered to '${tether.hostName}']`)
        } else {
          log(`[emitter-completion]   ✓ DB   ${key} → ${dbHit.manufacturer} ${dbHit.part_number}`)
        }
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
      // UNTETHERED ACCESSORY VALVE — same rule as the DB-first branch above: a
      // generated commodity valve must be tethered to a real principal-equipment
      // sibling, or it is not emitted.
      if (isCommodityProcessValve(word.name_human ?? '')) {
        const tether = tetherOrSuppressAccessoryValve(word, sub)
        if (tether.verdict === 'suppress') {
          log(
            `[emitter-completion]   ⊘ suppress ${key}: untethered accessory valve gap — ` +
            `no principal-equipment sibling in this sub_module to host it (declined generated ` +
            `${emittedMfr}); the plant's real valves are already counted in the zoned-distribution ` +
            `kits + process schedule`,
          )
          continue // leave this gap unfilled — never emit an untethered accessory valve
        }
        log(
          `[emitter-completion]   ✓ GEN  ${key} → ${emittedMfr} [tethered to '${tether.hostName}'] ` +
          `[MPN deferred${realMpnFromLlm ? `; LLM suggested "${realMpnFromLlm}" stored in DB` : ''}]`,
        )
      } else {
        log(
          `[emitter-completion]   ✓ GEN  ${key} → ${emittedMfr} ` +
          `[MPN deferred${realMpnFromLlm ? `; LLM suggested "${realMpnFromLlm}" stored in DB` : ''}]`,
        )
      }
      ;(sub.words ??= []).push(word)
      mutated = true
      filled.push({
        module_id: gap.module_id,
        sub_module_id: gap.sub_module_id,
        source: 'generated',
        manufacturer: emittedMfr,
        part_number: emittedMpn,
        name: word.name_human ?? humanName,
      })
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
  //
  // ALIAS RESOLUTION (2026-07-05, the bess-campaign-v11 Part-names 8.7 fix): `name_human`
  // and `content_character.name_human` are TWO independent authored surfaces for the SAME
  // word — a BoM-facing requirement name ('earth rod', 'smoke detector sounder') and a
  // content-character alias ('driven earth electrode', 'fire alarm sounder-beacon'). The
  // catalogue-component gate below used to pick ONE via `||` (content_character.name_human
  // first) and classify ONLY that string — so a word whose ALIAS happened to carry none of
  // the lexicon's catalogue signal (no 'rod'/'detector' token — 'driven earth electrode' /
  // 'fire alarm sounder-beacon') was wrongly bucketed `skippedStructural` and NEVER reached
  // DB-first/generate at all, even though its OWN requirement name ('earth rod', 'smoke
  // detector sounder') is squarely catalogue (X-32, I-15's true root cause — not a DB/LLM
  // failure, a classification skip upstream of either). Fix: gate on the UNION of BOTH
  // names (isCatalogueComponent(A) OR isCatalogueComponent(B)) and carry the alias forward
  // so its tokens/head-noun also inform the DB search below — universal, bounded, changes
  // nothing about `cand.name` itself (every existing downstream consumer is untouched).
  interface Candidate { module: DesignModuleLike; sub: SubModuleLike; word: WordLike; name: string; aliasName: string | null; subId: string; moduleId: string }
  const candidates: Candidate[] = []
  let skippedStructural = 0
  for (const m of safeModules) {
    const moduleId = String(m?.module ?? 'unknown_module')
    for (const sm of Array.isArray(m?.sub_modules) ? m.sub_modules! : []) {
      const subId = String(sm?.id ?? 'unknown_sub_module')
      for (const w of Array.isArray(sm?.words) ? sm.words! : []) {
        const pn = (w.modifier_characters ?? []).find((mc) => mc.kind === 'part_number')?.value
        if ((w as { mis_emission_note?: string }).mis_emission_note) continue // demoted scope note — never pin a part on it (run-36: Daikin HX pinned on a demoted liquid-cooling word)
        if (!isBlankOrPlaceholderMpn(pn)) continue // already has a real MPN — leave it
        const name = w.content_character?.name_human || w.name_human || w.content_character?.character_id || subId
        const otherName = w.name_human || w.content_character?.name_human || null
        const aliasName = otherName && otherName !== name ? otherName : null
        if (!isCatalogueComponentByEitherName(name, aliasName, subId)) { skippedStructural++; continue }
        candidates.push({ module: m, sub: sm, word: w, name, aliasName, subId, moduleId })
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
  // DUPLICATE-REPRESENTATIVE-POPULATION fold (see _representativeDuplicateKey above) —
  // keyed by sub_module id, so a legitimate same-named population in a DIFFERENT
  // sub_module is never touched.
  const representativeSeenInSub = new Map<string, Set<string>>()

  try {
    for (const cand of candidates) {
      // A generic-representative filler ("<name> — representative <module> component")
      // that folds to a population key ALREADY minted by an earlier word in this SAME
      // sub_module is the same undifferentiated count restated under a plural or
      // actuator/valve synonym — remove it before it can be independently DB-matched
      // and double/triple-priced + double/triple-listed. Real hand-authored words
      // (BESS/SAF's actuated valves) never carry this stamp and are unaffected.
      if (isGenericRepresentativeFiller(cand.word)) {
        const key = representativeDuplicateKey(cand.word, cand.name)
        let seen = representativeSeenInSub.get(cand.subId)
        if (!seen) { seen = new Set<string>(); representativeSeenInSub.set(cand.subId, seen) }
        if (seen.has(key)) {
          removeWordFromSub(cand.sub, cand.word)
          mutated = true
          log(
            `[fill-blank-mpn]   ⊘ fold ${cand.moduleId}::${cand.subId} (${cand.name}): ` +
            `duplicate representative population (key ${key}) already counted by an ` +
            `earlier filler in this sub_module — removed, never re-priced/re-listed`,
          )
          continue
        }
        seen.add(key)
      }
      // TOKEN PRIORITY (2026-07-03, Bar A): the WORD'S OWN tokens lead the query
      // list — dbFirstLookup slices the first 8, and with subId first a long
      // module path ('mass_fluid_transport_process__ro_membrane_elements')
      // crowded the word's actual component nouns ('pump') out of the window.
      // ALIAS TOKENS (2026-07-05): the alias name's tokens ride the SAME window — a
      // catalogue row indexed under the alias vocabulary ('driven earth electrode',
      // 'sounder-beacon') is otherwise unreachable even though the word passed the
      // catalogue gate on its alias (see the candidate-collection comment above).
      const tokens = new Set<string>([
        ...tokenize(cand.name),
        ...tokenize(cand.aliasName),
        ...tokenize(cand.word.content_character?.character_id),
        ...tokenize(cand.subId),
      ])
      const tokenList = [...tokens]
      // Head noun = the component FAMILY = the LAST distinguishing token of the
      // natural-language name ('Fertigation Dosing Pump' → 'pump'), matching the
      // dbHitAcceptableForWord type-coherence bar. The old FIRST-token head
      // ('fertigation') let a qualifier outrank the family (the iSii mis-pin).
      const nameToks = tokenize(cand.name)
      const subToks = tokenize(cand.subId)
      const headNoun = nameToks[nameToks.length - 1] ?? subToks[subToks.length - 1] ?? null
      // ALIAS HEAD NOUN (2026-07-05): a fallback family noun from the alias name — tried
      // ONLY when the primary head noun's DB lookup misses (below), never in place of it,
      // so an alias never outranks the word's own authored requirement identity.
      const aliasToks = cand.aliasName ? tokenize(cand.aliasName) : []
      const aliasHeadNoun = aliasToks.length ? (aliasToks[aliasToks.length - 1] ?? null) : null

      // MOTOR-DRIVE, DUTY-AWARE (2026-07-03, Bar B): a VFD/starter is sized to
      // its driven motor. When the word CARRIES that duty (rating_primary kW —
      // lineage from the pump words), pin a DB drive in the kW band with the
      // basis stated; only a duty-less drive slot stays the honest generic TBD.
      // A loose name-token pin is never used here (it mis-sizes — the ACS580 HIGH).
      if (isMotorDriveSlot(cand.name)) {
        const dutyKw = wordMotorDriveDutyKw(cand.word)
        const driveHit = dutyKw ? dbFirstMotorDriveLookup(db, dutyKw, cand.name) : null
        if (dutyKw && driveHit) {
          setWordMpn(cand.word, driveHit.manufacturer, driveHit.part_number, 'db')
          cand.word.source_detail =
            `Discover-on-miss: DB-first library match — sized to driven motor ${dutyKw} kW`
          mutated = true
          filled.push({ module_id: cand.moduleId, sub_module_id: cand.subId, source: 'db', manufacturer: driveHit.manufacturer, part_number: driveHit.part_number, name: cand.name })
          log(`[fill-blank-mpn]   ✓ DB   ${cand.moduleId}::${cand.subId} (${cand.name}) → ${driveHit.manufacturer} ${driveHit.part_number} [sized to driven motor ${dutyKw} kW]`)
        } else {
          log(`[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): motor drive — ${dutyKw ? `no DB drive in the ${dutyKw} kW band` : 'no driven-motor duty resolvable'} — frame sized to the driven motor at detailed design`)
        }
        continue
      }

      // COMMODITY PROCESS VALVE (Tristan 2026-06-27, tether-or-suppress added
      // 2026-07-05): a simple mechanical valve — check / non-return / swing /
      // ball / gate / globe / needle — is specified GENERICALLY at design stage
      // (by size, rating, material: "DN100 PN16 wafer check valve"), NOT by a
      // single MPN. A DB name-token match pins an unreliable part: a Crouzet
      // sub-miniature non-return FLOW SENSOR (81529907) + a 24V DC solenoid
      // (81519648) were pinned onto a process Non-Return / Solenoid Valve in a
      // 90 m³/h plant — right "valve"/"non-return" token, wrong SCALE + vendor
      // (the physics critic's valve HIGHs). Keep the generic spec. NOT applied
      // to an ACTUATED / control / dosing valve (those carry a real MPN — e.g.
      // the brief's Keystone Composeal). UNIVERSAL — keyed on the commodity-
      // valve vocabulary. Hoisted ahead of the DB lookup (2026-07-05) so a
      // commodity valve is ALWAYS routed here regardless of whether a DB hit
      // exists — tether it to a real principal-equipment sibling in this
      // sub_module, or suppress the line entirely (see the block above
      // isCommodityProcessValve for the full rationale).
      if (isCommodityProcessValve(cand.name)) {
        const tether = tetherOrSuppressAccessoryValve(cand.word, cand.sub)
        if (tether.verdict === 'suppress') {
          removeWordFromSub(cand.sub, cand.word)
          mutated = true
          log(
            `[fill-blank-mpn]   ⊘ suppress ${cand.moduleId}::${cand.subId} (${cand.name}): ` +
            `untethered accessory valve — no principal-equipment sibling in this sub_module to ` +
            `host it; the plant's real valves are already counted in the zoned-distribution kits ` +
            `+ process schedule`,
          )
        } else {
          log(
            `[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): commodity ` +
            `process valve — tethered to its host '${tether.hostName}', generic spec ` +
            `(size/rating/material), not a name-matched MPN`,
          )
        }
        continue
      }

      // 1. DB-FIRST — cache-real structured MPN (gate-20-safe). Per-word matching
      //    needs a TIGHTER precision bar than sub_module-gap matching (council
      //    seat 1): a loose token overlap mis-pins (Abracon crystal → "battery
      //    busbar"). Require the word's HEAD NOUN — the component TYPE, which in a
      //    natural-language name is the LAST token (busbar/sensor/controller), not
      //    the first — to appear as a whole word in the candidate, AND never reuse
      //    a part within the sub_module.
      let used = usedInSub.get(cand.subId)
      if (!used) { used = new Set<string>(); usedInSub.set(cand.subId, used) }

      // EXCLUSIVE ASSIGNMENT (2026-07-04, the TDS-vs-conductivity shadowing fix): the
      // initial pick may already be CLAIMED by an earlier word in this sub_module (a
      // real DB row that mentions both families — an E+H CLS15D listed as "Conductivity
      // / TDS sensor" — wins the rank for BOTH a 'Conductivity Sensor' word and a
      // distinct 'TDS Sensor' word). Rather than fall straight to a GENERATE guess the
      // moment the top pick is unavailable, retry ONCE with every key already claimed in
      // this sub_module excluded from ranking entirely — a genuinely distinct DB row (if
      // one exists) wins instead. A single-part run (no collision) never triggers the
      // retry, so behaviour is unchanged outside the shadowing case.
      // ALIAS HEAD NOUNS AT RANKING TIME (2026-07-05): pass BOTH the primary and alias
      // head nouns together (pickBestDbCandidate now accepts an array) rather than
      // retrying sequentially on a null result — a sequential retry only helps when the
      // FIRST attempt finds NOTHING, but the real v79 failure mode was a WRONG top-
      // ranked row winning on the primary noun alone (a stray hallucinated
      // 'wind_turbine_completion' row headed with 'electrode' out-ranked the correct
      // web-verified 'Earth rod' row before either name's acceptance check ever ran).
      // Ranking on the union fixes the ROOT cause; a single-name candidate is
      // unaffected (aliasHeadNoun is null or identical → the array degenerates to one
      // element, byte-identical to the pre-fix ranking).
      const headNounsForRank = aliasHeadNoun && aliasHeadNoun !== headNoun
        ? [headNoun, aliasHeadNoun].filter((h): h is string => !!h)
        : headNoun
      let dbHit = dbFirstLookup(db, tokenList, headNounsForRank, { excludeMakerVendors: true })
      let pinned = false
      let blocked = false // a guard refused the pin outright — never fall through to generate
      let retriesLeft = 4   // walk-down budget: claimed-retry + up to 3 type-coherence walks
      const rejectedRows = new Set<string>()
      while (dbHit && !pinned && !blocked) {
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
          blocked = true
          break
        }
        // (Commodity process valves never reach here — the tether-or-suppress block
        // above owns them entirely, hoisted ahead of this loop so it fires whether
        // or not a DB hit exists.)
        // ELECTRONICS-IC MIS-PIN (Tristan 2026-06-27): a process FIELD instrument / switch must not be
        // pinned to an electronics-component vendor's IC (a Maxim MAX31827A temp-sensor IC landed on a
        // 'Low Pressure Switch' via the loose 'switch' token). The DB is electronics-heavy; a field
        // device needs an industrial instrument (E+H / WIKA / Hach), not a chip. Keep generic. UNIVERSAL.
        if (isElectronicsIcMispin(cand.name, dbHit.manufacturer)) {
          log(`[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): electronics-IC vendor ${dbHit.manufacturer} on a process field instrument — generic spec, not a chip MPN (was ${dbHit.part_number})`)
          blocked = true
          break
        }
        // BOARD-MOUNT-SENSOR MIS-PIN (Tristan 2026-06-29): a process field switch/transmitter must not be
        // pinned to a PCB board-mount sensor CHIP. A Honeywell HSCDLNN100MDSA5 (£39 board sensor) landed
        // on a 'Differential-Pressure Switch' and rendered £420 → gate-21 10.7× FATAL. The manufacturer is
        // legit (Honeywell makes both chip + field DP switch), so this keys on the board-sensor MPN pattern.
        if (isBoardMountSensorMispin(cand.name, dbHit.part_number)) {
          log(`[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): board-mount PCB sensor ${dbHit.manufacturer} ${dbHit.part_number} on a process field-instrument slot — generic field-device spec, not a chip MPN`)
          blocked = true
          break
        }
        // INDICATOR-LIGHT MIS-PIN (Tristan 2026-06-28): a panel pilot light / LED indicator (Banner
        // K30LMBXXP EZ-LIGHT) must not pin a non-light slot ('Cable Trays'). Keep the generic spec.
        if (isIndicatorLightMispin(cand.name, dbHit)) {
          log(`[fill-blank-mpn]   ⊘ skip ${cand.moduleId}::${cand.subId} (${cand.name}): indicator/pilot-light part ${dbHit.manufacturer} ${dbHit.part_number} on a non-light slot — generic spec`)
          blocked = true
          break
        }
        // (Motor-drive slots never reach here — the DUTY-AWARE block above owns
        // them entirely: in-band DB pin when the duty is known, honest TBD when
        // not. A loose name-token pin on a drive is still impossible.)
        // ALIAS TYPE-COHERENCE FALLBACK (2026-07-05): dbHitAcceptableForWord's head-noun
        // check reads its OWN `name` argument's LAST token — a real earth-rod catalogue
        // row ('Earth rod — ABB Furse RC012 …') carries 'rod' in its lead segment, not
        // 'electrode' (the primary name's head noun when the alias 'driven earth
        // electrode' is what fillBlankWordMpns happened to prefer). Try the primary name
        // first (unchanged priority); only on a REJECT does the alias name get a second,
        // independent attempt — an alias never overrides a primary ACCEPT.
        const typeOk = dbHitAcceptableForWord(dbHit, cand.name) ||
          (!!cand.aliasName && dbHitAcceptableForWord(dbHit, cand.aliasName))
        const key = `${dbHit.manufacturer}|${dbHit.part_number}`.toLowerCase()
        if (typeOk && !used.has(key)) {
          used.add(key)
          setWordMpn(cand.word, dbHit.manufacturer, dbHit.part_number, 'db')
          mutated = true
          filled.push({ module_id: cand.moduleId, sub_module_id: cand.subId, source: 'db', manufacturer: dbHit.manufacturer, part_number: dbHit.part_number, name: cand.name })
          log(`[fill-blank-mpn]   ✓ DB   ${cand.moduleId}::${cand.subId} (${cand.name}) → ${dbHit.manufacturer} ${dbHit.part_number}`)
          pinned = true
          break
        }
        if (typeOk && used.has(key) && retriesLeft > 0) {
          retriesLeft -= 1
          log(`[fill-blank-mpn]   ↻ retry ${cand.moduleId}::${cand.subId} (${cand.name}): best DB row ${dbHit.manufacturer} ${dbHit.part_number} already claimed in this sub_module — re-ranking excluding claimed part(s) (exclusive assignment)`)
          dbHit = dbFirstLookup(db, tokenList, headNounsForRank, { excludeMakerVendors: true, excludeKeys: used })
          continue
        }
        // TYPE-COHERENCE WALK-DOWN (2026-07-10, runs 40-42 plateau: the single best
        // cosine row failed type-coherence and the fill gave up — while the RIGHT
        // seeded row sat at rank #2-#K, permanently unreachable: 'Gas Sensors' kept
        // losing to a heat detector though the MICS-6814 was in the DB). On a type
        // reject, EXCLUDE the rejected row and re-rank — the coherence bar itself is
        // unchanged (every candidate must still pass it), only the recall improves.
        if (!typeOk && retriesLeft > 0) {
          retriesLeft -= 1
          rejectedRows.add(key)
          log(`[fill-blank-mpn]   ↻ walk  ${cand.moduleId}::${cand.subId} (${cand.name}): ${dbHit.manufacturer} ${dbHit.part_number} fails type-coherence — trying the next ranked candidate`)
          dbHit = dbFirstLookup(db, tokenList, headNounsForRank, { excludeMakerVendors: true, excludeKeys: new Set([...used, ...rejectedRows]) })
          continue
        }
        // type mismatch, or a duplicate with no distinct alternative left → treat as a
        // MISS (fall through to generate) — LOGGED (2026-07-03): the silent fall-through
        // hid why a word stayed TBD (the Kratos-shades-Eaton diagnosis took a debugger).
        log(`[fill-blank-mpn]   ⊘ miss ${cand.moduleId}::${cand.subId} (${cand.name}): best DB row ${dbHit.manufacturer} ${dbHit.part_number} ${typeOk ? 'already claimed in this sub_module (no distinct alternative)' : 'fails type-coherence'} — ${opts.skipGenerate ? 'staying generic' : 'falling through to generate'}`)
        break
      }
      if (pinned || blocked) continue

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
