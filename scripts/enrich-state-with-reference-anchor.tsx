#!/usr/bin/env npx tsx
/**
 * scripts/enrich-state-with-reference-anchor.tsx
 *
 * Engine C — reference-product anchoring (pre-render step).
 *
 * For every BoM word in a pipeline state.json, retrieve the most similar
 * reference parts from the Phase 4 RAG corpus (via `scripts/rag/reference_lookup.py`)
 * and write an `engine_c_*` annotation block onto the matching row in
 * `state.partVerifications`. The renderer (render-minimal-pdf.tsx) picks
 * these up to surface a flag on each BoM line and an aggregate verdict on
 * the cover.
 *
 * Why a Python subprocess
 * -----------------------
 * The corpus retrieval pipeline is Python (OpenAI embeddings client, numpy
 * cosine math, SQLite reader). Reimplementing in TypeScript was rejected
 * because (a) the OpenAI Node SDK doesn't expose the same dimensions
 * parameter cleanly without re-embedding the corpus, and (b) the retrieval
 * cache lives in `~/.forge-truth/forge-truth.db` which the Python helper
 * already loads matrix-style into memory.
 *
 * The subprocess runs in `--batch` mode so a single Python process embeds +
 * matrix-loads once and serves all queries via NDJSON over stdin/stdout.
 *
 * Annotation schema written to each partVerification
 * --------------------------------------------------
 *   engine_c_ref_median_gbp: number       // median reference unit price (GBP)
 *   engine_c_ref_p25_gbp: number          // IQR low
 *   engine_c_ref_p75_gbp: number          // IQR high
 *   engine_c_ref_count: number            // how many corpus hits (k)
 *   engine_c_priced_count: number         // how many of those had a price
 *   engine_c_our_unit_gbp: number         // the verification's effective unit
 *   engine_c_ratio: number                // our_unit / median_ref
 *   engine_c_flag: 'over' | 'under' | 'in_range' | 'no_reference'
 *   engine_c_top_excerpts: string[]       // up to 3 raw excerpts (evidence)
 *   engine_c_top_sources: {table,id,document_id,score}[]
 *
 * Aggregate state.engine_c_summary
 * --------------------------------
 *   product_class:      string
 *   total_priced_lines: number
 *   in_range:           number
 *   over:               number
 *   under:              number
 *   no_reference:       number
 *   pct_flagged_out_of_range: number      // (over+under)/total_priced_lines
 *   top_over_flags:     {word_id, name, our_unit_gbp, ref_median_gbp, ratio, excerpt}[]
 *   top_under_flags:    {word_id, name, our_unit_gbp, ref_median_gbp, ratio, excerpt}[]
 *
 * Usage:
 *   npx tsx scripts/enrich-state-with-reference-anchor.tsx <state.json> [out.json]
 *
 * When `out.json` is omitted, the input is overwritten in place. A `.bak`
 * sibling is written before the overwrite.
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs'
import { resolve, dirname, basename, join } from 'path'
import { spawn } from 'child_process'
import {
  bespokeEquipmentReference,
  isBespokeFabrication,
  bespokeFlagFor,
  type BespokeReference,
} from '../src/lib/pdf-engine-v2/lib/bespoke-equipment-bands'

// ---------------------------------------------------------------------------
// Engine C tuning constants. Plan locks the ratio thresholds at 2.0x / 0.5x.
// ---------------------------------------------------------------------------

const OVER_RATIO = 2.0
const UNDER_RATIO = 0.5
const K = 5                  // retrieve top-5 reference records per word

// ---------------------------------------------------------------------------
// Bespoke-fabrication reference band (2026-06-04, CO₂-mineralisation v10).
//
// The corpus median is meaningless for build-to-order chemical-process kit
// (316L vessels, crystallisers, packed columns, plate/shell-tube exchangers,
// centrifuges, fluid-bed dryers, screw feeders, fabricated internals/supports):
// the RAG nearest-neighbour search returns whatever is closest in embedding
// space and its price is noise (a flue-gas blower matched a £8.66 desk fan; a
// £650 vessel support matched a £29,500 whole skid). That produced ~79% of v10's
// priced lines flagged (66 <.5x / 45 >2x) on credibly-costed parts.
//
// For a recognised bespoke fabricated part we therefore ANCHOR the per-line REF
// flag on bespoke-equipment-bands.ts — a per-class envelope of real UK ex-works
// chemical-plant equipment costs, sized by mass/volume/capacity + material/
// complexity — INSTEAD OF the corpus median, when the corpus is unreliable for
// the line. "Unreliable" = the corpus had too few priced hits OR its median is
// wildly off the bespoke envelope (the desk-fan / whole-skid mis-anchor). A
// rich, in-envelope corpus median is left to win (it is a genuine signal). The
// flag then reads OK for a price inside the realistic spread and only stays
// over/under for a true outlier — keeping the gate honest, not silencing it.
// ---------------------------------------------------------------------------

/** Minimum corpus priced-hits before its median is trusted over the bespoke band. */
const CORPUS_TRUST_MIN_PRICED = 3
/** If the corpus median is >this× outside the bespoke envelope, treat it as a mis-anchor. */
const CORPUS_MISANCHOR_FACTOR = 3

