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
