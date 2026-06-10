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
      { class: 'energy_conversion_transduction', role: 'principal', required: true, display: 'PMSG generator + shrouded rotor', derived_parameter_hints: ['rated_power_kw', 'rotor_diameter_m'] },
      { class: 'actuation_kinematics', role: 'actuator', required: true, display: 'Wing + control surfaces + winch' },
      { class: 'structure_containment', role: 'enclosure', required: true, display: 'Pressure-tolerant hull + fairings' },
      { class: 'power_distribution', role: 'subsystem', required: true, display: 'Subsea export cable + slip ring' },
      { class: 'control_compute_communication', role: 'communications', required: true, display: 'Flight controller + acoustic link' },
      { class: 'sensing_instrumentation', role: 'sensor', required: true, display: 'IMU + DVL + current profiler' },
      { class: 'safety_protection', role: 'safety', required: true, display: 'Emergency surfacing + tether release' },
      { class: 'mooring_foundation', role: 'subsystem', required: true, display: 'Gravity base + tether' },
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
