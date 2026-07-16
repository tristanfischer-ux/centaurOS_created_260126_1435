// proveCatch for the SUB_ASSEMBLY cost-capacity scale + envelope-capped vessel default
// (2026-07-09, Powerwall exit-32 round 2). A 0.11 kW mini-chiller was decomposed with
// 40 kW-class template bases (£4,010 scroll compressor, £4,200 control panel → £16k
// chiller) and a size-less "Coolant Expansion Tank" defaulted to the 50 m³ template
// (4.0 m GRP tank + walkway + gelcoat, £13.6k) inside a 0.13 m³ wall cabinet.
/* eslint-disable no-console */
import { explodeEquipmentSubAssemblies } from './universal-contract-sizing'

function mkWord(id: string, name: string, mods: Array<{ kind: string; value: string; unit?: string }>): any {
  return { id, name_human: name, content_character: { character_id: id, name_human: name },
    modifier_characters: mods.map((m) => ({ kind: m.kind, value: m.value, unit: m.unit })) }
}
function childPrices(mods: any[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const w of mods) {
    if (!w._subcomponent) continue
    const p = (w.modifier_characters ?? []).find((m: any) => m.kind === 'price_estimate_gbp')
    out[String(w.name_human)] = Number(p?.value ?? 0)
  }
  return out
}
function expect(cond: boolean, msg: string): void { if (!cond) throw new Error(`sub-assembly-scale: ${msg}`) }

// ── 1. CATCH: a 0.11 kW chiller's template prices scale by (0.11/40)^0.6 ≈ 0.034 ──
const tiny: any = { sub_modules: [{ words: [
  mkWord('liquid_coolant_chiller_word', 'Liquid Coolant Chiller',
    [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '0.11', unit: 'kW' }]),
] }] }
explodeEquipmentSubAssemblies([tiny], {})
const tinyPrices = childPrices(tiny.sub_modules[0].words)
expect((tinyPrices['Scroll Compressor'] ?? 1e9) < 400,
  `0.11 kW chiller compressor must price at mini-compressor money (got £${tinyPrices['Scroll Compressor']})`)
expect((tinyPrices['Control Panel'] ?? 1e9) < 400,
  `0.11 kW chiller control panel must scale with the duty (got £${tinyPrices['Control Panel']})`)

// ── 2. NO FALSE POSITIVE: a 40 kW (reference-duty) chiller is byte-identical ──
const ref: any = { sub_modules: [{ words: [
  mkWord('hvac_chiller_word', 'HVAC Chiller',
    [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '40', unit: 'kW' }]),
] }] }
explodeEquipmentSubAssemblies([ref], {})
const refPrices = childPrices(ref.sub_modules[0].words)
expect(Math.abs((refPrices['Scroll Compressor'] ?? 0) - (4000 + 40 * 95)) < 1,
  `40 kW chiller compressor must stay at the unscaled template price (got £${refPrices['Scroll Compressor']})`)

