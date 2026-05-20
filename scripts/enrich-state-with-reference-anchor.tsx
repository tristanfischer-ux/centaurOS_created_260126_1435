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

// ---------------------------------------------------------------------------
// Engine C tuning constants. Plan locks the ratio thresholds at 2.0x / 0.5x.
// ---------------------------------------------------------------------------

const OVER_RATIO = 2.0
const UNDER_RATIO = 0.5
const K = 5                  // retrieve top-5 reference records per word
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

async function main(): Promise<void> {
  const [, , inputArg, outputArg] = process.argv
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

  for (const r of requests) {
    const res = results.get(r.request_id)
    const v = r.verif_ref
    const ourUnit = effectiveUnitPriceGbp(v)
    if (!res) {
      // Should not happen — python returned no row. Mark no_reference.
      v.engine_c_flag = 'no_reference'
      v.engine_c_ref_count = 0
      v.engine_c_priced_count = 0
      counts.no_reference += 1
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
  console.error(`[engine-c] wrote ${outputPath}`)
}

main().catch((err) => {
  console.error('[engine-c] failed:', err?.stack || err)
  process.exit(1)
})
