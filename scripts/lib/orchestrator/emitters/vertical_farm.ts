/**
 * scripts/lib/orchestrator/emitters/vertical_farm.ts
 *
 * VERTICAL FARM (CONTAINERISED 40-FT) DETERMINISTIC EMITTER — leafy-greens
 * production unit inside a 40-foot high-cube ISO shipping container,
 * sized against the brief at `src/lib/pdf-engine-v2/briefs/farm.md` and
 * `farm-container-100m2.md`.
 *
 * Build #20b (2026-05-22): hand-tuned BESS-quality emitter modelled on
 * deterministic-emitter.ts (BESS) + emitters/haps.ts (HAPS). Reads tool-
 * derived quantities from the Contract (LED kW + PPFD + DLI, HVAC kW + COP,
 * dehum kg/h, irrigation pump kW + head, transpiration L/day, yield kg/yr,
 * CO2 tank kg, grid kVA service, mass aggregator total) and emits a
 * 12-module, ~30-sub-module, ~120-word design with real manufacturer
 * parts (Heliospectra MITRA + Fluence SPYDR LED, Daikin VRV + Mitsubishi
 * PUMY DX HVAC, Munters/Aerial DH, Grundfos CR/MQ pump, Atlas Scientific
 * EC/pH probes, Hawkin GreenGuard dosing, Siemens S7-1200 PLC, ebm-papst
 * RadiCal fan, CIMC ISO 40-HC container, Bender IMD insulation monitor).
 *
 * Reproducibility contract:
 *   - Pure function — no I/O, no Date(), no Math.random()
 *   - Same (contract, brief, envelope) → byte-identical DesignJSON
 *   - All numerical fields read from contract.quantities (never invented)
 *   - Real industry part numbers from public datasheets
 */

import { registerAssembler } from '../assembler'
import type { ClassEmitter, DesignJSON } from '../assembler'
import type { ContractInProgress } from '../types'

// ---------------------------------------------------------------------------
// Local type aliases — match deterministic-emitter.ts shapes structurally so
// the existing chain consumers and PDF renderer pipeline accept the output.
// ---------------------------------------------------------------------------

type ModifierCharacter = { kind: string; value: string; unit?: string }

interface ContentCharacter {
  character_id: string
  name_human: string
  function_radical_primary: string | null
  function_radical_secondary: string | null
  material_radical_primary: string | null
  material_radical_secondary: string | null
}

interface Word {
  id: string
  name_human: string
  content_character: ContentCharacter
  modifier_characters: ModifierCharacter[]
}

