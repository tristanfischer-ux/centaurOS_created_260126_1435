/**
 * scripts/lib/orchestrator/emitters/dac.ts
 *
 * DAC (Direct Air Capture) deterministic emitter — 2026-05-22.
 *
 * 11 modules: air_contactor_fans, sorbent_bed_modules,
 * regeneration_steam_circuit, co2_compression_storage, electrical_solar_grid,
 * heat_recovery_HX, controls_DCS, water_supply_steam_gen, foundation_civil,
 * monitoring_emissions, regulatory_lifecycle_co2.
 *
 * Industry refs: Climeworks Mammoth (36 kt/year, solid amine-on-silica
 * sorbent, ~7 GJ/t CO₂ heat), Carbon Engineering CE-1 (1 Mt/year, KOH
 * liquid solvent → 900°C calciner), Heirloom (Ca/Mg looping), Global
 * Thermostat (amine-on-monolith).
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
  // Universal fix #A (2026-05-22): strip literal " word" suffix from name_human.
  const cleanName = n.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: c, modifier_characters: m }
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

interface DacParams {
  captureTpd: number
  captureTpa: number
  contactorCount: number
  contactorVolumeM3: number
  contactorFrontalM2: number
  fanPowerKw: number
  sorbentMassKg: number
  sorbentCycleLifetime: number
  regenTempC: number
  thermalMw: number
  electricalMw: number
  energyGjPerT: number
  co2PurityPct: number
  co2StorageMassKg: number
}

function deriveParams(c: ContractInProgress): DacParams {
  const tpd = q(c, 'target_capture_tpd', 100)
  return {
    captureTpd: tpd,
    captureTpa: tpd * 365,
    contactorCount: Math.max(1, Math.round(q(c, 'contactor_count', 12))),
    contactorVolumeM3: q(c, 'contactor_volume_m3', 40),
    contactorFrontalM2: q(c, 'contactor_frontal_area_m2', 16),
    fanPowerKw: q(c, 'fan_power_kw', 220),
    sorbentMassKg: q(c, 'sorbent_mass_kg', 12_000),
    sorbentCycleLifetime: q(c, 'sorbent_cycle_lifetime', 800),
    regenTempC: q(c, 'regeneration_temp_c', 100),
    thermalMw: q(c, 'thermal_power_required_mw', 7.5),
    electricalMw: q(c, 'electrical_power_required_mw', 1.2),
    energyGjPerT: q(c, 'specific_heat_demand_gj_per_ton_co2', 6.5),
    co2PurityPct: q(c, 'co2_purity_pct', 96),
    co2StorageMassKg: q(c, 'co2_storage_mass_kg', 14_000),
  }
}

// ---------------------------------------------------------------------------
// 1. air_contactor_fans
// ---------------------------------------------------------------------------

function emitAirContactorFans(p: DacParams): DesignModule {
  const fans = makeSub('contactor_fan_bank', 'contactor fan bank', 'draws',
    `${p.contactorCount} × axial blowers totalling ${p.fanPowerKw.toFixed(0)} kW shaft power across ${(p.contactorFrontalM2 * p.contactorCount).toFixed(0)} m² of frontal area`, [
    word('axial_blower_word', 'axial blower',
      cc('axial_blower', 'axial blower', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', fmtQty(p.contactorCount)),
       mod('form', 'variable-pitch axial'),
       mod('capacity', String((p.fanPowerKw / p.contactorCount).toFixed(0)), 'kW each'),
       mod('regulatory', 'IEC 60034')]),
    word('vfd_motor_drive_word', 'VFD motor drive',
      cc('vfd_motor_drive', 'VFD motor drive', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', fmtQty(p.contactorCount)),
       mod('form', 'IGBT inverter'),
       mod('capacity', String((p.fanPowerKw / p.contactorCount).toFixed(0)), 'kW')]),
    word('contactor_louvre_word', 'contactor louvre',
      cc('contactor_louvre', 'contactor louvre', 'mass_fluid_transport_process' as string, 'aluminium'),
      [mod('quantity', fmtQty(p.contactorCount * 4)),
       mod('form', 'gravity-shutter louvres')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `${p.contactorCount} variable-pitch axial blowers (~${(p.fanPowerKw / p.contactorCount).toFixed(0)} kW each, ${p.fanPowerKw.toFixed(0)} kW total) draw ambient air through ${(p.contactorFrontalM2 * p.contactorCount).toFixed(0)} m² frontal area.`,
    overview_paragraph_en: '',
    derived_parameters: {
      contactor_count: p.contactorCount,
      fan_power_kw: p.fanPowerKw,
    },
    allowed_radicals: ['mass_fluid_transport_process' as string, 'silicon_semiconductor_function', 'steel', 'aluminium'],
    applicability_confidence: 'high',
    sub_modules: [fans],
  }
}

// ---------------------------------------------------------------------------
// 2. sorbent_bed_modules
// ---------------------------------------------------------------------------

function emitSorbentBedModules(p: DacParams): DesignModule {
  const sorbent = makeSub('sorbent_bed', 'amine-on-silica sorbent bed', 'adsorbs',
    `${(p.sorbentMassKg / 1000).toFixed(1)} t amine-on-silica sorbent across ${p.contactorCount} packed beds, ${p.sorbentCycleLifetime.toFixed(0)} cycle lifetime`, [
    word('amine_sorbent_word', 'amine sorbent',
      cc('amine_sorbent', 'amine-on-silica sorbent', 'chemical_sensing_function', 'ceramic'),
      [mod('quantity', fmtQty(Math.round(p.sorbentMassKg))),
       mod('unit', 'kg'),
       mod('form', 'TEPA on SBA-15 silica'),
       mod('capacity', '1.5', 'mmol/g')]),
    word('sorbent_packed_bed_word', 'sorbent packed bed',
      cc('sorbent_packed_bed', 'sorbent packed bed', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', fmtQty(p.contactorCount)),
       mod('form', 'horizontal packed bed'),
       mod('dimension', String(p.contactorVolumeM3.toFixed(0)), 'm³')]),
    word('sorbent_distributor_plate_word', 'sorbent distributor plate',
      cc('sorbent_distributor_plate', 'sorbent distributor plate', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', fmtQty(p.contactorCount * 2)),
       mod('form', 'perforated plate')]),
  ])

  return {
    module: 'energy_storage_source',
    module_brief: `${(p.sorbentMassKg / 1000).toFixed(1)} t TEPA-on-silica sorbent (1.5 mmol/g capacity) in ${p.contactorCount} horizontal packed beds with perforated distributor plates. ${p.sorbentCycleLifetime.toFixed(0)} cycles to 50% degradation.`,
    overview_paragraph_en: '',
    derived_parameters: {
      sorbent_mass_kg: p.sorbentMassKg,
      sorbent_cycle_lifetime: p.sorbentCycleLifetime,
    },
    allowed_radicals: ['chemical_sensing_function', 'mass_fluid_transport_process' as string, 'ceramic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [sorbent],
  }
}

// ---------------------------------------------------------------------------
// 3. regeneration_steam_circuit
// ---------------------------------------------------------------------------

function emitRegenerationSteamCircuit(p: DacParams): DesignModule {
  const steam = makeSub('regeneration_steam_loop', 'regeneration steam loop', 'desorbs',
    `${p.regenTempC.toFixed(0)}°C low-pressure steam circuit delivering ${p.thermalMw.toFixed(1)} MW thermal duty for sorbent regeneration`, [
    word('lp_steam_generator_word', 'LP steam generator',
      cc('lp_steam_generator', 'low-pressure steam generator', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'low-pressure shell + tube'),
       mod('capacity', String((p.thermalMw / 2).toFixed(1)), 'MW each')]),
    word('steam_distributor_word', 'steam distributor',
      cc('steam_distributor', 'steam distributor', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', fmtQty(p.contactorCount)),
       mod('form', 'header + branch'),
       mod('regulatory', 'ASME B31.1')]),
    word('vacuum_pump_word', 'vacuum pump',
      cc('vacuum_pump_dac', 'vacuum pump', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×4'),
       mod('form', 'liquid-ring vacuum'),
       mod('capacity', '50', 'mbar')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: `Regeneration steam loop: 2 low-pressure shell-and-tube steam generators (${p.thermalMw.toFixed(1)} MW total at ${p.regenTempC.toFixed(0)}°C) feeding ${p.contactorCount} distributors. 4 liquid-ring vacuum pumps maintain 50 mbar during desorption.`,
    overview_paragraph_en: '',
    derived_parameters: {
      regen_temp_c: p.regenTempC,
      thermal_mw: p.thermalMw,
    },
    allowed_radicals: ['thermal_transfer_function', 'mass_fluid_transport_process' as string, 'steel'],
    applicability_confidence: 'high',
    sub_modules: [steam],
  }
}

// ---------------------------------------------------------------------------
// 4. co2_compression_storage
// ---------------------------------------------------------------------------

function emitCo2CompressionStorage(p: DacParams): DesignModule {
  const compressor = makeSub('co2_compressor_train', 'CO₂ compressor train', 'compresses',
    `4-stage centrifugal compressor train to 15 MPa dense-phase CO₂ pipeline-ready, ${(p.captureTpa).toFixed(0)} t/year throughput`, [
    word('centrifugal_compressor_word', 'centrifugal compressor',
      cc('centrifugal_compressor', 'centrifugal compressor', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×4'),
       mod('form', '4-stage integral gear'),
       mod('capacity', '15', 'MPa final')]),
    word('inter_stage_cooler_word', 'inter-stage cooler',
      cc('inter_stage_cooler', 'inter-stage cooler', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', 'plate + frame'),
       mod('capacity', '35', '°C outlet')]),
    word('co2_storage_tank_word', 'CO₂ storage tank',
      cc('co2_storage_tank', 'CO₂ storage tank', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'SA-516 gr.70 vessel'),
       mod('capacity', '15', 'MPa MAWP'),
       mod('regulatory', 'ASME VIII')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `4-stage centrifugal CO₂ compressor train compresses ${p.captureTpd.toFixed(0)} t/day CO₂ at ${p.co2PurityPct.toFixed(1)}% purity to 15 MPa dense-phase, stored in 2× ASME VIII pressure vessels (${(p.co2StorageMassKg / 1000).toFixed(0)} t each empty).`,
    overview_paragraph_en: '',
    derived_parameters: {
      co2_purity_pct: p.co2PurityPct,
      capture_tpa: p.captureTpa,
    },
    allowed_radicals: ['mass_fluid_transport_process' as string, 'thermal_transfer_function', 'pressure_vessel_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [compressor],
  }
}

// ---------------------------------------------------------------------------
// 5. electrical_solar_grid
// ---------------------------------------------------------------------------

function emitElectricalSolarGrid(p: DacParams): DesignModule {
  const electrical = makeSub('electrical_supply', 'electrical supply', 'powers',
    `${p.electricalMw.toFixed(1)} MW grid-tied electrical supply with on-site solar option, MV switchgear at the PCC`, [
    word('mv_switchgear_word', 'MV switchgear',
      cc('mv_switchgear', 'MV switchgear', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', '33 kV outdoor switchgear'),
       mod('capacity', String((p.electricalMw * 1.5).toFixed(1)), 'MVA'),
       mod('regulatory', 'IEC 62271')]),
    word('grid_step_down_transformer_word', 'grid step-down transformer',
      cc('grid_step_down_transformer', 'grid step-down transformer', 'magnetic_coupling_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', '33 kV / 0.4 kV oil-filled'),
       mod('capacity', String((p.electricalMw * 1.2).toFixed(1)), 'MVA')]),
    word('lv_distribution_panel_word', 'LV distribution panel',
      cc('lv_distribution_panel', 'LV distribution panel', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', '400 V form-4'),
       mod('regulatory', 'IEC 61439')]),
  ])

  return {
    module: 'power_distribution',
    module_brief: `Electrical: ${p.electricalMw.toFixed(1)} MW grid supply via 33 kV / 0.4 kV transformer, IEC 62271 MV switchgear, IEC 61439 LV distribution panels. Solar option supported in BoM.`,
    overview_paragraph_en: '',
    derived_parameters: {
      electrical_mw: p.electricalMw,
    },
    allowed_radicals: ['electromechanical_switching_function', 'magnetic_coupling_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [electrical],
  }
}

// ---------------------------------------------------------------------------
// 6. heat_recovery_HX
// ---------------------------------------------------------------------------

function emitHeatRecoveryHX(p: DacParams): DesignModule {
  const hx = makeSub('heat_recovery_hx', 'heat-recovery heat exchanger', 'recovers',
    `${(p.thermalMw * 0.25).toFixed(1)} MW heat recovery from exhaust to pre-heat inlet streams`, [
    word('plate_frame_hx_word', 'plate and frame HX',
      cc('plate_frame_hx', 'plate and frame heat exchanger', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', 'gasketed plate-and-frame'),
       mod('capacity', String((p.thermalMw / 4).toFixed(1)), 'MW each')]),
  ])

  return {
    module: 'environmental_interface',
    module_brief: `4 gasketed plate-and-frame heat exchangers recovering ${(p.thermalMw * 0.25).toFixed(1)} MW low-grade heat from exhaust to inlet pre-heat (≈25% recovery factor).`,
    overview_paragraph_en: '',
    derived_parameters: { heat_recovery_mw: p.thermalMw * 0.25 },
    allowed_radicals: ['thermal_transfer_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [hx],
  }
}

// ---------------------------------------------------------------------------
// 7. controls_DCS
// ---------------------------------------------------------------------------

function emitControlsDcs(_p: DacParams): DesignModule {
  const dcs = makeSub('plant_dcs', 'plant DCS', 'orchestrates',
    'IEC 61511 SIL-2 distributed control system with redundant servers + 4000 IO points', [
    word('dcs_controller_word', 'DCS controller',
      cc('dcs_controller', 'DCS controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×8'),
       mod('form', 'redundant pair'),
       mod('regulatory', 'IEC 61511 SIL-2')]),
    word('safety_plc_word', 'safety PLC',
      cc('safety_plc', 'safety PLC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'safety-rated'),
       mod('regulatory', 'IEC 61508 SIL-3')]),
    word('io_module_word', 'IO module',
      cc('io_module', 'IO module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×250'),
       mod('form', '16-channel galvanic-isolated'),
       mod('capacity', '4000', 'IO total')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: 'DCS: 8 controllers (4 redundant pairs) + 2 safety PLCs at IEC 61511 SIL-2 process control / IEC 61508 SIL-3 safety functions. 4000 IO points across 250 modules.',
    overview_paragraph_en: '',
    derived_parameters: { dcs_io_count: 4000 },
    allowed_radicals: ['silicon_semiconductor_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [dcs],
  }
}

// ---------------------------------------------------------------------------
// 8. water_supply_steam_gen
// ---------------------------------------------------------------------------

function emitWaterSupplySteamGen(_p: DacParams): DesignModule {
  const water = makeSub('water_treatment_supply', 'water treatment + supply', 'supplies',
    'demineralised water RO + EDI train for steam generator make-up', [
    word('ro_skid_word', 'RO skid',
      cc('ro_skid', 'reverse osmosis skid', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'CDLT + RO membrane'),
       mod('capacity', '20', 'm³/h')]),
    word('edi_polisher_word', 'EDI polisher',
      cc('edi_polisher', 'EDI polisher', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'electrodeionisation'),
       mod('regulatory', '<1 µS/cm')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: 'Water treatment: 2× RO skids (20 m³/h each) followed by EDI polishers producing <1 µS/cm demineralised water for steam-generator make-up.',
    overview_paragraph_en: '',
    derived_parameters: { water_throughput_m3_h: 40 },
    allowed_radicals: ['mass_fluid_transport_process' as string, 'steel'],
    applicability_confidence: 'high',
    sub_modules: [water],
  }
}

// ---------------------------------------------------------------------------
// 9. foundation_civil
// ---------------------------------------------------------------------------

function emitFoundationCivil(p: DacParams): DesignModule {
  const civil = makeSub('foundation_concrete', 'foundation + civil works', 'supports',
    `reinforced concrete foundation slab and steel structural skid for ${p.contactorCount} contactor modules`, [
    word('concrete_slab_word', 'concrete slab',
      cc('concrete_slab_dac', 'reinforced concrete slab', 'electromechanical_switching_function', 'ceramic'),
      [mod('quantity', '×1'),
       mod('form', 'C32/40 reinforced'),
       mod('dimension', String(Math.round(p.contactorFrontalM2 * p.contactorCount * 1.5)), 'm² area'),
       mod('regulatory', 'Eurocode 2')]),
    word('structural_steel_skid_word', 'structural steel skid',
      cc('structural_steel_skid', 'structural steel skid', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.contactorCount)),
       mod('form', 'welded HSS frame'),
       mod('regulatory', 'EN 1090')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: `Civil works: C32/40 reinforced-concrete slab ~${Math.round(p.contactorFrontalM2 * p.contactorCount * 1.5)} m² and ${p.contactorCount} welded HSS structural skids for contactor mounting. Eurocode 2 + EN 1090.`,
    overview_paragraph_en: '',
    derived_parameters: { slab_area_m2: p.contactorFrontalM2 * p.contactorCount * 1.5 },
    allowed_radicals: ['electromechanical_switching_function', 'ceramic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [civil],
  }
}

// ---------------------------------------------------------------------------
// 10. monitoring_emissions
// ---------------------------------------------------------------------------

function emitMonitoringEmissions(_p: DacParams): DesignModule {
  const monitoring = makeSub('cems_co2_monitor', 'CEMS + CO₂ monitor', 'measures',
    'continuous emissions monitoring + Coriolis CO₂ mass-flow meter for ISO 14064 reporting', [
    word('cems_analyser_word', 'CEMS analyser',
      cc('cems_analyser', 'CEMS analyser', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'NDIR + paramagnetic O₂'),
       mod('regulatory', 'EN 14181 + ISO 14064')]),
    word('coriolis_co2_meter_word', 'Coriolis CO₂ meter',
      cc('coriolis_co2_meter', 'Coriolis CO₂ mass-flow meter', 'silicon_semiconductor_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'Endress+Hauser Promass Q'),
       mod('regulatory', 'OIML R117 cl.0.2')]),
  ])

  return {
    module: 'safety_protection',
    module_brief: 'Emissions monitoring: 2× NDIR + paramagnetic CEMS analysers (EN 14181 + ISO 14064), 2× Coriolis CO₂ mass-flow meters (Endress+Hauser Promass Q, OIML R117 cl.0.2).',
    overview_paragraph_en: '',
    derived_parameters: { cems_analyser_count: 2 },
    allowed_radicals: ['silicon_semiconductor_function', 'steel', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [monitoring],
  }
}

// ---------------------------------------------------------------------------
// 11. regulatory_lifecycle_co2
// ---------------------------------------------------------------------------

function emitRegulatoryLifecycleCo2(_p: DacParams): DesignModule {
  const reg = makeSub('lifecycle_co2_basis', 'lifecycle CO₂ basis', 'certifies',
    'ISO 27914 geological storage + ISO 14064-2 GHG project + 40 CFR Part 98 + EU ETS + Verra CCS-RD methodologies', [
    word('iso27914_storage_word', 'ISO 27914 storage label',
      cc('iso27914_storage', 'ISO 27914 geological storage label', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'ISO 27914:2017')]),
    word('iso14064_label_word', 'ISO 14064 label',
      cc('iso14064_ghg', 'ISO 14064-2 GHG project label', null, 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'ISO 14064-2:2019')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Regulatory basis: ISO 27914 (geological CO₂ storage), ISO 14064-2 (GHG project accounting), 40 CFR Part 98 (US GHG reporting), EU ETS, Verra CCS-RD verification.',
    overview_paragraph_en: '',
    derived_parameters: { regulatory_mandatory_count: 5 },
    allowed_radicals: ['polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [reg],
  }
}

// ---------------------------------------------------------------------------
// Cross-module grammar links
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: DacParams) {
  return [
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_storage_source',
      mechanism: 'fluid_loop' as const, type: 'directional' as const,
      detail: `${p.fanPowerKw.toFixed(0)} kW fan power moves air through ${p.contactorCount} contactor beds` },
    { from_module: 'energy_storage_source', to_module: 'energy_conversion_transduction',
      mechanism: 'fluid_loop' as const, type: 'directional' as const,
      detail: `desorbed CO₂ from sorbent beds → 4-stage compressor train` },
    { from_module: 'environmental_interface', to_module: 'mass_fluid_transport_process',
      mechanism: 'thermal' as const, type: 'mutual' as const,
      detail: `heat recovery exhaust → inlet pre-heat (${(p.thermalMw * 0.25).toFixed(1)} MW)` },
    { from_module: 'power_distribution', to_module: 'mass_fluid_transport_process',
      mechanism: 'electrical_bus' as const, type: 'directional' as const,
      detail: `${p.electricalMw.toFixed(1)} MW LV supply to blowers, pumps, compressors` },
    { from_module: 'control_compute_communication', to_module: 'mass_fluid_transport_process',
      mechanism: 'control' as const, type: 'directional' as const,
      detail: 'DCS sets fan VFD speed + steam dosing per contactor' },
    { from_module: 'safety_protection', to_module: 'control_compute_communication',
      mechanism: 'data' as const, type: 'directional' as const,
      detail: 'CEMS analyser + Coriolis meter → DCS for ISO 14064 reporting' },
    { from_module: 'structure_containment', to_module: 'energy_storage_source',
      mechanism: 'mechanical' as const, type: 'directional' as const,
      detail: 'contactor modules bolted to steel skids on concrete slab' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitAirContactorFans(p),
    emitSorbentBedModules(p),
    emitRegenerationSteamCircuit(p),
    emitCo2CompressionStorage(p),
    emitElectricalSolarGrid(p),
    emitHeatRecoveryHX(p),
    emitControlsDcs(p),
    emitWaterSupplySteamGen(p),
    emitFoundationCivil(p),
    emitMonitoringEmissions(p),
    emitRegulatoryLifecycleCo2(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 11 DAC modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Solid-sorbent direct air capture plant at ${p.captureTpd.toFixed(0)} t CO₂/day (${p.captureTpa.toFixed(0)} t/year). ${p.contactorCount} amine-on-silica contactor modules, ${p.energyGjPerT.toFixed(1)} GJ/t energy intensity at ${p.regenTempC.toFixed(0)}°C regeneration. ${p.thermalMw.toFixed(1)} MW thermal + ${p.electricalMw.toFixed(1)} MW electrical. Output CO₂ ${p.co2PurityPct.toFixed(1)}% purity compressed to 15 MPa for pipeline/storage.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('dac', emitter)
registerAssembler('dac/plant', emitter)
