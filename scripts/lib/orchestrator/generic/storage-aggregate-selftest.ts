// proveCatch guard for the "a total_* aggregate is never a physical vessel" fix in
// universal-contract-sizing.ts (Tristan 2026-06-27, physics-critic Risk-tab PHYSICS-FIRST work).
//
// THE BUG it catches: the contract carries the brief's SEPARATE storage vessels
// (fresh_water_tank 40 m³ ×1, drain_water_tank ×2) AND a roll-up total_water_storage_volume_m3.
// The synthesis minted a vessel for the total TOO — a single 262 m³ "Total Water Storage" tank
// that double-counts the constituents and reads as one store mixing clean RO water with
// recirculated drain water (physics-critic HIGH: violates the ebb/flow process topology, makes
// drain recovery impossible without cross-contamination). The fix suppresses synthesis of a
// total_* / overall / combined volume WHEN the constituent vessels are present (≥2 synthesisable
// non-aggregate volume groups). This guard fails the build if the phantom aggregate tank returns,
// OR if the suppression over-reaches and a LONE total_* (no breakdown) stops making its vessel.
//
// Standalone (not a --selftest block inside the big module). Wired into verify-engine-guards.sh.

import { applyUniversalContractSizing, reconcilePrincipalEquipment, cylinderFromVolumeM3 } from './universal-contract-sizing'

function names(modules: any): string[] {
  const out: string[] = []
  for (const m of modules) for (const sm of m.sub_modules) for (const w of sm.words ?? []) out.push(w.name_human || '')
  return out
}
function emptyModules(): any {
  return [{ module: 'storage', sub_modules: [{ sub_module: 's', words: [] }] }]
}
function contractOf(q: Record<string, number>): any {
  const quantities: Record<string, { value: number }> = {}
  for (const [k, v] of Object.entries(q)) quantities[k] = { value: v }
  return { quantities }
}