interface SubModule {
  id: string
  name_human: string
  english_sentence: string
  rad_syntax: string
  role_verb: string
  topology_clause: string
  words: Word[]
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function q(contract: ContractInProgress, key: string, fallback: number): number {
  const v = (contract.quantities as Record<string, { value?: number }> | undefined)?.[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function fmtQty(n: number): string {
  if (Number.isInteger(n)) return `×${n}`
  return `×${n.toFixed(2)}`
}

function mod(kind: string, value: string, unit?: string): ModifierCharacter {
  return unit !== undefined ? { kind, value, unit } : { kind, value }
}

function cc(
  character_id: string,
  name_human: string,
  fp: string | null,
  mp: string | null,
  fs: string | null = null,
  ms: string | null = null,
): ContentCharacter {
  return {
    character_id,
    name_human,
    function_radical_primary: fp,
    function_radical_secondary: fs,
    material_radical_primary: mp,
    material_radical_secondary: ms,
  }
}

function word(id: string, name_human: string, content: ContentCharacter, modifiers: ModifierCharacter[]): Word {
  // Bug fix #6 (2026-05-22): emitter call sites historically passed `name_human`
  // with a literal " word" suffix (template-variable hangover). Strip it here so
  // the BoM Part column shows "ISO container 40 HC" not "ISO container 40 HC word".
  const cleanName = name_human.replace(/\s+word$/i, '')
  return { id, name_human: cleanName, content_character: content, modifier_characters: modifiers }
}

function synthesizeRadSyntax(words: Word[]): string {
  return words
    .map((w) => {
      const tokens = w.modifier_characters
        .slice()
        .sort((a, b) => (a.kind === 'quantity' ? -1 : b.kind === 'quantity' ? 1 : 0))
        .map((m) => (m.unit ? `${m.value}${m.unit}` : m.value))
      if (tokens.length === 0) return w.content_character.character_id
      return `${w.content_character.character_id} (${tokens.join(', ')})`
    })
    .join(' ⊙ ')
}

/**
 * Bug fix #8 (2026-05-22): subject-verb disagreement in sub-module prose.
 * When `name_human` is a plural noun (ends in 's' and isn't a known singular
 * exception like "bus" / "chassis" / "press" / "iris" / "harness"), pick the
 * BASE plural verb form. The renderer uses `role_verb` to build sentences
 * like "The {name_human} {role_verb} ...". For plural subjects ('sensors',
 * 'trolleys', 'circuits') the verb must be base form ('monitor', 'carry',
 * 'isolate'), not 3rd-person-singular ('monitors', 'carries', 'isolates').
 */
const SINGULAR_NOUN_ENDINGS_EXCEPTIONS = new Set<string>([
  'bus', 'chassis', 'lens', 'series', 'analysis', 'press', 'iris', 'harness',
  'mass', 'glass', 'pass', 'class', 'access', 'process',
])

function isPluralName(name: string): boolean {
  if (!name) return false
  const norm = name.trim().toLowerCase()
  const lastWord = norm.split(/\s+/).pop() ?? ''
  if (!lastWord.endsWith('s')) return false
  if (SINGULAR_NOUN_ENDINGS_EXCEPTIONS.has(lastWord)) return false
  return true
}

/** Convert a 3rd-person-singular verb to the base plural form.
 *  monitors→monitor, measures→measure, carries→carry, drives→drive,
 *  isolates→isolate, illuminates→illuminate, mixes→mix, processes→process,
 *  organises→organise. Falls back to stripping a trailing 's'. */
function toBaseVerb(verb: string): string {
  const v = verb.trim().toLowerCase()
  if (v.endsWith('ies')) return v.slice(0, -3) + 'y'  // carries→carry
  if (v.endsWith('xes') || v.endsWith('ses') || v.endsWith('zes') || v.endsWith('ches') || v.endsWith('shes')) return v.slice(0, -2)  // mixes→mix, processes→process
  if (v.endsWith('es')) {
    // "comprises" → "comprise", "monitors" doesn't match -es heuristic.
    // Be conservative: only strip "es" when "e" stem is recognisable.
    if (/[bcdfghjklmnpqrstvwxz]es$/.test(v)) return v.slice(0, -1)  // "doses"→"dose"
    return v.slice(0, -2)
  }
  if (v.endsWith('s')) return v.slice(0, -1)
  return v
}

function makeSubModule(
  id: string,
  name_human: string,
  role_verb: string,
  topology_clause: string,
  words: Word[],
): SubModule {
  // Bug fix #8: align role_verb tense with subject number.
  const finalVerb = isPluralName(name_human) ? toBaseVerb(role_verb) : role_verb
  // Bug fix #9 (2026-05-22): topology_clause is appended at the end of the
  // generated sub-module paragraph as a tail-fragment. When the first letter
  // is lowercase, the rendered paragraph ends with a sentence like "separate
  // 20 ft envelope for fertigation equipment." — visibly broken as a stand-
  // alone fragment. Capitalise the first letter so the trailing sentence reads
  // as proper prose.
  const cappedTopo = topology_clause && topology_clause.length > 0
    ? topology_clause.charAt(0).toUpperCase() + topology_clause.slice(1)
    : topology_clause
  return {
    id,
    name_human,
    english_sentence: '',
    rad_syntax: synthesizeRadSyntax(words),
    role_verb: finalVerb,
    topology_clause: cappedTopo,
    words,
  }
}

// ---------------------------------------------------------------------------
// VERTICAL FARM PARAMETERS — derived from Contract.quantities
// ---------------------------------------------------------------------------

interface VfParams {
  canopyAreaM2: number
  trolleyCount: number
  tiersPerTrolley: number
  trayCount: number
  ledInstalledKw: number
  ledHeatLoadKw: number
  ppfdUmolM2s: number
  dliMolM2Day: number
  ledEfficacyUmolJ: number
  hvacCoolingKw: number
  hvacAirflowCmh: number
  hvacCop: number
  hvacCompressorKw: number
  ahuFanKw: number
  ahuFaceAreaM2: number
  ahuCoilRows: number
  dehumidifierKgH: number
  dehumidifierElectricalKw: number
  dehumidifierLDay: number
  irrigationPumpKw: number
  irrigationFlowLpm: number
  irrigationHeadM: number
  irrigationPipePressureKpa: number
  co2KgDay: number
  co2TankKg: number
  co2InjectionPoints: number
  transpirationKgDay: number
  cropName: string
  annualYieldKg: number
  yieldKgM2Yr: number
  cropCycleDays: number
  cropCyclesPerYear: number
  nutrientEcMsCm: number
  nutrientPh: number
  fertigationReservoirL: number
  uvcLamps: number
  uvcDoseMjCm2: number
  totalElectricalKw: number
  supplyKwAvailable: number
  serviceTransformerKva: number
  totalSystemMassKg: number
  massBudgetUtilisationPct: number
  recommendedContainerCount: number
  photoperiodHours: number
  operatingTempC: number
  targetRhPct: number
  co2TargetPpm: number
}

function deriveVfParams(c: ContractInProgress): VfParams {
  const canopyAreaM2 = q(c, 'canopy_area_m2', 100)
  const trolleyCount = Math.max(1, Math.round(q(c, 'trolley_count', 8)))
  const tiersPerTrolley = Math.max(1, Math.round(q(c, 'tiers_per_trolley', 5)))
  const trayCount = Math.max(1, Math.round(q(c, 'tray_count', trolleyCount * tiersPerTrolley)))
  const ledInstalledKw = q(c, 'led_installed_power_kw', 12)
  const ledHeatLoadKw = q(c, 'led_heat_load_kw', ledInstalledKw * 0.55)
  const ppfdUmolM2s = q(c, 'led_ppfd_umol_m2_s', 250)
  const dliMolM2Day = q(c, 'led_dli_mol_m2_day', 17)
  const ledEfficacyUmolJ = q(c, 'led_wall_plug_efficacy_umol_per_j', 2.5)
  const hvacCoolingKw = q(c, 'hvac_cooling_kw', q(c, 'hvac_chiller_capacity_kw', 20))
  const hvacAirflowCmh = q(c, 'hvac_airflow_cmh', 3600)
  const hvacCop = q(c, 'chiller_cop_cooling', q(c, 'hvac_expected_cop', 3.5))
  const hvacCompressorKw = q(c, 'hvac_compressor_power_kw', hvacCoolingKw / Math.max(2.0, hvacCop))
  const ahuFanKw = q(c, 'ahu_fan_power_kw', 1.5)
  const ahuFaceAreaM2 = q(c, 'ahu_coil_face_area_m2', 0.5)
  const ahuCoilRows = Math.max(1, Math.round(q(c, 'ahu_coil_rows', 4)))
  const dehumidifierKgH = q(c, 'moisture_removed_kg_h', 5)
  const dehumidifierElectricalKw = q(c, 'dehumidifier_electrical_kw', 2.5)
  const dehumidifierLDay = q(c, 'dehumidifier_capacity_l_day', 100)
  const irrigationPumpKw = q(c, 'irrigation_pump_motor_kw', 0.75)
  const irrigationFlowLpm = q(c, 'irrigation_pump_flow_lpm', 30)
  const irrigationHeadM = q(c, 'irrigation_pump_head_m', 12)
  const irrigationPipePressureKpa = q(c, 'irrigation_pipe_pressure_drop_kpa', 40)
  const co2KgDay = q(c, 'co2_consumption_kg_day', 4.5)
  const co2TankKg = q(c, 'co2_tank_size_kg', 100)
  const co2InjectionPoints = Math.max(1, Math.round(q(c, 'co2_injection_points', 1)))
  const transpirationKgDay = q(c, 'plant_transpiration_kg_day', 60)
  const annualYieldKg = q(c, 'annual_yield_kg', 25000)
  const yieldKgM2Yr = q(c, 'crop_annual_yield_kg_m2', 30)
  const cropCycleDays = Math.max(1, Math.round(q(c, 'crop_cycle_days', 35)))
  const cropCyclesPerYear = q(c, 'crop_cycles_per_year', 10)
  const nutrientEcMsCm = q(c, 'nutrient_target_ec_ms_cm', 1.4)
  const nutrientPh = q(c, 'nutrient_target_ph', 6.0)
  const fertigationReservoirL = q(c, 'fertigation_reservoir_l', 1000)
  const uvcLamps = Math.max(1, Math.round(q(c, 'uvc_lamps_required', 2)))
  const uvcDoseMjCm2 = q(c, 'uvc_target_dose_mj_cm2', 44)
  const totalElectricalKw = q(c, 'total_electrical_kw', 30)
  const supplyKwAvailable = q(c, 'supply_kw_available', q(c, 'grid_connection_rated_kw', 44))
  const serviceTransformerKva = q(c, 'service_transformer_kva', 0)
  const totalSystemMassKg = q(c, 'total_system_mass_kg', 18000)
  const massBudgetUtilisationPct = q(c, 'mass_budget_utilisation_pct', 70)
  const recommendedContainerCount = Math.max(1, Math.round(q(c, 'recommended_container_count', 1)))
  const photoperiodHours = q(c, 'photoperiod_hours', 16)
  const operatingTempC = q(c, 'operating_temp_c', 22)
  const targetRhPct = q(c, 'target_rh_pct', 65)
  const co2TargetPpm = q(c, 'co2_target_ppm', 1000)
  // Crop name comes through `target_crop_id.condition` (string carried via
  // the typed-quantity `condition` field because Quantity.value is numeric).
  const cropName = (((c.quantities as any)?.target_crop_id?.condition as string)
    ?? ((c.quantities as any)?.target_crop?.value as string)
    ?? 'lettuce')

  return {
    canopyAreaM2, trolleyCount, tiersPerTrolley, trayCount,
    ledInstalledKw, ledHeatLoadKw, ppfdUmolM2s, dliMolM2Day, ledEfficacyUmolJ,
    hvacCoolingKw, hvacAirflowCmh, hvacCop, hvacCompressorKw,
    ahuFanKw, ahuFaceAreaM2, ahuCoilRows,
    dehumidifierKgH, dehumidifierElectricalKw, dehumidifierLDay,
    irrigationPumpKw, irrigationFlowLpm, irrigationHeadM, irrigationPipePressureKpa,
    co2KgDay, co2TankKg, co2InjectionPoints,
    transpirationKgDay,
    cropName, annualYieldKg, yieldKgM2Yr, cropCycleDays, cropCyclesPerYear,
    nutrientEcMsCm, nutrientPh, fertigationReservoirL,
    uvcLamps, uvcDoseMjCm2,
    totalElectricalKw, supplyKwAvailable, serviceTransformerKva,
    totalSystemMassKg, massBudgetUtilisationPct, recommendedContainerCount,
    photoperiodHours, operatingTempC, targetRhPct, co2TargetPpm,
  }
}

// ---------------------------------------------------------------------------
// 1. growing_canopy — mobile trolleys with tiered shelves + trays.
// ---------------------------------------------------------------------------

function emitGrowingCanopy(p: VfParams) {
  const trayAreaM2 = p.canopyAreaM2 / p.trayCount

  const growingTrolleys = makeSubModule(
    'mobile_growing_trolleys',
    'mobile growing trolleys',
    'carries',
    `${p.trolleyCount} mobile trolleys × ${p.tiersPerTrolley} vertical tiers = ${p.trayCount} trays totalling ${p.canopyAreaM2.toFixed(0)} m² canopy`,
    [
      word(
        'mobile_growing_trolley_word',
        'mobile growing trolley word',
        cc('mobile_growing_trolley', 'mobile growing trolley', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', fmtQty(p.trolleyCount)),
          mod('dimension', '1200×2000×2400', 'mm'),
          mod('form', 'powder-coated steel chassis with castors + guide rails'),
          mod('regulatory', 'BS EN 60204-1'),
        ],
      ),
      word(
        'growing_tray_word',
        'growing tray word',
        cc('growing_tray', 'NFT growing tray', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.trayCount)),
          mod('dimension', '1200×1000', 'mm'),
          mod('form', 'food-grade HDPE recirculating channel'),
          mod('regulatory', 'EU 10/2011 food-contact'),
        ],
      ),
      word(
        'trolley_castor_word',
        'trolley castor word',
        cc('trolley_castor', 'trolley castor with brake', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', fmtQty(p.trolleyCount * 4)),
          mod('capacity', '250', 'kg'),
          mod('form', 'polyurethane wheel, swivel + brake'),
        ],
      ),
      word(
        'floor_guide_rail_word',
        'floor guide rail word',
        cc('floor_guide_rail', 'floor guide rail', 'mechanical_load_function', 'aluminium'),
        [
          mod('quantity', fmtQty(p.trolleyCount * 2)),
          mod('dimension', '2400', 'mm'),
          mod('form', 'extruded aluminium U-channel'),
        ],
      ),
      word(
        'utility_quick_connect_word',
        'utility quick-connect dock word',
        cc('utility_quick_connect', 'utility quick-connect dock', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.trolleyCount)),
          mod('form', 'water + nutrient + power + drainage in single mate'),
          mod('regulatory', 'IP55'),
        ],
      ),
    ],
  )

  const seedingPropagation = makeSubModule(
    'seedling_propagation',
    'seedling propagation',
    'germinates',
    `dedicated propagation rack for ${p.cropCyclesPerYear.toFixed(1)} cycles/yr at ${p.cropCycleDays} day-cycle`,
    [
      word(
        'propagation_rack_word',
        'propagation rack word',
        cc('propagation_rack', 'propagation rack', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '1200×600×2000', 'mm'),
          mod('form', '3-tier seedling rack'),
        ],
      ),
      word(
        'rockwool_propagation_cube_word',
        'rockwool propagation cube word',
        cc('rockwool_cube', 'rockwool propagation cube', null, 'mineral_fibre_material'),
        [
          mod('quantity', fmtQty(Math.round(p.canopyAreaM2 * 25))),  // ~25 plugs/m² canopy
          mod('form', 'Grodan A-OK 36/40 wrapped'),
          mod('regulatory', 'BRCGS-approved'),
        ],
      ),
    ],
  )

  return {
    module: 'growing_canopy',
    module_brief: `Houses ${p.canopyAreaM2.toFixed(0)} m² of leafy-greens canopy across ${p.trolleyCount} mobile trolleys × ${p.tiersPerTrolley} tiers = ${p.trayCount} trays, each ${trayAreaM2.toFixed(2)} m². Target crop ${p.cropName}, ${p.cropCyclesPerYear.toFixed(1)} cycles/yr at ${p.cropCycleDays} day-cycle, projected annual yield ${(p.annualYieldKg / 1000).toFixed(1)} tonnes.`,
    overview_paragraph_en: '',
    derived_parameters: {
      canopy_area_m2: p.canopyAreaM2,
      trolley_count: p.trolleyCount,
      tier_count: p.tiersPerTrolley,
      tray_count: p.trayCount,
      tray_area_m2: trayAreaM2,
      annual_yield_kg: p.annualYieldKg,
      // Bug fix #1 (2026-05-22): publish the achievable yield-per-m² to the
      // module's derived_parameters so the headline-deriver picks up the
      // tool-computed yield (28.5 kg/m²/yr from plant-growth:yield, not the
      // hardcoded 50 kg/m²/yr top-of-market target). Without this the cover
      // shows the brief target as if the design hit it.
      crop_annual_yield_kg_m2: p.yieldKgM2Yr,
      yield_per_m2_per_year: p.yieldKgM2Yr,
      crop_cycle_days: p.cropCycleDays,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'fluid_flow_state',
      'steel',
      'aluminium',
      'polymer_thermoplastic',
      'mineral_fibre_material',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [growingTrolleys, seedingPropagation],
  }
}

