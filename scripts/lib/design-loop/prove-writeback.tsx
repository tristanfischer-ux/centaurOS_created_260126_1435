/**
 * prove-writeback — Increment 1 proof on REAL dossiers (CO2 + e-fuel), no synthetic data.
 * Shows the CAD→engine bridge reads the converged demand + measured run-lengths and produces
 * the right engine-quantity updates, identically across two archetypes (universal). Exits 1 on
 * any failed assertion. Run:  npx tsx scripts/lib/design-loop/prove-writeback.tsx
 */
import { computeQuantityUpdates, applyUpdates, isSettled, appendLedger, loadJson, ConvergenceReport, RouteManifest } from './writeback-bridge'

const CASES = [
  { name: 'CO2',    dir: 'out/co2-universal-proof' },
  { name: 'e-fuel', dir: 'out/redo-efuel-env-budget' },
]

let failures = 0
function check(cond: boolean, msg: string) { if (!cond) { console.error(`   ✗ ${msg}`); failures++ } else { console.error(`   ✓ ${msg}`) } }

for (const c of CASES) {
  console.error(`\n── ${c.name}  (${c.dir}) ──`)
  const conv = loadJson<ConvergenceReport>(c.dir, 'convergence-report.json')
  const rm = loadJson<RouteManifest>(c.dir, 'route-manifest.json')
  const state = loadJson<any>(c.dir, 'state.json')
  check(!!conv, 'convergence-report.json present')
  check(!!rm, 'route-manifest.json present')
  check(!!state, 'state.json present')
  if (!conv || !rm || !state) continue

  const quantities = (state.orchestratorContract && state.orchestratorContract.quantities) || {}
  const updates = computeQuantityUpdates(conv, rm, quantities)

  for (const u of updates) {
    const fromS = u.from == null ? '(new)' : String(u.from)
    console.error(`   ${u.key}: ${fromS} » ${u.to} ${u.unit}   (Δ ${(u.rel_change * 100).toFixed(2)}%)  ← ${u.source}`)
  }

  // assertions — the converged SUPPLY demand must be read + written ADDITIVELY (new key)
  const elec = updates.find(u => u.key === 'total_supply_demand_kw')
  const convergedKw = (conv.trajectory || []).slice(-1)[0]?.total_demand_kw
  check(!!elec, 'supply-demand update produced (additive)')
  check(!!elec && Math.abs(elec.to - Number(convergedKw)) < 0.01, `writes the converged demand (${convergedKw} kW)`)
  check(!('total_supply_demand_kw' in quantities), 'is a NEW key (does not overwrite a brief metric)')
  // interconnect lengths must be harvested from the routed runs
  check(updates.some(u => u.key === 'interconnect_pipe_length_m'), 'pipe-length harvested from routes')
  // applyUpdates is pure + lands the value
  if (elec) {
    const after = applyUpdates(quantities, [elec])
    check(after['total_supply_demand_kw']?.value === elec.to, 'applyUpdates lands the value, preserves shape')
    check(!('total_supply_demand_kw' in quantities), 'original quantities object untouched (pure)')
  }
  // ledger writes + reads back
  appendLedger(c.dir, { pass: 1, settled: isSettled(updates), blender_iterations: conv.iterations, updates })
  const led = loadJson<any>(c.dir, 'design-loop-ledger.json')
  check(!!led && Array.isArray(led.passes) && led.passes.length >= 1, 'design-loop-ledger.json written + readable')
}

console.error(`\n${failures === 0 ? '✓ ALL PASS' : `✗ ${failures} FAILED`} — writeback bridge proven on ${CASES.length} archetypes`)
process.exit(failures === 0 ? 0 : 1)
