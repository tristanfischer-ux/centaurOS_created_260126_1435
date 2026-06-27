// proveCatch guard for the flow-machine capacity validation in emitter-completion.ts
// (Tristan 2026-06-27 — chose "add capacity to the parts DB + validate"; physics-critic Risk HIGH).
//
// THE BUG: fill-blank-mpn pinned a 'Grundfos CM3-3' (a 3 m³/h pump) on the 90 m³/h Irrigation Pump
// because the DB lookup matches by NAME/class and the parts table has no capacity column. The fix
// parses the flow capacity from the row's raw_excerpt spec ("3 m3/h @ 35m head") and SKIPS a pin
// whose capacity is < 50% of the gap word's computed duty (keeping the honest generic spec). This
// guard fails the build if the capacity parser or the duty reader regress.

import { partFlowCapacityM3h, wordFlowDutyM3h } from '../../../../src/lib/pdf-engine-v2/lib/emitter-completion'

function pumpWord(name: string, m3h: number) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  return {
    name_human: name, content_character: { character_id: slug, name_human: name },
    modifier_characters: [{ kind: 'rating_primary', value: String(m3h), unit: 'm³/h' }],
  } as never
}

function run() {
  // capacity parse from the real CM3-3 ingest excerpt
  const cm33 = { part_name: 'main irrigation pump', raw_excerpt: '{"desc":"CM3-3 horizontal multistage centrifugal pump, 0.55kW 3-phase, stainless 304, 3 m3/h @ 35m head"}' }
  if (partFlowCapacityM3h(cm33) !== 3) throw new Error(`pump-capacity: should parse 3 m³/h from the CM3-3 desc (got ${partFlowCapacityM3h(cm33)})`)
  const big = { part_name: 'end-suction pump', raw_excerpt: 'NB 100-200, 120 m³/h @ 40 m' }
  if (partFlowCapacityM3h(big) !== 120) throw new Error(`pump-capacity: should parse 120 m³/h (got ${partFlowCapacityM3h(big)})`)
  if (partFlowCapacityM3h({ part_name: 'no flow here', raw_excerpt: '24 VDC relay' }) !== null) throw new Error('pump-capacity: a non-flow spec must parse to null')

  // duty read from the gap word (only for flow machines)
  if (wordFlowDutyM3h(pumpWord('Irrigation Pump', 90)) !== 90) throw new Error('pump-capacity: irrigation pump duty must read 90 m³/h')
  if (wordFlowDutyM3h({ name_human: 'PLC Controller', modifier_characters: [{ kind: 'rating_primary', value: '2', unit: 'kW' }] } as never) !== null) throw new Error('pump-capacity: a non-flow word must read null duty')

  // the rejection decision: CM3-3 (3 m³/h) is < 50% of the 90 m³/h duty → must be skipped
  const duty = wordFlowDutyM3h(pumpWord('Irrigation Pump', 90))!
  const cap = partFlowCapacityM3h(cm33)!
  if (!(cap < duty * 0.5)) throw new Error(`pump-capacity: a 3 m³/h pump for a 90 m³/h duty must trip the <50% reject (cap ${cap}, duty ${duty})`)
  // a correctly-sized pump (120 m³/h for a 90 m³/h duty) must NOT be rejected
  if (partFlowCapacityM3h(big)! < duty * 0.5) throw new Error('pump-capacity: a correctly-sized pump must NOT be rejected')

  // eslint-disable-next-line no-console
  console.log('pump-capacity --selftest OK (CM3-3 3 m³/h rejected for a 90 m³/h duty; a 120 m³/h pump accepted)')
}

run()