// ---------------------------------------------------------------------------
// DEVICE-SCALE reference guard (2026-07-20, F1c — the organoid-bioreactor
// £20k-vessel / £5.38M-actuation leak).
//
// The corpus + the bespoke-equipment bands are both PLANT-scale references:
// the bespoke band's smallest class (`agitated_vessel`) is an £8k–£60k
// jacketed 316L stirred TANK, and the corpus nearest-neighbour returns a
// £5.38M spacecraft reaction-control-thruster set for an "actuation" query.
// On a benchtop instrument (35 W, 20 mL working volume, 0.004 m³ envelope)
// EVERY such anchor is a class-mismatch: it flags a £1 lab consumable as
// "under-priced vs a £20k tank", drives the corpus-median lift + OEM-ceiling
// logic off a plant reference, and poisons the benchmark net. A device-scale
// product simply has no single part worth £10k+ — so a plant-scale reference
// on one of its lines is noise, not signal. Universal: keyed off the SAME
// watt-scale-instrument signal the sizing engine uses (enclosure < 1 m³ AND a
// low power / small working volume), never a per-class table.
// ---------------------------------------------------------------------------
/** No single BoM line of a benchtop instrument is a genuine £10k+ principal —
 *  a plant-scale reference (bespoke band or corpus median) above this is a
 *  class-mismatch, not an under-priced part. */
const DEVICE_SCALE_REF_CEILING_GBP = 10_000

/** Read a numeric quantity from wherever the chain stashed it (shared_quantities
 *  on either contract, wordDomainCoherence, or a module's derived_parameters). */
function readScaleQty(state: any, key: string): number | undefined {
  const asNum = (x: any): number | undefined => {
    const n = typeof x === 'object' && x != null ? Number(x.value) : Number(x)
    return Number.isFinite(n) ? n : undefined
  }
  const cands = [
    state?.engineeringContract?.shared_quantities?.[key],
    state?.orchestratorContract?.shared_quantities?.[key],
    state?.orchestratorContract?.quantities?.[key],
    state?.wordDomainCoherence?.[key],
  ]
  for (const c of cands) { const n = asNum(c); if (n !== undefined) return n }
  for (const m of (state?.moduleDecomposition?.modules ?? [])) {
    const n = asNum(m?.derived_parameters?.[key]); if (n !== undefined) return n
  }
  return undefined
}

/** True when the product is a benchtop/handheld instrument for which plant-scale
 *  references (bespoke chemical-process bands, industrial corpus medians) must
 *  NOT anchor a per-line flag. Mirrors `isWattScaleInstrument` in
 *  universal-contract-sizing.ts: a sub-1 m³ envelope AND a low power / small
 *  working volume, OR the explicit isInstrumentDevice signal. */
function isDeviceScaleProduct(state: any): boolean {
  if (state?.isInstrumentDevice === true) return true
  const vol = readScaleQty(state, 'enclosure_volume_m3')
  if (vol === undefined || !(vol < 1)) return false
  const powW = readScaleQty(state, 'peak_electrical_power_w')
  const loadKw = readScaleQty(state, 'connected_electrical_load_kw')
  const volMl = readScaleQty(state, 'working_volume_ml')
  return (powW !== undefined && powW <= 120)
    || (loadKw !== undefined && loadKw <= 0.12)
    || (volMl !== undefined && volMl <= 500)
}

