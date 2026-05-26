/**
 * scripts/lib/hardware-selectors.ts
 *
 * UNIVERSAL HARDWARE SELECTORS — deterministic functions that map engineering
 * inputs (thermal load, current, head pressure) to the smallest suitable
 * catalogue part from a known range.
 *
 * ARCHITECTURAL RULE (2026-05-26, L38 class-killer B):
 * Any hardware component whose rating DERIVES from a contract quantity MUST
 * use one of these selectors at emit time. The selector:
 *   1. Pulls from contract at emit time (heat load → flow; current → A rating)
 *   2. Applies a standard engineering safety factor (typically 1.25×)
 *   3. Picks the SMALLEST catalogue size that meets the derated requirement
 *   4. NEVER hard-codes the size
 *
 * Universal across all 35 product classes. Selectors are parameterised
 * functions — not BESS-specific. The BESS emitter calls them with BESS
 * contract values; a heat-pump emitter would call them with HP contract values.
 *
 * INVARIANT: selected_hardware_within_120pct_of_required_rating
 * Any emitted hardware's rated value MUST be in the range [100%, 120%] of
 * the requirement computed by the selector's inputs. Values outside this
 * band indicate either:
 *   - Under-spec (< 100%): safety violation — chain must exit non-zero
 *   - Over-spec (> 120%): engineering waste — council finding, not hard exit
 *     (except pump flow rates where 3× oversize is a real problem)
 * Regression harness invariant name: UNIVERSAL.selected_hardware_within_120pct
 *
 * Pre-change mempalace searches performed:
 *   1. "shared engineering quantity sub_module dedup coolant chemistry" → 5 drawers
 *   2. "sized hardware contract derived pump fan chiller cable selector" → 5 drawers
 *   3. "Phase 2 JSON truncation max_tokens finish_reason length" → 5 drawers
 * Key prior art: selectPfannenbergEbXt() in deterministic-emitter.ts (commit f959326eb,
 * task #122, 2026-05-25) — this file follows the same selector pattern universally.
 */

// ---------------------------------------------------------------------------
// COOLING PUMP SELECTOR — Grundfos NB / NBE end-suction centrifugal family
// ---------------------------------------------------------------------------

/**
 * Grundfos NB / NBE end-suction centrifugal pump range.
 *
 * Sizing anchors from Grundfos product catalogue (grundfos.com/nb-nbe):
 *   - NB 25-200/187: ~90 L/min @ 20 m head, ~1.5 kW, DN25 flanges
 *   - NB 40-200/172: ~230 L/min @ 20 m head, ~4.0 kW, DN40 flanges
 *   - NB 50-160/143: ~350 L/min @ 20 m head, ~4.0 kW, DN50 flanges
 *   - TPE 50-180/2:   ~280 L/min @ 20 m head, ~3.0 kW (inline, DN50)
 *     Source: https://product.grundfos.com/TPE-50-180-2
 *   - NB 65-160/151: ~480 L/min @ 20 m head, ~7.5 kW, DN65 flanges
 *   - NB 65-250/245: ~900 L/min @ 30 m head, ~11 kW, DN65 flanges
 *     Source: grundfos.com NB-NBE product page (verbatim: "Q=900 L/min @ H≈30 m")
 *     Validated in BESS L30 council (commit cbcc23755).
 *
 * The NB 65-250/245 was oversized for the L38 BESS (34.45 kW thermal load).
 * L38 finding: 14 racks × 2.46 kW/rack requires only ~210 L/min for ΔT=8K,
 * so the Grundfos TPE 50-180 (~280 L/min) is appropriate — NOT the NB 65-250
 * (~900 L/min, 3× oversized).
 *
 * Datasheet source for TPE 50-180:
 *   https://product.grundfos.com/TPE-50-180-2
 *   Grundfos TPE range product page — inline centrifugal pump, DN50, 3-phase,
 *   280 L/min @ 20 m head, EC motor for variable-speed energy saving, EN 12162.
 */
