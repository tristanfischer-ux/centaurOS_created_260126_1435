/**
 * scripts/lib/orchestrator/generic/bootstrap-class-graph.test.ts
 *
 * E6a STANDALONE TEST HARNESS (tracker #22) — run with:
 *   npx tsx scripts/lib/orchestrator/generic/bootstrap-class-graph.test.ts
 *
 * Lives OUTSIDE scripts/regression-harness.tsx (foreign-dirty workstream) —
 * same idiom as the sibling class-fit-check.test.ts. FOLLOW-UP: port into
 * the harness bucket UNIVERSAL.class_graph_bootstrap_* once it frees up.
 *
 * NO network, NO LLM, NO writes to the real forge-truth.db: validation +
 * candidate-store tests run against a throwaway temp DB.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  validateBootstrapGraph,
  validateGraphMagnitudeAgainstBrief,
  assertCandidateSlug,
  storeCandidate,
  latestCandidate,
} from './bootstrap-class-graph'
import type { ProductClassGraph } from '../../../../src/lib/pdf-engine-v2/class-reference-graph'

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

function goodGraphRaw(): any {
  return {
    display_name: 'Tidal Kite Subsea Generator (test fixture)',
    scope_notes: 'Tethered subsea tidal-stream kite. Fixture only.',
    nodes: [
      { class: 'energy_conversion_transduction', role: 'principal', required: true, display: 'PMSG generator + shrouded rotor', justified_by: 'brief: harvest tidal-stream kinetic power via shrouded rotor + PMSG', derived_parameter_hints: ['rated_power_kw', 'rotor_diameter_m'] },
      { class: 'actuation_kinematics', role: 'actuator', required: true, display: 'Wing + control surfaces + winch', justified_by: 'brief: kite must fly a figure-8 path and reel for station-keeping' },
      { class: 'structure_containment', role: 'enclosure', required: true, display: 'Pressure-tolerant hull + fairings', justified_by: 'brief: subsea pressure + biofouling enclosure duty' },
      { class: 'power_distribution', role: 'subsystem', required: true, display: 'Subsea export cable + slip ring', justified_by: 'brief: export generated power ashore via tether conductors' },
      { class: 'control_compute_communication', role: 'communications', required: true, display: 'Flight controller + acoustic link', justified_by: 'brief: closed-loop flight control + telemetry to surface' },
      { class: 'sensing_instrumentation', role: 'sensor', required: true, display: 'IMU + DVL + current profiler', justified_by: 'brief: navigation and inflow sensing for flight autonomy' },
      { class: 'safety_protection', role: 'safety', required: true, display: 'Emergency surfacing + tether release', justified_by: 'brief hazard: loss of control requires emergency surface + release' },
      { class: 'mooring_foundation', role: 'subsystem', required: true, display: 'Gravity base + tether', justified_by: 'brief: seabed reaction and tether anchorage' },
    ],
    edges: [
      { from_class: 'energy_conversion_transduction', to_class: 'power_distribution', mechanism: 'ac_busbar', required: true, direction: 'directional' },
      { from_class: 'control_compute_communication', to_class: 'actuation_kinematics', mechanism: 'can_bus', required: true, direction: 'directional' },
      { from_class: 'sensing_instrumentation', to_class: 'control_compute_communication', mechanism: 'sensor_feedback', required: true, direction: 'directional' },
      { from_class: 'structure_containment', to_class: 'mooring_foundation', mechanism: 'mechanical_mount', required: true, direction: 'mutual' },
      { from_class: 'safety_protection', to_class: 'control_compute_communication', mechanism: 'alarm_interlock', required: true, direction: 'mutual' },
    ],
  }
}

function main(): void {
  const SLUG = 'tidal_kite_selftest'

  // ── V: deterministic validation ─────────────────────────────────────
  console.log('\nV — validateBootstrapGraph')
  const ok = validateBootstrapGraph(goodGraphRaw(), SLUG)
  check('valid graph passes', ok.ok, ok.errors.join('; '))
  check('valid graph carries the slug as product_class', ok.graph?.product_class === SLUG)
  check('scope_notes carries the bootstrap provenance label', /bootstrap-candidate@v1/.test(ok.graph?.scope_notes ?? ''))
  check('derived_parameter_hints preserved on the principal node',
    Array.isArray((ok.graph?.nodes[0] as any)?.derived_parameter_hints))

  let bad = goodGraphRaw(); bad.nodes = bad.nodes.slice(0, 4)
  let v = validateBootstrapGraph(bad, SLUG)
  check('node count < 6 fails', !v.ok && v.errors.some(e => /node count/.test(e)), v.errors.join('; '))

  bad = goodGraphRaw(); bad.nodes.push({ ...bad.nodes[1] })
  v = validateBootstrapGraph(bad, SLUG)
  check('duplicate node id fails', !v.ok && v.errors.some(e => /duplicate node id/.test(e)))

  bad = goodGraphRaw(); bad.nodes[0].role = 'subsystem'
  v = validateBootstrapGraph(bad, SLUG)
  check('zero principals fails', !v.ok && v.errors.some(e => /principal/.test(e)))

  bad = goodGraphRaw(); bad.nodes[1].role = 'principal'
  v = validateBootstrapGraph(bad, SLUG)
  check('two principals fails', !v.ok && v.errors.some(e => /principal/.test(e)))

  bad = goodGraphRaw(); bad.edges[0].to_class = 'nonexistent_node'
  v = validateBootstrapGraph(bad, SLUG)
  check('edge endpoint not in nodes fails', !v.ok && v.errors.some(e => /is not a node/.test(e)))

  bad = goodGraphRaw(); delete bad.edges[1].mechanism
  v = validateBootstrapGraph(bad, SLUG)
  check('edge without mechanism fails', !v.ok && v.errors.some(e => /mechanism missing/.test(e)))

  bad = goodGraphRaw(); bad.edges.push({ ...bad.edges[0] })
  v = validateBootstrapGraph(bad, SLUG)
  check('duplicate edge fails', !v.ok && v.errors.some(e => /duplicate edge/.test(e)))

  bad = goodGraphRaw(); bad.display_name = ''
  v = validateBootstrapGraph(bad, SLUG)
  check('empty display_name fails', !v.ok && v.errors.some(e => /display_name/.test(e)))

  bad = goodGraphRaw(); bad.nodes[2].class = 'Bad-Class-Id!'
  v = validateBootstrapGraph(bad, SLUG)
  check('non-snake_case node id fails', !v.ok && v.errors.some(e => /must match/.test(e)))

  bad = goodGraphRaw(); delete bad.nodes[0].justified_by
  v = validateBootstrapGraph(bad, SLUG)
  check('missing justified_by fails admission', !v.ok && v.errors.some(e => /justified_by missing/.test(e)))

  bad = goodGraphRaw(); bad.nodes[0].justified_by = `class=${SLUG}`
  v = validateBootstrapGraph(bad, SLUG)
  check('class-only justified_by fails admission', !v.ok && v.errors.some(e => /class-only/.test(e)))

  check('valid graph preserves justified_by on principal',
    typeof (ok.graph?.nodes[0] as any)?.justified_by === 'string' &&
      String((ok.graph?.nodes[0] as any).justified_by).length > 10)

  // ── M: device-scale magnitude admission (cold cell-cycler class) ────
  console.log('\nM — validateGraphMagnitudeAgainstBrief')
  const cyclerBrief = {
    product_description:
      'Benchtop 8-channel battery cell cycler with Peltier-controlled air-cooled cell bay, ' +
      'linear-assisted discharge, precision AFE, 450 mm envelope.',
  } as any
  const cyclerEnv = { scale_tier: 'benchtop', application: 'battery cell cycler' } as any
  const liquidGraph = ok.graph!
  // Inject the cold-v1c failure: mass_fluid on an air-cooled instrument
  const polluted = {
    ...liquidGraph,
    nodes: [
      ...liquidGraph.nodes,
      {
        class: 'mass_fluid_transport_process',
        role: 'subsystem' as const,
        required: true,
        display: 'Pipework + manifold (forced air)',
        justified_by: 'brief: cooling',
      },
    ],
  }
  const magBad = validateGraphMagnitudeAgainstBrief(polluted as any, cyclerBrief, cyclerEnv)
  check('mass_fluid on air-cooled benchtop fails magnitude', magBad.some((e) => /mass_fluid_transport_process/.test(e)))

  const gimbalPolluted = {
    ...liquidGraph,
    nodes: liquidGraph.nodes.map((n, i) =>
      i === 1
        ? { ...n, display: '2-axis gimbal to time-average gravity', justified_by: 'class default kinematics' }
        : n,
    ),
  }
  const magGimbal = validateGraphMagnitudeAgainstBrief(gimbalPolluted as any, cyclerBrief, cyclerEnv)
  check('gimbal without brief microgravity fails magnitude', magGimbal.some((e) => /gimbal|microgravity/i.test(e)))

  const magClean = validateGraphMagnitudeAgainstBrief(liquidGraph, {
    product_description: 'Subsea tidal kite with tethered PMSG generator at 50 m depth.',
  } as any, { scale_tier: 'plant', application: 'tidal kite' } as any)
  check('plant-scale graph without liquid veto noise passes', magClean.length === 0)

  // ── S: candidate-store boundary (security item 18 pattern) ──────────
  console.log('\nS — candidate-store slug boundary')
  let threw = false
  try { assertCandidateSlug(`x'; DROP TABLE class_reference_graphs;--`) } catch { threw = true }
  check('hostile slug rejected with a throw', threw)
  threw = false
  try { assertCandidateSlug('tidal-kite') } catch { threw = true }
  check('hyphenated slug rejected (caller must normalise)', threw)
  threw = false
  try { assertCandidateSlug('tidal_kite_subsea_generator') } catch { threw = true }
  check('clean slug accepted', !threw)

  // ── D: G1 candidate store on a THROWAWAY temp DB ────────────────────
  console.log('\nD — class_graph_candidates store (temp DB, real DB untouched)')
  const tmp = mkdtempSync(join(tmpdir(), 'bootstrap-test-'))
  const tmpDb = join(tmp, 'test.db')
  try {
    const graph = ok.graph as ProductClassGraph
    const r1 = storeCandidate(SLUG, graph, tmpDb)
    check('first insert → version 1, status candidate', r1.version === 1 && r1.status === 'candidate', JSON.stringify(r1))
    const r2 = storeCandidate(SLUG, graph, tmpDb)
    check('second insert → version 2 (COALESCE MAX+1)', r2.version === 2, JSON.stringify(r2))
    const latest = latestCandidate(SLUG, tmpDb)
    check('latestCandidate returns newest version', latest?.version === 2 && latest?.status === 'candidate')
    const roundTrip = latest ? validateBootstrapGraph(JSON.parse(latest.graph_json), SLUG) : { ok: false, errors: ['no row'] }
    check('stored graph_json round-trips validation', roundTrip.ok, roundTrip.errors.join('; '))
    check('missing slug → null', latestCandidate('never_stored_slug', tmpDb) === null)
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`PASSED ${passed} / ${passed + failed}`)
  if (failed > 0) {
    console.log(`FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main()