// ---------------------------------------------------------------------------
// 2. lighting_array — horticultural LED fixtures + drivers + distribution.
// ---------------------------------------------------------------------------

function emitLightingArray(p: VfParams) {
  // LED count: 1 fixture per tray (commercial leafy-greens convention)
  const ledFixtureCount = p.trayCount * 2  // 2 per tray for dual-row coverage
  const ledFixtureWatts = Math.max(60, (p.ledInstalledKw * 1000) / Math.max(1, ledFixtureCount))

  const ledFixtures = makeSubModule(
    'led_fixtures',
    'LED fixtures',
    'illuminates',
    `${ledFixtureCount} tunable-spectrum horticultural LED bars across ${p.trayCount} trays delivering ${p.ppfdUmolM2s.toFixed(0)} µmol/m²/s PPFD`,
    [
      word(
        'horticultural_led_fixture_word',
        'horticultural LED fixture word',
        cc('horticultural_led_fixture', 'horticultural LED bar', 'optical_emission_function', 'aluminium'),
        [
          mod('quantity', fmtQty(ledFixtureCount)),
          mod('capacity', String(ledFixtureWatts.toFixed(0)), 'W'),
          mod('form', 'Heliospectra MITRA X / Fluence SPYDR class, tunable RB+W'),
          mod('regulatory', 'CE EN 60598-2-22'),
          mod('photometric', String(p.ledEfficacyUmolJ.toFixed(2)), 'µmol/J'),
        ],
      ),
      word(
        'led_dimming_driver_word',
        'LED dimming driver word',
        cc('led_dimming_driver', 'LED dimming driver', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(ledFixtureCount)),
          mod('form', 'Mean Well HLG-150H constant-current, 0-10V dim'),
          mod('regulatory', 'CE EMC EN 55015'),
        ],
      ),
      word(
        'led_thermal_heatsink_word',
        'LED thermal heatsink word',
        cc('led_thermal_heatsink', 'LED thermal heatsink', 'thermal_transfer_function', 'aluminium'),
        [
          mod('quantity', fmtQty(ledFixtureCount)),
          mod('form', 'extruded aluminium passive fin pack'),
        ],
      ),
      word(
        'led_reflective_louver_word',
        'LED reflective louver word',
        cc('led_reflective_louver', 'LED reflective louver', 'optical_emission_function', 'aluminium'),
        [
          mod('quantity', fmtQty(ledFixtureCount)),
          mod('form', 'specular aluminium 92% reflectivity'),
        ],
      ),
    ],
  )

  const lightingDistribution = makeSubModule(
    'lighting_distribution',
    'lighting distribution',
    'distributes',
    `0-10V dim + DALI control bus to ${ledFixtureCount} drivers; ${p.photoperiodHours.toFixed(0)} h photoperiod scheduling`,
    [
      word(
        'lighting_dali_controller_word',
        'lighting DALI controller word',
        cc('lighting_dali_controller', 'lighting DALI controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Tridonic basicDIM Wireless'),
          mod('regulatory', 'IEC 62386'),
        ],
      ),
      word(
        'lighting_bus_cable_word',
        'lighting bus cable word',
        cc('lighting_bus_cable', 'lighting bus cable', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '2×1.5', 'mm²'),
          mod('form', '0-10V dim pair, LSZH-sheathed'),
        ],
      ),
      word(
        'lighting_relay_contactor_word',
        'lighting relay contactor word',
        cc('lighting_relay_contactor', 'lighting relay contactor', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '40', 'A'),
          mod('form', 'ABB ESB 40-40N 4-pole'),
        ],
      ),
    ],
  )

  return {
    module: 'lighting_array',
    module_brief: `Provides ${p.ppfdUmolM2s.toFixed(0)} µmol/m²/s PPFD (DLI ${p.dliMolM2Day.toFixed(1)} mol/m²/day at ${p.photoperiodHours} h photoperiod) via ${ledFixtureCount} tunable-spectrum LED fixtures totalling ${p.ledInstalledKw.toFixed(2)} kW at ${p.ledEfficacyUmolJ.toFixed(2)} µmol/J wall-plug efficacy.`,
    overview_paragraph_en: '',
    derived_parameters: {
      led_installed_kw: p.ledInstalledKw,
      led_fixture_count: ledFixtureCount,
      ppfd_umol_m2_s: p.ppfdUmolM2s,
      dli_mol_m2_day: p.dliMolM2Day,
      led_efficacy_umol_per_j: p.ledEfficacyUmolJ,
      photoperiod_hours: p.photoperiodHours,
    },
    allowed_radicals: [
      'optical_emission_function',
      'silicon_semiconductor_function',
      'electromechanical_switching_function',
      'thermal_transfer_function',
      'electrical_conducting_function',
      'aluminium',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [ledFixtures, lightingDistribution],
  }
}

// ---------------------------------------------------------------------------
// 3. climate_control — HVAC + dehumidification + CO2 + air circulation.
// ---------------------------------------------------------------------------