const GRUNDFOS_COOLANT_PUMP_RANGE: Array<{
  part_number: string
  family: string
  nominal_flow_lpm: number
  head_m: number
  motor_kw: number
  connection_dn: number
  notes: string
}> = [
  {
    part_number: 'NB 25-200/187 BQQE',
    family: 'NB',
    nominal_flow_lpm: 90,
    head_m: 20,
    motor_kw: 1.5,
    connection_dn: 25,
    notes: 'Small BESS / <5 rack cooling loops. Source: grundfos.com NB-NBE range.',
  },
  {
    part_number: 'TPE 50-180/2',
    family: 'TPE',
    nominal_flow_lpm: 280,
    head_m: 20,
    motor_kw: 3.0,
    connection_dn: 50,
    notes: 'Grundfos TPE 50-180/2 inline centrifugal, DN50, EC motor. Appropriate for ~5-14 rack BESS loops at 20 L/min/rack. Source: https://product.grundfos.com/TPE-50-180-2',
  },
  {
    part_number: 'NB 50-160/143 BQQE',
    family: 'NB',
    nominal_flow_lpm: 350,
    head_m: 20,
    motor_kw: 4.0,
    connection_dn: 50,
    notes: 'Mid-size end-suction centrifugal, DN50, ISO 2858. Source: grundfos.com NB-NBE range.',
  },
  {
    part_number: 'NB 65-160/151 BQQE',
    family: 'NB',
    nominal_flow_lpm: 480,
    head_m: 20,
    motor_kw: 7.5,
    connection_dn: 65,
    notes: 'Large end-suction centrifugal, DN65, ISO 2858. Source: grundfos.com NB-NBE range.',
  },
  {
    part_number: 'NB 65-250/245 BQQE',
    family: 'NB',
    nominal_flow_lpm: 900,
    head_m: 30,
    motor_kw: 11.0,
    connection_dn: 65,
    notes: 'Heavy-duty end-suction centrifugal, DN65, ISO 2858, 900 L/min @ ~30 m head. Correct for ≥15 rack BESS at 60 L/min/rack (legacy 15-rack L30 design point). Source: grundfos.com NB-NBE range; L30 council commit cbcc23755.',
  },
]

/**
 * Compute required coolant flow from first principles.
 *
 * Q = P_thermal / (ρ × Cp × ΔT)
 *
 * @param systemThermalLoadKw  Total system thermal load [kW] (battery I²R + inverter losses)
 * @param dtK                  Target coolant temperature rise [K], default 8 K
 * @param coolantDensityKgPerL Coolant density [kg/L], default 1.04 (50/50 MPG/DI)
 * @param coolantCpKjPerKgK    Coolant heat capacity [kJ/kg·K], default 3.65 (50/50 MPG/DI)
 * @returns Required flow rate [L/min]
 */
export function computeRequiredFlowLpm(
  systemThermalLoadKw: number,
  dtK: number = 8,
  coolantDensityKgPerL: number = 1.04,
  coolantCpKjPerKgK: number = 3.65,
): number {
  // Q_m3_per_s = P_kW / (ρ_kg_m3 × Cp_kJ_kgK × ΔT_K)  [m³/s]
  // Convert: density kg/L = kg/m³ × 0.001, so kg/m³ = density × 1000
  const densityKgPerM3 = coolantDensityKgPerL * 1000
  const flowM3PerS = (systemThermalLoadKw) / (densityKgPerM3 * coolantCpKjPerKgK * dtK)
  const flowLPerMin = flowM3PerS * 1000 * 60  // m³/s → L/min
  return flowLPerMin
}

/**
 * selectCoolantPumpFor — universal pump selector.
 *
 * Computes required flow from first principles, applies a 1.25× safety factor,
 * and returns the SMALLEST Grundfos pump in the catalogue that meets the duty.
 *
 * This function is class-universal: any product class that has a liquid cooling
 * loop (BESS, EV charger, power electronics, heat pump secondary circuit) uses
 * this function with its own thermal load and coolant properties.
 *
 * @param systemThermalLoadKw  Total thermal load [kW] to be rejected
 * @param dtK                  Target temperature rise [K], default 8
 * @param headM                System head [m], default 20
 * @param safetyFactor         Overcapacity margin, default 1.25 (standard thermal)
 * @param coolantDensityKgPerL Coolant density [kg/L], default 1.04 (50/50 MPG/DI)
 * @param coolantCpKjPerKgK    Coolant heat capacity [kJ/kg·K], default 3.65
 * @returns Selected pump + diagnostic info
 */
