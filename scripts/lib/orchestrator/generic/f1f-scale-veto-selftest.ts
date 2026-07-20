/**
 * proveCatch for F1f Layer 1 — the hard scale-veto. A PLANT-ONLY tool family is INVISIBLE to a
 * lab-scale (handheld/benchtop) design identity, no matter what shared noun ("heater") the brief
 * carries; on a plant identity the same tools are kept. LLM-free (tests applyScaleVeto directly).
 * Run: npx tsx scripts/lib/orchestrator/generic/f1f-scale-veto-selftest.ts
 */
import { applyScaleVeto, isLabScaleTier } from './relevance-sweep'

function main(): number {
  const fails: string[] = []
  const ok = (c: boolean, m: string) => { if (!c) fails.push(m) }

  // The catalogue the LLM (or cache) judged — pretend it said YES to everything, incl. the
  // plant-only families a "heater"/"vessel" keyword can drag in.
  const verdicts = [
    { tool_id: 'thermal:cartridge-heater', relevant: true, reason: 'lab heater' },
    { tool_id: 'aquaculture:tank-heat-sizing', relevant: true, reason: 'keyword: heater' },
    { tool_id: 'pressure-vessel:design', relevant: true, reason: 'keyword: vessel' },
    { tool_id: 'irrigation:pump-sizing', relevant: true, reason: 'keyword: pump' },
    { tool_id: 'hvac:load-sizing', relevant: true, reason: 'keyword: thermal' },
    { tool_id: 'pcb:resolve-components', relevant: true, reason: 'real lab electronics' },
    { tool_id: 'optics:beer-lambert', relevant: true, reason: 'real lab optics' },
  ]

  // (1) BENCHTOP identity → every plant-only tool hard-vetoed; the real lab tools survive.
  const bench = applyScaleVeto(verdicts, 'benchtop')
  const benchRelevant = new Set(bench.verdicts.filter(v => v.relevant).map(v => v.tool_id))
  for (const plant of ['aquaculture:tank-heat-sizing', 'pressure-vessel:design',
                       'irrigation:pump-sizing', 'hvac:load-sizing']) {
    ok(!benchRelevant.has(plant), `benchtop identity must HARD-VETO the plant-only tool '${plant}'`)
  }
  ok(benchRelevant.has('thermal:cartridge-heater'), 'the LAB cartridge-heater tool must survive on benchtop')
  ok(benchRelevant.has('pcb:resolve-components') && benchRelevant.has('optics:beer-lambert'),
    'real lab electronics/optics tools must survive the veto')
  ok(bench.vetoed.length === 4, `benchtop veto count must be 4 (got ${bench.vetoed.length})`)

  // (2) HANDHELD identity vetoes too (isLabScaleTier).
  ok(isLabScaleTier('handheld') && isLabScaleTier('benchtop'), 'handheld+benchtop are lab-scale')
  ok(applyScaleVeto(verdicts, 'handheld').vetoed.length === 4, 'handheld identity must veto the same 4')

  // (3) PLANT identity → NO veto (the plant tools are legitimate there).
  const plant = applyScaleVeto(verdicts, 'plant')
  ok(plant.vetoed.length === 0, `plant identity must NOT veto any tool (got ${plant.vetoed.length})`)
  ok(plant.verdicts.filter(v => v.relevant).length === verdicts.length,
    'plant identity keeps every tool the LLM approved')

  // (4) NO tier / unknown → strict no-op (backward-compatible).
  ok(applyScaleVeto(verdicts, undefined).vetoed.length === 0, 'no tier → no veto (backward-compatible)')
  ok(applyScaleVeto(verdicts, 'unknown').vetoed.length === 0, 'unknown tier → no veto')
  ok(!isLabScaleTier('plant') && !isLabScaleTier('field') && !isLabScaleTier('unknown'),
    'plant/field/unknown are NOT lab-scale')

  if (fails.length) {
    console.error('[f1f-scale-veto][selftest] FAIL:')
    for (const f of fails) console.error('  ✗ ' + f)
    return 1
  }
  console.error('[f1f-scale-veto] _selftest passed — plant-only tools hard-vetoed on benchtop/handheld '
    + 'identity (heater→aquaculture/RAS/pressure-vessel/HVAC excluded); kept on plant; no-op without a tier')
  return 0
}

process.exit(main())