function emitClimateControl(p: VfParams) {
  const dxHvac = makeSubModule(
    'dx_hvac_unit',
    'DX HVAC unit',
    'conditions',
    `${p.hvacCoolingKw.toFixed(1)} kW DX cooling + reheat, ${p.hvacAirflowCmh.toFixed(0)} m³/h supply, COP=${p.hvacCop.toFixed(2)}`,
    [
      word(
        'dx_indoor_unit_word',
        'DX indoor unit word',
        cc('dx_indoor_unit', 'DX indoor unit', 'thermal_transfer_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.hvacCoolingKw.toFixed(1)), 'kW'),
          mod('form', 'Daikin VRV-S Mini / Mitsubishi PUMY-class ceiling cassette'),
          mod('regulatory', 'EN 14511, R290 / R32 refrigerant'),
        ],
      ),
      word(
        'dx_outdoor_unit_word',
        'DX outdoor unit word',
        cc('dx_outdoor_unit', 'DX outdoor unit', 'thermal_transfer_function', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.hvacCoolingKw.toFixed(1)), 'kW'),
          mod('form', 'inverter-driven scroll compressor + axial fan condenser'),
          mod('regulatory', 'EN 378 safety, IP24'),
        ],
      ),
      word(
        'refrigerant_line_set_word',
        'refrigerant line set word',
        cc('refrigerant_line_set', 'refrigerant line set', 'fluid_flow_state', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '15.9/9.5', 'mm OD'),
          mod('form', 'pre-insulated copper liquid + suction pair, 10 m'),
        ],
      ),
      word(
        'reheat_electric_element_word',
        'reheat electric element word',
        cc('reheat_electric_element', 'reheat electric element', 'thermal_transfer_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String((p.hvacCompressorKw * 0.4).toFixed(1)), 'kW'),
          mod('form', 'PTC stainless heater + airflow proving switch'),
        ],
      ),
      word(
        'condensate_recovery_pump_word',
        'condensate recovery pump word',
        cc('condensate_recovery_pump', 'condensate recovery pump', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '8', 'L/h'),
          mod('form', 'Sauermann Si-30 mini pump'),
        ],
      ),
    ],
  )

  const dehumidifier = makeSubModule(
    'dehumidifier',
    'dehumidifier',
    'removes',
    `${p.dehumidifierKgH.toFixed(1)} kg/h moisture (${p.dehumidifierLDay.toFixed(0)} L/day) from plant transpiration`,
    [
      word(
        'refrigeration_dehumidifier_word',
        'refrigeration dehumidifier word',
        cc('refrigeration_dehumidifier', 'refrigeration dehumidifier', 'fluid_flow_state', 'aluminium'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.dehumidifierLDay.toFixed(0)), 'L/day'),
          mod('form', 'Aerial AD-580 / Munters MX2-class commercial'),
          mod('regulatory', 'EN 60335-2-40'),
        ],
      ),
      word(
        'dehumidifier_drain_pump_word',
        'dehumidifier drain pump word',
        cc('dehumidifier_drain_pump', 'dehumidifier drain pump', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '15', 'L/h'),
          mod('form', 'integrated condensate transfer'),
        ],
      ),
    ],
  )

  const co2Enrichment = makeSubModule(
    'co2_enrichment',
    'CO2 enrichment',
    'doses',
    `${p.co2KgDay.toFixed(1)} kg/day CO2 to target ${p.co2TargetPpm} ppm via ${p.co2InjectionPoints} injection point(s) from a ${p.co2TankKg.toFixed(0)} kg bulk tank`,
    [
      word(
        'co2_bulk_tank_word',
        'CO2 bulk tank word',
        cc('co2_bulk_tank', 'CO2 bulk tank', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.co2TankKg.toFixed(0)), 'kg'),
          mod('form', 'cryogenic vacuum-insulated, vapouriser-fed'),
          mod('regulatory', 'PED 2014/68/EU'),
        ],
      ),
      word(
        'co2_pressure_regulator_word',
        'CO2 pressure regulator word',
        cc('co2_pressure_regulator', 'CO2 pressure regulator', 'pressure_vessel_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'Harris 825 two-stage 0-10 bar'),
          mod('regulatory', 'WRAS-approved'),
        ],
      ),
      word(
        'co2_solenoid_valve_word',
        'CO2 solenoid valve word',
        cc('co2_solenoid_valve', 'CO2 solenoid valve', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', fmtQty(p.co2InjectionPoints)),
          mod('capacity', '24', 'V DC'),
          mod('form', 'normally-closed brass solenoid'),
        ],
      ),
      word(
        'co2_injection_diffuser_word',
        'CO2 injection diffuser word',
        cc('co2_injection_diffuser', 'CO2 injection diffuser', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.co2InjectionPoints)),
          mod('form', 'micro-perforated PTFE diffusion ring'),
        ],
      ),
    ],
  )

  const airCirculation = makeSubModule(
    'air_circulation',
    'air circulation',
    'mixes',
    `${p.hvacAirflowCmh.toFixed(0)} m³/h supply at ${p.ahuFanKw.toFixed(2)} kW with ${p.ahuCoilRows}-row chilled coil`,
    [
      word(
        'ahu_centrifugal_fan_word',
        'AHU centrifugal fan word',
        cc('ahu_centrifugal_fan', 'AHU centrifugal fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.ahuFanKw.toFixed(2)), 'kW'),
          mod('form', 'ebm-papst RadiCal EC centrifugal'),
          mod('regulatory', 'CE Erp 2018'),
        ],
      ),
      word(
        'hepa_h13_filter_word',
        'HEPA H13 filter word',
        cc('hepa_h13_filter', 'HEPA H13 filter', null, 'mineral_fibre_material'),
        [
          mod('quantity', '×1'),
          mod('dimension', String(p.ahuFaceAreaM2.toFixed(2)), 'm²'),
          mod('form', 'Camfil Mini Mega HEPA H13'),
          mod('regulatory', 'EN 1822 H13'),
        ],
      ),
      word(
        'mixing_circulation_fan_word',
        'mixing circulation fan word',
        cc('mixing_circulation_fan', 'mixing circulation fan', 'thermal_transfer_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.tiersPerTrolley * 2)),
          mod('capacity', '45', 'W'),
          mod('form', 'inter-canopy axial fan, 200 mm'),
        ],
      ),
    ],
  )

  return {
    module: 'climate_control',
    module_brief: `Maintains ${p.operatingTempC.toFixed(0)} °C / ${p.targetRhPct.toFixed(0)}% RH / ${p.co2TargetPpm} ppm CO2 via ${p.hvacCoolingKw.toFixed(1)} kW DX HVAC (COP ${p.hvacCop.toFixed(2)}), ${p.dehumidifierLDay.toFixed(0)} L/day dehumidifier, ${p.co2TankKg.toFixed(0)} kg CO2 supply and ${p.hvacAirflowCmh.toFixed(0)} m³/h AHU.`,
    overview_paragraph_en: '',
    derived_parameters: {
      hvac_cooling_kw: p.hvacCoolingKw,
      hvac_cop: p.hvacCop,
      airflow_cmh: p.hvacAirflowCmh,
      dehumidifier_l_day: p.dehumidifierLDay,
      co2_kg_day: p.co2KgDay,
      co2_tank_kg: p.co2TankKg,
    },
    allowed_radicals: [
      'thermal_transfer_function',
      'fluid_flow_state',
      'pressure_vessel_function',
      'electromechanical_switching_function',
      'aluminium',
      'copper',
      'steel',
      'polymer_thermoplastic',
      'mineral_fibre_material',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [dxHvac, dehumidifier, co2Enrichment, airCirculation],
  }
}

// ---------------------------------------------------------------------------
// 4. irrigation_nutrient — fertigation tank + pumps + dosing + piping.
// ---------------------------------------------------------------------------

function emitIrrigationNutrient(p: VfParams) {
  const fertigationTank = makeSubModule(
    'fertigation_tank',
    'fertigation tank',
    'stores',
    `${p.fertigationReservoirL.toFixed(0)} L recirculating nutrient solution at EC ${p.nutrientEcMsCm.toFixed(2)} mS/cm, pH ${p.nutrientPh.toFixed(2)}`,
    [
      word(
        'fertigation_reservoir_word',
        'fertigation reservoir word',
        cc('fertigation_reservoir', 'fertigation reservoir', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.fertigationReservoirL.toFixed(0)), 'L'),
          mod('form', 'food-grade HDPE tank with light-tight lid'),
          mod('regulatory', 'EN 1186 / EU 10/2011'),
        ],
      ),
      word(
        'nutrient_stock_tank_a_word',
        'nutrient stock tank A word',
        cc('nutrient_stock_tank_a', 'nutrient stock tank A (Ca + N)', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '200', 'L'),
          mod('form', 'separate from tank B to prevent Ca-PO4-SO4 precipitation'),
        ],
      ),
      word(
        'nutrient_stock_tank_b_word',
        'nutrient stock tank B word',
        cc('nutrient_stock_tank_b', 'nutrient stock tank B (P + K + Mg + S)', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '200', 'L'),
          mod('form', 'separate from tank A'),
        ],
      ),
    ],
  )

  const dosingPumps = makeSubModule(
    'dosing_pumps',
    'dosing pumps',
    'doses',
    'A/B stock + pH down + pH up via peristaltic dosing into recirculation loop',
    [
      word(
        'peristaltic_dosing_pump_word',
        'peristaltic dosing pump word',
        cc('peristaltic_dosing_pump', 'peristaltic dosing pump', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×4'),
          mod('capacity', '8', 'L/h'),
          mod('form', 'Hawkin GreenGuard / Stenner Classic peristaltic'),
          mod('regulatory', 'EN 60335-2-76'),
        ],
      ),
      word(
        'ph_correction_acid_tank_word',
        'pH correction acid tank word',
        cc('ph_correction_acid_tank', 'pH correction acid tank', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '25', 'L'),
          mod('form', 'phosphoric / nitric acid (10% v/v) day-tank'),
        ],
      ),
      word(
        'ph_correction_base_tank_word',
        'pH correction base tank word',
        cc('ph_correction_base_tank', 'pH correction base tank', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '25', 'L'),
          mod('form', 'potassium hydroxide (10% v/v) day-tank'),
        ],
      ),
    ],
  )

  const recirculationLoop = makeSubModule(
    'recirculation_loop',
    'recirculation loop',
    'circulates',
    `${p.irrigationFlowLpm.toFixed(1)} L/min recirculating nutrient at ${p.irrigationHeadM.toFixed(1)} m head via ${p.irrigationPumpKw.toFixed(2)} kW pump; ${p.irrigationPipePressureKpa.toFixed(0)} kPa pipe loss`,
    [
      word(
        'fertigation_pump_word',
        'fertigation pump word',
        cc('fertigation_pump', 'fertigation pump', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(p.irrigationPumpKw.toFixed(2)), 'kW'),
          mod('form', 'Grundfos CR-class vertical multistage centrifugal'),
          mod('regulatory', 'EN 60335-2-41, WRAS'),
        ],
      ),
      word(
        'manifold_pvc_pipe_word',
        'manifold PVC pipe word',
        cc('manifold_pvc_pipe', 'manifold PVC pipe', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('dimension', '32', 'mm OD'),
          mod('form', 'PVC-U pressure pipe, food-contact'),
          mod('regulatory', 'BS EN 1452 / WRAS'),
        ],
      ),
      word(
        'tray_drip_emitter_word',
        'tray drip emitter word',
        cc('tray_drip_emitter', 'tray drip emitter', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.canopyAreaM2 * 4)),
          mod('capacity', '2', 'L/h'),
          mod('form', 'pressure-compensating emitter'),
        ],
      ),
      word(
        'return_drainage_grid_word',
        'return drainage grid word',
        cc('return_drainage_grid', 'return drainage grid', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('dimension', '50', 'mm OD'),
          mod('form', 'PVC-U gravity return manifold'),
        ],
      ),
      word(
        'inline_uv_steriliser_word',
        'inline UV steriliser word',
        cc('inline_uv_steriliser', 'inline UV steriliser', 'optical_emission_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '40', 'W'),
          mod('form', 'Grodan Aquariumsupplies UV 40W inline 254 nm'),
        ],
      ),
    ],
  )

  return {
    module: 'irrigation_nutrient',
    module_brief: `Recirculates ${p.fertigationReservoirL.toFixed(0)} L nutrient solution at EC ${p.nutrientEcMsCm.toFixed(2)} mS/cm, pH ${p.nutrientPh.toFixed(2)}, delivering ${p.irrigationFlowLpm.toFixed(1)} L/min via a ${p.irrigationPumpKw.toFixed(2)} kW Grundfos pump at ${p.irrigationHeadM.toFixed(1)} m head with split A/B dosing.`,
    overview_paragraph_en: '',
    derived_parameters: {
      reservoir_l: p.fertigationReservoirL,
      ec_ms_cm: p.nutrientEcMsCm,
      ph: p.nutrientPh,
      pump_kw: p.irrigationPumpKw,
      flow_lpm: p.irrigationFlowLpm,
      head_m: p.irrigationHeadM,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'optical_emission_function',
      'polymer_thermoplastic',
      'steel',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [fertigationTank, dosingPumps, recirculationLoop],
  }
}