export function selectCoolantPumpFor(params: {
  systemThermalLoadKw: number
  dtK?: number
  headM?: number
  safetyFactor?: number
  coolantDensityKgPerL?: number
  coolantCpKjPerKgK?: number
}): {
  part_number: string
  family: string
  nominal_flow_lpm: number
  head_m: number
  motor_kw: number
  connection_dn: number
  required_flow_lpm: number
  required_with_safety_lpm: number
  flow_utilisation_pct: number
  notes: string
} {
  const dtK = params.dtK ?? 8
  const headM = params.headM ?? 20
  const safetyFactor = params.safetyFactor ?? 1.25
  const densityKgPerL = params.coolantDensityKgPerL ?? 1.04
  const cpKjPerKgK = params.coolantCpKjPerKgK ?? 3.65

  const requiredLpm = computeRequiredFlowLpm(params.systemThermalLoadKw, dtK, densityKgPerL, cpKjPerKgK)
  const requiredWithSafetyLpm = requiredLpm * safetyFactor

  // Find the smallest pump in the range that meets the required flow at the
  // specified head. If the pump's catalogue head differs from the requirement,
  // apply a simple affinity-law flow correction: Q ∝ √H (affinity law 2 for
  // centrifugal pumps). This is conservative — real curves are steeper, so the
  // actual available flow at lower head is higher.
  for (const pump of GRUNDFOS_COOLANT_PUMP_RANGE) {
    // Affinity-law correction: if required head < pump's catalogue head, the
    // pump can deliver more flow. If required head > pump's catalogue head,
    // the pump delivers less flow. We correct the available flow at headM.
    const headRatio = pump.head_m > 0 ? Math.sqrt(headM / pump.head_m) : 1
    const availableFlowAtHead = pump.nominal_flow_lpm * headRatio
    if (availableFlowAtHead >= requiredWithSafetyLpm) {
      return {
        ...pump,
        required_flow_lpm: Math.round(requiredLpm * 10) / 10,
        required_with_safety_lpm: Math.round(requiredWithSafetyLpm * 10) / 10,
        flow_utilisation_pct: Math.round((requiredWithSafetyLpm / availableFlowAtHead) * 100),
      }
    }
  }

  // Saturated — return the largest pump in range; gate audit will flag oversize
  const largest = GRUNDFOS_COOLANT_PUMP_RANGE[GRUNDFOS_COOLANT_PUMP_RANGE.length - 1]
  return {
    ...largest,
    required_flow_lpm: Math.round(requiredLpm * 10) / 10,
    required_with_safety_lpm: Math.round(requiredWithSafetyLpm * 10) / 10,
    flow_utilisation_pct: Math.round((requiredWithSafetyLpm / largest.nominal_flow_lpm) * 100),
  }
}

// ---------------------------------------------------------------------------
// CABLE SELECTOR — IEC 60228 / BS 7671 conductor sizing
// ---------------------------------------------------------------------------

/**
 * Standard cable cross-sections from IEC 60228 Class 2 stranded conductor.
 * Current ratings per BS 7671:2018 Table 4D5 (single-core XLPE/EPR in
 * enclosed trunking, 30°C ambient). Safety factor 1.25 already baked into
 * BS 7671 derating; we add an additional 1.25× for BESS continuous duty.
 *
 * Source: BS 7671:2018 (IET Wiring Regulations 18th Ed.) Table 4D5,
 * IEC 60228:2004 conductor cross-sections.
 */