function run() {
  // CASE 1 (proveCatch): separate tanks + a total roll-up → the separate tanks synthesise,
  // the total does NOT (it is a reporting sum, not a vessel).
  const m1 = emptyModules()
  applyUniversalContractSizing(m1 as never[], contractOf({
    fresh_water_tank_volume_each_m3: 40, fresh_water_tank_count: 1,
    drain_water_tank_volume_each_m3: 40, drain_water_tank_count: 2,
    total_water_storage_volume_m3: 120,
  }), { explode: false, instrument: false, dedupeAndStrip: false })
  const n1 = names(m1)
  const hasFresh = n1.some((x) => /fresh water tank/i.test(x))
  const hasDrain = n1.some((x) => /drain water tank/i.test(x))
  const hasTotal = n1.some((x) => /total|overall|combined/i.test(x))
  if (!hasFresh || !hasDrain) throw new Error(`storage-aggregate: the separate fresh/drain tanks must still synthesise (got ${JSON.stringify(n1)})`)
  if (hasTotal) throw new Error(`storage-aggregate: a "Total Water Storage" phantom vessel was synthesised — a total_* roll-up must NEVER become a physical tank (got ${JSON.stringify(n1)})`)

  // CASE 2 (counter-case): a LONE total_* with no constituent breakdown MUST still make its
  // vessel (don't lose the only storage tank).
  const m2 = emptyModules()
  applyUniversalContractSizing(m2 as never[], contractOf({
    total_buffer_tank_volume_m3: 50,
  }), { explode: false, instrument: false, dedupeAndStrip: false })
  const n2 = names(m2)
  if (!n2.some((x) => /buffer/i.test(x))) throw new Error(`storage-aggregate: a lone total_* vessel (no constituents) must still synthesise — the suppression over-reached (got ${JSON.stringify(n2)})`)

  // CASE 3 (the REAL bug path): reconcilePrincipalEquipment re-mints principals from the contract
  // LATER in the chain. Even with a pre-existing "Total Water Storage" word in the design, the
  // reconcile must DROP it (not in `canons`) while keeping the separate tanks.
  const m3: any = [{
    module: 'storage', sub_modules: [{ sub_module: 's', words: [
      { id: 'total_water_storage_synth_word', name_human: 'Total Water Storage', _synthesized: true,
        content_character: { character_id: 'total_water_storage_synth', name_human: 'Total Water Storage' },
        modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '262', unit: 'm³' }] },
      { id: 'fresh_water_tank_synth_word', name_human: 'Fresh Water Tank', _synthesized: true,
        content_character: { character_id: 'fresh_water_tank_synth', name_human: 'Fresh Water Tank' },
        modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '40', unit: 'm³' }] },
      { id: 'drain_water_tank_synth_word', name_human: 'Drain Water Tank', _synthesized: true,
        content_character: { character_id: 'drain_water_tank_synth', name_human: 'Drain Water Tank' },
        modifier_characters: [{ kind: 'quantity', value: '×2' }, { kind: 'capacity', value: '40', unit: 'm³' }] },
    ] }],
  }]
  reconcilePrincipalEquipment(m3 as never[], contractOf({
    fresh_water_tank_volume_each_m3: 40, fresh_water_tank_count: 1,
    drain_water_tank_volume_each_m3: 40, drain_water_tank_count: 2,
    total_water_storage_volume_m3: 120,
  }) as never)
  const n3 = names(m3)
  if (n3.some((x) => /total|overall|combined/i.test(x))) throw new Error(`storage-aggregate: reconcilePrincipalEquipment did NOT remove the phantom "Total Water Storage" mega-tank (got ${JSON.stringify(n3)})`)
  if (!n3.some((x) => /fresh water tank/i.test(x)) || !n3.some((x) => /drain water tank/i.test(x))) throw new Error(`storage-aggregate: reconcile dropped a real separate tank (got ${JSON.stringify(n3)})`)

  // PHANTOM LLM-AUTHORED VESSEL (physics-critic HIGH 2026-06-30): a large fluid vessel the LLM invented
  // (NOT _synthesized) with NO backing contract group is a scope-fidelity phantom → dropped; a grounded
  // tank survives. The Codema run shipped a 40 m³ "Cip Tank"/"Cleaning Tank" the brief never asked for.
  const m4: any = [{ module: 'maintenance', sub_modules: [{ sub_module: 's', words: [
    { id: 'fresh_water_tank_synth_word', name_human: 'Fresh Water Tank', _synthesized: true,
      content_character: { character_id: 'fresh_water_tank_synth', name_human: 'Fresh Water Tank' },
      modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '40', unit: 'm³' }] },
    { id: 'cip_tank_word', name_human: 'Cip Tank',  // LLM-authored, NOT _synthesized, no contract key
      content_character: { character_id: 'cip_tank', name_human: 'Cip Tank' },
      modifier_characters: [{ kind: 'quantity', value: '×1' }, { kind: 'capacity', value: '40', unit: 'm³' }] },
  ] }] }]
  reconcilePrincipalEquipment(m4 as never[], contractOf({ fresh_water_tank_volume_each_m3: 40, fresh_water_tank_count: 1 }) as never)
  const n4 = names(m4)
  if (n4.some((x) => /cip|cleaning/i.test(x))) throw new Error(`storage-aggregate: ungrounded LLM "Cip Tank" phantom must be DROPPED (got ${JSON.stringify(n4)})`)
  if (!n4.some((x) => /fresh water tank/i.test(x))) throw new Error(`storage-aggregate: the grounded Fresh Water Tank must SURVIVE (got ${JSON.stringify(n4)})`)

  // TANK ASPECT (physics-critic HIGH 2026-06-30): a CLOSED vertical STORAGE tank must be TALL (h≈d, the
  // real Enduramaxx 3.64×3.88 — not a 5.8⌀×1.5 paddling pool); an OPEN process basin (rearing/aeration/
  // clarifier) stays wide+shallow. A 40 m³ storage tank → ~3.7×3.7; a 40 m³ rearing tank → ~5.8×1.5.
  const tankDim = cylinderFromVolumeM3(40, 'Fresh Water Tank')
  const tankM = /([0-9.]+) m dia x ([0-9.]+) m/.exec(tankDim)
  if (!tankM || Number(tankM[2]) / Number(tankM[1]) < 0.7) throw new Error(`storage-aggregate: a 40 m³ STORAGE tank must be TALL (h/d≥0.7), got ${tankDim}`)
  const basinDim = cylinderFromVolumeM3(40, 'Rearing Tank')
  const basinM = /([0-9.]+) m dia x ([0-9.]+) m/.exec(basinDim)
  if (!basinM || Number(basinM[2]) / Number(basinM[1]) > 0.5) throw new Error(`storage-aggregate: an OPEN rearing tank must stay wide+shallow (h/d≤0.5), got ${basinDim}`)
  // RESERVOIR is CLOSED storage (not open-basin): a 91 m³ cleanwater reservoir must be tall
  // (h/d≥0.7), never the open-basin pancake ⌀8×1.8 that floated on a vertical-vessel skirt.
  const resDim = cylinderFromVolumeM3(91, 'Cleanwater Reservoir')
  const resM = /([0-9.]+) m dia x ([0-9.]+) m/.exec(resDim)
  if (!resM || Number(resM[2]) / Number(resM[1]) < 0.7) {
    throw new Error(`storage-aggregate: a 91 m³ RESERVOIR must be TALL closed storage (h/d≥0.7), got ${resDim}`)
  }
  // STORAGE-PIN ALIAS: when the contract carries BOTH a compliance scalar
  // (cleanwater_reservoir_volume_m3) AND the equipment family that delivers it
  // (fresh_water_tank_volume_each_m3 + count), only ONE clean-side vessel may be synthesised.
  // A same-volume drain tank must still mint separately (clean ≠ dirty role family).
  const mPin = emptyModules()
  applyUniversalContractSizing(
    mPin as never[],
    contractOf({
      cleanwater_reservoir_volume_m3: 91,
      fresh_water_tank_volume_each_m3: 91,
      fresh_water_tank_count: 1,
      drain_water_tank_volume_each_m3: 91,
      drain_water_tank_count: 2,
    }) as never,
    { explode: false, instrument: false, dedupeAndStrip: false },
  )
  const nPin = names(mPin)
  const pinHits = nPin.filter((x) => /cleanwater|reservoir|fresh water/i.test(x))
  if (pinHits.length !== 1) {
    throw new Error(
      `storage-aggregate: storage-pin alias must mint exactly ONE clean-side vessel (got ${JSON.stringify(pinHits)})`,
    )
  }
  if (!nPin.some((x) => /fresh water tank/i.test(x))) {
    throw new Error(
      `storage-aggregate: the equipment-family Fresh Water Tank must win over the compliance pin (got ${JSON.stringify(nPin)})`,
    )
  }
  if (!nPin.some((x) => /drain water tank/i.test(x))) {
    throw new Error(
      `storage-aggregate: same-volume drain tanks must still mint (clean pin must not collapse onto dirty) (got ${JSON.stringify(nPin)})`,
    )
  }
  // DISTINCT ZONE STORAGE (2026-07-09): when the contract carries BOTH a main drain
  // reservoir volume AND a smaller nursery drain reservoir volume, BOTH principals mint
  // at their OWN sizes — never collapse the nursery onto the main class.
  const mZone = emptyModules()
  applyUniversalContractSizing(
    mZone as never[],
    contractOf({
      fresh_water_tank_volume_each_m3: 91, fresh_water_tank_count: 1,
      drain_water_tank_volume_each_m3: 91, drain_water_tank_count: 2,
      nursery_drain_water_tank_volume_each_m3: 40, nursery_drain_water_tank_count: 1,
    }) as never,
    { explode: false, instrument: false, dedupeAndStrip: false },
  )
  const nZone = names(mZone)
  if (!nZone.some((x) => /nursery.*drain|drain.*nursery/i.test(x))) {
    throw new Error(`storage-aggregate: distinct nursery drain reservoir must synthesise (got ${JSON.stringify(nZone)})`)
  }
  if (!nZone.some((x) => /drain water tank/i.test(x))) {
    throw new Error(`storage-aggregate: main drain water tank must still synthesise beside nursery (got ${JSON.stringify(nZone)})`)
  }
  let nurseryCap = 0
  let mainDrainCap = 0
  for (const m of mZone) for (const sm of m.sub_modules) for (const w of sm.words ?? []) {
    const nm = String(w.name_human || '')
    const cap = (w.modifier_characters || []).find((mc: any) => mc.kind === 'capacity')
    const v = cap ? parseFloat(String(cap.value)) || 0 : 0
    if (/nursery/i.test(nm) && /drain|reservoir|tank/i.test(nm)) nurseryCap = v
    if (/^drain water tank$/i.test(nm)) mainDrainCap = v
  }
  if (nurseryCap !== 40) throw new Error(`storage-aggregate: nursery reservoir capacity must be 40 m³ (got ${nurseryCap})`)
  if (mainDrainCap !== 91) throw new Error(`storage-aggregate: main drain reservoir capacity must be 91 m³ (got ${mainDrainCap})`)

  // eslint-disable-next-line no-console
  console.log(
    `storage-aggregate --selftest OK (separate tanks kept; total roll-up suppressed + reconciled; ` +
      `storage tank TALL ${tankDim}, basin SHALLOW ${basinDim}, reservoir TALL ${resDim}; pin-alias single vessel; ` +
      `nursery 40 m³ ≠ main drain 91 m³)`,
  )
}

run()
