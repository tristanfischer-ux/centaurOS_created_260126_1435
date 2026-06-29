// proveCatch for the MOTORLESS-DUPLICATE drop in reconcilePrincipalEquipment (Tristan 2026-06-29,
// the Codema fertigation physics HIGH).
//
// THE BUG: the contract sizes a POWERED fertigation pump (fertigation_dosing_pump_power_kw=7.5,
// _throughput_m3_h=45, _count=2) → a correct synthesised "Fertigation Dosing Pump ×2, 7.5 kW".
// But the LLM ALSO emitted a "Water-Powered Dosing Pump" (→ Dosatron D8RE5, a motorless 8 m³/h
// injector) in the fertigation module — a DUPLICATE that the physics critic flags as undersized.
// It evades every other dedup: non-_synthesized + MPN-shielded + different name + different residual.
// THE FIX: drop a NON-synth word naming a MOTORLESS drive whose device-kind matches a POWERED
// contract canon and shares ≥1 of its distinguishing stems. SAFE: keyed on water-powered/-driven
// vocab only, so a real ELECTRIC dosing pump is never dropped; a same-kind powered canon + shared
// stem ties the drop to a specific principal. This guard fails the build if that regresses.

import { reconcilePrincipalEquipment } from './universal-contract-sizing'

function w(name: string, opts: { synth?: boolean; mfr?: string; qty?: number } = {}) {
  const slug = name.toLowerCase().replace(/\W+/g, '_')
  const mods: Array<{ kind: string; value: string; unit?: string }> = [
    { kind: 'quantity', value: `×${opts.qty ?? 1}` },
  ]
  if (opts.mfr) { mods.push({ kind: 'manufacturer', value: opts.mfr }); mods.push({ kind: 'part_number', value: 'D8RE5' }) }
  return {
    id: `${slug}_word`, name_human: name,
    content_character: { character_id: `${slug}`, name_human: name },
    modifier_characters: mods, _synthesized: !!opts.synth,
  } as never
}

function mod(id: string, words: unknown[]) {
  return { module: id, sub_modules: [{ sub_module: `${id}_sm`, words }] }
}

function num(value: number) { return { value } }

function run() {
  // contract: a POWERED fertigation pump (7.5 kW) + an electric drain pump; NO water-powered group.
  const contract = {
    quantities: {
      fertigation_dosing_pump_throughput_m3_h: num(45),
      fertigation_dosing_pump_power_kw: num(7.5),
      fertigation_dosing_pump_count: num(2),
      drain_transfer_pump_throughput_m3_h: num(45),
      drain_transfer_pump_power_kw: num(1.9),
      drain_transfer_pump_count: num(2),
    },
  } as never

  // design: the correct synthesised pump + the motorless Dosatron duplicate + legit OTHER pumps
  const modules = [
    mod('mass_fluid_transport_process', [
      w('Fertigation Dosing Pump', { synth: true, qty: 2 }),
      w('Backwash Pump', { qty: 2 }),                 // grounded non-synth, electric → MUST survive
      w('Drain Transfer Pump', { synth: true, qty: 2 }),
    ]),
    mod('fertigation_dosing_system', [
      w('Water-Powered Dosing Pump', { mfr: 'Dosatron' }),   // the motorless duplicate → MUST be dropped
    ]),
  ]

  const res = reconcilePrincipalEquipment(modules as never, contract)

  const names = new Set<string>()
  for (const m of modules) for (const sm of m.sub_modules) for (const ww of sm.words as Array<{ name_human?: string }>) names.add(String(ww.name_human))

  if (names.has('Water-Powered Dosing Pump')) {
    throw new Error('motorless-duplicate: the Water-Powered Dosing Pump (Dosatron) duplicate of a 7.5 kW powered canon must be DROPPED')
  }
  for (const keep of ['Fertigation Dosing Pump', 'Backwash Pump', 'Drain Transfer Pump']) {
    if (!names.has(keep)) throw new Error(`motorless-duplicate: a legitimate pump was wrongly dropped: ${keep}`)
  }

  // NEGATIVE: with NO powered canon, a motorless word is NOT touched (no false drop).
  const modules2 = [mod('m', [w('Water-Powered Dosing Pump', { mfr: 'Dosatron' })])]
  reconcilePrincipalEquipment(modules2 as never, { quantities: {} } as never)
  const survived = (modules2[0].sub_modules[0].words as Array<{ name_human?: string }>).some((x) => x.name_human === 'Water-Powered Dosing Pump')
  if (!survived) throw new Error('motorless-duplicate: with NO powered canon present, a motorless word must NOT be dropped')

  // eslint-disable-next-line no-console
  console.log('motorless-duplicate --selftest OK (Dosatron water-powered duplicate dropped vs a 7.5 kW powered canon; Backwash/Fertigation/Drain pumps kept; no powered canon ⇒ no drop)')
}

run()
