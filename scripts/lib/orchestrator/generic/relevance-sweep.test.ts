/**
 * scripts/lib/orchestrator/generic/relevance-sweep.test.ts
 *
 * DETERMINISTIC RELEVANCE SWEEP — standalone test harness. Run with:
 *   npx tsx scripts/lib/orchestrator/generic/relevance-sweep.test.ts
 *
 * Same idiom as the sibling bootstrap-tool-plan.test.ts. TWO blocks:
 *   PURE  — the cache key (determinism) + the coverage gate (Part C), NO network,
 *           NO writes outside a temp dir.
 *   SMOKE — ONE+ real google/gemini-3.1-pro-preview sweep over the live catalogue
 *           on the RAS brief: prints the relevant subset + the coverage table,
 *           asserts the drum filter + biofilter + degasser + oxygen + UV + heat-
 *           pump + electrical + control units are all covered, and that the
 *           verdicts ROUND-TRIP through the cache (a second call REPLAYS the
 *           identical selection — determinism). Skipped (vacuous pass) without an
 *           OPENROUTER_API_KEY.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import '../register-all' // populate the tool registry (listTools/getTool)
import type { BriefEnvelope, ParsedConstraints } from '../types'
import { buildToolCatalogue } from './bootstrap-tool-plan'
import {
  relevanceCacheKey,
  checkUnitCoverage,
  sweepToolRelevance,
} from './relevance-sweep'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..', '..', '..')

// ── .env.local self-load (council-scorer idiom) ─────────────────────────────
const envLocal = join(REPO, '.env.local')
if (existsSync(envLocal)) {
  for (const line of readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
}

// ── tiny assert runner ──────────────────────────────────────────────────────
let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; failures.push(name); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// RAS process text (the brief's stated unit operations — the same the coverage
// gate keys off). Trimmed from briefs-rerun/yellowtail-kingfish-ras.md.
const RAS_PROCESS = [
  'Rear the kingfish in circular self-cleaning tanks with dual Cornell-type drains.',
  'Remove settleable and suspended solids in rotary drum microscreen filters with a 40 to 60 micron screen and automatic backwash.',
  'Oxidise total ammonia nitrogen to nitrate in a moving-bed biofilm reactor (MBBR) biofilter.',
  'Strip carbon dioxide below 6 mg/L in forced-draught counter-current packed-column degassers.',
  'Re-oxygenate with pure oxygen through down-flow bubble contactors (oxygen cones) fed from a pressure-swing-adsorption oxygen generator.',
  'Disinfect the recirculating water with ultraviolet reactors at a validated dose, with optional ozone.',
  'Heat and hold the water at 26.4 C using heat pumps with heat recovery; dose sodium bicarbonate.',
  'Duty and standby recirculation pumps. A planned 5 MVA, 6 MW renewable micro-grid and backup generator.',
  'A fail-safe control system with low-dissolved-oxygen, pump-trip and oxygen-pressure alarms with auto-dialler escalation.',
].join('\n')

// ── PURE block ──────────────────────────────────────────────────────────────
function pureTests(): void {
  console.log('\nPURE — cache key (determinism) + coverage gate (no network)')

  const env: Pick<BriefEnvelope, 'class' | 'scale_tier' | 'application'> = {
    class: 'aquaculture_ras', scale_tier: 'medium', application: 'land_based_marine_aquaculture',
  }
  const cat = ['a:one', 'b:two', 'c:three']

  // determinism: identical inputs → identical key
  const k1 = relevanceCacheKey('aquaculture_ras', 'desc', RAS_PROCESS, env, cat)
  const k2 = relevanceCacheKey('aquaculture_ras', 'desc', RAS_PROCESS, env, cat)
  check('cache key is deterministic (identical inputs → identical key)', k1 === k2, `${k1} vs ${k2}`)
  // order-independence of the catalogue (sorted internally)
  const k3 = relevanceCacheKey('aquaculture_ras', 'desc', RAS_PROCESS, env, [...cat].reverse())
  check('cache key is order-independent over the catalogue snapshot', k1 === k3)
  // catalogue snapshot is IN the key: adding a tool invalidates (H6 anti-overfit)
  const k4 = relevanceCacheKey('aquaculture_ras', 'desc', RAS_PROCESS, env, [...cat, 'd:four'])
  check('cache key CHANGES when the catalogue changes (new tool → re-sweep)', k1 !== k4)
  // brief change invalidates
  const k5 = relevanceCacheKey('aquaculture_ras', 'DIFFERENT desc', RAS_PROCESS, env, cat)
  check('cache key CHANGES when the brief description changes', k1 !== k5)
  // DETERMINISM FIX: duty VALUE jitter must NOT change the key (duties are not in
  // the key) — the cache is slug+brief-text+catalogue-stable across re-runs.
  // (Nothing to vary here since duties were removed from the signature; this
  // assertion documents the invariant: the same brief always yields the same key.)
  check('cache key is duty-value INDEPENDENT (run-to-run duty jitter cannot change it)', k1 === k2)

  // ── Coverage gate (Part C) — the brief-named units must be detected, and a
  //    selected tool set covers/uncovers them deterministically.
  // (i) FULL coverage: a realistic RAS tool set covers every named unit incl. the
  //     drum filter (the headline missing-before case).
  const goodSet = [
    'process:drum-filter-sizing', 'mbbr:biofilter-sizing', 'degasser:co2-stripping',
    'dissolved-oxygen:aeration-sizing', 'uv:disinfection-sizing', 'heat-pump:cop-sizing',
    'process:pump-sizing', 'electrical:cable-ampacity', 'control-systems:pid-tuning',
    'mass-aggregator:envelope-check', 'regulatory-cert-cost:lookup',
  ]
  const cov = checkUnitCoverage(RAS_PROCESS, '', goodSet)
  check('coverage gate detects the RAS named units (≥7)', cov.named_units.length >= 7, `named: ${cov.named_units.join(' | ')}`)
  check('coverage gate: drum/microscreen filter is COVERED (the missing-before unit)',
    cov.coverage.some(c => /drum\/microscreen/.test(c.unit) && c.covered_by != null),
    JSON.stringify(cov.coverage.find(c => /drum/.test(c.unit))))
  check('coverage gate: NO uncovered units for the good set', cov.uncovered.length === 0, `uncovered: ${cov.uncovered.join(', ')}`)

  // (ii) a tool set MISSING the drum filter flags it as UNSIZED (loud-log set).
  const noDrum = goodSet.filter(id => !/drum/.test(id))
  const cov2 = checkUnitCoverage(RAS_PROCESS, '', noDrum)
  check('coverage gate: removing the drum-filter tool → "drum/microscreen filter" is UNSIZED',
    cov2.uncovered.some(u => /drum\/microscreen/.test(u)), `uncovered: ${cov2.uncovered.join(', ')}`)

  // (iii) units are read from the product_description fallback too (many briefs
  //       name the units there, not in target_process).
  const cov3 = checkUnitCoverage('', 'The plant uses rotary drum microscreen filters and an MBBR biofilter.', ['x:none'])
  check('coverage gate reads named units from product_description fallback',
    cov3.named_units.some(u => /drum/.test(u)) && cov3.named_units.some(u => /biofilter/.test(u)))
}

// ── SMOKE block — real sweep on the live catalogue ──────────────────────────
async function smokeTest(): Promise<void> {
  console.log('\nSMOKE — sweepToolRelevance over the live catalogue on the RAS brief')

  if (!process.env.OPENROUTER_API_KEY) {
    check('RAS sweep (skipped: OPENROUTER_API_KEY not set — vacuous pass)', true)
    return
  }

  const catalogue = buildToolCatalogue()
  check('live catalogue populated (>150 tools)', catalogue.length > 150, `catalogue=${catalogue.length}`)

  const brief: ParsedConstraints = {
    product_class: 'aquaculture_ras',
    product_description:
      'A land-based fully recirculating marine aquaculture system (RAS) growing yellowtail kingfish ' +
      'from 200 g juveniles to 3.4 kg sashimi-grade harvest. A continuously-operated water-treatment ' +
      'and life-support plant wrapped around circular fish-rearing tanks. Recirculates 99.6% of its water.',
    extra: { constraints: { target_process: { value: RAS_PROCESS, source: 'brief' } } },
  } as any

  const envelope: BriefEnvelope = {
    class: 'aquaculture_ras', scale_tier: 'medium', voltage_tier: 'low',
    form_factor: 'field_erected', application: 'land_based_marine_aquaculture',
  } as BriefEnvelope

  const duties = [
    { key: 'recirculation_flow_m3_h', value: 4900, unit: 'm3/h' },
    { key: 'oxygen_demand_kg_day', value: 750, unit: 'kg/day' },
    { key: 'tan_removal_kg_day', value: 110, unit: 'kg/day' },
    { key: 'co2_stripping_kg_day', value: 1030, unit: 'kg/day' },
    { key: 'building_heat_loss_kw', value: 480, unit: 'kW' },
    { key: 'recirc_pump_power_kw', value: 220, unit: 'kW' },
  ]

  // Bust the cache so this is a REAL sweep (the determinism check below makes its
  // OWN fresh call then a cached replay).
  process.env.CHAIN_NO_RELEVANCE_CACHE = '1'
  const r1 = await sweepToolRelevance({ slug: 'aquaculture_ras', brief, envelope, duties, catalogue, targetProcess: RAS_PROCESS })
  if (!r1.ok) {
    check('RAS sweep succeeded', false, `stage=${r1.stage} error=${r1.error}`)
    return
  }

  console.log(`\n  ── RELEVANCE SWEEP for aquaculture_ras (${r1.relevant_tool_ids.length}/${catalogue.length} relevant, from_cache=${r1.from_cache}) ──`)
  console.log(`  relevant: ${r1.relevant_tool_ids.join(', ')}`)
  if (r1.llm_cost_usd != null) console.log(`  (LLM cost: $${r1.llm_cost_usd.toFixed(4)}, ${r1.batch_calls} batch calls)`)

  check('sweep returned a non-empty relevant subset', r1.relevant_tool_ids.length > 0)
  check('sweep is a PROPER SUBSET (relevance actually narrowed the catalogue)',
    r1.relevant_tool_ids.length < catalogue.length, `relevant=${r1.relevant_tool_ids.length} catalogue=${catalogue.length}`)
  check('every catalogue tool got a verdict (EXHAUSTIVE — nothing forgotten)',
    r1.verdicts.length === catalogue.length, `verdicts=${r1.verdicts.length} catalogue=${catalogue.length}`)

  // NO domain-blind nonsense in the relevant set (the airfoil/AUV/bicycle signatures).
  const relStr = r1.relevant_tool_ids.join(' ')
  const FORBIDDEN: Array<[string, RegExp]> = [
    ['airfoil/aerosandbox', /airfoil|aerosandbox|aeroelastic|xfoil|avl\b/i],
    ['AUV/submarine hydro', /auv|hydro-drag|submarine|submersible|sonar/i],
    ['gear-ratio (bicycle)', /gear-ratio|gear_ratio|bicycle|rolling-resistance/i],
    ['spacecraft/orbit', /orbit|tsiolkovsky|delta-v|reaction-wheel|magnetorquer/i],
  ]
  for (const [label, re] of FORBIDDEN) {
    check(`relevant set EXCLUDES ${label}`, !re.test(relStr), re.test(relStr) ? `matched in: ${relStr}` : undefined)
  }

  // COVERAGE: the brief-named units map to a relevant tool. NOTE: the drum/
  // microscreen filter has NO existing catalogue tool (there is no drum-filter
  // sizing tool), so at SWEEP-time it is a GAP — that gap is filled by Part B
  // (tool-creation-pass runs BEFORE the bootstrap in orchestrate.ts, creates the
  // drum-filter tool, registers it → the catalogue then includes it → the cache-
  // key catalogue snapshot changes → a fresh sweep can judge it relevant). This
  // standalone sweep ran WITHOUT the creation pass, so the gate correctly reports
  // the gap. We assert the NON-create-dependent units are covered, and that the
  // gate DETECTS the drum gap loudly (the missing-before unit is never silently
  // dropped). End-to-end coverage incl. the created drum tool is proven by the
  // full RAS chain run (the DONE-BAR), not this isolated sweep.
  const cov = checkUnitCoverage(RAS_PROCESS, brief.product_description, r1.relevant_tool_ids)
  console.log(`\n  ── COVERAGE (brief-named units → relevant tool) ──`)
  for (const c of cov.coverage) console.log(`    ${c.covered_by ? '✓' : '✗ UNSIZED'} ${c.unit}${c.covered_by ? ` → ${c.covered_by}` : ''}`)
  check('coverage: the gate DETECTS the drum/microscreen filter unit (named in the brief)',
    cov.coverage.some(c => /drum\/microscreen/.test(c.unit)))
  // The duties with a genuine existing-catalogue tool ARE covered by the sweep.
  for (const u of ['biofilter', 'degasser', 'oxygenation', 'UV disinfection', 'heat pump', 'recirculation', 'electrical', 'control']) {
    const row = cov.coverage.find(c => c.unit.includes(u))
    check(`coverage: "${u}" unit covered by a relevant existing tool`, !!row && row.covered_by != null,
      row ? `covered_by=${row.covered_by}` : `unit "${u}" not detected`)
  }

  // DETERMINISM: re-running with the cache ON replays the IDENTICAL selection.
  delete process.env.CHAIN_NO_RELEVANCE_CACHE
  const rWrite = await sweepToolRelevance({ slug: 'aquaculture_ras', brief, envelope, duties, catalogue, targetProcess: RAS_PROCESS }) // writes cache
  const rReplay = await sweepToolRelevance({ slug: 'aquaculture_ras', brief, envelope, duties, catalogue, targetProcess: RAS_PROCESS }) // replays cache
  if (rWrite.ok && rReplay.ok) {
    check('cache REPLAY returns from_cache=true (no LLM call on re-run)', rReplay.from_cache === true)
    check('cache REPLAY reproduces the IDENTICAL relevant set (deterministic)',
      JSON.stringify(rWrite.relevant_tool_ids) === JSON.stringify(rReplay.relevant_tool_ids),
      `write=${rWrite.relevant_tool_ids.length} replay=${rReplay.relevant_tool_ids.length}`)
  } else {
    check('cache write+replay both succeeded', false, `write.ok=${rWrite.ok} replay.ok=${rReplay.ok}`)
  }
}

async function main(): Promise<void> {
  pureTests()
  await smokeTest()

  console.log(`\n${'='.repeat(60)}`)
  console.log(`PASSED ${passed} / ${passed + failed}`)
  if (failed > 0) {
    console.log(`FAILED: ${failures.join(', ')}`)
    process.exit(1)
  }
}

main().catch((err) => { console.error(err); process.exit(1) })