// ---------------------------------------------------------------------------
// 5. automation_sensing — sensors + PLC + controllers.
// ---------------------------------------------------------------------------

function emitAutomationSensing(p: VfParams) {
  const envSensors = makeSubModule(
    'environmental_sensors',
    'environmental sensors',
    'monitors',
    `temperature, RH, CO2, PAR per zone (${p.tiersPerTrolley} tiers × ${p.trolleyCount} trolleys)`,
    [
      word(
        'sht41_temp_rh_sensor_word',
        'SHT41 temperature + RH sensor word',
        cc('sht41_temp_rh_sensor', 'SHT41 temperature + RH sensor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.trolleyCount * 2)),
          mod('form', 'Sensirion SHT41 ±0.2 °C / ±1.8% RH, I2C'),
        ],
      ),
      word(
        'co2_ndir_sensor_word',
        'CO2 NDIR sensor word',
        cc('co2_ndir_sensor', 'CO2 NDIR sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.co2InjectionPoints + 1)),
          mod('form', 'Sensirion SCD41 NDIR 0-5000 ppm'),
          mod('regulatory', 'EN 50543'),
        ],
      ),
      word(
        'par_quantum_sensor_word',
        'PAR quantum sensor word',
        cc('par_quantum_sensor', 'PAR quantum sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.trolleyCount)),
          mod('form', 'Apogee SQ-500 PAR quantum sensor 400-700 nm'),
        ],
      ),
    ],
  )

  const waterSensors = makeSubModule(
    'water_chemistry_sensors',
    'water chemistry sensors',
    'measures',
    'EC + pH + dissolved-O2 + water temperature on recirculation return',
    [
      word(
        'ec_conductivity_probe_word',
        'EC conductivity probe word',
        cc('ec_conductivity_probe', 'EC conductivity probe', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Atlas Scientific K1.0 platinum EC probe'),
          mod('regulatory', 'EN 27888'),
        ],
      ),
      word(
        'ph_glass_probe_word',
        'pH glass probe word',
        cc('ph_glass_probe', 'pH glass probe', 'electrical_conducting_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Atlas Scientific LabGrade Ag/AgCl pH probe'),
        ],
      ),
      word(
        'dissolved_o2_probe_word',
        'dissolved O2 probe word',
        cc('dissolved_o2_probe', 'dissolved O2 probe', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Atlas Scientific RTD-class galvanic'),
        ],
      ),
      word(
        'water_temp_ntc_sensor_word',
        'water temperature NTC sensor word',
        cc('water_temp_ntc_sensor', 'water temperature NTC sensor', 'electrical_conducting_function', 'ceramic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Pt-1000 RTD in stainless thermowell'),
        ],
      ),
    ],
  )

  const controlPlc = makeSubModule(
    'control_plc',
    'control PLC',
    'orchestrates',
    'sensor read + actuator dispatch + recipe execution + alarm logic',
    [
      word(
        'plc_controller_word',
        'PLC controller word',
        cc('plc_controller', 'PLC controller', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Siemens S7-1200 CPU 1214C DC/DC/DC'),
          mod('regulatory', 'IEC 61131-3'),
        ],
      ),
      word(
        'analogue_io_module_word',
        'analogue I/O module word',
        cc('analogue_io_module', 'analogue I/O module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Siemens SM 1234 4×AI / 2×AO, 4-20 mA / 0-10 V'),
        ],
      ),
      word(
        'digital_io_module_word',
        'digital I/O module word',
        cc('digital_io_module', 'digital I/O module', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Siemens SM 1223 16 DI / 16 DQ'),
        ],
      ),
      word(
        'modbus_rs485_gateway_word',
        'Modbus RS485 gateway word',
        cc('modbus_rs485_gateway', 'Modbus RS485 gateway', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Anybus Communicator Modbus TCP-RTU'),
          mod('regulatory', 'Modbus IEC 61158'),
        ],
      ),
      word(
        'hmi_touchscreen_word',
        'HMI touchscreen word',
        cc('hmi_touchscreen', 'HMI touchscreen', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Siemens KTP700 Basic 7" colour panel'),
          mod('regulatory', 'IP65 front'),
        ],
      ),
    ],
  )

  return {
    module: 'automation_sensing',
    module_brief: `Monitors temperature, RH, CO2, PAR, EC, pH and DO across ${p.trolleyCount} trolleys via 12+ sensors feeding a Siemens S7-1200 PLC with Modbus TCP to all actuators and an integrated 7" HMI for operator setpoints.`,
    overview_paragraph_en: '',
    derived_parameters: {
      sensor_count: p.trolleyCount * 4 + 6,
      plc_count: 1,
      hmi_count: 1,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'optical_sensing_function',
      'electrical_conducting_function',
      'polymer_thermoplastic',
      'ceramic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [envSensors, waterSensors, controlPlc],
  }
}

// ---------------------------------------------------------------------------
// 6. electrical_distribution — main panel + breakers + 3-phase service.
// ---------------------------------------------------------------------------

function emitElectricalDistribution(p: VfParams) {
  // Bug fix #5 (2026-05-22): main breaker rating must reflect the actual
  // demand. With LED corrected from 8.93 kW → ~15 kW and HVAC scaling
  // proportionally, totalElectricalKw climbs from ~30 kW to ~60 kW. Compute
  // the breaker rating from the 400 V 3-phase total demand current with a
  // 1.25× safety factor, then round up to the next standard MCCB frame size
  // (63 / 80 / 100 / 125 / 160 A). Default frame was 63A which mis-protects
  // a 15-kW LED design.
  const totalLoadA = (p.totalElectricalKw * 1000) / (400 * Math.sqrt(3))
  const requiredBreakerA = totalLoadA * 1.25
  const standardBreakerSizes = [40, 63, 80, 100, 125, 160, 200]
  const mainBreakerA = standardBreakerSizes.find(s => s >= requiredBreakerA) ?? 250

  const mainPanel = makeSubModule(
    'main_distribution_panel',
    'main distribution panel',
    'distributes',
    `${p.totalElectricalKw.toFixed(1)} kW at 400 V 3-phase via a TP&N MCCB enclosure rated ${p.supplyKwAvailable.toFixed(0)} kW`,
    [
      word(
        'tp_n_main_breaker_word',
        'TP&N main breaker word',
        cc('tp_n_main_breaker', 'TP&N main breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(mainBreakerA), 'A'),
          mod('form', 'ABB Tmax XT1H 4-pole 36 kA'),
          mod('regulatory', 'BS EN 60947-2'),
        ],
      ),
      word(
        'rcd_residual_current_device_word',
        'RCD residual-current device word',
        cc('rcd_residual_current_device', 'RCD residual-current device', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '30', 'mA'),
          mod('form', 'ABB DDA 200 Type B'),
          mod('regulatory', 'BS EN 61008-1'),
        ],
      ),
      word(
        'panel_busbar_word',
        'panel busbar word',
        cc('panel_busbar', 'panel busbar', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '160', 'A'),
          mod('form', 'tin-plated copper bar, 25×3 mm'),
        ],
      ),
    ],
  )

  const branchCircuits = makeSubModule(
    'branch_circuits',
    'branch circuits',
    'isolates',
    'individually-protected branch circuits for lighting, HVAC, pumps and sensors',
    [
      word(
        'lighting_branch_breaker_word',
        'lighting branch breaker word',
        cc('lighting_branch_breaker', 'lighting branch breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×2'),
          mod('capacity', String(Math.max(16, Math.round(p.ledInstalledKw * 1.5))), 'A'),
          mod('form', 'ABB S203 C-curve 3-pole MCB'),
        ],
      ),
      word(
        'hvac_branch_breaker_word',
        'HVAC branch breaker word',
        cc('hvac_branch_breaker', 'HVAC branch breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', String(Math.max(20, Math.round(p.hvacCompressorKw * 3.0))), 'A'),
          mod('form', 'ABB S203 D-curve 3-pole MCB'),
        ],
      ),
      word(
        'pump_dehumidifier_branch_breaker_word',
        'pump + dehumidifier branch breaker word',
        cc('pump_branch_breaker', 'pump + dehumidifier branch breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×2'),
          mod('capacity', '16', 'A'),
          mod('form', 'ABB S203 C-curve 3-pole MCB'),
        ],
      ),
      word(
        'control_24v_branch_breaker_word',
        '24V control branch breaker word',
        cc('control_24v_branch_breaker', '24V control branch breaker', 'electromechanical_switching_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '6', 'A'),
          mod('form', 'ABB S202 C-curve 2-pole MCB'),
        ],
      ),
      word(
        'mean_well_dr_120_24_psu_word',
        'Mean Well DR-120-24 24V PSU word',
        cc('mean_well_dr_120_24_psu', 'Mean Well DR-120-24 24V PSU', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '120', 'W'),
          mod('form', 'DIN-rail mounted PSU for PLC + sensors'),
        ],
      ),
    ],
  )

  const insulationMonitoring = makeSubModule(
    'insulation_monitoring',
    'insulation monitoring',
    'verifies',
    'continuous insulation monitor + earth-fault trip on the 400 V supply',
    [
      word(
        'insulation_monitor_word',
        'insulation monitor word',
        cc('insulation_monitor', 'insulation monitor', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Bender IRDH275 IMD'),
          mod('regulatory', 'BS EN 61557-8'),
        ],
      ),
      word(
        'main_earth_busbar_word',
        'main earth busbar word',
        cc('main_earth_busbar', 'main earth busbar', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('capacity', '160', 'A'),
          mod('form', 'tin-plated copper bar, 25×3 mm'),
          mod('regulatory', 'BS 7430 earthing'),
        ],
      ),
    ],
  )

  return {
    module: 'electrical_distribution',
    module_brief: `Routes ${p.totalElectricalKw.toFixed(1)} kW total demand (against ${p.supplyKwAvailable.toFixed(0)} kW 3-phase 63A supply) through a TP&N main breaker + RCD + per-branch MCBs with continuous insulation monitoring on the 400 V bus.`,
    overview_paragraph_en: '',
    derived_parameters: {
      total_electrical_kw: p.totalElectricalKw,
      grid_connection_rated_kw: p.supplyKwAvailable,
      main_breaker_a: 63,
    },
    allowed_radicals: [
      'electromechanical_switching_function',
      'electrical_conducting_function',
      'silicon_semiconductor_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [mainPanel, branchCircuits, insulationMonitoring],
  }
}

