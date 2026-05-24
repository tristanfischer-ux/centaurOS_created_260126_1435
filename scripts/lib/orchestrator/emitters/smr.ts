/**
 * scripts/lib/orchestrator/emitters/smr.ts
 *
 * SMR (Small Modular Reactor) deterministic emitter — 2026-05-22.
 *
 * 12 modules: reactor_core_fuel, primary_loop_pressuriser,
 * steam_generator_HX, secondary_loop_turbine, containment_pressure_vessel,
 * control_rod_drive, decay_heat_removal_passive, biological_shielding_concrete,
 * instrumentation_safety, fuel_handling, electrical_generation_grid_tie,
 * regulatory_safety_basis.
 *
 * Industry refs: Rolls-Royce SMR (470 MWt PWR, helical SG), NuScale
 * Power (160 MWt integral PWR), X-energy Xe-100 (200 MWt pebble-bed
 * HTGR), Last Energy 20 MW (gas-cooled PWR).
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

// ---------------------------------------------------------------------------
// Params
// ---------------------------------------------------------------------------

interface SmrParams {
  thermalMwt: number
  electricalMwe: number
  thermalEfficiencyPct: number
  fuelEnrichmentPct: number
  fuelAssemblyCount: number
  coreLifetimeYears: number
  keff: number
  dopplerPcmK: number
  shieldThicknessCm: number
  rpvWallMm: number
  rpvMassKg: number
  hxAreaM2: number
  passiveRemovalMw: number
  gsuKva: number
}

function deriveParams(c: ContractInProgress): SmrParams {
  const thermal = q(c, 'thermal_power_mwt', 200)
  const eta = q(c, 'thermal_efficiency_pct', 33)
  return {
    thermalMwt: thermal,
    electricalMwe: thermal * (eta / 100),
    thermalEfficiencyPct: eta,
    fuelEnrichmentPct: q(c, 'fuel_enrichment_pct', 4.95),
    fuelAssemblyCount: Math.max(1, Math.round(q(c, 'fuel_assembly_count', 89))),
    coreLifetimeYears: q(c, 'core_lifetime_years', 4),
    keff: q(c, 'keff', 1.001),
    dopplerPcmK: q(c, 'doppler_coefficient_pcm_K', -3.5),
    shieldThicknessCm: q(c, 'shield_thickness_required_cm', 240),
    rpvWallMm: q(c, 'rpv_wall_thickness_mm', 220),
    rpvMassKg: q(c, 'rpv_mass_kg', 350_000),
    hxAreaM2: q(c, 'steam_generator_area_m2', 3500),
    passiveRemovalMw: q(c, 'passive_removal_required_mw', 13),
    gsuKva: q(c, 'gsu_transformer_rating_kva', 100_000),
  }
}

// ---------------------------------------------------------------------------
// 1. reactor_core_fuel
// ---------------------------------------------------------------------------

function emitReactorCoreFuel(p: SmrParams): DesignModule {
  const fuel = makeSub('uo2_fuel_assembly', 'UO₂ fuel assembly', 'fissions',
    `${p.fuelAssemblyCount} UO₂ fuel assemblies at ${p.fuelEnrichmentPct.toFixed(2)}% U-235 enrichment, ${p.thermalMwt.toFixed(0)} MWt total`, [
    word('uo2_fuel_assembly_word', 'UO₂ fuel assembly',
      cc('uo2_fuel_assembly', 'UO₂ fuel assembly', 'nuclear_fission_function' as string, 'ceramic'),
      [mod('quantity', fmtQty(p.fuelAssemblyCount)),
       mod('form', '17×17 PWR lattice'),
       mod('capacity', String(p.fuelEnrichmentPct.toFixed(2)), '% U-235'),
       mod('regulatory', 'ASTM C753 + ASME III')]),
    word('zircaloy_clad_word', 'Zircaloy clad',
      cc('zircaloy_clad', 'Zircaloy-4 cladding', 'nuclear_fission_function' as string, 'steel'),
      [mod('quantity', fmtQty(p.fuelAssemblyCount * 264)),
       mod('form', 'Zircaloy-4 tube'),
       mod('dimension', '0.57', 'mm wall')]),
    word('fuel_spacer_grid_word', 'fuel spacer grid',
      cc('fuel_spacer_grid', 'fuel spacer grid', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', fmtQty(p.fuelAssemblyCount * 11)),
       mod('form', 'Inconel-718 spring grid')]),
  ])

  return {
    module: 'energy_storage_source',
    module_brief: `${p.fuelAssemblyCount} fuel assemblies of UO₂ at ${p.fuelEnrichmentPct.toFixed(2)}% U-235 enrichment, ${p.coreLifetimeYears.toFixed(1)} year core life, k_eff ${p.keff.toFixed(4)} at BoL.`,
    overview_paragraph_en: '',
    derived_parameters: {
      thermal_power_mwt: p.thermalMwt,
      fuel_assemblies: p.fuelAssemblyCount,
      enrichment_pct: p.fuelEnrichmentPct,
      core_lifetime_years: p.coreLifetimeYears,
    },
    allowed_radicals: ['nuclear_fission_function' as string, 'ceramic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [fuel],
  }
}

// ---------------------------------------------------------------------------
// 2. primary_loop_pressuriser
// ---------------------------------------------------------------------------

function emitPrimaryLoopPressuriser(_p: SmrParams): DesignModule {
  const pressuriser = makeSub('pressuriser', 'primary loop pressuriser', 'pressurises',
    '15.5 MPa primary coolant pressure with electric heaters + spray', [
    word('pressuriser_vessel_word', 'pressuriser vessel',
      cc('pressuriser_vessel', 'pressuriser vessel', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×1'),
       mod('capacity', '15.5', 'MPa'),
       mod('form', 'SA-508 cl.3 forged'),
       mod('regulatory', 'ASME III NB')]),
    word('pressuriser_heater_word', 'pressuriser heater',
      cc('pressuriser_heater', 'pressuriser heater', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×60'),
       mod('form', 'Incoloy 800 cartridge'),
       mod('capacity', '30', 'kW each')]),
    word('safety_relief_valve_word', 'safety relief valve',
      cc('safety_relief_valve_smr', 'safety relief valve', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×3'),
       mod('capacity', '17.2', 'MPa'),
       mod('regulatory', 'ASME III NB-7000')]),
    word('primary_coolant_pump_word', 'primary coolant pump',
      cc('primary_coolant_pump', 'primary coolant pump', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×4'),
       mod('capacity', '15.5', 'MPa'),
       mod('form', 'KSB/Flowserve canned-rotor reactor coolant pump, hermetically sealed'),
       mod('regulatory', 'ASME III NB')]),
  ])

  return {
    module: 'mass_fluid_transport_process',
    module_brief: 'Primary loop pressuriser maintains 15.5 MPa: 60x 30 kW cartridge heaters + 3x ASME-relief valves at 17.2 MPa + 4x canned-rotor primary coolant pumps.',
    overview_paragraph_en: '',
    derived_parameters: { design_pressure_mpa: 15.5, heater_count: 60 },
    allowed_radicals: ['pressure_vessel_function', 'thermal_transfer_function', 'mass_fluid_transport_process', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [pressuriser],
  }
}

// ---------------------------------------------------------------------------
// 3. steam_generator_HX
// ---------------------------------------------------------------------------

function emitSteamGeneratorHX(p: SmrParams): DesignModule {
  const sg = makeSub('steam_generator', 'steam generator', 'transfers heat',
    `helical-coil once-through steam generator with ${p.hxAreaM2.toFixed(0)} m² heat-transfer area`, [
    word('helical_tube_bundle_word', 'helical tube bundle',
      cc('helical_tube_bundle', 'helical tube bundle', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'Inconel 690 tube'),
       mod('capacity', String(Math.round(p.hxAreaM2)), 'm²'),
       mod('regulatory', 'ASME III NB')]),
    word('sg_shell_word', 'steam generator shell',
      cc('sg_shell', 'steam generator shell', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'SA-508 cl.3'),
       mod('capacity', '15.5', 'MPa primary')]),
    word('moisture_separator_word', 'moisture separator',
      cc('moisture_separator', 'moisture separator', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'cyclonic'),
       mod('regulatory', 'EPRI G-RG-1')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Helical-coil once-through SG: ${p.hxAreaM2.toFixed(0)} m² heat-transfer surface, Inconel 690 tubes producing dry saturated steam at 6 MPa.`,
    overview_paragraph_en: '',
    derived_parameters: { sg_area_m2: p.hxAreaM2 },
    allowed_radicals: ['thermal_transfer_function', 'pressure_vessel_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [sg],
  }
}

// ---------------------------------------------------------------------------
// 4. secondary_loop_turbine
// ---------------------------------------------------------------------------

function emitSecondaryLoopTurbine(p: SmrParams): DesignModule {
  const turbine = makeSub('steam_turbine', 'steam turbine generator', 'expands',
    `single-flow saturated-steam turbine driving a ${p.electricalMwe.toFixed(0)} MWe generator`, [
    word('steam_turbine_word', 'steam turbine',
      cc('steam_turbine_smr', 'steam turbine', 'energy_conversion_transduction' as string, 'steel'),
      [mod('quantity', '×1'),
       mod('capacity', String(p.electricalMwe.toFixed(0)), 'MWe'),
       mod('form', 'single-flow saturated')]),
    word('condenser_word', 'main condenser',
      cc('main_condenser', 'main condenser', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'shell + tube surface condenser'),
       mod('capacity', String((p.thermalMwt - p.electricalMwe).toFixed(0)), 'MW reject')]),
    word('feedwater_pump_word', 'feedwater pump',
      cc('feedwater_pump', 'feedwater pump', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×3'),
       mod('form', 'horizontal multi-stage centrifugal'),
       mod('capacity', '7', 'MPa')]),
  ])

  return {
    module: 'energy_conversion_transduction',
    module_brief: `Steam turbine generator: ${p.electricalMwe.toFixed(0)} MWe gross output at ${p.thermalEfficiencyPct.toFixed(0)}% thermal efficiency from a ${p.thermalMwt.toFixed(0)} MWt primary heat source. Condenser rejects ${(p.thermalMwt - p.electricalMwe).toFixed(0)} MW.`,
    overview_paragraph_en: '',
    derived_parameters: {
      electrical_power_mwe: p.electricalMwe,
      thermal_efficiency_pct: p.thermalEfficiencyPct,
    },
    allowed_radicals: ['energy_conversion_transduction' as string, 'thermal_transfer_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [turbine],
  }
}

// ---------------------------------------------------------------------------
// 5. containment_pressure_vessel
// ---------------------------------------------------------------------------

function emitContainmentPressureVessel(p: SmrParams): DesignModule {
  const containment = makeSub('reactor_pressure_vessel', 'reactor pressure vessel', 'contains',
    `${p.rpvWallMm.toFixed(0)} mm wall SA-508 cl.3 forged RPV at 15.5 MPa design pressure, ${(p.rpvMassKg / 1000).toFixed(0)} t`, [
    word('rpv_forging_word', 'RPV forging',
      cc('rpv_forging', 'RPV forging', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'SA-508 cl.3 forged ring'),
       mod('dimension', String(p.rpvWallMm.toFixed(0)), 'mm wall'),
       mod('regulatory', 'ASME III NB-2000')]),
    word('containment_dome_word', 'containment dome',
      cc('containment_dome', 'containment dome', 'pressure_vessel_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'steel-lined concrete dome'),
       mod('regulatory', 'IAEA NS-G-1.10')]),
    word('rpv_thermal_insulation_word', 'RPV thermal insulation',
      cc('rpv_thermal_insulation', 'RPV thermal insulation', 'thermal_transfer_function', 'ceramic'),
      [mod('quantity', '×1'),
       mod('form', 'reflective metallic'),
       mod('regulatory', 'EPRI 1015061')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: `RPV: ${(p.rpvMassKg / 1000).toFixed(0)} t SA-508 cl.3 forged vessel with ${p.rpvWallMm.toFixed(0)} mm wall. Surrounded by steel-lined concrete containment dome and reflective metallic insulation.`,
    overview_paragraph_en: '',
    derived_parameters: {
      rpv_mass_t: p.rpvMassKg / 1000,
      wall_thickness_mm: p.rpvWallMm,
      design_pressure_mpa: 15.5,
    },
    allowed_radicals: ['pressure_vessel_function', 'thermal_transfer_function', 'steel', 'ceramic'],
    applicability_confidence: 'high',
    sub_modules: [containment],
  }
}

// ---------------------------------------------------------------------------
// 6. control_rod_drive
// ---------------------------------------------------------------------------

function emitControlRodDrive(_p: SmrParams): DesignModule {
  const cr = makeSub('control_rod_drive', 'control rod drive', 'modulates',
    'magnetic-jack control rod drive mechanisms with B₄C absorber clusters', [
    word('control_rod_assembly_word', 'control rod assembly',
      cc('control_rod_assembly', 'control rod assembly', 'nuclear_fission_function' as string, 'steel'),
      [mod('quantity', '×33'),
       mod('form', 'B₄C absorber in stainless tube'),
       mod('regulatory', 'ASME III')]),
    word('crdm_word', 'CRDM',
      cc('crdm', 'control rod drive mechanism', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×33'),
       mod('form', 'magnetic-jack stepper'),
       mod('capacity', '0.5', 'm/s scram')]),
    word('scram_circuit_word', 'scram circuit',
      cc('scram_circuit', 'scram circuit', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×2'),
       mod('form', 'fail-safe de-energise'),
       mod('regulatory', 'IEC 61513')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: 'Reactivity control: 33 B₄C control rod clusters on magnetic-jack CRDMs with 2× redundant fail-safe scram circuits.',
    overview_paragraph_en: '',
    derived_parameters: { control_rod_count: 33 },
    allowed_radicals: ['nuclear_fission_function' as string, 'electromechanical_switching_function', 'silicon_semiconductor_function', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [cr],
  }
}

// ---------------------------------------------------------------------------
// 7. decay_heat_removal_passive
// ---------------------------------------------------------------------------

function emitDecayHeatRemovalPassive(p: SmrParams): DesignModule {
  const passive = makeSub('passive_decay_heat_radiator', 'passive decay heat radiator', 'rejects',
    `passive natural-convection decay-heat removal radiator sized for ${p.passiveRemovalMw.toFixed(1)} MW`, [
    word('passive_radiator_word', 'passive radiator',
      cc('passive_radiator', 'passive radiator', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', 'natural-convection cooling tower'),
       mod('capacity', String((p.passiveRemovalMw / 4).toFixed(1)), 'MW each')]),
    word('iso_condenser_word', 'isolation condenser',
      cc('iso_condenser', 'isolation condenser', 'thermal_transfer_function', 'steel'),
      [mod('quantity', '×2'),
       mod('form', 'gravity-driven water/steam IC')]),
    word('rcic_loop_word', 'RCIC backup loop',
      cc('rcic_loop', 'reactor core isolation cooling', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'turbine-driven pump backup'),
       mod('capacity', '6', 'MW')]),
  ])

  return {
    module: 'safety_protection',
    module_brief: `Passive decay-heat removal: 4 natural-convection radiators (${(p.passiveRemovalMw / 4).toFixed(1)} MW each), 2 gravity-driven isolation condensers, 1 RCIC backup loop. Designed to remove ${p.passiveRemovalMw.toFixed(1)} MW peak post-shutdown.`,
    overview_paragraph_en: '',
    derived_parameters: {
      passive_removal_mw: p.passiveRemovalMw,
      radiator_count: 4,
    },
    allowed_radicals: ['thermal_transfer_function', 'mass_fluid_transport_process' as string, 'steel'],
    applicability_confidence: 'high',
    sub_modules: [passive],
  }
}

// ---------------------------------------------------------------------------
// 8. biological_shielding_concrete
// ---------------------------------------------------------------------------

function emitBiologicalShieldingConcrete(p: SmrParams): DesignModule {
  const shield = makeSub('biological_shield', 'biological shield', 'attenuates',
    `${p.shieldThicknessCm.toFixed(0)} cm high-density (3.5 g/cm³) concrete shielding for radiation attenuation`, [
    word('high_density_concrete_word', 'high-density concrete',
      cc('high_density_concrete', 'high-density concrete', 'electromechanical_switching_function', 'ceramic'),
      [mod('quantity', '×1'),
       mod('form', '3.5 g/cm³ barite + magnetite aggregate'),
       mod('dimension', String(p.shieldThicknessCm.toFixed(0)), 'cm thickness'),
       mod('regulatory', 'ACI 349')]),
    word('shield_lining_steel_word', 'shield lining steel',
      cc('shield_lining_steel', 'shield lining steel', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', '6 mm carbon steel liner'),
       mod('regulatory', 'AWS D1.1')]),
  ])

  return {
    module: 'structure_containment',
    module_brief: `${p.shieldThicknessCm.toFixed(0)} cm high-density concrete biological shield (3.5 g/cm³ barite + magnetite) with 6 mm carbon-steel liner. Maintains site-boundary dose ≤ 0.1 µSv/h.`,
    overview_paragraph_en: '',
    derived_parameters: {
      shield_thickness_cm: p.shieldThicknessCm,
      concrete_density_kg_m3: 3500,
    },
    allowed_radicals: ['electromechanical_switching_function', 'ceramic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [shield],
  }
}

// ---------------------------------------------------------------------------
// 9. instrumentation_safety
// ---------------------------------------------------------------------------

function emitInstrumentationSafety(_p: SmrParams): DesignModule {
  const ic = makeSub('reactor_protection_system', 'reactor protection system', 'monitors',
    'IEC 61513-rated digital reactor protection + analogue diverse backup', [
    word('rps_chassis_word', 'RPS chassis',
      cc('rps_chassis', 'RPS chassis', 'silicon_semiconductor_function', 'steel'),
      [mod('quantity', '×4'),
       mod('form', '2-of-4 voting logic'),
       mod('regulatory', 'IEC 61513 + IEC 60880')]),
    word('neutron_flux_detector_word', 'neutron flux detector',
      cc('neutron_flux_detector', 'neutron flux detector', 'silicon_semiconductor_function', 'ceramic'),
      [mod('quantity', '×12'),
       mod('form', 'fission chamber + ionisation chamber')]),
    word('thermocouple_word', 'core thermocouple',
      cc('core_thermocouple', 'core thermocouple', 'thermal_transfer_function', 'ceramic'),
      [mod('quantity', '×40'),
       mod('form', 'type-K mineral-insulated')]),
  ])

  return {
    module: 'control_compute_communication',
    module_brief: 'Reactor protection system: 4 chassis × 2-of-4 voting per IEC 61513 + IEC 60880. 12 neutron flux detectors (fission + ionisation), 40 core thermocouples.',
    overview_paragraph_en: '',
    derived_parameters: { rps_chassis: 4, neutron_detector_count: 12 },
    allowed_radicals: ['silicon_semiconductor_function', 'thermal_transfer_function', 'ceramic', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [ic],
  }
}

// ---------------------------------------------------------------------------
// 10. fuel_handling
// ---------------------------------------------------------------------------

function emitFuelHandling(_p: SmrParams): DesignModule {
  const fh = makeSub('fuel_handling_machine', 'fuel handling machine', 'transfers',
    'remote-operated refuelling machine + spent-fuel pool storage', [
    word('refuel_machine_word', 'refuelling machine',
      cc('refuel_machine', 'refuelling machine', 'electromechanical_switching_function', 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'remote-operated bridge crane'),
       mod('regulatory', 'NUREG-0612')]),
    word('spent_fuel_pool_word', 'spent fuel pool',
      cc('spent_fuel_pool', 'spent fuel pool', 'mass_fluid_transport_process' as string, 'steel'),
      [mod('quantity', '×1'),
       mod('form', 'stainless-lined boric water pool'),
       mod('capacity', '20', 'years storage')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Fuel handling: remote-operated bridge-crane refuelling machine + 20-year stainless-lined spent fuel pool with boric-water shielding.',
    overview_paragraph_en: '',
    derived_parameters: { spent_fuel_pool_years: 20 },
    allowed_radicals: ['electromechanical_switching_function', 'mass_fluid_transport_process' as string, 'steel'],
    applicability_confidence: 'high',
    sub_modules: [fh],
  }
}

// ---------------------------------------------------------------------------
// 11. electrical_generation_grid_tie
// ---------------------------------------------------------------------------

function emitElectricalGenerationGridTie(p: SmrParams): DesignModule {
  const grid = makeSub('generator_step_up', 'generator step-up transformer', 'transmits',
    `${(p.gsuKva / 1000).toFixed(0)} MVA generator step-up transformer to 400 kV grid`, [
    word('gsu_transformer_word', 'GSU transformer',
      cc('gsu_transformer', 'generator step-up transformer', 'magnetic_coupling_function', 'steel'),
      [mod('quantity', '×1'),
       mod('capacity', String((p.gsuKva / 1000).toFixed(0)), 'MVA'),
       mod('form', '24 kV / 400 kV Dyn1 oil-filled'),
       mod('regulatory', 'IEC 60076')]),
    word('synchronous_generator_word', 'synchronous generator',
      cc('synchronous_generator_smr', 'synchronous generator', 'magnetic_coupling_function', 'copper'),
      [mod('quantity', '×1'),
       mod('capacity', String(p.electricalMwe.toFixed(0)), 'MWe'),
       mod('form', 'hydrogen-cooled')]),
    word('grid_protection_relay_word', 'grid protection relay',
      cc('grid_protection_relay', 'grid protection relay', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
      [mod('quantity', '×3'),
       mod('regulatory', 'ENA G99')]),
  ])

  return {
    module: 'power_distribution',
    module_brief: `Electrical grid tie: ${p.electricalMwe.toFixed(0)} MWe hydrogen-cooled synchronous generator → ${(p.gsuKva / 1000).toFixed(0)} MVA GSU transformer → 400 kV grid PCC. ENA G99 protection.`,
    overview_paragraph_en: '',
    derived_parameters: {
      electrical_power_mwe: p.electricalMwe,
      gsu_mva: p.gsuKva / 1000,
    },
    allowed_radicals: ['magnetic_coupling_function', 'silicon_semiconductor_function', 'copper', 'steel'],
    applicability_confidence: 'high',
    sub_modules: [grid],
  }
}

// ---------------------------------------------------------------------------
// 12. regulatory_safety_basis
// ---------------------------------------------------------------------------

function emitRegulatorySafetyBasis(_p: SmrParams): DesignModule {
  const reg = makeSub('regulatory_safety_basis', 'regulatory safety basis', 'certifies',
    'NRC Part 50/52 + UK GDA + IAEA SSR-2/1 + ASME III + IEC 61513', [
    word('safety_analysis_report_word', 'safety analysis report',
      cc('safety_analysis_report', 'safety analysis report', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('form', 'FSAR + PRA Level 1/2/3'),
       mod('regulatory', 'NRC 10 CFR 50.34')]),
    word('environmental_impact_word', 'environmental impact statement',
      cc('environmental_impact', 'environmental impact statement', 'electromechanical_switching_function', 'polymer_thermoplastic'),
      [mod('quantity', '×1'),
       mod('regulatory', 'NEPA + EIA Directive 2014/52/EU')]),
  ])

  return {
    module: 'maintenance_serviceability',
    module_brief: 'Regulatory basis: NRC Part 50/52 SAR + PRA Levels 1/2/3, UK GDA submission, IAEA SSR-2/1, ASME III nuclear code, IEC 61513 I&C.',
    overview_paragraph_en: '',
    derived_parameters: { regulatory_mandatory_count: 5 },
    allowed_radicals: ['electromechanical_switching_function', 'polymer_thermoplastic'],
    applicability_confidence: 'high',
    sub_modules: [reg],
  }
}

// ---------------------------------------------------------------------------
// Cross-module grammar links
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(p: SmrParams) {
  return [
    { from_module: 'energy_storage_source', to_module: 'mass_fluid_transport_process',
      mechanism: 'thermal' as const, type: 'directional' as const,
      detail: `${p.thermalMwt.toFixed(0)} MWt core → pressurised primary loop` },
    { from_module: 'mass_fluid_transport_process', to_module: 'energy_conversion_transduction',
      mechanism: 'thermal' as const, type: 'mutual' as const,
      detail: 'primary ↔ secondary heat transfer at steam generator' },
    { from_module: 'energy_conversion_transduction', to_module: 'power_distribution',
      mechanism: 'electrical_bus' as const, type: 'directional' as const,
      detail: `${p.electricalMwe.toFixed(0)} MWe turbine output to GSU transformer` },
    { from_module: 'control_compute_communication', to_module: 'energy_storage_source',
      mechanism: 'control' as const, type: 'directional' as const,
      detail: 'CRDM step + scram commands to control rod assemblies' },
    { from_module: 'safety_protection', to_module: 'energy_storage_source',
      mechanism: 'thermal' as const, type: 'directional' as const,
      detail: `passive decay heat removal at ${p.passiveRemovalMw.toFixed(1)} MW post-shutdown` },
    { from_module: 'structure_containment', to_module: 'energy_storage_source',
      mechanism: 'mechanical' as const, type: 'directional' as const,
      detail: 'RPV bolted to containment dome floor' },
    { from_module: 'structure_containment', to_module: 'safety_protection',
      mechanism: 'mechanical' as const, type: 'directional' as const,
      detail: 'biological shield attenuates radiation field around RPV' },
  ]
}

// ---------------------------------------------------------------------------
// PUBLIC EMITTER
// ---------------------------------------------------------------------------

const emitter: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveParams(contract)
  const modules: DesignModule[] = [
    emitReactorCoreFuel(p),
    emitPrimaryLoopPressuriser(p),
    emitSteamGeneratorHX(p),
    emitSecondaryLoopTurbine(p),
    emitContainmentPressureVessel(p),
    emitControlRodDrive(p),
    emitDecayHeatRemovalPassive(p),
    emitBiologicalShieldingConcrete(p),
    emitInstrumentationSafety(p),
    emitFuelHandling(p),
    emitElectricalGenerationGridTie(p),
    emitRegulatorySafetyBasis(p),
  ]
  return {
    modules,
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 SMR modules apply.',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Small modular reactor at ${p.thermalMwt.toFixed(0)} MWt / ${p.electricalMwe.toFixed(0)} MWe (η=${p.thermalEfficiencyPct.toFixed(0)}%). ${p.fuelAssemblyCount} fuel assemblies at ${p.fuelEnrichmentPct.toFixed(2)}% U-235 with ${p.coreLifetimeYears.toFixed(1)} year core life. k_eff ${p.keff.toFixed(4)}, Doppler ${p.dopplerPcmK.toFixed(1)} pcm/K. ${p.passiveRemovalMw.toFixed(1)} MW passive decay-heat removal. NRC + UK GDA + ASME III + IEC 61513 safety basis.`,
      target_customers: '',
      why_now: '',
    },
  }
}

registerAssembler('smr', emitter)
registerAssembler('smr/micro-reactor', emitter)
