/**
 * scripts/apply-auto-improve.tsx
 *
 * AUTO-IMPROVE chain enrichment (Tristan decision 3, 2026-05-30). Reads state.json,
 * applies the SAFE auto-improve levers (currently L1 — re-price over-priced material
 * macros to grounded commodity rates), and writes the re-priced macros +
 * state.autoImproveLog back. Same enrichment-subprocess pattern as cost-repair.tsx,
 * run AFTER pricing is settled and BEFORE render so the rendered cost + the
 * post-render BoM cost gate (gate 10 / B-7 / B-8) see the improved design.
 *
 * Idempotent + safe: L1 only REDUCES material macros priced above their commodity
 * band (deriveMacroMaterialRateGbpPerKg), never raises a price, never touches an
 * integrated assembly — so for an already-grounded design it no-ops. Phase 3
 * (downrate/scale) is NOT applied here (it changes the design + needs council
 * validation). Spec: AUTO-IMPROVE-SPEC.md.
 *
 * Usage: npx tsx scripts/apply-auto-improve.tsx <state.json> [--write]
 */
import { readFileSync, writeFileSync } from 'fs'
import { applyAutoImproveToState } from '../src/lib/pdf-engine-v2/lib/auto-improve'

const statePath = process.argv[2]
const write = process.argv.includes('--write')
if (!statePath) {
  console.error('[apply-auto-improve] usage: npx tsx scripts/apply-auto-improve.tsx <state.json> [--write]')
  process.exit(1)
}

const state = JSON.parse(readFileSync(statePath, 'utf-8'))
const outcome = applyAutoImproveToState(state)

if (outcome.applied.length === 0) {
  console.error('[apply-auto-improve] no over-priced material macros — no-op (design already grounded in commodity reality)')
} else {
  console.error(`[apply-auto-improve] applied ${outcome.applied.join(', ')} — saved £${Math.round(outcome.cost_saving_gbp).toLocaleString('en-GB')}`)
  for (const n of outcome.notes) console.error(`  ${n}`)
}

if (write) {
  // Always persist so state.autoImproveLog is present even on a no-op (the renderer
  // reads it; absence vs an empty log is meaningful for "was auto-improve run?").
  writeFileSync(statePath, JSON.stringify(state, null, 2))
}