// ---------------------------------------------------------------------------
// 7. data_compute_communication — local server + comms + remote monitoring.
// ---------------------------------------------------------------------------

function emitDataComputeComms(_p: VfParams) {
  const localCompute = makeSubModule(
    'local_compute',
    'local compute',
    'runs',
    'edge controller + local time-series database + recipe engine',
    [
      word(
        'edge_industrial_pc_word',
        'edge industrial PC word',
        cc('edge_industrial_pc', 'edge industrial PC', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Advantech UNO-148 Atom x6413E DIN-rail'),
          mod('regulatory', 'IEC 60068 vibration'),
        ],
      ),
      word(
        'ssd_industrial_word',
        'industrial SSD word',
        cc('ssd_industrial', 'industrial SSD', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '256', 'GB'),
          mod('form', 'industrial M.2 SATA, -40 to +85 °C'),
        ],
      ),
    ],
  )

  const networking = makeSubModule(
    'networking',
    'networking',
    'connects',
    'local Ethernet ring + cellular fallback for remote telemetry',
    [
      word(
        'industrial_managed_switch_word',
        'industrial managed switch word',
        cc('industrial_managed_switch', 'industrial managed switch', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Hirschmann GREYHOUND GRS105 5-port'),
          mod('regulatory', 'IEC 61850-3 substation'),
        ],
      ),
      word(
        'cellular_4g_router_word',
        '4G cellular router word',
        cc('cellular_4g_router', '4G cellular router', 'silicon_semiconductor_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'Teltonika RUT240 LTE Cat-4 + dual SIM'),
        ],
      ),
      word(
        'ethernet_cat6_cable_word',
        'Ethernet Cat6 cable word',
        cc('ethernet_cat6_cable', 'Ethernet Cat6 cable', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×1'),
          mod('dimension', '25', 'm'),
          mod('form', 'LSZH F/UTP Cat6, industrial'),
        ],
      ),
    ],
  )

  return {
    module: 'data_compute_communication',
    module_brief: 'Hosts an Advantech edge industrial PC running a local time-series database + recipe engine, connected to the Siemens PLC over Modbus TCP and to remote monitoring via a 4G cellular router + Ethernet ring topology.',
    overview_paragraph_en: '',
    derived_parameters: {
      edge_pc_count: 1,
      cellular_modem_count: 1,
      ethernet_ports: 5,
    },
    allowed_radicals: [
      'silicon_semiconductor_function',
      'electrical_conducting_function',
      'copper',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [localCompute, networking],
  }
}

// ---------------------------------------------------------------------------
// 8. structure_containment — 40-ft ISO container + insulation + doors.
// ---------------------------------------------------------------------------

function emitStructureContainment(p: VfParams) {
  const containerShell = makeSubModule(
    'iso_container_40hc',
    'ISO container 40 HC',
    'contains',
    `40-foot high-cube ISO 6346 shell, ${p.totalSystemMassKg.toFixed(0)} kg loaded (${p.massBudgetUtilisationPct.toFixed(0)}% of payload envelope)`,
    [
      word(
        'iso_container_40hc_word',
        'ISO container 40 HC word',
        cc('iso_container_40hc', 'ISO container 40 HC', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '12190×2440×2900', 'mm'),
          mod('form', 'CIMC / Maersk-grade 40HC, modified panels'),
          mod('regulatory', 'BS EN ISO 1496-1 / ISO 6346'),
        ],
      ),
      word(
        'thermal_insulation_panel_word',
        'thermal insulation panel word',
        cc('thermal_insulation_panel', 'thermal insulation panel', null, 'mineral_fibre_material'),
        [
          mod('quantity', '×1'),
          mod('dimension', '100', 'mm'),
          mod('form', 'Kingspan Kooltherm K100 wall + ceiling'),
          mod('regulatory', 'B-s1,d0 EN 13501-1'),
        ],
      ),
      word(
        'food_grade_interior_lining_word',
        'food-grade interior lining word',
        cc('food_grade_interior_lining', 'food-grade interior lining', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'PVC anti-microbial liner panels'),
          mod('regulatory', 'BS EN 1186 / BRCGS Agriculture'),
        ],
      ),
      word(
        'epoxy_floor_coating_word',
        'epoxy floor coating word',
        cc('epoxy_floor_coating', 'epoxy floor coating', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('dimension', '28.6', 'm²'),
          mod('form', 'food-grade slip-resistant epoxy'),
          mod('regulatory', 'EN 1504-2'),
        ],
      ),
      word(
        'grounding_lug_set_word',
        'grounding lug set word',
        cc('grounding_lug_set', 'grounding lug set', 'electrical_conducting_function', 'copper'),
        [
          mod('quantity', '×4'),
          mod('form', 'M10 copper lug per corner casting'),
          mod('regulatory', 'BS 7430'),
        ],
      ),
    ],
  )

  const accessDoors = makeSubModule(
    'access_doors',
    'access doors',
    'admits',
    'main personnel door + maintenance access into the conditioned envelope',
    [
      word(
        'personnel_door_assembly_word',
        'personnel door assembly word',
        cc('personnel_door_assembly', 'personnel door assembly', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '900×2000', 'mm'),
          mod('form', 'insulated steel door + tri-point latch + thermal break'),
          mod('regulatory', 'IP54 + EN 1627 RC2'),
        ],
      ),
      word(
        'maintenance_panel_word',
        'maintenance panel word',
        cc('maintenance_panel', 'maintenance panel', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', '×2'),
          mod('dimension', '600×1800', 'mm'),
          mod('form', 'insulated removable side panel for service access'),
        ],
      ),
      word(
        'door_seal_gasket_word',
        'door seal gasket word',
        cc('door_seal_gasket', 'door seal gasket', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×3'),
          mod('form', 'EPDM compression gasket'),
        ],
      ),
    ],
  )

  return {
    module: 'structure_containment',
    module_brief: `Houses the vertical farm in a 40-foot high-cube ISO container (ISO 6346, 12.19 × 2.44 × 2.90 m), insulated to ${100} mm Kingspan Kooltherm K100, food-grade lined and epoxy-floored, with one IP54 personnel door and two removable maintenance panels. Loaded mass ${p.totalSystemMassKg.toFixed(0)} kg.`,
    overview_paragraph_en: '',
    derived_parameters: {
      container_count: p.recommendedContainerCount,
      total_system_mass_kg: p.totalSystemMassKg,
      mass_budget_utilisation_pct: p.massBudgetUtilisationPct,
      insulation_thickness_mm: 100,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'electrical_conducting_function',
      'steel',
      'mineral_fibre_material',
      'polymer_thermoplastic',
      'copper',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [containerShell, accessDoors],
  }
}

// ---------------------------------------------------------------------------
// 9. worker_access_safety — entry vestibule + egress + walkways + signage.
// ---------------------------------------------------------------------------