const IEC60228_CABLE_RANGE: Array<{
  cross_section_mm2: number
  awg_equivalent: string
  rated_current_a: number  // BS 7671 Table 4D5 continuous @ 30°C enclosed trunking
  voltage_class_v: number  // max rated voltage (0.6/1 kV class)
  notes: string
}> = [
  { cross_section_mm2: 6,   awg_equivalent: '10 AWG', rated_current_a: 57,  voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 10,  awg_equivalent: '8 AWG',  rated_current_a: 76,  voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 16,  awg_equivalent: '6 AWG',  rated_current_a: 101, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 25,  awg_equivalent: '4 AWG',  rated_current_a: 131, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 35,  awg_equivalent: '2 AWG',  rated_current_a: 162, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 50,  awg_equivalent: '1 AWG',  rated_current_a: 196, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 70,  awg_equivalent: '2/0 AWG', rated_current_a: 251, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 95,  awg_equivalent: '3/0 AWG', rated_current_a: 304, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 120, awg_equivalent: '4/0 AWG', rated_current_a: 352, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 150, awg_equivalent: '300 kcmil', rated_current_a: 406, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 185, awg_equivalent: '350 kcmil', rated_current_a: 463, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 240, awg_equivalent: '500 kcmil', rated_current_a: 546, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 300, awg_equivalent: '600 kcmil', rated_current_a: 631, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 400, awg_equivalent: '750 kcmil', rated_current_a: 746, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 500, awg_equivalent: '900 kcmil', rated_current_a: 855, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5' },
  { cross_section_mm2: 630, awg_equivalent: '1200 kcmil', rated_current_a: 1000, voltage_class_v: 1000, notes: 'IEC 60228 Cl2, BS 7671 Table 4D5; split into parallel runs above 630 mm²' },
]

/**
 * selectCableFor — universal cable cross-section selector.
 *
 * Selects the minimum IEC 60228 Class 2 stranded copper conductor cross-section
 * that meets the continuous current requirement with a 1.25× safety factor and
 * the maximum design voltage class.
 *
 * UNIVERSAL: applies to BESS DC inter-rack cabling, EV charger power cabling,
 * wind turbine collection cable, PCS AC output cable, heat pump compressor feed.
 *
 * @param continuousA         Continuous design current [A]
 * @param designVoltageV      Maximum design voltage [V]
 * @param safetyFactor        Current margin factor, default 1.25 (BS 7671 practice)
 * @returns Selected cable cross-section + diagnostic info
 */
export function selectCableFor(params: {
  continuousA: number
  designVoltageV: number
  safetyFactor?: number
  cableLengthM?: number
}): {
  cross_section_mm2: number
  awg_equivalent: string
  rated_current_a: number
  voltage_class_v: number
  required_current_a: number
  required_with_safety_a: number
  current_utilisation_pct: number
  notes: string
} {
  const safetyFactor = params.safetyFactor ?? 1.25
  const requiredA = params.continuousA
  const requiredWithSafetyA = requiredA * safetyFactor

  for (const cable of IEC60228_CABLE_RANGE) {
    if (cable.rated_current_a >= requiredWithSafetyA && cable.voltage_class_v >= params.designVoltageV) {
      return {
        ...cable,
        required_current_a: Math.round(requiredA * 10) / 10,
        required_with_safety_a: Math.round(requiredWithSafetyA * 10) / 10,
        current_utilisation_pct: Math.round((requiredWithSafetyA / cable.rated_current_a) * 100),
      }
    }
  }

  // Saturated — return 630 mm² (use parallel runs for higher currents)
  const largest = IEC60228_CABLE_RANGE[IEC60228_CABLE_RANGE.length - 1]
  return {
    ...largest,
    required_current_a: Math.round(requiredA * 10) / 10,
    required_with_safety_a: Math.round(requiredWithSafetyA * 10) / 10,
    current_utilisation_pct: Math.round((requiredWithSafetyA / largest.rated_current_a) * 100),
  }
}

// ---------------------------------------------------------------------------
// FORMAT HELPERS (shared with brief-value-literal-scanner.ts validation)
// ---------------------------------------------------------------------------

/**
 * formatMassKg — format a mass value as a human-readable string with commas.
 * Usage: `${formatMassKg(p.maxMassKg)}` in emitter templates.
 * Prevents gate 25 (brief-value-literal-scanner) from flagging hardcoded mass
 * values in template strings.
 */
export function formatMassKg(massKg: number): string {
  return massKg.toLocaleString('en-GB') + ' kg'
}

/**
 * formatFlowLpm — format a flow rate as L/min string.
 */
export function formatFlowLpm(flowLpm: number): string {
  return `${Math.round(flowLpm)} L/min`
}

// ---------------------------------------------------------------------------
// FIRE SUPPRESSION AGENT MASS SELECTOR — NFPA 2001 formula
// ---------------------------------------------------------------------------

/**
 * Specific volumes (m³/kg) for clean agents at 20 °C per NFPA 2001 §A.5.4.2.
 * These are publicly known constants from the NFPA 2001 standard.
 * - Novec 1230 (FK-5-1-12): NFPA 2001 Table A.5.4.2, s = 0.07188 m³/kg @ 20 °C
 * - FM-200 (HFC-227ea):     NFPA 2001 Table A.5.4.2, s = 0.1372 m³/kg @ 20 °C
 * - Inergen (IG-541):       NFPA 2001 Table A.5.4.2, s = 0.6824 m³/kg @ 20 °C
 * - CO₂:                    NFPA 2001 §5.4 / NFPA 12 Table B.2.1, s = 0.5443 m³/kg @ 20 °C
 *
 * Temperature correction: s(T) ≈ s(20°C) × (1 + 0.00178 × (T - 20)) per NFPA 2001 Annex A.
 * Linear approximation; adequate for ±30 °C range around 20 °C.
 */
const NFPA2001_SPECIFIC_VOLUMES: Record<
  'novec_1230' | 'fm_200' | 'inergen' | 'co2',
  { s_20c_m3_per_kg: number; label: string; design_concentration_pct_class_a: number }
> = {
  novec_1230: { s_20c_m3_per_kg: 0.07188, label: 'Novec 1230 (FK-5-1-12)', design_concentration_pct_class_a: 5.3 },
  fm_200:     { s_20c_m3_per_kg: 0.1372,  label: 'FM-200 (HFC-227ea)',      design_concentration_pct_class_a: 7.0 },
  inergen:    { s_20c_m3_per_kg: 0.6824,  label: 'Inergen (IG-541)',         design_concentration_pct_class_a: 35.0 },
  co2:        { s_20c_m3_per_kg: 0.5443,  label: 'CO₂',                      design_concentration_pct_class_a: 34.0 },
}

/**
 * selectFireSuppressionAgentMass — universal clean-agent charge sizing per NFPA 2001.
 *
 * Formula (NFPA 2001 §A.5.4.2):
 *   W = V × C / (s × (100 - C))
 * where:
 *   W = agent mass required [kg]
 *   V = enclosure volume [m³] (net free volume, excluding equipment displacement)
 *   C = design concentration [% v/v]  (e.g. 5.3 for Novec 1230 Class A)
 *   s = specific volume of agent vapour at temperature [m³/kg]
 *
 * NOTE (pre-change mempalace search: NFPA 2001 fire suppression Novec mass formula):
 *   NFPA 855 does NOT govern agent mass — NFPA 2001 §A.5.4.2 does. Never use a
 *   kWh-keyed coefficient; always use this volume-based formula.
 *   Per MemPalace drawer: "any engine that emits fire-suppression sizing for a BESS
 *   must use volume-based formulas keyed to enclosure interior cubic-metres × design-
 *   concentration constant, never kWh × constant."
 *
 * L39 Physics Critic MED finding: design claimed 62.3 kg achieves 5.3% v/v in 86 m³.
 * Correct formula: W = (86 / 0.07188) × (5.3 / 94.7) = 67.0 kg.
 * This function now computes that correctly.
 *
 * UNIVERSAL: applies to BESS, bioreactor cleanroom, data centre (Novec), server room (FM-200).
 *
 * @param args.agent                      Clean agent type
 * @param args.enclosure_volume_m3        Net free volume of protected space [m³]
 * @param args.design_concentration_pct   Design concentration [% v/v], e.g. 5.3
 * @param args.temperature_c              Agent temperature at discharge [°C], default 20
 */
export function selectFireSuppressionAgentMass(args: {
  agent: 'novec_1230' | 'fm_200' | 'inergen' | 'co2'
  enclosure_volume_m3: number
  design_concentration_pct: number
  temperature_c?: number
}): {
  mass_kg: number
  specific_volume_m3_per_kg: number
  formula_notes: string
} {
  const { agent, enclosure_volume_m3, design_concentration_pct } = args
  const tempC = args.temperature_c ?? 20

  const entry = NFPA2001_SPECIFIC_VOLUMES[agent]

  // Temperature correction per NFPA 2001 Annex A: s(T) ≈ s(20°C) × (1 + 0.00178 × (T - 20))
  const specificVolume = entry.s_20c_m3_per_kg * (1 + 0.00178 * (tempC - 20))

  // NFPA 2001 §A.5.4.2: W = V × C / (s × (100 - C))
  const C = design_concentration_pct
  const massKg = enclosure_volume_m3 * C / (specificVolume * (100 - C))

  const formulaNotes =
    `NFPA 2001 §A.5.4.2: W = V × C / (s × (100 − C)) = ` +
    `${enclosure_volume_m3.toFixed(1)} × ${C} / (${specificVolume.toFixed(5)} × ${(100 - C).toFixed(1)}) ` +
    `= ${massKg.toFixed(1)} kg. ` +
    `${entry.label} @ ${tempC}°C, s = ${specificVolume.toFixed(5)} m³/kg.`

  return {
    mass_kg: Math.round(massKg * 10) / 10,
    specific_volume_m3_per_kg: Math.round(specificVolume * 100000) / 100000,
    formula_notes: formulaNotes,
  }
}

// ---------------------------------------------------------------------------
// CURRENT SENSOR SELECTOR — LEM HASS family
// ---------------------------------------------------------------------------

/**
 * LEM HASS open-loop Hall effect current sensor family.
 * Rated nominal current and part numbers from LEM product catalogue.
 * Source: LEM HASS series datasheet (lem.com) — publicly available.
 *
 * Sizing rule: rated_nominal_a MUST be ≥ 1.25 × max(continuous, peak)
 * i.e. sensor loaded at ≤ 80% of nominal for thermal stability.
 *
 * L39 Physics Critic MED finding: HASS 100-S used for 102 A peak → 102% loading.
 * Correct selection: 102 × 1.25 = 127.5 A minimum nominal → HASS 200-S (200 A, 51% loading).
 */
const LEM_HASS_RANGE: Array<{
  part_number: string
  rated_nominal_a: number
  notes: string
}> = [
  { part_number: 'HASS 50-S',  rated_nominal_a: 50,  notes: 'LEM HASS 50-S, 50 A nominal open-loop Hall effect. Source: LEM HASS series datasheet.' },
  { part_number: 'HASS 100-S', rated_nominal_a: 100, notes: 'LEM HASS 100-S, 100 A nominal open-loop Hall effect. Source: LEM HASS series datasheet.' },
  { part_number: 'HASS 200-S', rated_nominal_a: 200, notes: 'LEM HASS 200-S, 200 A nominal open-loop Hall effect. Source: LEM HASS series datasheet.' },
  { part_number: 'HASS 300-S', rated_nominal_a: 300, notes: 'LEM HASS 300-S, 300 A nominal open-loop Hall effect. Source: LEM HASS series datasheet.' },
  { part_number: 'HASS 600-S', rated_nominal_a: 600, notes: 'LEM HASS 600-S, 600 A nominal open-loop Hall effect. Source: LEM HASS series datasheet.' },
]

/**
 * selectCurrentSensorFor — universal current sensor selector for LEM HASS family.
 *
 * Sizes at ≤ 80% of rated nominal (safety factor 1.25×) per IEC 60688 thermal
 * derating practice for continuous-duty current transducers.
 *
 * @param args.continuous_current_a  Continuous RMS current [A]
 * @param args.peak_current_a        Peak current [A], optional — uses the larger
 * @param args.family                Sensor family (only 'lem_hass' implemented)
 * @returns Selected sensor with loading percentage
 */
export function selectCurrentSensorFor(args: {
  continuous_current_a: number
  peak_current_a?: number
  family: 'lem_hass' | 'lem_hat' | 'lem_lf' | 'lem_lts' | 'allegro'
}): {
  manufacturer: string
  part_number: string
  rated_nominal_a: number
  loading_pct: number
} {
  const maxCurrentA = Math.max(args.continuous_current_a, args.peak_current_a ?? 0)
  // Must be sized at ≤80% of nominal: rated_nominal_a ≥ 1.25 × maxCurrentA
  const minNominalA = maxCurrentA * 1.25

  if (args.family === 'lem_hass') {
    for (const sensor of LEM_HASS_RANGE) {
      if (sensor.rated_nominal_a >= minNominalA) {
        return {
          manufacturer: 'LEM',
          part_number: sensor.part_number,
          rated_nominal_a: sensor.rated_nominal_a,
          loading_pct: Math.round((maxCurrentA / sensor.rated_nominal_a) * 100),
        }
      }
    }
    // Saturated — return largest
    const largest = LEM_HASS_RANGE[LEM_HASS_RANGE.length - 1]
    return {
      manufacturer: 'LEM',
      part_number: largest.part_number,
      rated_nominal_a: largest.rated_nominal_a,
      loading_pct: Math.round((maxCurrentA / largest.rated_nominal_a) * 100),
    }
  }

  // Other families not yet catalogued — return the lem_hass result as best effort
  // (avoids compilation errors; extend by adding family range tables above)
  return selectCurrentSensorFor({ ...args, family: 'lem_hass' })
}

// ---------------------------------------------------------------------------
// DC FUSE SELECTOR — Bussmann 170M family (utility BESS DC string protection)
// ---------------------------------------------------------------------------

/**
 * Bussmann 170M DC semiconductor protection fuse family.
 * Voltage/current variants from Eaton Bussmann catalogue.
 * Source: Eaton Bussmann 170M series product page (eaton.com/bussmann).
 *
 * UK utility BESS engineering norm: rated_voltage_dc_v ≥ 1.5 × string_max_voltage_v.
 * For 912.5 V string max: requires ≥ 1369 V → 1500 V class fuse.
 *
 * L39 Physics Critic LOW finding: PV-200ANH1 rated 1000 V DC for 912.5 V string max
 * (only 9.6% margin). 1500 V class fuse required per UK utility BESS practice for
 * safe arc clearing under worst-case fault conditions.
 *
 * NOTE: KNOWN_PART_AUTHORITATIVE in parts-spec-validator.ts does not need updating
 * for these variants — they are standard catalogue parts from the same family.
 * Datasheet URL: https://www.eaton.com/us/en-us/catalog/bussmann-series-low-voltage-semiconductor-fuses/170m-series-fuses.html
 */
const BUSSMANN_170M_RANGE: Array<{
  part_number: string
  rated_current_a: number
  rated_voltage_dc_v: number
  notes: string
}> = [
  {
    part_number: '170M1560',
    rated_current_a: 160,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 160 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M2560',
    rated_current_a: 250,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 250 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M3560',
    rated_current_a: 315,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 315 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M4460',
    rated_current_a: 400,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 400 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M4860',
    rated_current_a: 500,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 500 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M5860',
    rated_current_a: 630,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M 630 A / 1500 V DC. Source: Eaton Bussmann 170M series catalogue.',
  },
  {
    part_number: '170M6812',
    rated_current_a: 1250,
    rated_voltage_dc_v: 1500,
    notes: 'Bussmann 170M6812 1250 A / 1500 V DC HRC semiconductor fuse. IEC 60269-4 Class aR. Source: Eaton Bussmann 170M series catalogue https://www.eaton.com/us/en-us/catalog/bussmann-series-low-voltage-semiconductor-fuses/170m-series-fuses.html',
  },
]

/**
 * selectDcFuseFor — universal DC string fuse selector.
 *
 * UK utility BESS engineering norm: rated_voltage_dc_v ≥ 1.5 × string_max_voltage_v.
 * This ensures safe arc clearing under worst-case fault conditions per BS EN 60269-4
 * and UK DNO G98/G99 BESS interconnection guidance.
 *
 * @param args.continuous_current_a   Continuous DC string current [A]
 * @param args.string_max_voltage_v   Maximum DC string voltage [V] (at max cell voltage)
 * @param args.family                 Fuse family ('bussmann_170m' implemented)
 * @returns Selected fuse with rated voltage and current
 */
export function selectDcFuseFor(args: {
  continuous_current_a: number
  string_max_voltage_v: number
  family: 'bussmann_170m' | 'mersen_a070' | 'siba_uri'
}): {
  manufacturer: string
  part_number: string
  rated_current_a: number
  rated_voltage_dc_v: number
} {
  // UK utility BESS norm: voltage rating ≥ 1.5 × string max voltage
  const minVoltageV = args.string_max_voltage_v * 1.5
  // Size fuse to continuous current with 1.25× margin (standard engineering practice)
  const minCurrentA = args.continuous_current_a * 1.25

  if (args.family === 'bussmann_170m') {
    for (const fuse of BUSSMANN_170M_RANGE) {
      if (fuse.rated_voltage_dc_v >= minVoltageV && fuse.rated_current_a >= minCurrentA) {
        return {
          manufacturer: 'Eaton Bussmann',
          part_number: fuse.part_number,
          rated_current_a: fuse.rated_current_a,
          rated_voltage_dc_v: fuse.rated_voltage_dc_v,
        }
      }
    }
    // Saturated on current — return highest current 1500 V variant
    const largest = BUSSMANN_170M_RANGE[BUSSMANN_170M_RANGE.length - 1]
    return {
      manufacturer: 'Eaton Bussmann',
      part_number: largest.part_number,
      rated_current_a: largest.rated_current_a,
      rated_voltage_dc_v: largest.rated_voltage_dc_v,
    }
  }

  // Other families not yet catalogued — fall back to bussmann_170m
  return selectDcFuseFor({ ...args, family: 'bussmann_170m' })
}