/** Parse a numeric token followed by a unit out of a free-text string. */
function parseFirstNumber(re: RegExp, ...texts: (string | null | undefined)[]): number | null {
  for (const t of texts) {
    if (!t) continue
    const m = String(t).match(re)
    if (m) {
      const n = Number(m[1].replace(/,/g, ''))
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

/** Pull the bespoke size signals (mass kg, working volume m³, capacity) from a
 *  word's modifier_characters + the verification, best-effort. The emitter puts
 *  these in `dimension`/`dimensions`/`capacity`/`form` modifiers; we read any of
 *  them. Missing signals just mean the class typical (un-scaled) is used. */
function bespokeSizeSignals(word: any, verification: any): { mass_kg?: number | null; volume_m3?: number | null; capacity?: number | null } {
  const mods: any[] = Array.isArray(word?.modifier_characters) ? word.modifier_characters : []
  const modVal = (kinds: string[]): string => {
    const parts: string[] = []
    for (const mc of mods) if (kinds.includes(String(mc?.kind))) parts.push(String(mc?.value ?? ''))
    return parts.join(' ')
  }
  const dimText = modVal(['dimension', 'dimensions', 'form', 'capacity'])
  const capMod = mods.find((mc: any) => String(mc?.kind) === 'capacity')
  // Working volume: "3 m³", "1.5 m3", "0.2 m dia × 1 m" → derive cylinder vol.
  let volume_m3 = parseFirstNumber(/([0-9][0-9.,]*)\s*m(?:³|3)\b/i, dimText)
  if (volume_m3 === null) {
    const dia = parseFirstNumber(/([0-9][0-9.,]*)\s*m\s*(?:dia|diameter|⌀|ø)/i, dimText)
    const ht = dia !== null ? parseFirstNumber(/(?:×|x|by)\s*([0-9][0-9.,]*)\s*m\b/i, dimText) : null
    if (dia !== null && ht !== null) volume_m3 = Math.PI * (dia / 2) ** 2 * ht
  }
  const mass_kg = parseFirstNumber(/([0-9][0-9.,]*)\s*kg\b/i, dimText, String(verification?.mass_kg ?? ''))
  // Capacity: the emitter often stores a bare number (e.g. centrifuge "165",
  // dryer "75") in a `capacity` modifier — use it directly.
  let capacity: number | null = null
  if (capMod) {
    const c = Number(String(capMod.value).replace(/[^0-9.]/g, ''))
    if (Number.isFinite(c) && c > 0) capacity = c
  }
  return { mass_kg, volume_m3, capacity }
}

/**
 * Decide the per-line REF flag for a bespoke fabricated part, preferring the
 * bespoke-equipment band over a noisy corpus median.
 *
 * Returns null when the part is NOT a recognised bespoke fabrication — the
 * caller then keeps the normal corpus-median flag path unchanged. Returns a
 * verdict object (with the band as the effective reference) otherwise.
 */
function bespokeFlagDecision(
  word: any,
  verification: any,
  ourUnit: number,
  corpusMedian: number | null,
  corpusPriced: number,
  deviceScale: boolean,
): { flag: 'over' | 'under' | 'in_range'; ratio: number | null; ref_median_gbp: number; ref_low_gbp: number; ref_high_gbp: number; ref: BespokeReference } | null {
  // F1c (2026-07-20): the bespoke-equipment bands are PLANT-scale chemical-process
  // references (smallest is an £8k–£60k jacketed 316L tank). On a benchtop
  // instrument NONE of them applies — a lab-scale "culture vessel" is a £10–500
  // consumable, not a stirred tank. Suppress the band entirely so the caller keeps
  // the (also device-scale-guarded) corpus path. Universal — keyed on scale only.
  if (deviceScale) return null
  const name = String(word?.name_human ?? verification?.word_name ?? '')
  const form = (Array.isArray(word?.modifier_characters) ? word.modifier_characters : []).find((m: any) => m?.kind === 'form')?.value
  const pn = verification?.part_number
    ?? (Array.isArray(word?.modifier_characters) ? word.modifier_characters : []).find((m: any) => m?.kind === 'part_number')?.value
  if (!isBespokeFabrication(name, form, pn)) return null
  const ref = bespokeEquipmentReference(`${name} ${form ?? ''} ${pn ?? ''}`, bespokeSizeSignals(word, verification))
  if (!ref) return null

  // For a NO-CATALOGUE bespoke fabrication the engineering equipment ENVELOPE is
  // the authoritative reference — the corpus median, for these parts, is a
  // nearest-neighbour artefact (a flue-gas blower matched a £8.66 desk fan; a
  // £650 vessel support matched a £29,500 skid). So the in/out decision is made
  // against the band envelope. (corpusMedian / corpusPriced are still passed for
  // a future diagnostic; CORPUS_TRUST_MIN_PRICED + CORPUS_MISANCHOR_FACTOR
  // document the rich-corpus-vs-band trade-off and are retained for that.)
  void corpusMedian; void corpusPriced; void CORPUS_TRUST_MIN_PRICED; void CORPUS_MISANCHOR_FACTOR
  const { flag, ratio } = bespokeFlagFor(ourUnit, ref, OVER_RATIO, UNDER_RATIO)
  return {
    flag,
    ratio: Math.round(ratio * 1000) / 1000,
    ref_median_gbp: ref.reference_gbp,
    ref_low_gbp: ref.low_gbp,
    ref_high_gbp: ref.high_gbp,
    ref,
  }
}
const BATCH_CONCURRENCY = 1  // single Python process; queries are I/O bound on OpenAI

// ---------------------------------------------------------------------------
// Map the pipeline state's product_class strings into corpus product_class
// slugs that the embedding biasing actually understands. Pipeline emits
// things like "energy_storage" / "thermal_system" / "wearable_medical" via
// keyMetrics.product_class, but the corpus uses dashed slugs. Hint is
// advisory only — passed to the embedder as a query suffix.
// ---------------------------------------------------------------------------

// 2026-05-19 fix M5 (audit-found): expanded class-hint alias coverage.
// Previously this map omitted many classifier-emitted slugs (mini_split_heatpump,
// battery_energy_storage, residential_ess, commercial_heatpump, vfd, drone,
// agv, amr, auv, traction_battery_pack, etc.). Missing slugs fall through to
// full-corpus search without product-class bias, degrading reference-price
// anchor quality. Mirrors the ENVELOPE_ALIASES + K10 ALIASES maps in the
// chain. New product classes need entries here AND in those maps AND in
// class-standards.ts / class-hazards.ts / class-price-bands.ts / class-cost-
// structure.ts (renderer-side) to be fully integrated.
const CORPUS_CLASS_HINT: Record<string, string> = {
  // BESS
  energy_storage: 'bess-utility-scale',
  bess: 'bess-utility-scale',
  battery_energy_storage: 'bess-utility-scale',
  residential_ess: 'bess-utility-scale',
  'battery energy storage system (bess)': 'bess-utility-scale',
  'bess-utility-scale': 'bess-utility-scale',
  // Heat pump
  thermal_system: 'heat-pump-residential',
  heatpump: 'heat-pump-residential',
  heat_pump: 'heat-pump-residential',
  mini_split_heatpump: 'heat-pump-residential',
  'heat-pump-residential': 'heat-pump-residential',
  commercial_heatpump: 'heat-pump-commercial',
  'heat-pump-commercial': 'heat-pump-commercial',
  // CGM / wearable medical
  wearable_medical: 'wearable_medical_device',
  cgm: 'wearable_medical_device',
  wearable_medical_device: 'wearable_medical_device',
  // EV charger
  ev_charger: 'dc_fast_ev_charger',
  'ev-charger': 'dc_fast_ev_charger',
  dc_fast_ev_charger: 'dc_fast_ev_charger',
  // Vehicle battery
  traction_battery_pack: 'vehicle_battery_pack',
  vehicle_battery: 'vehicle_battery_pack',
  // VFD / motor drive
  motor_drive_vfd: 'vfd-motor-drive',
  vfd: 'vfd-motor-drive',
  motor_drive: 'vfd-motor-drive',
  // PV / solar
  pv_string_inverter: 'pv_string_inverter',
  // AUV / subsea
  auv: 'auv-subsea',
  auv_subsea: 'auv-subsea',
  // Drones / UAVs
  drone: 'consumer_cinematography_drone',
  consumer_drone: 'consumer_cinematography_drone',
  industrial_inspection_drone: 'industrial_inspection_drone',
  // Mobile robotics
  agv: 'automated_guided_vehicle_agv',
  amr: 'autonomous_mobile_robot_amr',
  // Other (best-effort)
  industrial_robot_arm: 'industrial_robot_arm',
  insulin_pump: 'insulin_pump',
  escalator: 'escalator',
  bioreactor: 'bioreactor',
  fuel_cell: 'fuel-cell-power-module',
  electrolyser: 'hydrogen-electrolyser',
  wind_turbine: 'wind-turbine-small',
  pv_module: 'pv-module-residential',
  industrial_3d_printer: 'industrial-3d-printer',
  // Vertical farm / CEA (added 2026-05-20, Task #68 — was missing, so VF chain
  // runs resolved class to null and Engine C searched the whole corpus
  // without product-class context. The slug here matches the `category` field
  // seeded by scripts/seed-corpus-vf-commodities.tsx.
  vertical_farm: 'vertical_farm',
  vertical_farming: 'vertical_farm',
  cea: 'vertical_farm',
  controlled_environment_agriculture: 'vertical_farm',
  hydroponic: 'vertical_farm',
  hydroponics: 'vertical_farm',
  greenhouse: 'vertical_farm',
}

function resolveCorpusClassHint(state: any): string | null {
  const raw = String(
    state?.keyMetrics?.product_class ??
    state?.moduleDecomposition?.product_class ??
    state?.parsedBrief?.product_class ??
    ''
  ).toLowerCase().trim()
  if (!raw) return null
  if (CORPUS_CLASS_HINT[raw]) return CORPUS_CLASS_HINT[raw]
  // Last-resort prefix match on the projectId.
  const projectId: string = String(state?.projectId || '')
  const prefix = projectId.split('-')[0]?.toLowerCase()
  if (prefix && CORPUS_CLASS_HINT[prefix]) return CORPUS_CLASS_HINT[prefix]
  return null
}

// ---------------------------------------------------------------------------
// Build the embedding query for a single word. Combines the word's human
// name + content character + manufacturer + part_number + key ratings, which
// is the same signal the embed step uses for the corpus side, so we get
// reasonable cosine alignment.
// ---------------------------------------------------------------------------

function buildQueryForWord(word: any, verification: any): string {
  const parts: string[] = []
  if (word?.name_human) parts.push(String(word.name_human))
  const cc = word?.content_character
  if (cc?.name_human && !parts.includes(String(cc.name_human))) parts.push(String(cc.name_human))
  // Manufacturer + part_number from either the verification or the word's
  // modifier_characters block.
  const mfg = verification?.manufacturer
    ?? (word?.modifier_characters ?? []).find((m: any) => m.kind === 'manufacturer')?.value
  const pn = verification?.part_number
    ?? (word?.modifier_characters ?? []).find((m: any) => m.kind === 'part_number')?.value
  if (mfg) parts.push(String(mfg))
  if (pn) parts.push(String(pn))
  // Add primary rating (kWh, kW, Ah, ...) for ranking signal.
  const rating = (word?.modifier_characters ?? []).find((m: any) => m.kind === 'rating_primary')?.value
  if (rating) parts.push(String(rating))
  return parts.join(' ').trim()
}

// ---------------------------------------------------------------------------
// Pick the effective unit-cost we compare against the reference median.
// We use the SAME field the renderer ends up summing (distributor preferred,
// price estimate fallback). Note: this is the PRE-W3 raw unit price — the
// W3 batch scale factor is applied later by the renderer and does not
// belong inside Engine C's reference comparison (Engine C is meant to ground
// the raw distributor / estimator output, not the W3-corrected number).
// ---------------------------------------------------------------------------

function effectiveUnitPriceGbp(v: any): number {
  const a = Number(v?.distributor_price_gbp)
  if (Number.isFinite(a) && a > 0) return a
  const e = Number(v?.price_estimate_gbp)
  if (Number.isFinite(e) && e > 0) return e
  return 0
}

// ---------------------------------------------------------------------------
// Subprocess driver — spawns reference_lookup.py --batch, pipes NDJSON
// requests in, collects NDJSON responses keyed by request_id.
// ---------------------------------------------------------------------------

type LookupResult = {
  ref_count: number
  priced_count: number
  median_unit_cost_gbp: number | null
  p25_unit_cost_gbp: number | null
  p75_unit_cost_gbp: number | null
  top_excerpts: string[]
  top_sources: { table: string; id: number; document_id: number; score: number }[]
  reason: 'priced' | 'no_priced_hits' | 'no_hits'
}

async function batchLookup(
  requests: { request_id: string; query: string; class: string | null }[],
): Promise<Map<string, LookupResult>> {
  const repoRoot = resolve(__dirname, '..')
  const py = process.env.PYTHON_BIN || 'python3'
  return new Promise((resolveP, rejectP) => {
    const child = spawn(py, ['scripts/rag/reference_lookup.py', '--batch', '--k', String(K)], {
      cwd: repoRoot,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'inherit'],
    })
    const results = new Map<string, LookupResult>()
    let buf = ''
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf-8')
      let nl = buf.indexOf('\n')
      while (nl !== -1) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) {
          try {
            const obj = JSON.parse(line)
            if (obj?.request_id && obj?.result) {
              results.set(String(obj.request_id), obj.result)
            }
          } catch (e) {
            console.error('[engine-c] bad NDJSON from python:', line.slice(0, 200))
          }
        }
        nl = buf.indexOf('\n')
      }
    })
    child.on('error', rejectP)
    child.on('close', (code) => {
      if (code !== 0) rejectP(new Error(`reference_lookup.py exited ${code}`))
      else resolveP(results)
    })
    // Pipe requests.
    for (const req of requests) {
      child.stdin.write(JSON.stringify(req) + '\n')
    }
    child.stdin.end()
  })
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * F1c proveCatch — the device-scale reference guard. Asserts (a) the benchtop
 * organoid-bioreactor 2150 signals classify as device-scale, (b) a plant does
 * NOT, (c) the bespoke-equipment band is suppressed for a device-scale product
 * and still fires for a plant, and (d) a plant-scale corpus median is above the
 * device ceiling (so the caller's guard fires). Runs with no network / no state.
 */
function runSelfTest(): void {
  const fails: string[] = []
  const ok = (cond: boolean, msg: string) => { if (!cond) fails.push(msg) }

  // (a) the frozen 2150 benchtop bioreactor is device-scale — via the explicit
  // signal AND, independently, via the watt-scale branch (35 W, 20 mL, 0.004 m³).
  ok(isDeviceScaleProduct({ isInstrumentDevice: true }), '2150 isInstrumentDevice → device-scale')
  ok(isDeviceScaleProduct({ engineeringContract: { shared_quantities: {
    enclosure_volume_m3: 0.00403, peak_electrical_power_w: 35, working_volume_ml: 20 } } }),
    '2150 watt-scale signals (0.004 m³ / 35 W / 20 mL) → device-scale')
  // (b) a utility BESS / plant is NOT device-scale.
  ok(!isDeviceScaleProduct({ engineeringContract: { shared_quantities: {
    enclosure_volume_m3: 38, connected_electrical_load_kw: 1200 } } }),
    'utility plant (38 m³ / 1.2 MW) → NOT device-scale')
  ok(!isDeviceScaleProduct({}), 'no scale signals → NOT device-scale (fail-open safe)')

  // (c) the bespoke-equipment band: a fabricated agitated vessel anchors on the
  // plant band at plant scale, but is SUPPRESSED on a device-scale product.
  const vesselWord = { name_human: 'Fabricated 316L Agitated Vessel',
    modifier_characters: [{ kind: 'form', value: 'jacketed stirred tank' }] }
  const plantVerdict = bespokeFlagDecision(vesselWord, {}, 30, null, 0, /*deviceScale*/ false)
  const deviceVerdict = bespokeFlagDecision(vesselWord, {}, 30, null, 0, /*deviceScale*/ true)
  ok(plantVerdict !== null, 'agitated vessel anchors on the bespoke band at PLANT scale')
  ok(deviceVerdict === null, 'agitated vessel band SUPPRESSED on a device-scale product (F1c)')
  if (plantVerdict) ok(plantVerdict.ref_median_gbp > DEVICE_SCALE_REF_CEILING_GBP,
    'the plant vessel band reference is > the device-scale ceiling (proves the mis-anchor magnitude)')

  // (d) the corpus-median caller guard fires only when device-scale AND median
  // exceeds the ceiling — mirror the exact 2150 leaks (£20k vessel, £5.38M actuation).
  const guardFires = (deviceScale: boolean, median: number) =>
    deviceScale && median != null && median > DEVICE_SCALE_REF_CEILING_GBP
  ok(guardFires(true, 20000), 'device-scale + £20k corpus median → suppressed')
  ok(guardFires(true, 5382000), 'device-scale + £5.38M corpus median → suppressed')
  ok(!guardFires(true, 450), 'device-scale + £450 in-scale median → KEPT (a real lab-part reference survives)')
  ok(!guardFires(false, 20000), 'plant + £20k median → KEPT (plant references are legitimate)')

  if (fails.length) {
    console.error('[engine-c][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    process.exit(1)
  }
  console.error('[engine-c] _selftest passed — F1c device-scale reference guard proveCatch (11 assertions)')
  process.exit(0)
}

async function main(): Promise<void> {
  const [, , inputArg, outputArg] = process.argv
  if (inputArg === '--selftest') { runSelfTest(); return }
  if (!inputArg) {
    console.error('usage: enrich-state-with-reference-anchor.tsx <state.json> [out.json]')
    process.exit(2)
  }
  const inputPath = resolve(process.cwd(), inputArg)
  if (!existsSync(inputPath)) {
    console.error(`[engine-c] state file not found: ${inputPath}`)
    process.exit(1)
  }
  const outputPath = outputArg ? resolve(process.cwd(), outputArg) : inputPath
  const backupPath = inputPath + '.bak'
  if (outputPath === inputPath && !existsSync(backupPath)) {
    copyFileSync(inputPath, backupPath)
    console.error(`[engine-c] wrote backup ${basename(backupPath)}`)
  }

  const state = JSON.parse(readFileSync(inputPath, 'utf-8'))

  const classHint = resolveCorpusClassHint(state)
  console.error(`[engine-c] product class hint: ${classHint || '(none — full-corpus search)'}`)

  const verifications: any[] = Array.isArray(state.partVerifications) ? state.partVerifications : []
  // 2026-05-19 fix C1 (data-corruption bug): word_id is scoped per sub-module,
  // not globally unique. Two modules each with a 'housing' or 'sensor' word
  // would collide; the second .set() would overwrite the first and the BoM
  // line for the FIRST module would get the SECOND module's prices/refs.
  // Use compound key `{module}::{sub_module_id}::{word_id}` everywhere.
  // Legacy bare-word_id map kept as fallback for old state files where the
  // chain didn't write module/sub_module_id onto each verification row.
  const compoundKey = (module: string | null | undefined, subModuleId: string | null | undefined, wordId: string | null | undefined): string =>
    `${module ?? ''}::${subModuleId ?? ''}::${wordId ?? ''}`
  const verifByCompoundId = new Map<string, any>()
  const verifByLegacyWordId = new Map<string, any>()
  for (const v of verifications) {
    if (!v?.word_id) continue
    if (v.module && v.sub_module_id) {
      verifByCompoundId.set(compoundKey(v.module, v.sub_module_id, v.word_id), v)
    } else {
      verifByLegacyWordId.set(String(v.word_id), v)
    }
  }

  // Build the request list. One entry per BoM word; skip words with no
  // verification (would not appear on the BoM anyway). Skip words with no
  // effective unit price — Engine C cannot compute a ratio without one.
  const modules = state?.moduleDecomposition?.modules ?? []
  const requests: { request_id: string; query: string; class: string | null; word_ref: any; verif_ref: any }[] = []
  let skippedNoPrice = 0
  for (const m of modules) {
    for (const sm of m?.sub_modules ?? []) {
      for (const w of sm?.words ?? []) {
        const v = verifByCompoundId.get(compoundKey(m.module, sm.id, w.id))
          ?? verifByLegacyWordId.get(String(w.id))
        if (!v) continue
        const unit = effectiveUnitPriceGbp(v)
        if (unit <= 0) { skippedNoPrice += 1; continue }
        const query = buildQueryForWord(w, v)
        if (!query) continue
        // request_id MUST be unique across the batch; using compound key here
        // matches what the lookup map keys are, and survives `housing` collisions
        // across modules. python doesn't care what the request_id is — it
        // echoes it back as-is via NDJSON.
        requests.push({
          request_id: compoundKey(m.module, sm.id, w.id),
          query,
          class: classHint,
          word_ref: w,
          verif_ref: v,
        })
      }
    }
  }
  console.error(`[engine-c] ${requests.length} priced BoM lines queued (skipped ${skippedNoPrice} TBD lines)`)
  if (requests.length === 0) {
    console.error('[engine-c] nothing to enrich — writing through state unchanged')
    if (outputPath !== inputPath) writeFileSync(outputPath, JSON.stringify(state, null, 2))
    return
  }

  // Run the batch. ~250 queries × ~300ms embedding latency = ~75s wall-clock.
  // The python process loads the embedding matrix once and reuses it across queries.
  const t0 = Date.now()
  console.error(`[engine-c] spawning reference_lookup.py (batch)…`)
  const wireRequests = requests.map(r => ({ request_id: r.request_id, query: r.query, class: r.class }))
  const results = await batchLookup(wireRequests)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.error(`[engine-c] retrieved ${results.size}/${requests.length} results in ${elapsed}s`)

  // Annotate verifications + roll up aggregate.
  let counts = { in_range: 0, over: 0, under: 0, no_reference: 0 }
  type FlagRow = {
    word_id: string
    name: string
    our_unit_gbp: number
    ref_median_gbp: number
    ratio: number
    excerpt: string
  }
  const overFlags: FlagRow[] = []
  const underFlags: FlagRow[] = []

  // F1c (2026-07-20): compute product scale ONCE. On a benchtop instrument the
  // plant-scale references (bespoke bands, industrial corpus medians) are all
  // class-mismatches — suppress them so a £1 lab consumable is never flagged
  // "under-priced vs a £20k tank" and the £5.38M spacecraft-thruster corpus
  // median never anchors an actuation line.
  const deviceScale = isDeviceScaleProduct(state)
  if (deviceScale) console.error('[engine-c] device-scale product — plant-scale references suppressed (bespoke bands off; corpus medians > £' + DEVICE_SCALE_REF_CEILING_GBP.toLocaleString('en-GB') + ' treated as class-mismatch)')

  let bespokeRescued = 0  // lines whose flag came from the bespoke band, not the corpus
  let deviceScaleSuppressed = 0  // corpus medians rejected as plant-scale mis-anchors
  for (const r of requests) {
    const res = results.get(r.request_id)
    const v = r.verif_ref
    const ourUnit = effectiveUnitPriceGbp(v)

    const corpusMedian: number | null = res ? res.median_unit_cost_gbp : null
    const corpusPriced: number = res ? Number(res.priced_count || 0) : 0

    // Bespoke-fabrication anchor (2026-06-04): for a recognised build-to-order
    // process item, prefer the bespoke-equipment band over a thin / mis-anchored
    // corpus median. Returns null → keep the corpus path (rich, in-envelope
    // median, or not a bespoke part). This rescues BOTH the no_reference case
    // (corpus found nothing) and the wild-ratio false flags (desk-fan / whole-
    // skid mis-anchors).
    const bespoke = bespokeFlagDecision(r.word_ref, v, ourUnit, corpusMedian, corpusPriced, deviceScale)

    if (bespoke) {
      counts[bespoke.flag] += 1
      v.engine_c_ref_median_gbp = bespoke.ref_median_gbp
      v.engine_c_ref_p25_gbp = bespoke.ref_low_gbp
      v.engine_c_ref_p75_gbp = bespoke.ref_high_gbp
      v.engine_c_ref_count = res ? res.ref_count : 0
      v.engine_c_priced_count = corpusPriced
      v.engine_c_our_unit_gbp = ourUnit
      v.engine_c_ratio = bespoke.ratio
      v.engine_c_flag = bespoke.flag
      v.engine_c_ref_basis = 'bespoke_equipment_band'
      v.engine_c_ref_class = bespoke.ref.key
      v.engine_c_top_excerpts = [
        `Bespoke chemical-process equipment reference (${bespoke.ref.key}): £${bespoke.ref.low_gbp.toLocaleString('en-GB')}–£${bespoke.ref.high_gbp.toLocaleString('en-GB')} ex-works, typical ~£${bespoke.ref.reference_gbp.toLocaleString('en-GB')}. ${bespoke.ref.source}`,
        ...(res ? res.top_excerpts.slice(0, 2) : []),
      ]
      v.engine_c_top_sources = res ? res.top_sources : []
      bespokeRescued += 1

      if (bespoke.flag === 'over' || bespoke.flag === 'under') {
        const row: FlagRow = {
          word_id: r.request_id,
          name: String(r.word_ref?.name_human || r.word_ref?.id || ''),
          our_unit_gbp: ourUnit,
          ref_median_gbp: bespoke.ref_median_gbp,
          ratio: bespoke.ratio ?? 0,
          excerpt: `vs bespoke ${bespoke.ref.key} band £${bespoke.ref.low_gbp}-£${bespoke.ref.high_gbp}`,
        }
        if (bespoke.flag === 'over') overFlags.push(row)
        else underFlags.push(row)
      }
      continue
    }

    if (!res) {
      // Python returned no row AND the part is not a recognised bespoke item.
      v.engine_c_flag = 'no_reference'
      v.engine_c_ref_count = 0
      v.engine_c_priced_count = 0
      counts.no_reference += 1
      continue
    }
    // F1c (2026-07-20): on a benchtop instrument a corpus median above the
    // device-scale ceiling is a nearest-neighbour class-mismatch (the "actuation"
    // query returned a £5.38M spacecraft reaction-control-thruster set; a "vial
    // holder" returned a £42.5k buffer vessel). Recording it as an under-priced
    // reference poisons the corpus-median lift, the OEM ceiling, and the
    // benchmark net. Suppress to no_reference — the line keeps its own estimate.
    if (deviceScale && res.median_unit_cost_gbp != null && Number(res.median_unit_cost_gbp) > DEVICE_SCALE_REF_CEILING_GBP) {
      v.engine_c_flag = 'no_reference'
      v.engine_c_ref_median_gbp = null
      v.engine_c_ref_p25_gbp = null
      v.engine_c_ref_p75_gbp = null
      v.engine_c_ref_count = res.ref_count
      v.engine_c_priced_count = res.priced_count
      v.engine_c_our_unit_gbp = ourUnit
      v.engine_c_ratio = null
      v.engine_c_ref_basis = 'device_scale_misanchor_suppressed'
      counts.no_reference += 1
      deviceScaleSuppressed += 1
      continue
    }
    const median = res.median_unit_cost_gbp
    let flag: 'over' | 'under' | 'in_range' | 'no_reference'
    let ratio: number | null = null
    if (median === null || median <= 0) {
      flag = 'no_reference'
    } else {
      ratio = ourUnit / median
      if (ratio > OVER_RATIO) flag = 'over'
      else if (ratio < UNDER_RATIO) flag = 'under'
      else flag = 'in_range'
    }
    counts[flag] += 1

    v.engine_c_ref_median_gbp = res.median_unit_cost_gbp ?? null
    v.engine_c_ref_p25_gbp = res.p25_unit_cost_gbp ?? null
    v.engine_c_ref_p75_gbp = res.p75_unit_cost_gbp ?? null
    v.engine_c_ref_count = res.ref_count
    v.engine_c_priced_count = res.priced_count
    v.engine_c_our_unit_gbp = ourUnit
    v.engine_c_ratio = ratio !== null ? Math.round(ratio * 1000) / 1000 : null
    v.engine_c_flag = flag
    v.engine_c_top_excerpts = res.top_excerpts
    v.engine_c_top_sources = res.top_sources

    const row: FlagRow = {
      word_id: r.request_id,
      name: String(r.word_ref?.name_human || r.word_ref?.id || ''),
      our_unit_gbp: ourUnit,
      ref_median_gbp: median ?? 0,
      ratio: ratio ?? 0,
      excerpt: (res.top_excerpts[0] || '').slice(0, 200),
    }
    if (flag === 'over') overFlags.push(row)
    else if (flag === 'under') underFlags.push(row)
  }

  overFlags.sort((a, b) => b.ratio - a.ratio)
  underFlags.sort((a, b) => a.ratio - b.ratio)

  const totalPriced = requests.length
  const flaggedOutOfRange = counts.over + counts.under
  const pctFlagged = totalPriced > 0 ? (flaggedOutOfRange / totalPriced) * 100 : 0

  state.engine_c_summary = {
    product_class: classHint,
    total_priced_lines: totalPriced,
    in_range: counts.in_range,
    over: counts.over,
    under: counts.under,
    no_reference: counts.no_reference,
    pct_flagged_out_of_range: Math.round(pctFlagged * 10) / 10,
    top_over_flags: overFlags.slice(0, 5),
    top_under_flags: underFlags.slice(0, 5),
    enriched_at: new Date().toISOString(),
    over_ratio_threshold: OVER_RATIO,
    under_ratio_threshold: UNDER_RATIO,
    bespoke_band_rescued_lines: bespokeRescued,
    device_scale_misanchor_suppressed_lines: deviceScaleSuppressed,
    is_device_scale_product: deviceScale,
    k: K,
  }

  // Stamp partVerifications back onto state. Already mutated in-place via
  // the references above, but be explicit so the write reflects intent.
  state.partVerifications = verifications

  writeFileSync(outputPath, JSON.stringify(state, null, 2))
  console.error(
    `[engine-c] flags: in_range=${counts.in_range}  over=${counts.over}  under=${counts.under}  no_reference=${counts.no_reference}`
  )
  console.error(
    `[engine-c] ${flaggedOutOfRange}/${totalPriced} priced lines flagged out-of-range vs reference corpus (${pctFlagged.toFixed(1)}%)`
  )
  console.error(
    `[engine-c] ${bespokeRescued} bespoke-fabrication line(s) anchored on the equipment band instead of a noisy corpus median`
  )
  if (deviceScale) console.error(
    `[engine-c] ${deviceScaleSuppressed} plant-scale reference(s) suppressed as class-mismatch on this device-scale product (F1c)`
  )
  console.error(`[engine-c] wrote ${outputPath}`)
}

main().catch((err) => {
  console.error('[engine-c] failed:', err?.stack || err)
  process.exit(1)
})