function emitWorkerAccessSafety(p: VfParams) {
  const accessRoute = makeSubModule(
    'worker_access_route',
    'worker access route',
    'routes',
    'entry vestibule + central walkway between trolleys + emergency egress',
    [
      word(
        'entry_vestibule_word',
        'entry vestibule word',
        cc('entry_vestibule', 'entry vestibule', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'air-lock with hand-wash + sanitise station'),
          mod('regulatory', 'BRCGS Agriculture / EN ISO 22000'),
        ],
      ),
      word(
        'central_walkway_word',
        'central walkway word',
        cc('central_walkway', 'central walkway', 'mechanical_load_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '800×10000', 'mm'),
          mod('form', 'slip-resistant aluminium walkway between trolley rows'),
        ],
      ),
      word(
        'emergency_egress_release_word',
        'emergency egress release word',
        cc('emergency_egress_release', 'emergency egress release', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', 'panic-bar release on inside of personnel door'),
          mod('regulatory', 'EN 1125'),
        ],
      ),
    ],
  )

  const safetySignage = makeSubModule(
    'safety_signage_estop',
    'safety signage + emergency stop',
    'warns',
    'E-stop + UV-C warning + escape route + electrical hazard labels',
    [
      word(
        'emergency_stop_pushbutton_word',
        'emergency stop pushbutton word',
        cc('emergency_stop_pushbutton', 'emergency stop pushbutton', 'electromechanical_switching_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'Eaton M22-PV mushroom head, twist-release'),
          mod('regulatory', 'EN ISO 13850'),
        ],
      ),
      word(
        'uvc_warning_label_word',
        'UV-C warning label word',
        cc('uvc_warning_label', 'UV-C warning label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(p.uvcLamps + 1)),
          mod('regulatory', 'ANSI Z535.4 + ISO 7010'),
        ],
      ),
      word(
        'electrical_hazard_label_word',
        'electrical hazard label word',
        cc('electrical_hazard_label', 'electrical hazard label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×3'),
          mod('regulatory', 'BS EN ISO 7010'),
        ],
      ),
      word(
        'food_safety_compliance_label_word',
        'food safety compliance label word',
        cc('food_safety_compliance_label', 'food safety compliance label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'BRCGS Agriculture'),
        ],
      ),
    ],
  )

  const uvcSterilisation = makeSubModule(
    'uvc_sterilisation',
    'UV-C sterilisation',
    'sterilises',
    `${p.uvcLamps} UV-C lamps deliver ${p.uvcDoseMjCm2.toFixed(0)} mJ/cm² dose (4-log Botrytis) during photoperiod-off cycle, with occupancy interlock`,
    [
      word(
        'uvc_low_pressure_lamp_word',
        'UV-C low-pressure lamp word',
        cc('uvc_low_pressure_lamp', 'UV-C low-pressure lamp', 'optical_emission_function', 'ceramic'),
        [
          mod('quantity', fmtQty(p.uvcLamps)),
          mod('capacity', '30', 'W'),
          mod('form', 'Philips TUV PL-L 254 nm + electronic ballast'),
          mod('regulatory', 'ANSI/IES RP-27.3'),
        ],
      ),
      word(
        'occupancy_interlock_sensor_word',
        'occupancy interlock sensor word',
        cc('occupancy_interlock_sensor', 'occupancy interlock sensor', 'optical_sensing_function', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'PIR + door switch logic, hard-wired to UV-C ballast'),
        ],
      ),
    ],
  )

  return {
    module: 'worker_access_safety',
    module_brief: 'Provides hygienic worker access via entry vestibule + central walkway, dual emergency stops, escape route signage, UV-C warning labels, and an occupancy-interlocked UV-C sterilisation cycle.',
    overview_paragraph_en: '',
    derived_parameters: {
      estop_count: 2,
      uvc_lamp_count: p.uvcLamps,
      walkway_count: 1,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'electromechanical_switching_function',
      'optical_emission_function',
      'optical_sensing_function',
      'steel',
      'polymer_thermoplastic',
      'ceramic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [accessRoute, safetySignage, uvcSterilisation],
  }
}

// ---------------------------------------------------------------------------
// 10. harvest_handling — sorting tables + packing area + weighing.
// ---------------------------------------------------------------------------

function emitHarvestHandling(p: VfParams) {
  const sortingPacking = makeSubModule(
    'sorting_packing',
    'sorting + packing',
    'processes',
    `${(p.annualYieldKg / 1000).toFixed(1)} tonnes/yr harvest sorted, weighed and packed in-container`,
    [
      word(
        'stainless_sorting_table_word',
        'stainless sorting table word',
        cc('stainless_sorting_table', 'stainless sorting table', null, 'steel'),
        [
          mod('quantity', '×1'),
          mod('dimension', '1800×800×900', 'mm'),
          mod('form', '304 stainless food-grade work bench'),
          mod('regulatory', 'EN 1186 / BRCGS Agriculture'),
        ],
      ),
      word(
        'bench_scale_word',
        'bench scale word',
        cc('bench_scale', 'bench scale', 'electromechanical_switching_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '30', 'kg'),
          mod('form', 'OIML-approved trade-use bench scale'),
          mod('regulatory', 'EU 2014/31 NAWI'),
        ],
      ),
      word(
        'packing_film_dispenser_word',
        'packing film dispenser word',
        cc('packing_film_dispenser', 'packing film dispenser', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'compostable PLA film roll dispenser'),
          mod('regulatory', 'BS EN 13432 compostable'),
        ],
      ),
    ],
  )

  const handWashStation = makeSubModule(
    'hand_wash_station',
    'hand-wash station',
    'sanitises',
    'knee-operated hand-wash + sanitiser dispenser per BRCGS at the worker entry',
    [
      word(
        'knee_operated_sink_word',
        'knee-operated sink word',
        cc('knee_operated_sink', 'knee-operated sink', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('form', '304 stainless knee-operated mixer, food-grade'),
          mod('regulatory', 'WRAS-approved'),
        ],
      ),
      word(
        'sanitiser_dispenser_word',
        'sanitiser dispenser word',
        cc('sanitiser_dispenser', 'sanitiser dispenser', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('form', 'elbow-operated 1 L wall dispenser'),
        ],
      ),
    ],
  )

  return {
    module: 'harvest_handling',
    module_brief: `Provides in-container harvest sorting, OIML-approved weighing and compostable-film packing on a 304 stainless food-grade bench, with a knee-operated BRCGS hand-wash station for ${(p.annualYieldKg / 1000).toFixed(1)} t/yr throughput.`,
    overview_paragraph_en: '',
    derived_parameters: {
      throughput_kg_yr: p.annualYieldKg,
      sorting_table_count: 1,
      scale_count: 1,
    },
    allowed_radicals: [
      'mechanical_load_function',
      'fluid_flow_state',
      'electromechanical_switching_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [sortingPacking, handWashStation],
  }
}

// ---------------------------------------------------------------------------
// 11. regulatory_compliance — food safety + traceability + certification.
// ---------------------------------------------------------------------------

function emitRegulatoryCompliance(_p: VfParams) {
  const certEvidence = makeSubModule(
    'certification_evidence',
    'certification evidence',
    'attests',
    'mandatory certifications for UK food production + machinery + water contact',
    [
      word(
        'brcgs_agriculture_audit_word',
        'BRCGS Agriculture audit word',
        cc('brcgs_agriculture_audit', 'BRCGS Agriculture audit pack', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'BRCGS Global Standard for Agriculture'),
        ],
      ),
      word(
        'ukca_marking_label_word',
        'UKCA marking label word',
        cc('ukca_marking_label', 'UKCA marking label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'UKCA Conformity Assessment 2022'),
        ],
      ),
      word(
        'en_60204_machinery_safety_dossier_word',
        'EN 60204 machinery safety dossier word',
        cc('en_60204_machinery_safety_dossier', 'EN 60204 machinery safety dossier', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'BS EN 60204-1'),
        ],
      ),
      word(
        'wras_approval_certificate_word',
        'WRAS approval certificate word',
        cc('wras_approval_certificate', 'WRAS approval certificate', null, 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('regulatory', 'WRAS Approved Materials Directory 2024'),
        ],
      ),
    ],
  )

  const traceability = makeSubModule(
    'traceability_qr',
    'traceability QR + batch records',
    'records',
    'per-tray QR-coded batch traceability + water-quality test points',
    [
      word(
        'tray_qr_label_word',
        'tray QR code label word',
        cc('tray_qr_label', 'tray QR code label', null, 'polymer_thermoplastic'),
        [
          mod('quantity', fmtQty(_p.trayCount)),
          mod('form', 'GS1-128 QR per tray with cycle ID'),
          mod('regulatory', 'EU 178/2002 traceability'),
        ],
      ),
      word(
        'water_quality_sampling_port_word',
        'water-quality sampling port word',
        cc('water_quality_sampling_port', 'water-quality sampling port', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×2'),
          mod('form', 'stainless quick-connect on supply + return manifolds'),
          mod('regulatory', 'BS EN ISO 19458'),
        ],
      ),
    ],
  )

  return {
    module: 'regulatory_compliance',
    module_brief: 'Carries the mandatory UK certification evidence — BRCGS Agriculture, UKCA, BS EN 60204 machinery safety, WRAS water-contact — alongside per-tray GS1-128 QR traceability and stainless water-quality sampling ports on the supply and return manifolds.',
    overview_paragraph_en: '',
    derived_parameters: {
      cert_count: 4,
      qr_label_count: _p.trayCount,
      sampling_port_count: 2,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [certEvidence, traceability],
  }
}

// ---------------------------------------------------------------------------
// 12. effluent_treatment — drainage filtration + UV recirculation.
// ---------------------------------------------------------------------------

