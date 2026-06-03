/**
 * scripts/lib/orchestrator/emitters/co2-mineralisation.ts
 *
 * CO2 capture + mineral-carbonation plant deterministic emitter — 2026-06-03.
 *
 * Process (per the brief): capture CO2 from flue gas in 30 wt% aqueous MEA →
 * react the CO2-rich amine with GYPSUM (CaSO4·2H2O) in a stirred carbonation
 * reactor to precipitate CaCO3 → filter / wash / air-blow / hot-air dry the
 * CaCO3 cake → react the sulfate-bearing filtrate with solid KOH to form K2SO4
 * and regenerate free MEA → filter + recrystallise + dry the K2SO4 → distil the
 * CaCO3 wash water to recover MEA + water → recycle MEA → bag both solids in
 * 25 kg sacks.
 *
 * Stoichiometry (per mol captured CO2): 1 CaCO3 + 1 K2SO4, consuming 1
 * CaSO4·2H2O + 2 KOH. Mass yields per tonne CO2: CaCO3 100/44 ≈ 2.27 t,
 * K2SO4 174/44 ≈ 3.95 t, gypsum 172/44 ≈ 3.91 t, KOH 112/44 ≈ 2.55 t.
 *
 * Scale: skid-mounted pilot/demonstration plant, default 1 t CO2/day.
 * Industry refs: GEA / Andritz filtration + drying skids, Sulzer / Koch
 * packed columns, Alfa Laval plate exchangers, GEA Messo crystallisers,
 * Endress+Hauser process instruments, ABB drives. British spelling.
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON, DesignModule } from '../assembler'
import type { ContractInProgress } from '../types'

interface Mod { kind: string; value: string; unit?: string }
interface CC { character_id: string; name_human: string;
  function_radical_primary: string | null; function_radical_secondary: string | null;
  material_radical_primary: string | null; material_radical_secondary: string | null }
interface W { id: string; name_human: string; content_character: CC; modifier_characters: Mod[] }
interface SM { id: string; name_human: string; english_sentence: string; rad_syntax: string;
  role_verb: string; topology_clause: string; words: W[] }

function q(c: ContractInProgress, key: string, fallback: number): number {
  const v = c.quantities?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function fmtQty(n: number): string { return Number.isInteger(n) ? `×${n}` : `×${n.toFixed(2)}` }
function mod(k: string, v: string, u?: string): Mod { return u !== undefined ? { kind: k, value: v, unit: u } : { kind: k, value: v } }
function cc(id: string, n: string, fp: string | null, mp: string | null, fs: string | null = null, ms: string | null = null): CC {
  return { character_id: id, name_human: n, function_radical_primary: fp, function_radical_secondary: fs, material_radical_primary: mp, material_radical_secondary: ms }
}
function word(id: string, n: string, c: CC, m: Mod[]): W {
  return { id, name_human: n.replace(/\s+word$/i, ''), content_character: c, modifier_characters: m }
}
function rad(ws: W[]): string {
  return ws.map(w => {
    const o = [...w.modifier_characters].sort((a, b) => a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0)
    const toks = o.map(m => m.unit ? `${m.value}${m.unit}` : m.value)
    return toks.length === 0 ? w.content_character.character_id : `${w.content_character.character_id} (${toks.join(', ')})`
  }).join(' ⊙ ')
}
function makeSub(id: string, n: string, role: string, top: string, ws: W[]): SM {
  return { id, name_human: n, english_sentence: '', rad_syntax: rad(ws), role_verb: role, topology_clause: top, words: ws }
}

interface Co2MinParams {
  captureTpd: number
  captureKgH: number
  caco3Tpd: number
  k2so4Tpd: number
  gypsumTpd: number
  kohTpd: number
  meaWtPct: number
  meaCircM3H: number
  absorberDiaM: number
  absorberHeightM: number
  reactorVolumeM3: number
  filterAreaM2: number
  distillColDiaM: number
  dryerHeatKw: number
  steamKgH: number
  electricalKw: number
  bagKg: number
  bagsPerDay: number
}

function deriveParams(c: ContractInProgress): Co2MinParams {
  const tpd = q(c, 'target_capture_tpd', 1)
  const kgH = (tpd * 1000) / 24
  const caco3 = tpd * (100 / 44)
  const k2so4 = tpd * (174 / 44)
  const gypsum = tpd * (172 / 44)
  const koh = tpd * (112 / 44)
  const bagKg = 25
  return {
    captureTpd: tpd,
    captureKgH: kgH,
    caco3Tpd: caco3,
    k2so4Tpd: k2so4,
    gypsumTpd: gypsum,
    kohTpd: koh,
    meaWtPct: q(c, 'mea_wt_pct', 30),
    // ~0.40 mol CO2/mol MEA working capacity on 30 wt% MEA ⇒ ~70 kg solution per kg CO2/h.
    meaCircM3H: q(c, 'mea_circulation_m3_h', Math.max(0.5, Math.round(kgH * 0.07 * 10) / 10)),
    absorberDiaM: q(c, 'absorber_diameter_m', 0.4),
    absorberHeightM: q(c, 'absorber_packed_height_m', 6),
    reactorVolumeM3: q(c, 'carbonation_reactor_volume_m3', 4),
    filterAreaM2: q(c, 'filter_area_m2', 3),
    distillColDiaM: q(c, 'distillation_column_diameter_m', 0.3),
    dryerHeatKw: q(c, 'dryer_heat_duty_kw', 75),
    steamKgH: q(c, 'reboiler_steam_kg_h', 180),
    electricalKw: q(c, 'electrical_load_kw', 90),
    bagKg,
    bagsPerDay: Math.round(((caco3 + k2so4) * 1000) / bagKg),
  }
}

// 1. CO2 absorption (MEA capture) -------------------------------------------------
function emitAbsorptionCapture(p: Co2MinParams): DesignModule {
  const sub = makeSub('mea_absorption_train', 'MEA absorption train', 'absorbs',
    `${p.captureKgH.toFixed(0)} kg/h CO2 absorbed into ${p.meaWtPct.toFixed(0)} wt% aqueous MEA circulating at ${p.meaCircM3H.toFixed(1)} m³/h through a ${p.absorberDiaM.toFixed(1)} m × ${p.absorberHeightM.toFixed(0)} m packed column`, [
    word('packed_absorber_column_word', 'packed absorber column',
      cc('packed_absorber_column', 'packed absorber column', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'random-packed counter-current column'),
       mod('dimension', `${p.absorberDiaM.toFixed(1)} m dia × ${p.absorberHeightM.toFixed(0)} m`), mod('manufacturer', 'Sulzer'), mod('regulatory', 'PED 2014/68/EU')]),
    word('structured_packing_word', 'structured packing',
      cc('structured_packing', 'structured packing', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'Mellapak 250.Y'), mod('manufacturer', 'Sulzer'), mod('dimension', `${(p.absorberDiaM * p.absorberDiaM * 0.785 * p.absorberHeightM).toFixed(1)} m³ bed`)]),
    word('mea_circulation_pump_word', 'MEA circulation pump',
      cc('mea_circulation_pump', 'MEA circulation pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'centrifugal, 1 duty + 1 standby'), mod('capacity', String(p.meaCircM3H.toFixed(1)), 'm³/h'), mod('manufacturer', 'Grundfos')]),
    word('rich_lean_mea_exchanger_word', 'rich/lean MEA exchanger',
      cc('rich_lean_mea_exchanger', 'rich/lean MEA plate exchanger', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'gasketed plate exchanger'), mod('manufacturer', 'Alfa Laval')]),
    word('flue_gas_blower_word', 'flue-gas inlet blower',
      cc('flue_gas_blower', 'flue-gas inlet blower', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'centrifugal'), mod('capacity', String((p.captureKgH * 12).toFixed(0)), 'kg/h gas'), mod('manufacturer', 'Howden')]),
    word('mea_storage_tank_word', 'MEA storage tank',
      cc('mea_storage_tank', '30 wt% MEA storage tank', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'bunded atmospheric tank'), mod('dimension', '5 m³'), mod('regulatory', 'DSEAR')]),
  ])
  return { module: 'mass_fluid_transport_process',
    module_brief: `30 wt% aqueous MEA counter-current packed absorber captures ${p.captureKgH.toFixed(0)} kg/h CO2 from flue gas; rich amine pumped to the carbonation reactor, lean amine returned.`,
    overview_paragraph_en: '', derived_parameters: { capture_kg_h: p.captureKgH, mea_circulation_m3_h: p.meaCircM3H, mea_wt_pct: p.meaWtPct },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 2. Gypsum carbonation reactor ---------------------------------------------------
function emitCarbonationReactor(p: Co2MinParams): DesignModule {
  const sub = makeSub('gypsum_carbonation_reactor', 'gypsum carbonation reactor', 'reacts',
    `CO2-rich MEA reacts with ${p.gypsumTpd.toFixed(1)} t/day gypsum in a ${p.reactorVolumeM3.toFixed(0)} m³ stirred reactor, precipitating ${p.caco3Tpd.toFixed(1)} t/day CaCO3 and releasing sulfate to the filtrate`, [
    word('stirred_carbonation_reactor_word', 'stirred carbonation reactor',
      cc('stirred_carbonation_reactor', 'stirred carbonation reactor', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'baffled stirred-tank reactor, jacketed'), mod('dimension', String(p.reactorVolumeM3.toFixed(0)), 'm³'), mod('manufacturer', 'De Dietrich'), mod('regulatory', 'PED 2014/68/EU')]),
    word('reactor_agitator_word', 'reactor agitator',
      cc('reactor_agitator', 'top-entry agitator', 'electromagnetic_actuator_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'pitched-blade turbine, VSD'), mod('capacity', '4', 'kW'), mod('manufacturer', 'Ekato')]),
    word('gypsum_feed_hopper_word', 'gypsum feed hopper + screw',
      cc('gypsum_feed_hopper', 'gypsum feed hopper and metering screw', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'loss-in-weight screw feeder'), mod('capacity', String((p.gypsumTpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Schenck Process')]),
    word('slurry_transfer_pump_word', 'CaCO3 slurry transfer pump',
      cc('slurry_transfer_pump', 'CaCO3 slurry transfer pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'progressive-cavity, abrasion-rated'), mod('manufacturer', 'SEEPEX')]),
    word('reactor_ph_probe_word', 'reactor pH/ORP probe',
      cc('reactor_ph_probe', 'reactor pH/ORP probe', 'chemical_sensing_function', 'glass'),
      [mod('quantity', '×2'), mod('form', 'in-line pH + ORP'), mod('manufacturer', 'Endress+Hauser')]),
  ])
  return { module: 'energy_conversion_transduction',
    module_brief: `Jacketed stirred carbonation reactor mineralises captured CO2 with gypsum to ${p.caco3Tpd.toFixed(1)} t/day CaCO3; pH/ORP-controlled, agitated, slurry pumped to filtration.`,
    overview_paragraph_en: '', derived_parameters: { reactor_volume_m3: p.reactorVolumeM3, caco3_tpd: p.caco3Tpd, gypsum_tpd: p.gypsumTpd },
    allowed_radicals: ['chemical_reaction_function', 'electromagnetic_actuator_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 3. CaCO3 filtration, wash, dry --------------------------------------------------
function emitCaco3Recovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('caco3_filter_dry_line', 'CaCO3 filtration + drying line', 'separates',
    `${p.caco3Tpd.toFixed(1)} t/day CaCO3 filtered over ${p.filterAreaM2.toFixed(0)} m², water-washed to strip MEA, air-blown, then hot-air dried at ${p.dryerHeatKw.toFixed(0)} kW`, [
    word('caco3_vacuum_belt_filter_word', 'CaCO3 vacuum belt filter',
      cc('caco3_vacuum_belt_filter', 'CaCO3 vacuum belt filter', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'horizontal vacuum belt filter with cake wash + air-blow zones'), mod('dimension', String(p.filterAreaM2.toFixed(0)), 'm²'), mod('manufacturer', 'BHS-Sonthofen')]),
    word('cake_wash_manifold_word', 'cake wash-water manifold',
      cc('cake_wash_manifold', 'cake wash-water spray manifold', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'counter-current displacement wash bars')]),
    word('filter_vacuum_pump_word', 'filter vacuum pump',
      cc('filter_vacuum_pump', 'liquid-ring vacuum pump', 'mass_fluid_transport_process', 'cast_iron'),
      [mod('quantity', '×1'), mod('form', 'liquid-ring'), mod('manufacturer', 'Busch')]),
    word('caco3_hot_air_dryer_word', 'CaCO3 hot-air dryer',
      cc('caco3_hot_air_dryer', 'CaCO3 fluid-bed hot-air dryer', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'fluidised-bed dryer'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW'), mod('manufacturer', 'GEA')]),
    word('cake_air_blower_word', 'cake air-blow blower',
      cc('cake_air_blower', 'cake de-watering air blower', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'side-channel blower'), mod('manufacturer', 'Becker')]),
  ])
  return { module: 'mass_fluid_transport_process',
    module_brief: `CaCO3 slurry is vacuum-belt-filtered, the cake water-washed to displace MEA, air-blown and hot-air dried to a free-flowing filler-grade powder.`,
    overview_paragraph_en: '', derived_parameters: { filter_area_m2: p.filterAreaM2, dryer_heat_kw: p.dryerHeatKw },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 4. K2SO4 recovery (KOH reaction, filter, recrystallise, dry) --------------------
function emitK2so4Recovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('k2so4_recovery_line', 'K2SO4 recovery line', 'converts',
    `sulfate filtrate reacts with ${p.kohTpd.toFixed(1)} t/day solid KOH to form ${p.k2so4Tpd.toFixed(1)} t/day K2SO4 and free MEA; K2SO4 is filtered, recrystallised MEA-free, and hot-air dried`, [
    word('koh_reaction_vessel_word', 'KOH reaction vessel',
      cc('koh_reaction_vessel', 'KOH reaction vessel', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'agitated, jacketed'), mod('dimension', '3 m³'), mod('manufacturer', 'De Dietrich'), mod('regulatory', 'PED 2014/68/EU')]),
    word('koh_dosing_feeder_word', 'KOH solids dosing feeder',
      cc('koh_dosing_feeder', 'KOH solids dosing feeder', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'enclosed screw feeder, corrosion-rated'), mod('capacity', String((p.kohTpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Gericke'), mod('regulatory', 'COSHH')]),
    word('k2so4_centrifuge_word', 'K2SO4 pusher centrifuge',
      cc('k2so4_centrifuge', 'K2SO4 pusher centrifuge', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'single-stage pusher centrifuge'), mod('capacity', String((p.k2so4Tpd * 1000 / 24).toFixed(0)), 'kg/h'), mod('manufacturer', 'Andritz')]),
    word('k2so4_recrystalliser_word', 'K2SO4 recrystalliser',
      cc('k2so4_recrystalliser', 'K2SO4 forced-circulation recrystalliser', 'chemical_reaction_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'forced-circulation crystalliser, MEA stripping'), mod('manufacturer', 'GEA Messo')]),
    word('k2so4_hot_air_dryer_word', 'K2SO4 hot-air dryer',
      cc('k2so4_hot_air_dryer', 'K2SO4 fluid-bed hot-air dryer', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'fluidised-bed dryer'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW'), mod('manufacturer', 'GEA')]),
  ])
  return { module: 'energy_conversion_transduction',
    module_brief: `KOH converts the sulfate filtrate to fertiliser-grade K2SO4 and regenerates free MEA; K2SO4 is centrifuged, recrystallised MEA-free and hot-air dried.`,
    overview_paragraph_en: '', derived_parameters: { k2so4_tpd: p.k2so4Tpd, koh_tpd: p.kohTpd },
    allowed_radicals: ['chemical_reaction_function', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 5. MEA recovery + recycle (wash-water distillation) -----------------------------
function emitMeaRecovery(p: Co2MinParams): DesignModule {
  const sub = makeSub('mea_recovery_loop', 'MEA recovery + recycle loop', 'recovers',
    `CaCO3 wash water is distilled in a ${p.distillColDiaM.toFixed(1)} m column (${p.steamKgH.toFixed(0)} kg/h reboiler steam) to recover MEA and reclaim wash water; recovered MEA returns to the absorber`, [
    word('mea_distillation_column_word', 'MEA distillation column',
      cc('mea_distillation_column', 'MEA wash-water distillation column', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'packed stripping column'), mod('dimension', `${p.distillColDiaM.toFixed(1)} m dia`), mod('manufacturer', 'Koch-Glitsch'), mod('regulatory', 'PED 2014/68/EU')]),
    word('reboiler_word', 'distillation reboiler',
      cc('reboiler', 'thermosiphon reboiler', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'shell-and-tube thermosiphon'), mod('capacity', String(p.steamKgH.toFixed(0)), 'kg/h steam'), mod('manufacturer', 'Alfa Laval')]),
    word('overhead_condenser_word', 'overhead condenser',
      cc('overhead_condenser', 'overhead condenser', 'thermal_transfer_function', 'stainless_steel'),
      [mod('quantity', '×1'), mod('form', 'plate condenser'), mod('manufacturer', 'Alfa Laval')]),
    word('mea_recycle_pump_word', 'MEA recycle pump',
      cc('mea_recycle_pump', 'recovered-MEA recycle pump', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'centrifugal, 1 duty + 1 standby'), mod('manufacturer', 'Grundfos')]),
    word('reclaim_water_tank_word', 'reclaimed wash-water tank',
      cc('reclaim_water_tank', 'reclaimed wash-water tank', 'mass_fluid_transport_process', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'buffer tank'), mod('dimension', '3 m³')]),
  ])
  return { module: 'mass_fluid_transport_process',
    module_brief: `Wash-water distillation recovers MEA and reclaims wash water in a closed solvent loop, minimising MEA make-up and effluent.`,
    overview_paragraph_en: '', derived_parameters: { distillation_column_diameter_m: p.distillColDiaM, reboiler_steam_kg_h: p.steamKgH },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 6. Thermal utilities ------------------------------------------------------------
function emitThermalUtilities(p: Co2MinParams): DesignModule {
  const sub = makeSub('thermal_utilities', 'thermal utilities', 'supplies',
    `steam generation for the reboiler and hot air for two drying stages plus cooling water`, [
    word('steam_generator_word', 'electric steam generator',
      cc('steam_generator', 'electric steam generator', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'packaged electric steam boiler'), mod('capacity', String(p.steamKgH.toFixed(0)), 'kg/h'), mod('manufacturer', 'Cochran'), mod('regulatory', 'PED 2014/68/EU')]),
    word('hot_air_heater_word', 'hot-air process heater',
      cc('hot_air_heater', 'electric hot-air process heater', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×2'), mod('form', 'finned electric duct heater'), mod('capacity', String(p.dryerHeatKw.toFixed(0)), 'kW each'), mod('manufacturer', 'Kanthal')]),
    word('cooling_water_skid_word', 'cooling-water skid',
      cc('cooling_water_skid', 'closed-loop cooling-water skid', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'dry-cooler + circulation pump'), mod('manufacturer', 'Pfannenberg')]),
  ])
  return { module: 'environmental_interface',
    module_brief: `Packaged electric steam + hot-air + cooling-water utilities serve the reboiler, the two dryers and process cooling.`,
    overview_paragraph_en: '', derived_parameters: { reboiler_steam_kg_h: p.steamKgH, dryer_heat_kw: p.dryerHeatKw },
    allowed_radicals: ['thermal_transfer_function', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 7. Process control --------------------------------------------------------------
function emitProcessControl(_p: Co2MinParams): DesignModule {
  const sub = makeSub('process_control_system', 'process control system', 'controls',
    `PLC/SCADA sequences the absorption, carbonation, filtration, KOH reaction, recrystallisation, distillation and bagging steps`, [
    word('plc_controller_word', 'plant PLC controller',
      cc('plc_controller', 'plant PLC controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'safety PLC, redundant CPU'), mod('manufacturer', 'Siemens'), mod('part_number', '6ES7515-2UM02-0AB0')]),
    word('scada_hmi_word', 'SCADA HMI station',
      cc('scada_hmi', 'SCADA HMI station', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'panel PC, WinCC'), mod('manufacturer', 'Siemens')]),
    word('io_remote_rack_word', 'remote I/O rack',
      cc('io_remote_rack', 'remote I/O rack', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'), mod('form', 'ET 200SP distributed I/O'), mod('manufacturer', 'Siemens')]),
    word('control_panel_word', 'control panel',
      cc('control_panel', 'IP54 control panel', 'silicon_semiconductor_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'floor-standing IP54 panel'), mod('regulatory', 'BS EN 61439')]),
  ])
  return { module: 'control_compute_communication',
    module_brief: `A safety PLC + SCADA sequences and interlocks the full mineralisation process and records mass balance for product certification.`,
    overview_paragraph_en: '', derived_parameters: { control_loops: 24 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 8. Instrumentation --------------------------------------------------------------
function emitInstrumentation(_p: Co2MinParams): DesignModule {
  const sub = makeSub('process_instrumentation', 'process instrumentation', 'measures',
    `flow, level, density, pH and temperature instrumentation across the reaction, filtration and recovery stages`, [
    word('coriolis_flow_meter_word', 'Coriolis flow meter',
      cc('coriolis_flow_meter', 'Coriolis mass-flow meter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×4'), mod('form', 'Coriolis mass flow'), mod('manufacturer', 'Endress+Hauser'), mod('part_number', 'Promass F 300')]),
    word('radar_level_word', 'radar level transmitter',
      cc('radar_level', 'guided-radar level transmitter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×6'), mod('form', 'guided-wave radar'), mod('manufacturer', 'Endress+Hauser')]),
    word('density_meter_word', 'slurry density meter',
      cc('density_meter', 'in-line slurry density meter', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×2'), mod('form', 'tuning-fork density'), mod('manufacturer', 'Emerson')]),
    word('rtd_temp_word', 'RTD temperature sensor',
      cc('rtd_temp', 'Pt100 RTD temperature sensor', 'chemical_sensing_function', 'stainless_steel'),
      [mod('quantity', '×12'), mod('form', 'Pt100, 4-20 mA head Tx'), mod('manufacturer', 'WIKA')]),
  ])
  return { module: 'sensing_instrumentation',
    module_brief: `Coriolis flow, guided-radar level, slurry density and RTD temperature instruments close the mass balance and feed the control system.`,
    overview_paragraph_en: '', derived_parameters: { instrument_count: 24 },
    allowed_radicals: ['chemical_sensing_function', 'stainless_steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 9. Electrical -------------------------------------------------------------------
function emitElectrical(p: Co2MinParams): DesignModule {
  const sub = makeSub('electrical_distribution', 'electrical distribution', 'distributes',
    `${p.electricalKw.toFixed(0)} kW of pumps, agitators, heaters, blowers and drives fed from a motor control centre`, [
    word('motor_control_centre_word', 'motor control centre',
      cc('motor_control_centre', 'motor control centre', 'electrical_conduction_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'Form 4 MCC'), mod('capacity', String(p.electricalKw.toFixed(0)), 'kW'), mod('manufacturer', 'ABB'), mod('regulatory', 'BS EN 61439')]),
    word('vsd_drive_word', 'variable-speed drive',
      cc('vsd_drive', 'variable-speed drive', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×6'), mod('form', 'IP55 VSD'), mod('manufacturer', 'ABB'), mod('part_number', 'ACS580')]),
    word('transformer_word', 'distribution transformer',
      cc('distribution_transformer', 'distribution transformer', 'electromagnetic_actuator_function', 'copper'),
      [mod('quantity', '×1'), mod('form', 'cast-resin'), mod('capacity', '160', 'kVA'), mod('manufacturer', 'Schneider Electric')]),
  ])
  return { module: 'power_distribution',
    module_brief: `A Form-4 MCC with IP55 VSDs and a cast-resin transformer supplies the ${p.electricalKw.toFixed(0)} kW plant load.`,
    overview_paragraph_en: '', derived_parameters: { electrical_load_kw: p.electricalKw },
    allowed_radicals: ['electrical_conduction_function', 'silicon_semiconductor_function', 'copper'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 10. Structure / containment / skid ----------------------------------------------
function emitStructure(_p: Co2MinParams): DesignModule {
  const sub = makeSub('skid_structure', 'skid structure + containment', 'supports',
    `a transportable galvanised-steel skid carrying the vessels, columns and tanks with chemical bunding`, [
    word('process_skid_frame_word', 'process skid frame',
      cc('process_skid_frame', 'galvanised process skid frame', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'welded galvanised frame, ISO-corner transportable'), mod('dimension', '12 m × 2.4 m')]),
    word('chemical_bund_word', 'chemical bund',
      cc('chemical_bund', 'MEA/KOH chemical bund', 'mechanical_load_bearing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', '110% bunded containment'), mod('regulatory', 'DSEAR')]),
    word('vessel_supports_word', 'vessel supports + saddles',
      cc('vessel_supports', 'vessel supports and saddles', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×8'), mod('form', 'bolted saddles')]),
    word('access_platform_word', 'access platform + ladders',
      cc('access_platform', 'access platform and ladders', 'mechanical_load_bearing_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'GRP grating platform'), mod('regulatory', 'BS EN ISO 14122')]),
  ])
  return { module: 'structure_containment',
    module_brief: `A transportable skid with 110% chemical bunding carries the full plant for road transport and drop-in installation.`,
    overview_paragraph_en: '', derived_parameters: { skid_length_m: 12 },
    allowed_radicals: ['mechanical_load_bearing_function', 'steel', 'polymer_thermoplastic'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 11. Safety ----------------------------------------------------------------------
function emitSafety(_p: Co2MinParams): DesignModule {
  const sub = makeSub('safety_protection', 'safety + protection', 'protects',
    `DSEAR/ATEX zoning, pressure relief, gas detection and emergency shutdown for MEA and KOH handling`, [
    word('pressure_relief_valve_word', 'pressure relief valves',
      cc('pressure_relief_valve', 'pressure relief valves', 'mass_fluid_transport_process', 'stainless_steel'),
      [mod('quantity', '×6'), mod('form', 'spring-loaded PRV'), mod('manufacturer', 'LESER'), mod('regulatory', 'PED 2014/68/EU')]),
    word('co2_gas_detector_word', 'CO2 + VOC gas detector',
      cc('co2_gas_detector', 'CO2 and amine-VOC gas detector', 'chemical_sensing_function', 'polymer_thermoplastic'),
      [mod('quantity', '×4'), mod('form', 'fixed NDIR + PID'), mod('manufacturer', 'Honeywell'), mod('regulatory', 'DSEAR')]),
    word('emergency_stop_word', 'emergency shutdown system',
      cc('emergency_stop', 'emergency shutdown system', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'), mod('form', 'SIL-2 ESD chain'), mod('regulatory', 'BS EN 61511')]),
    word('eyewash_shower_word', 'safety shower + eyewash',
      cc('eyewash_shower', 'safety shower and eyewash', 'mass_fluid_transport_process', 'polymer_thermoplastic'),
      [mod('quantity', '×2'), mod('form', 'combination shower/eyewash'), mod('regulatory', 'BS EN 15154')]),
  ])
  return { module: 'safety_protection',
    module_brief: `DSEAR/ATEX zoning, SIL-2 emergency shutdown, pressure relief and gas detection protect the MEA and corrosive-KOH handling areas.`,
    overview_paragraph_en: '', derived_parameters: { regulatory_mandatory_count: 4 },
    allowed_radicals: ['mass_fluid_transport_process', 'chemical_sensing_function', 'polymer_thermoplastic'], applicability_confidence: 'high', sub_modules: [sub] }
}

// 12. Solids bagging --------------------------------------------------------------
function emitBagging(p: Co2MinParams): DesignModule {
  const sub = makeSub('bagging_packaging_line', 'bagging + packaging line', 'packages',
    `${p.bagsPerDay} × 25 kg bags/day of CaCO3 and K2SO4 filled, sealed and palletised`, [
    word('open_mouth_bagger_word', 'open-mouth bagging machine',
      cc('open_mouth_bagger', 'open-mouth bagging machine', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'net-weigh open-mouth bagger, 25 kg'), mod('capacity', String(p.bagsPerDay), 'bags/day'), mod('manufacturer', 'Premier Tech')]),
    word('bag_heat_sealer_word', 'bag heat sealer',
      cc('bag_heat_sealer', 'bag heat sealer', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'), mod('form', 'continuous band sealer')]),
    word('product_storage_silo_word', 'product storage silo',
      cc('product_storage_silo', 'product storage silo', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×2'), mod('form', 'one CaCO3 + one K2SO4 day-silo'), mod('dimension', '8 m³ each')]),
    word('palletiser_word', 'pallet wrapper',
      cc('palletiser', 'semi-automatic pallet wrapper', 'mass_fluid_transport_process', 'steel'),
      [mod('quantity', '×1'), mod('form', 'turntable stretch-wrapper')]),
  ])
  return { module: 'maintenance_serviceability',
    module_brief: `Net-weigh bagging fills, seals and palletises ${p.bagsPerDay} × 25 kg bags/day of CaCO3 and K2SO4 from dedicated day-silos.`,
    overview_paragraph_en: '', derived_parameters: { bags_per_day: p.bagsPerDay, bag_kg: p.bagKg },
    allowed_radicals: ['mass_fluid_transport_process', 'thermal_transfer_function', 'steel'], applicability_confidence: 'high', sub_modules: [sub] }
}

// Cross-module grammar links ------------------------------------------------------
function emitCrossModuleGrammarLinks(p: Co2MinParams) {
  return [
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `CO2-rich MEA → gypsum carbonation reactor (${p.caco3Tpd.toFixed(1)} t/day CaCO3)` },
    { from_module: 'energy_conversion_transduction', to_module: 'mass_fluid_transport_process',
      mechanism: 'fluid_loop' as const, type: 'directional' as const, detail: `sulfate filtrate → K2SO4 recovery; regenerated MEA → recovery loop` },
    { from_module: 'environmental_interface', to_module: 'mass_fluid_transport_process',
      mechanism: 'thermal' as const, type: 'directional' as const, detail: `${p.steamKgH.toFixed(0)} kg/h reboiler steam + hot air to dryers + distillation` },
    { from_module: 'power_distribution', to_module: 'mass_fluid_transport_process',
      mechanism: 'electrical_bus' as const, type: 'directional' as const, detail: `${p.electricalKw.toFixed(0)} kW to pumps, agitators, blowers, baggers` },
    { from_module: 'control_compute_communication', to_module: 'energy_conversion_transduction',
      mechanism: 'control' as const, type: 'directional' as const, detail: 'PLC sequences carbonation pH/ORP + KOH dosing + crystalliser' },
    { from_module: 'sensing_instrumentation', to_module: 'control_compute_communication',
      mechanism: 'data' as const, type: 'directional' as const, detail: 'Coriolis flow + density + level close the CaCO3/K2SO4 mass balance' },
    { from_module: 'safety_protection', to_module: 'control_compute_communication',
      mechanism: 'data' as const, type: 'directional' as const, detail: 'gas detection + ESD chain trip the PLC' },
    { from_module: 'structure_containment', to_module: 'energy_conversion_transduction',
      mechanism: 'mechanical' as const, type: 'directional' as const, detail: 'reactors + columns saddle-mounted on the bunded skid' },
  ]
}

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitAbsorptionCapture(p),
    emitCarbonationReactor(p),
    emitCaco3Recovery(p),
    emitK2so4Recovery(p),
    emitMeaRecovery(p),
    emitThermalUtilities(p),
    emitProcessControl(p),
    emitInstrumentation(p),
    emitElectrical(p),
    emitStructure(p),
    emitSafety(p),
    emitBagging(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 CO2-mineralisation process modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Skid-mounted CO2 capture + mineral-carbonation plant capturing ${p.captureTpd.toFixed(1)} t CO2/day in ${p.meaWtPct.toFixed(0)} wt% MEA, mineralising it with gypsum to ${p.caco3Tpd.toFixed(1)} t/day CaCO3 and recovering ${p.k2so4Tpd.toFixed(1)} t/day K2SO4 fertiliser via KOH, with closed-loop MEA recovery and ${p.bagsPerDay} × 25 kg bags/day of product.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('co2_mineralisation', emitter)
registerAssembler('co2_mineralisation/plant', emitter)

export { emitter as co2MineralisationEmitter }
