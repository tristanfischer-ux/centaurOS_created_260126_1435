/**
 * Engine A — write-time cost-reality gate validator test.
 *
 * Loads the Tesla iter-S1-test state (`radical-phase5-state-containerised_
 * 3_5_mwh_battery_energy_storage.json`) and a synthesised heatpump-at-band
 * scenario, runs `validateBomAgainstBand` on each, and exercises the
 * corrective re-emit loop on the Tesla state when it lands out of band.
 *
 * Per PLAN-2026-05-18 cost-correctness-engine-v2 § Engine A. Runs locally:
 *
 *   npx tsx scripts/test-engine-a.ts
 *
 * Outputs a per-test report to stdout — no PDF or state-write side effects.
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  validateBomAgainstBand,
  runEngineACorrectiveLoop,
  buildEngineAReEmitPrompt,
  extractBomLinesFromState,
} from '../src/lib/pdf-engine-v2/stages/4-bom-cost-suppliers'

const PROJECT_ROOT = resolve(__dirname, '..')

function loadState(name: string): any {
  return JSON.parse(readFileSync(resolve(PROJECT_ROOT, name), 'utf-8'))
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return 'NaN'
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function header(s: string): void {
  console.log('')
  console.log('═'.repeat(72))
  console.log(s)
  console.log('═'.repeat(72))
}

async function testTeslaBess(): Promise<void> {
  header('TEST 1 — Tesla iter-S1-test (3.5 MWh BESS)')

  const state = loadState('radical-phase5-state-containerised_3_5_mwh_battery_energy_storage.json')

  // The radical pipeline writes the post-markup BoM total to
  // `radicalCostSummary.bomTotal`. That is the figure Engine D's cost-stack
  // accepts (raw materials + markups already applied). The renderer-time
  // path reaches the same number after `applyBatchEconomics` (W3=1.0 for
  // BESS, so it passes through unchanged).
  const initialBomTotal: number = state.radicalCostSummary?.bomTotal ?? 0
  console.log(`Initial raw BoM total: ${fmt(initialBomTotal)}`)

  // 3.5 MWh = 3500 kWh — Engine A's fallback derives this from projectId.
  const initialResult = validateBomAgainstBand(state, initialBomTotal)
  console.log(`Class key:            ${initialResult.class_key}`)
  console.log(`Metric:               ${initialResult.metric_label}`)
  console.log(`Installed ASP:        ${fmt(initialResult.installed_asp_gbp)}`)
  console.log(`£/metric (computed):  £${initialResult.metric_value.toFixed(2)}`)
  console.log(`Band:                 £${initialResult.band_low}-${initialResult.band_high}`)
  console.log(`Verdict:              ${initialResult.verdict}`)
  console.log(`Deviation:            ${initialResult.pct_deviation.toFixed(1)}%`)
  console.log(`Diagnostic:           ${initialResult.diagnostic}`)
  console.log(`Top outliers:`)
  for (const o of initialResult.top_outliers) {
    console.log(`  - ${o.name}  qty ${o.quantity} × ${fmt(o.unit_price_gbp)} = ${fmt(o.line_total_gbp)}  (${o.source})`)
  }
  console.log(`Total BoM rows extracted: ${extractBomLinesFromState(state).length}`)

  // Build the re-emit prompt regardless of in-band, so we have visibility.
  console.log('')
  console.log('--- corrective re-emit prompt (preview) ---')
  console.log(buildEngineAReEmitPrompt(initialResult).slice(0, 600))
  console.log('--- end preview ---')

  // Force the re-emit pathway for verification. The spec's default 50%
  // gate doesn't trip on the Tesla state (it's 47.6% under), but Tristan
  // asked to "verify the re-emitted BoM lands closer to band" — so we
  // exercise the loop with a lowered gate to prove the pathway end-to-end.
  // Production usage retains the default 50%.
  const FORCE_REEMIT_GATE = 30
  if (initialResult.verdict !== 'unavailable' && !initialResult.in_band && Math.abs(initialResult.pct_deviation) > FORCE_REEMIT_GATE) {
    console.log('')
    console.log(`>>> Forcing re-emit (gate lowered to ${FORCE_REEMIT_GATE}% for end-to-end verification).`)
    // Track the running BoM total via a closure. The re-emit loop replaces
    // the BoM through this getter/setter pair.
    let currentTotal = initialBomTotal
    let currentLines: Array<{ name: string; quantity: number; unit_price_gbp: number; source: string }> | null = null

    const result = await runEngineACorrectiveLoop(
      state,
      () => currentTotal,
      (newLines: Array<{ name: string; quantity: number; unit_price_gbp: number; source: string }>, newTotal: number) => {
        currentLines = newLines
        currentTotal = newTotal
        // Mutate state so subsequent extractBomLinesFromState calls see the
        // new BoM. We attach to `state.bomLines` because the legacy shape
        // is recognised by the extractor.
        state.bomLines = newLines.map(l => ({
          name: l.name,
          partNumber: l.name,
          quantity: l.quantity,
          unitCostGbp: l.unit_price_gbp,
          costSource: l.source,
        }))
        // Wipe the radical hierarchy on the state so the extractor picks up
        // the legacy shape instead. Necessary because shape (a) takes
        // priority in the extractor — once the LLM re-emits, the new lines
        // are the source of truth, not the original radical leaves.
        if (state.radicalCostSummary?.radicalHierarchy) {
          state.radicalCostSummary.radicalHierarchy.sentences = []
        }
      },
      { deviationGate: FORCE_REEMIT_GATE, maxRetries: 2 },
    )

    console.log('')
    console.log('--- post-re-emit ---')
    console.log(`Final BoM total:      ${fmt(currentTotal)}`)
    console.log(`Final verdict:        ${result.verdict}`)
    console.log(`Final £/metric:       £${result.metric_value.toFixed(2)}`)
    console.log(`Final deviation:      ${result.pct_deviation.toFixed(1)}%`)
    console.log(`cost_reality_status:  ${state.cost_reality_status}`)
    console.log(`Attempts used:        ${state.cost_reality_attempts ?? 0}`)
    if (currentLines && Array.isArray(currentLines)) {
      const lines: Array<{ name: string; quantity: number; unit_price_gbp: number; source: string }> = currentLines
      console.log(`Re-emitted line count: ${lines.length}`)
      for (const l of lines.slice(0, 8)) {
        console.log(`  + ${l.name}  qty ${l.quantity} × ${fmt(l.unit_price_gbp)}  (${l.source})`)
      }
      if (lines.length > 8) console.log(`  ... ${lines.length - 8} more`)
    }
    // Verdict: did the re-emit move the BoM closer to band?
    const movedCloser = Math.abs(result.pct_deviation) < Math.abs(initialResult.pct_deviation)
    console.log('')
    console.log(`MOVED CLOSER TO BAND? ${movedCloser ? 'YES' : 'NO'}`)
    console.log(`IN BAND?              ${result.in_band ? 'YES' : 'NO'}`)
  } else {
    console.log('')
    console.log('No re-emit triggered — already in band or below the >50% gate.')
  }
}

async function testHeatpumpInTolerance(): Promise<void> {
  header('TEST 2 — Heatpump iter-64 (£907/kW post-W3, band £600-900)')

  // The persisted heatpump state in this repo (radical-phase5-state-30_kw_
  // ...heat_pump_using.json) is from before the moduleDecomposition shape
  // was added, so it's not useful for the band resolver. Build a minimal
  // synthetic state matching the iter-64 numbers cited in PLAN-2026-05-18
  // — post-W3 BoM £907/kW × 30 kW thermal = £27,210.
  const post_w3_kw = 907
  const thermal_kw = 30
  const post_w3_total = post_w3_kw * thermal_kw // £27,210

  // Synthesise an in-band heatpump state. Engine A receives the post-W3
  // BoM (Engine D's input). slugHint defaults to normalised_class.
  const synthState = {
    projectId: 'heatpump-iter-64-synth',
    moduleDecomposition: {
      product_class: 'thermal_system',
      normalised_class: 'heatpump',
      modules: [],
    },
    keyMetrics: {
      product_class: 'thermal_system',
      headline_output: { id: 'design_thermal_kw', value: thermal_kw },
    },
    // Synthetic minimal BoM rows for top_outlier reporting.
    bomLines: [
      { name: 'R290 scroll compressor 30 kW', quantity: 1, unitCostGbp: 4200, costSource: 'distributor' },
      { name: 'Brazed plate heat exchanger 100 kW', quantity: 1, unitCostGbp: 1800, costSource: 'distributor' },
      { name: 'EC fan + shroud assembly', quantity: 2, unitCostGbp: 850, costSource: 'distributor' },
    ],
  }

  const result = validateBomAgainstBand(synthState, post_w3_total)
  console.log(`Class key:            ${result.class_key}`)
  console.log(`Metric:               ${result.metric_label}`)
  console.log(`Raw BoM (post-W3):    ${fmt(post_w3_total)}`)
  console.log(`Installed ASP:        ${fmt(result.installed_asp_gbp)}`)
  console.log(`£/metric (computed):  £${result.metric_value.toFixed(2)}`)
  console.log(`Band:                 £${result.band_low}-${result.band_high}`)
  console.log(`Verdict:              ${result.verdict}`)
  console.log(`Deviation:            ${result.pct_deviation.toFixed(1)}%`)
  console.log(`Diagnostic:           ${result.diagnostic}`)

  // The crucial behaviour: Engine A should leave it alone — within band
  // means in_band=true, the gate (>50% deviation) is not tripped, no
  // Flash-Lite call happens.
  const wouldReEmit = result.verdict !== 'unavailable' && !result.in_band && Math.abs(result.pct_deviation) > 50
  console.log('')
  console.log(`WOULD ENGINE A FIRE A RE-EMIT? ${wouldReEmit ? 'YES' : 'NO'}`)
}

async function main(): Promise<void> {
  if (!process.env.OPENROUTER_API_KEY) {
    // Load .env.local manually — tsx doesn't auto-load it.
    const envPath = resolve(PROJECT_ROOT, '.env.local')
    try {
      const env = readFileSync(envPath, 'utf-8')
      for (const line of env.split('\n')) {
        const m = line.match(/^([A-Z0-9_]+)=(?:"(.*?)"|(.+))$/)
        if (m) process.env[m[1]] = m[2] ?? m[3]
      }
    } catch {
      // ignore — Test 2 doesn't need a key.
    }
  }

  await testTeslaBess()
  await testHeatpumpInTolerance()
}

main().catch(err => {
  console.error('Engine A test failed:', err)
  process.exit(1)
})