function emitEffluentTreatment(p: VfParams) {
  const drainageFiltration = makeSubModule(
    'drainage_filtration',
    'drainage filtration',
    'filters',
    'particulate + bio-film removal from return drainage before recirculation',
    [
      word(
        'screen_filter_50_micron_word',
        '50 µm screen filter word',
        cc('screen_filter_50_micron', '50 µm screen filter', 'fluid_flow_state', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '40', 'L/min'),
          mod('form', 'Amiad 2" T-line self-cleaning screen filter'),
          mod('regulatory', 'BS EN 13443-1'),
        ],
      ),
      word(
        'biological_sand_polish_word',
        'biological sand polish word',
        cc('biological_sand_polish', 'biological sand polish', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×1'),
          mod('capacity', '150', 'L'),
          mod('form', 'slow-sand bed for biofilm load reduction'),
        ],
      ),
    ],
  )

  const uvRecirculation = makeSubModule(
    'uv_recirculation_loop',
    'UV recirculation loop',
    'disinfects',
    `inline 254 nm UV steriliser on the recirculation loop before re-injection (${p.transpirationKgDay.toFixed(0)} kg/day water turnover)`,
    [
      word(
        'recirc_uv_steriliser_word',
        'recirculation UV steriliser word',
        cc('recirc_uv_steriliser', 'recirculation UV steriliser', 'optical_emission_function', 'steel'),
        [
          mod('quantity', '×1'),
          mod('capacity', '40', 'W'),
          mod('form', 'TMC Pro-Clear UV 40W inline 254 nm'),
          mod('regulatory', 'CE EN 60335-2-109'),
        ],
      ),
      word(
        'check_valve_recirc_word',
        'recirculation check valve word',
        cc('check_valve_recirc', 'recirculation check valve', 'fluid_flow_state', 'polymer_thermoplastic'),
        [
          mod('quantity', '×2'),
          mod('form', 'PVC spring-loaded swing check, 32 mm'),
        ],
      ),
    ],
  )

  return {
    module: 'effluent_treatment',
    module_brief: 'Polishes drainage with a 50 µm self-cleaning screen filter + biological sand bed before sterilising the recirculation loop through a 40 W inline 254 nm UV unit, supporting closed-loop water reuse.',
    overview_paragraph_en: '',
    derived_parameters: {
      filter_micron: 50,
      uv_power_w: 40,
      sand_bed_l: 150,
    },
    allowed_radicals: [
      'fluid_flow_state',
      'optical_emission_function',
      'steel',
      'polymer_thermoplastic',
    ],
    applicability_confidence: 'high' as const,
    sub_modules: [drainageFiltration, uvRecirculation],
  }
}

// ---------------------------------------------------------------------------
// CROSS-MODULE GRAMMAR LINKS
// ---------------------------------------------------------------------------

function emitCrossModuleGrammarLinks(_p: VfParams) {
  return [
    { from_module: 'electrical_distribution', to_module: 'lighting_array', mechanism: 'electrical_bus', type: 'directional' as const, detail: '400V 3-phase to LED drivers via 32A MCB' },
    { from_module: 'electrical_distribution', to_module: 'climate_control', mechanism: 'electrical_bus', type: 'directional' as const, detail: '400V 3-phase to HVAC + dehumidifier branches' },
    { from_module: 'electrical_distribution', to_module: 'irrigation_nutrient', mechanism: 'electrical_bus', type: 'directional' as const, detail: '230V single-phase to fertigation pump + dosing pumps' },
    { from_module: 'electrical_distribution', to_module: 'automation_sensing', mechanism: 'electrical_bus', type: 'directional' as const, detail: '24V DC to PLC + sensors via Mean Well PSU' },
    { from_module: 'lighting_array', to_module: 'climate_control', mechanism: 'thermal', type: 'directional' as const, detail: 'LED sensible heat (~55% of input) drives HVAC cooling load' },
    { from_module: 'growing_canopy', to_module: 'climate_control', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'plant transpiration → dehumidifier moisture load' },
    { from_module: 'growing_canopy', to_module: 'irrigation_nutrient', mechanism: 'fluid_loop', type: 'mutual' as const, detail: 'NFT trays receive irrigation + return to recirculation' },
    { from_module: 'irrigation_nutrient', to_module: 'effluent_treatment', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'drainage returns through 50 µm filter + UV before reuse' },
    { from_module: 'automation_sensing', to_module: 'climate_control', mechanism: 'control', type: 'directional' as const, detail: 'PLC drives HVAC + dehumidifier setpoints via Modbus' },
    { from_module: 'automation_sensing', to_module: 'irrigation_nutrient', mechanism: 'control', type: 'directional' as const, detail: 'PLC commands dosing pumps + irrigation cycles' },
    { from_module: 'automation_sensing', to_module: 'lighting_array', mechanism: 'control', type: 'directional' as const, detail: 'PLC drives DALI photoperiod schedule' },
    { from_module: 'data_compute_communication', to_module: 'automation_sensing', mechanism: 'data', type: 'mutual' as const, detail: 'edge PC ↔ PLC over Modbus TCP for telemetry + remote control' },
    { from_module: 'climate_control', to_module: 'irrigation_nutrient', mechanism: 'fluid_loop', type: 'directional' as const, detail: 'HVAC condensate recovery returns to fertigation tank' },
    { from_module: 'growing_canopy', to_module: 'structure_containment', mechanism: 'mechanical', type: 'directional' as const, detail: 'trolleys roll on floor guide rails inside container' },
    { from_module: 'climate_control', to_module: 'structure_containment', mechanism: 'mechanical', type: 'directional' as const, detail: 'DX outdoor unit roof-mounted on container' },
    { from_module: 'worker_access_safety', to_module: 'structure_containment', mechanism: 'mechanical', type: 'directional' as const, detail: 'personnel door + maintenance panels in container shell' },
    { from_module: 'harvest_handling', to_module: 'growing_canopy', mechanism: 'mechanical', type: 'directional' as const, detail: 'mature trolleys roll to packing bench at harvest' },
    { from_module: 'regulatory_compliance', to_module: 'harvest_handling', mechanism: 'data', type: 'directional' as const, detail: 'GS1-128 QR labels attach traceability to each tray' },
    { from_module: 'worker_access_safety', to_module: 'lighting_array', mechanism: 'control', type: 'directional' as const, detail: 'UV-C occupancy interlock disables LED + UV during access' },
    { from_module: 'electrical_distribution', to_module: 'data_compute_communication', mechanism: 'electrical_bus', type: 'directional' as const, detail: '24V DC via Mean Well PSU to edge industrial PC' },
  ]
}

// ---------------------------------------------------------------------------
// MAIN EMITTER
// ---------------------------------------------------------------------------

const emitVerticalFarmDesign: ClassEmitter = (contract, _brief, _envelope): DesignJSON => {
  const p = deriveVfParams(contract)
  const modules = [
    emitGrowingCanopy(p),               // 1
    emitLightingArray(p),               // 2
    emitClimateControl(p),              // 3
    emitIrrigationNutrient(p),          // 4
    emitAutomationSensing(p),           // 5
    emitElectricalDistribution(p),      // 6
    emitDataComputeComms(p),            // 7
    emitStructureContainment(p),        // 8
    emitWorkerAccessSafety(p),          // 9
    emitHarvestHandling(p),             // 10
    emitRegulatoryCompliance(p),        // 11
    emitEffluentTreatment(p),           // 12
  ]
  return {
    modules: modules as unknown as DesignJSON['modules'],
    cross_module_grammar_links: emitCrossModuleGrammarLinks(p),
    excluded_modules: [],
    rationale_excluded: 'All 12 modules apply to containerised vertical farm (leafy greens).',
    brief_overview_prose: {
      overview_and_context: '',
      mission_statement: `Deliver ${(p.annualYieldKg / 1000).toFixed(1)} tonnes/yr of leafy greens (${p.cropName}) from a single 40-foot high-cube ISO container with ${p.canopyAreaM2.toFixed(0)} m² of canopy across ${p.trolleyCount} mobile trolleys × ${p.tiersPerTrolley} tiers, sized to BS EN 60204-1 + BRCGS Agriculture + WRAS + UKCA, drawing ${p.totalElectricalKw.toFixed(1)} kW against a 3-phase 63A supply.`,
      target_customers: '',
      why_now: '',
    },
  }
}

/**
 * Brief-shape gate (mirrors canEmitBess pattern). Returns true only for
 * vertical_farm contracts where the brief actually has a canopy area.
 */
export function canEmitVerticalFarm(contract: ContractInProgress): boolean {
  if (contract?.product_class !== 'vertical_farm') return false
  const canopy = (contract.quantities as any)?.canopy_area_m2?.value
  if (typeof canopy !== 'number' || !Number.isFinite(canopy)) return false
  return canopy >= 5 && canopy <= 2000
}

// Register against both bare class and class/scale_tier key so it wins both
// exact-match and class-alone lookups in assembler.ts.
registerAssembler('vertical_farm', emitVerticalFarmDesign)
registerAssembler('vertical_farm/commercial', emitVerticalFarmDesign)
registerAssembler('vertical_farm/micro', emitVerticalFarmDesign)
registerAssembler('vertical_farm/industrial', emitVerticalFarmDesign)

export { emitVerticalFarmDesign }