// ── 3. CATCH: a size-less tank inside a compact enclosure caps to envelope/4 ──
const walled: any = { sub_modules: [{ words: [
  mkWord('coolant_expansion_tank_word', 'Coolant Expansion Tank', [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([walled], { enclosure_volume_m3: 0.13 })
const walledPrices = childPrices(walled.sub_modules[0].words)
const walledTotal = Object.values(walledPrices).reduce((s, v) => s + v, 0)
expect(walledTotal < 9000,
  `size-less tank in a 0.13 m³ enclosure must not price as a 50 m³ GRP tank (got £${Math.round(walledTotal)})`)

// ── 4. NO FALSE POSITIVE: a plant-scale (no compact enclosure) size-less tank unchanged ──
const plant: any = { sub_modules: [{ words: [
  mkWord('buffer_tank_word', 'Buffer Tank', [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([plant], {})  // no enclosure_volume_m3 → 50 m³ default holds
const plantPrices = childPrices(plant.sub_modules[0].words)
const plantTotal = Object.values(plantPrices).reduce((s, v) => s + v, 0)
expect(plantTotal > 9000,
  `plant-scale size-less tank keeps the 50 m³ default calibration (got £${Math.round(plantTotal)})`)

// ── 5. CATCH: air-cooled scale demotes the liquid thermal plant (never priced) ──
import { demoteLiquidThermalPlantAtAirCooledScale } from './universal-contract-sizing'
const airMod: any = { sub_modules: [{ words: [
  mkWord('coolant_expansion_tank_word', 'Coolant Expansion Tank', [{ kind: 'quantity', value: '×1' }]),
  mkWord('coolant_pump_word', 'Coolant Pump', [{ kind: 'quantity', value: '×1' }]),
  mkWord('hvac_chiller_word', 'HVAC Chiller', [{ kind: 'quantity', value: '×1' }]),
  mkWord('active_ventilation_fan_word', 'Active Ventilation Fan', [{ kind: 'quantity', value: '×1' }]),
] }] }
const nDem = demoteLiquidThermalPlantAtAirCooledScale([airMod], { system_thermal_dissipation_kw: 0.43 })
expect(nDem === 3, `0.43 kW duty must demote tank+pump+chiller and spare the fan (got ${nDem})`)
const fanWord = airMod.sub_modules[0].words.find((w: any) => w.id === 'active_ventilation_fan_word')
expect(!fanWord.mis_emission_note, 'the air-path fan must NOT be demoted')
// the explode must then skip the stamped words (no priced children ever minted)
explodeEquipmentSubAssemblies([airMod], { system_thermal_dissipation_kw: 0.43 })
const demChildren = airMod.sub_modules[0].words.filter((w: any) =>
  w._subcomponent && /coolant|chiller/.test(String(w.id)))
expect(demChildren.length === 0,
  `a demoted plant word must never explode into priced children (got ${demChildren.length})`)

// ── 6. NO FALSE POSITIVE: utility duty (25 kW) demotes nothing ──
const utilMod: any = { sub_modules: [{ words: [
  mkWord('hvac_chiller_word', 'HVAC Chiller', [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '47', unit: 'kW' }]),
] }] }
expect(demoteLiquidThermalPlantAtAirCooledScale([utilMod], { system_thermal_dissipation_kw: 25 }) === 0,
  'utility duty must demote nothing')
// ── 7. NO FALSE POSITIVE: no dissipation quantity (non-thermal archetype) → no-op ──
expect(demoteLiquidThermalPlantAtAirCooledScale([utilMod], {}) === 0,
  'an archetype without the dissipation quantity must be untouched')

// ── 8. CATCH: occupancy-scale safety PLANT demoted in a sealed sub-1 m³ cabinet;
//     a point smoke DETECTOR (not plant) is spared ──
const occMod: any = { sub_modules: [{ words: [
  mkWord('gas_detection_system_word', 'Gas Detection System', [{ kind: 'quantity', value: '×1' }]),
  mkWord('smoke_detectors_word', 'Smoke Detectors', [{ kind: 'quantity', value: '×1' }]),
] }] }
expect(demoteLiquidThermalPlantAtAirCooledScale([occMod], { enclosure_volume_m3: 0.13 }) === 1,
  'a 0.13 m³ sealed cabinet must demote the gas-detection PLANT and spare the point detector')
// plant-scale enclosure (86 m³ container) keeps its gas detection — no false positive
const occUtil: any = { sub_modules: [{ words: [
  mkWord('gas_detection_system_word', 'Gas Detection System', [{ kind: 'quantity', value: '×1' }]),
] }] }
expect(demoteLiquidThermalPlantAtAirCooledScale([occUtil], { enclosure_volume_m3: 86, system_thermal_dissipation_kw: 25 }) === 0,
  'a containerised enclosure must keep its gas-detection plant')

// ── 9. CATCH: a fan explodes into FAN anatomy (housing/impeller/EC motor — never a
//     mechanical seal or isolation valve), duty-capped at ~1.5× the thermal load ──
const fanMod: any = { sub_modules: [{ words: [
  mkWord('active_ventilation_fan_word', 'Active Ventilation Fan',
    [{ kind: 'quantity', value: '×1' }, { kind: 'rating_primary', value: '1.7', unit: 'kW' }]),
] }] }
explodeEquipmentSubAssemblies([fanMod], { system_thermal_dissipation_kw: 0.43, hvac_design_load_kw: 0.14 })
const fanKids = fanMod.sub_modules[0].words.filter((w: any) => w._subcomponent)
const fanKidNames = fanKids.map((w: any) => String(w.name_human))
expect(fanKidNames.some((n: string) => /EC Motor/.test(n)) && fanKidNames.some((n: string) => /Impeller/.test(n)),
  `fan must decompose into fan anatomy (got ${fanKidNames.join(', ')})`)
expect(!fanKidNames.some((n: string) => /Mechanical Seal|Isolation Valve|Baseplate/i.test(n)),
  'a fan must never mint pump anatomy (seals / isolation valves / baseplate)')
const fanTotal = fanKids.reduce((s: number, w: any) =>
  s + Number((w.modifier_characters ?? []).find((x: any) => x.kind === 'price_estimate_gbp')?.value ?? 0), 0)
expect(fanTotal < 500,
  `a duty-capped cabinet fan set must price at EC-fan money, never pump anatomy £3,971 (got £${Math.round(fanTotal)})`)

// ── 9a. CATCH (2026-07-15 NinjaPCR): unrated heatsink/fan parent must NOT invent a
//     100 W EC Motor (old `p.kw || 0.1` default) — electronics axial fans are ~5 W.
const tinyFanMod: any = { sub_modules: [{ words: [
  mkWord('heatsink_fan_assembly_word', 'Heatsink Fan Assembly',
    [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([tinyFanMod], {
  connected_electrical_load_kw: 0.175,
  heat_rejection_duty_w: 213,
  enclosure_volume_m3: 0.0036,
})
const tinyEc = tinyFanMod.sub_modules[0].words.find((w: any) => /EC Motor/i.test(String(w.name_human ?? '')))
const tinyEcKw = Number((tinyEc?.modifier_characters ?? []).find((x: any) => x.kind === 'rating_primary')?.value ?? 99)
expect(!!tinyEc && tinyEcKw > 0 && tinyEcKw <= 0.02,
  `unrated heatsink fan EC Motor must be ≤20 W electronics-class (got ${tinyEcKw} kW)`)

// ── 9a2. CATCH (2026-07-15 NinjaPCR): fan_failure_detect / fan_tachometer_sense must
//     NOT explode EC Motor / Impeller anatomy — only the real heatsink fan does.
const senseFanMod: any = { sub_modules: [{ words: [
  mkWord('fan_failure_detect_word', 'Fan Failure Detect',
    [{ kind: 'quantity', value: '×1' }]),
  mkWord('fan_tachometer_sense_word', 'Fan Tachometer Sense',
    [{ kind: 'quantity', value: '×1' }]),
  mkWord('heatsink_fan_assembly_word', 'Heatsink Fan Assembly',
    [{ kind: 'quantity', value: '×1' }]),
] }] }
explodeEquipmentSubAssemblies([senseFanMod], {
  connected_electrical_load_kw: 0.175,
  enclosure_volume_m3: 0.0036,
})
const senseKids = senseFanMod.sub_modules[0].words.filter((w: any) => w._subcomponent)
const senseEcParents = senseKids
  .filter((w: any) => /EC Motor/i.test(String(w.name_human ?? '')))
  .map((w: any) => String((w.content_character || {}).character_id || w.id || ''))
expect(senseEcParents.length === 1 && /heatsink_fan/i.test(senseEcParents[0] || ''),
  `only heatsink_fan may explode an EC Motor (got ${senseEcParents.join(', ') || 'none'})`)
expect(!senseKids.some((w: any) => /fan_failure|fan_tachometer/i.test(
  String((w.content_character || {}).character_id || w.id || ''))),
  'fan_failure_detect / fan_tachometer_sense must never mint fan anatomy children')

// ── 9b. CATCH: grid-interface PLANT (step-up/MV/isolation transformer, switchgear) in a
//     sealed sub-1 m³ enclosure whose contract sizes NO transformer demotes; a contract
//     that DOES size one (utility BESS / wind: transformer_rating_kva) keeps every word ──
const gridMod: any = { sub_modules: [{ words: [
  mkWord('mv_step_up_transformer_word', 'MV Step Up Transformer', [{ kind: 'quantity', value: '×1' }]),
  mkWord('ac_switchgear_word', 'AC Switchgear', [{ kind: 'quantity', value: '×1' }]),
  mkWord('hybrid_inverter_word', 'Hybrid Inverter', [{ kind: 'quantity', value: '×1' }]),
] }] }
expect(demoteLiquidThermalPlantAtAirCooledScale([gridMod], { enclosure_volume_m3: 0.13 }) >= 2,
  'a sealed 0.13 m³ cabinet with no contract transformer must demote MV transformer + switchgear')
expect(!gridMod.sub_modules[0].words.find((w: any) => w.id === 'hybrid_inverter_word').mis_emission_note,
  'the hybrid inverter (real product electronics) must never be demoted')
const gridUtil: any = { sub_modules: [{ words: [
  mkWord('mv_step_up_transformer_word', 'MV Step Up Transformer', [{ kind: 'quantity', value: '×1' }]),
] }] }
expect(demoteLiquidThermalPlantAtAirCooledScale([gridUtil],
  { enclosure_volume_m3: 86, transformer_rating_kva: 1250 }) === 0,
  'a contract that sizes a transformer must keep its transformer word untouched')

// ── 10. CATCH: SYSTEM-SINGLETON controller normalisation — an invented bms_master ×10
//     (rack_count=1, no contract count says 10) collapses to ×1; near-synonym master
//     duplicates demote to scope notes; slave boards track rack_count; a population the
//     contract BACKS (gateway_count=3) is untouched; non-controller words untouched ──
import { normaliseSystemSingletonControllers } from './universal-contract-sizing'
const ctrlMod: any = { sub_modules: [{ words: [
  mkWord('bms_master_word', 'BMS Master', [{ kind: 'quantity', value: '×10' }]),
  mkWord('bms_master_controller_word', 'BMS Master Controller',
    [{ kind: 'quantity', value: '×10' }, { kind: 'part_number', value: 'ORION-BMS-2' }]),
  mkWord('battery_management_system_slave_word', 'Battery Management System Slave', [{ kind: 'quantity', value: '×10' }]),
  mkWord('bms_slave_word', 'BMS Slave', [{ kind: 'quantity', value: '×10' }]),
  mkWord('cell_temperature_sensors_word', 'Cell Temperature Sensors', [{ kind: 'quantity', value: '×88' }]),
] }] }
normaliseSystemSingletonControllers([ctrlMod], { rack_count: 1, cell_count: 88 })
const ctrlWords: any[] = ctrlMod.sub_modules[0].words
const qtyOf = (id: string) => String(ctrlWords.find((w) => w.id === id)?.modifier_characters
  .find((m: any) => m.kind === 'quantity')?.value ?? '')
const noteOf = (id: string) => ctrlWords.find((w) => w.id === id)?.mis_emission_note
expect(qtyOf('bms_master_controller_word') === '×1' && !noteOf('bms_master_controller_word'),
  'the pinned-part master must be KEPT at ×1 (an invented ×10 with rack_count=1 collapses)')
expect(!!noteOf('bms_master_word'),
  'the near-synonym duplicate master must demote to a scope note')
expect(!!noteOf('bms_slave_word') !== !!noteOf('battery_management_system_slave_word'),
  'exactly ONE slave word survives; its synonym demotes')
const keptSlave = noteOf('bms_slave_word') ? 'battery_management_system_slave_word' : 'bms_slave_word'
expect(qtyOf(keptSlave) === '×1',
  `the kept slave board must track rack_count=1 (got ${qtyOf(keptSlave)})`)
expect(qtyOf('cell_temperature_sensors_word') === '×88' && !noteOf('cell_temperature_sensors_word'),
  'a non-controller word must be byte-untouched')
// contract-BACKED population is left alone (gateway_count=3 backs a ×3 Gateway)
const gwMod: any = { sub_modules: [{ words: [
  mkWord('telemetry_gateway_word', 'Telemetry Gateway', [{ kind: 'quantity', value: '×3' }]),
] }] }
normaliseSystemSingletonControllers([gwMod], { gateway_count: 3 })
expect(String(gwMod.sub_modules[0].words[0].modifier_characters.find((m: any) => m.kind === 'quantity').value) === '×3',
  'a contract-backed controller population (gateway_count=3) must be untouched')
// utility counter-case: slaves already tracking rack_count=15 are a strict no-op
const utilCtrl: any = { sub_modules: [{ words: [
  mkWord('bms_slave_boards_word', 'BMS Slave Boards', [{ kind: 'quantity', value: '×15' }]),
  mkWord('bms_master_word', 'BMS Master', [{ kind: 'quantity', value: '×1' }]),
] }] }
expect(normaliseSystemSingletonControllers([utilCtrl], { rack_count: 15 }) === 0,
  'a utility design whose controller counts are already physical must be a strict no-op')
// run-33: FOUR power-conversion words → ONE PCS (keeping the pinned word)
const pcMod: any = { sub_modules: [{ words: [
  mkWord('dc_ac_inverter_module_word', 'DC AC Inverter Module', [{ kind: 'quantity', value: '×1' }]),
  mkWord('silicon_carbide_inverter_word', 'Silicon Carbide Inverter',
    [{ kind: 'quantity', value: '×1' }, { kind: 'part_number', value: 'CAB450M12XM3' }]),
  mkWord('power_conversion_system_pcs_word', 'Power Conversion System PCS', [{ kind: 'quantity', value: '×1' }]),
  mkWord('bidirectional_pcs_inverter_word', 'Bidirectional PCS Inverter', [{ kind: 'quantity', value: '×1' }]),
] }] }
normaliseSystemSingletonControllers([pcMod], { rack_count: 1 })
const pcWords: any[] = pcMod.sub_modules[0].words
expect(pcWords.filter((w) => !w.mis_emission_note).length === 1
  && !pcWords.find((w) => w.id === 'silicon_carbide_inverter_word').mis_emission_note,
  'four power-conversion words must fold to the ONE pinned PCS')

// run-21: Remote Monitoring Module ×5 + Interface ×5 → ONE telemetry device ×1
const rmMod: any = { sub_modules: [{ words: [
  mkWord('remote_monitoring_module_word', 'Remote Monitoring Module',
    [{ kind: 'quantity', value: '×5' }, { kind: 'part_number', value: 'RUT956' }]),
  mkWord('remote_monitoring_interface_word', 'Remote Monitoring Interface', [{ kind: 'quantity', value: '×5' }]),
] }] }
normaliseSystemSingletonControllers([rmMod], { rack_count: 1 })
const rmWords: any[] = rmMod.sub_modules[0].words
const rmKept = rmWords.find((w) => !w.mis_emission_note)
expect(!!rmKept && rmWords.filter((w) => w.mis_emission_note).length === 1
  && String(rmKept.modifier_characters.find((m: any) => m.kind === 'quantity').value) === '×1',
  'remote-monitoring ×5 duo must fold to ONE device ×1 (keeping the pinned word)')

// ── 11. CATCH: oversize dimension strip — a '1123x955x1235 mm' component inside a
//     0.143 m³ cabinet is physically impossible (run-22 seven-word smear); a dim
//     that FITS stays; no enclosure signal = strict no-op ──
import { stripOversizeDimensionModifiers } from './universal-contract-sizing'
const dimMod: any = { sub_modules: [{ words: [
  mkWord('pcs_word', 'Power Conversion System', [{ kind: 'dimension', value: '1123x955x1235 mm' }]),
  mkWord('bms_board_word', 'BMS Board', [{ kind: 'dimension', value: '180x120x40 mm' }]),
] }] }
expect(stripOversizeDimensionModifiers([dimMod], { enclosure_volume_m3: 0.143 }) === 1,
  'a component dimension exceeding the whole enclosure must strip (exactly 1)')
expect(dimMod.sub_modules[0].words[1].modifier_characters.some((m: any) => m.kind === 'dimension'),
  'a component dimension that FITS must be untouched')
const dimNoEnv: any = { sub_modules: [{ words: [
  mkWord('pcs_word', 'Power Conversion System', [{ kind: 'dimension', value: '1123x955x1235 mm' }]),
] }] }
expect(stripOversizeDimensionModifiers([dimNoEnv], {}) === 0,
  'no enclosure signal must be a strict no-op (utility/open-skid byte-identity)')

console.log('sub-assembly-scale --selftest OK (0.11 kW chiller scales to mini-compressor money; '
  + '40 kW reference chiller byte-identical; size-less tank capped by a compact enclosure; '
  + 'plant-scale default calibration preserved; air-cooled scale demotes tank/pump/chiller '
  + 'but never the fan, demoted words never explode; utility + non-thermal no-ops hold)')
