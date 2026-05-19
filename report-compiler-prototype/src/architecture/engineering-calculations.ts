import type { ProductClass, ProductDossier } from '../schema/types'

export type EngineeringCalculationStatus =
  | 'within_envelope'
  | 'needs_review'
  | 'outside_envelope'
  | 'blocked'

export interface EngineeringCalculationRow {
  id: string
  status: EngineeringCalculationStatus
  label: string
  formula: string
  inputs: Record<string, number>
  result: number | null
  unit: string
  envelope: string
  interpretation: string
  evidenceRequired: string
  linkedRequirements: string[]
}

export interface EngineeringCalculationLedger {
  summary: {
    rows: number
    withinEnvelope: number
    needsReview: number
    outsideEnvelope: number
    blocked: number
  }
  rows: EngineeringCalculationRow[]
}

export function buildEngineeringCalculationLedger(dossier: ProductDossier): EngineeringCalculationLedger {
  const rows = calculationRowsForClass(dossier.productClass, dossier)
  return {
    summary: {
      rows: rows.length,
      withinEnvelope: rows.filter(row => row.status === 'within_envelope').length,
      needsReview: rows.filter(row => row.status === 'needs_review').length,
      outsideEnvelope: rows.filter(row => row.status === 'outside_envelope').length,
      blocked: rows.filter(row => row.status === 'blocked').length,
    },
    rows,
  }
}

export function renderEngineeringCalculationLedgerCsv(ledger: EngineeringCalculationLedger): string {
  const header = [
    'id',
    'status',
    'label',
    'formula',
    'inputs',
    'result',
    'unit',
    'envelope',
    'interpretation',
    'evidenceRequired',
    'linkedRequirements',
  ]
  const rows = ledger.rows.map(row => [
    row.id,
    row.status,
    row.label,
    row.formula,
    JSON.stringify(row.inputs),
    row.result === null ? '' : String(row.result),
    row.unit,
    row.envelope,
    row.interpretation,
    row.evidenceRequired,
    row.linkedRequirements.join('; '),
  ])
  return [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n') + '\n'
}

function calculationRowsForClass(productClass: ProductClass, dossier: ProductDossier): EngineeringCalculationRow[] {
  if (productClass === 'energy_storage') return bessRows(dossier)
  if (productClass === 'vertical_farm') return verticalFarmRows(dossier)
  if (productClass === 'heat_pump') return heatPumpRows(dossier)
  if (productClass === 'ev_charger') return evChargerRows(dossier)
  if (productClass === 'bioreactor') return bioreactorRows(dossier)
  if (productClass === 'auv') return auvRows(dossier)
  if (productClass === 'edge_ai') return edgeAiRows(dossier)
  if (productClass === 'haps') return hapsRows(dossier)
  if (productClass === 'cgm') return cgmRows(dossier)
  if (productClass === 'drone') return droneRows(dossier)
  return []
}

function bessRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const capacityMwh = req(dossier, 'capacity_mwh')
  const powerMw = req(dossier, 'power_mw')
  const massKg = req(dossier, 'mass_kg')
  return [
    calc({
      id: 'bess_discharge_duration_h',
      label: 'BESS discharge duration',
      formula: 'capacity_mwh / power_mw',
      inputs: { capacity_mwh: capacityMwh, power_mw: powerMw },
      unit: 'h',
      linkedRequirements: ['capacity_mwh', 'power_mw'],
      envelope: '2 to 8 h is a common grid-storage concept envelope before duty-cycle proof.',
      evidenceRequired: 'Confirm use case, PCS rating, usable energy window, C-rate limits and warranty throughput.',
      compute: ({ capacity_mwh, power_mw }) => capacity_mwh / power_mw,
      classify: value => within(value, 2, 8) ? 'within_envelope' : value > 0 ? 'outside_envelope' : 'blocked',
      interpret: value => `${value} h implied by nameplate capacity and PCS power.`,
    }),
    calc({
      id: 'bess_system_energy_density_wh_per_kg',
      label: 'BESS system energy density',
      formula: '(capacity_mwh * 1,000,000) / mass_kg',
      inputs: { capacity_mwh: capacityMwh, mass_kg: massKg },
      unit: 'Wh/kg',
      linkedRequirements: ['capacity_mwh', 'mass_kg'],
      envelope: '60 to 180 Wh/kg is a broad containerised LFP system envelope before packaging proof.',
      evidenceRequired: 'Review cell mass, racks, enclosure, HVAC, fire protection, transformer/PCS boundary and shipping mass allowance.',
      compute: ({ capacity_mwh, mass_kg }) => (capacity_mwh * 1_000_000) / mass_kg,
      classify: value => within(value, 60, 180) ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} Wh/kg implied by energy and gross mass.`,
    }),
    calc({
      id: 'bess_nameplate_annual_throughput_mwh',
      label: 'BESS annual nameplate throughput',
      formula: 'capacity_mwh * 365',
      inputs: { capacity_mwh: capacityMwh },
      unit: 'MWh/year',
      linkedRequirements: ['capacity_mwh'],
      envelope: 'Arithmetic only; real throughput depends on dispatch, degradation, auxiliary load and warranty.',
      evidenceRequired: 'Confirm cycles per year, usable depth of discharge, round-trip efficiency and degradation assumptions.',
      compute: ({ capacity_mwh }) => capacity_mwh * 365,
      classify: () => 'needs_review',
      interpret: value => `${value} MWh/year assumes one full equivalent cycle per day.`,
    }),
  ]
}

function verticalFarmRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const lengthM = req(dossier, 'envelope_length_m')
  const widthM = req(dossier, 'envelope_width_m')
  const footprintM2 = req(dossier, 'footprint_m2')
  return [
    calc({
      id: 'farm_footprint_check_m2',
      label: 'Vertical farm footprint check',
      formula: 'envelope_length_m * envelope_width_m',
      inputs: { envelope_length_m: lengthM, envelope_width_m: widthM, footprint_m2: footprintM2 },
      unit: 'm2',
      linkedRequirements: ['envelope_length_m', 'envelope_width_m', 'footprint_m2'],
      envelope: 'Calculated footprint should match parsed footprint within 1%.',
      evidenceRequired: 'Confirm whether the envelope includes aisle, service clearance, reservoir and electrical cabinet space.',
      compute: ({ envelope_length_m, envelope_width_m }) => envelope_length_m * envelope_width_m,
      classify: (value, inputs) => relativeError(value, inputs.footprint_m2) <= 0.01 ? 'within_envelope' : 'outside_envelope',
      interpret: (value, inputs) => `${value} m2 calculated from dimensions versus ${inputs.footprint_m2} m2 parsed footprint.`,
    }),
    calc({
      id: 'farm_service_clearance_area_m2',
      label: 'Indicative service-clearance footprint',
      formula: 'footprint_m2 * 1.25',
      inputs: { footprint_m2: footprintM2 },
      unit: 'm2',
      linkedRequirements: ['footprint_m2'],
      envelope: 'Planning allowance only; layout needs crop tower count and operator-access review.',
      evidenceRequired: 'Review maintenance access, nutrient tank access, airflow paths and electrical service clearances.',
      compute: ({ footprint_m2 }) => footprint_m2 * 1.25,
      classify: () => 'needs_review',
      interpret: value => `${value} m2 allows a provisional 25% service envelope around the parsed footprint.`,
    }),
  ]
}

function heatPumpRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const thermalOutputKw = req(dossier, 'thermal_output_kw')
  const cop = req(dossier, 'cop')
  return [
    calc({
      id: 'heat_pump_electrical_input_kw',
      label: 'Heat pump electrical input',
      formula: 'thermal_output_kw / cop',
      inputs: { thermal_output_kw: thermalOutputKw, cop },
      unit: 'kW',
      linkedRequirements: ['thermal_output_kw', 'cop'],
      envelope: 'Positive arithmetic check; electrical design still needs compressor map and ambient condition.',
      evidenceRequired: 'Confirm COP rating condition, compressor input power, pump/fan auxiliaries and defrost allowance.',
      compute: ({ thermal_output_kw, cop }) => thermal_output_kw / cop,
      classify: value => value > 0 ? 'within_envelope' : 'blocked',
      interpret: value => `${value} kW ideal electrical input before auxiliaries and defrost.`,
    }),
    calc({
      id: 'heat_pump_cop_envelope',
      label: 'Heat pump COP envelope',
      formula: 'cop',
      inputs: { cop },
      unit: 'COP',
      linkedRequirements: ['cop'],
      envelope: '2.5 to 5.5 COP is plausible before rating-condition proof.',
      evidenceRequired: 'Confirm EN 14511 or local rating point, flow temperature, refrigerant and ambient condition.',
      compute: ({ cop: value }) => value,
      classify: value => within(value, 2.5, 5.5) ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} COP target needs rating-condition evidence.`,
    }),
  ]
}

function evChargerRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const dcPowerKw = req(dossier, 'dc_power_kw')
  return [
    calc({
      id: 'ev_charger_800v_current_a',
      label: 'EV charger current at 800 V',
      formula: '(dc_power_kw * 1,000) / 800',
      inputs: { dc_power_kw: dcPowerKw, assumed_voltage_v: 800 },
      unit: 'A',
      linkedRequirements: ['dc_power_kw'],
      envelope: '<=500 A is a broad liquid-cooled CCS concept envelope before connector and cable proof.',
      evidenceRequired: 'Confirm output voltage range, cable thermal rating, connector current limit, contactor rating and derating.',
      compute: ({ dc_power_kw, assumed_voltage_v }) => (dc_power_kw * 1_000) / assumed_voltage_v,
      classify: value => value <= 500 ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} A at an assumed 800 V output point.`,
    }),
    calc({
      id: 'ev_charger_daily_full_power_energy_kwh',
      label: 'EV charger daily full-power energy',
      formula: 'dc_power_kw * 4',
      inputs: { dc_power_kw: dcPowerKw, equivalent_full_power_hours_per_day: 4 },
      unit: 'kWh/day',
      linkedRequirements: ['dc_power_kw'],
      envelope: 'Utilisation assumption only; revenue and thermal duty need site-specific evidence.',
      evidenceRequired: 'Confirm expected sessions per day, dwell time, grid capacity, charger derating and tariff assumptions.',
      compute: ({ dc_power_kw, equivalent_full_power_hours_per_day }) => dc_power_kw * equivalent_full_power_hours_per_day,
      classify: () => 'needs_review',
      interpret: value => `${value} kWh/day assumes 4 equivalent full-power hours.`,
    }),
  ]
}

function bioreactorRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const workingVolumeL = req(dossier, 'working_volume_l')
  return [
    calc({
      id: 'bioreactor_nominal_bag_volume_l',
      label: 'Bioreactor nominal bag volume',
      formula: 'working_volume_l / 0.8',
      inputs: { working_volume_l: workingVolumeL, fill_fraction: 0.8 },
      unit: 'L',
      linkedRequirements: ['working_volume_l'],
      envelope: '80% fill fraction is a planning assumption before vendor bag geometry.',
      evidenceRequired: 'Confirm bag platform, mixing turndown, foam allowance, sparging rate and working-volume range.',
      compute: ({ working_volume_l, fill_fraction }) => working_volume_l / fill_fraction,
      classify: () => 'needs_review',
      interpret: value => `${value} L nominal bag volume at 80% working fill.`,
    }),
    calc({
      id: 'bioreactor_annual_working_volume_l',
      label: 'Bioreactor annual working volume',
      formula: 'working_volume_l * 40',
      inputs: { working_volume_l: workingVolumeL, batches_per_year: 40 },
      unit: 'L/year',
      linkedRequirements: ['working_volume_l'],
      envelope: '40 batches/year is a throughput assumption, not validated scheduling.',
      evidenceRequired: 'Confirm batch duration, turnaround, cleaning/assembly time, hold steps and campaign model.',
      compute: ({ working_volume_l, batches_per_year }) => working_volume_l * batches_per_year,
      classify: () => 'needs_review',
      interpret: value => `${value} L/year assumes 40 batches per year.`,
    }),
  ]
}

function auvRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const depthRatingM = req(dossier, 'depth_rating_m')
  const enduranceHours = req(dossier, 'endurance_hours')
  return [
    calc({
      id: 'auv_hydrostatic_pressure_bar',
      label: 'AUV hydrostatic pressure',
      formula: '1 + depth_rating_m / 10',
      inputs: { depth_rating_m: depthRatingM },
      unit: 'bar abs',
      linkedRequirements: ['depth_rating_m'],
      envelope: '<=51 bar abs covers up to roughly 500 m before deeper-hull concept review.',
      evidenceRequired: 'Confirm hull material, safety factor, penetrators, seals, buckling margin and test pressure.',
      compute: ({ depth_rating_m }) => 1 + depth_rating_m / 10,
      classify: value => value <= 51 ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} bar absolute pressure implied at rated depth.`,
    }),
    calc({
      id: 'auv_endurance_minutes',
      label: 'AUV endurance minutes',
      formula: 'endurance_hours * 60',
      inputs: { endurance_hours: enduranceHours },
      unit: 'minutes',
      linkedRequirements: ['endurance_hours'],
      envelope: 'Arithmetic only; mission endurance needs hotel load, propulsion and reserve energy proof.',
      evidenceRequired: 'Confirm speed profile, payload load, reserve margin, battery derating and recovery scenario.',
      compute: ({ endurance_hours }) => endurance_hours * 60,
      classify: () => 'needs_review',
      interpret: value => `${value} minutes mission endurance before energy-budget proof.`,
    }),
  ]
}

function edgeAiRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const computeTops = req(dossier, 'compute_tops')
  const powerBudgetW = req(dossier, 'power_budget_w')
  const rackUnits = req(dossier, 'rack_units')
  return [
    calc({
      id: 'edge_ai_tops_per_watt',
      label: 'Edge AI accelerator efficiency',
      formula: 'compute_tops / power_budget_w',
      inputs: { compute_tops: computeTops, power_budget_w: powerBudgetW },
      unit: 'TOPS/W',
      linkedRequirements: ['compute_tops', 'power_budget_w'],
      envelope: '>=0.1 TOPS/W is a broad plausibility floor before accelerator selection.',
      evidenceRequired: 'Confirm workload precision, sustained throughput, accelerator SKU, thermal derating and host overhead.',
      compute: ({ compute_tops, power_budget_w }) => compute_tops / power_budget_w,
      classify: value => value >= 0.1 ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} TOPS/W using total appliance power budget.`,
    }),
    calc({
      id: 'edge_ai_power_density_w_per_u',
      label: 'Rack power density',
      formula: 'power_budget_w / rack_units',
      inputs: { power_budget_w: powerBudgetW, rack_units: rackUnits },
      unit: 'W/U',
      linkedRequirements: ['power_budget_w', 'rack_units'],
      envelope: '<=1,000 W/U is plausible for dense air-cooled edge equipment before thermal proof.',
      evidenceRequired: 'Confirm inlet temperature, airflow, fan curve, acoustic limit, PSU derating and service clearance.',
      compute: ({ power_budget_w, rack_units }) => power_budget_w / rack_units,
      classify: value => value <= 1_000 ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} W/U rack density before thermal validation.`,
    }),
  ]
}

function hapsRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const enduranceDays = req(dossier, 'endurance_days')
  const altitudeKm = req(dossier, 'altitude_km')
  const wingspanM = req(dossier, 'wingspan_m')
  return [
    calc({
      id: 'haps_endurance_hours',
      label: 'HAPS endurance hours',
      formula: 'endurance_days * 24',
      inputs: { endurance_days: enduranceDays },
      unit: 'h',
      linkedRequirements: ['endurance_days'],
      envelope: 'Arithmetic only; station keeping needs wind, day/night energy and degradation proof.',
      evidenceRequired: 'Confirm solar resource, battery reserve, wind field, degradation, payload power and recovery plan.',
      compute: ({ endurance_days }) => endurance_days * 24,
      classify: () => 'needs_review',
      interpret: value => `${value} h endurance target before stratospheric energy-balance proof.`,
    }),
    calc({
      id: 'haps_altitude_ft',
      label: 'HAPS altitude conversion',
      formula: 'altitude_km * 3,280.84',
      inputs: { altitude_km: altitudeKm },
      unit: 'ft',
      linkedRequirements: ['altitude_km'],
      envelope: '49,000 to 82,000 ft is a broad HAPS operating band before airspace proof.',
      evidenceRequired: 'Confirm operating altitude, airspace permissions, atmospheric density, thermal envelope and wind model.',
      compute: ({ altitude_km }) => altitude_km * 3_280.84,
      classify: value => within(value, 49_000, 82_000) ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} ft converted from target altitude.`,
    }),
    calc({
      id: 'haps_wingspan_to_altitude_ratio',
      label: 'HAPS wingspan-to-altitude marker',
      formula: 'wingspan_m / altitude_km',
      inputs: { wingspan_m: wingspanM, altitude_km: altitudeKm },
      unit: 'm/km',
      linkedRequirements: ['wingspan_m', 'altitude_km'],
      envelope: 'Marker only; aerodynamic feasibility needs wing area, mass, Reynolds number and aeroelastic proof.',
      evidenceRequired: 'Confirm wing area, mass budget, airfoil, aeroelastic margin, launch loads and transport constraints.',
      compute: ({ wingspan_m, altitude_km }) => wingspan_m / altitude_km,
      classify: () => 'needs_review',
      interpret: value => `${value} m/km is a trace marker, not an aerodynamic proof.`,
    }),
  ]
}

function cgmRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const wearDays = req(dossier, 'wear_days')
  const intervalMinutes = req(dossier, 'reading_interval_minutes')
  const mardPercent = req(dossier, 'mard_percent')
  return [
    calc({
      id: 'cgm_readings_per_day',
      label: 'CGM readings per day',
      formula: '1,440 / reading_interval_minutes',
      inputs: { reading_interval_minutes: intervalMinutes },
      unit: 'readings/day',
      linkedRequirements: ['reading_interval_minutes'],
      envelope: '96 to 1,440 readings/day covers 15 min to 1 min intervals before power and buffering proof.',
      evidenceRequired: 'Confirm sensor settling, BLE duty cycle, local buffering, timestamping and battery budget.',
      compute: ({ reading_interval_minutes }) => 1_440 / reading_interval_minutes,
      classify: value => within(value, 96, 1_440) ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} readings/day implied by sample interval.`,
    }),
    calc({
      id: 'cgm_total_wear_readings',
      label: 'CGM total wear readings',
      formula: 'wear_days * (1,440 / reading_interval_minutes)',
      inputs: { wear_days: wearDays, reading_interval_minutes: intervalMinutes },
      unit: 'readings/wear',
      linkedRequirements: ['wear_days', 'reading_interval_minutes'],
      envelope: 'Arithmetic only; storage, power and calibration drift need evidence.',
      evidenceRequired: 'Confirm memory, telemetry retries, battery capacity, sensor drift and calibration strategy.',
      compute: ({ wear_days, reading_interval_minutes }) => wear_days * (1_440 / reading_interval_minutes),
      classify: () => 'needs_review',
      interpret: value => `${value} readings over the stated wear period.`,
    }),
    calc({
      id: 'cgm_mard_margin_to_10_percent',
      label: 'CGM MARD margin to 10%',
      formula: '10 - mard_percent',
      inputs: { mard_percent: mardPercent },
      unit: 'percentage points',
      linkedRequirements: ['mard_percent'],
      envelope: 'Positive margin to 10% target before clinical validation.',
      evidenceRequired: 'Confirm clinical protocol, comparator, calibration method, population mix and error-grid analysis.',
      compute: ({ mard_percent }) => 10 - mard_percent,
      classify: value => value >= 0 ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} percentage-point margin to a 10% MARD target.`,
    }),
  ]
}

function droneRows(dossier: ProductDossier): EngineeringCalculationRow[] {
  const durationMinutes = req(dossier, 'duration_minutes')
  return [
    calc({
      id: 'drone_endurance_hours',
      label: 'Drone endurance hours',
      formula: 'duration_minutes / 60',
      inputs: { duration_minutes: durationMinutes },
      unit: 'h',
      linkedRequirements: ['duration_minutes'],
      envelope: '0.25 to 1.0 h is plausible for prosumer multirotor concepts before battery and payload proof.',
      evidenceRequired: 'Confirm payload mass, hover power, battery usable energy, reserve margin, wind and take-off weight.',
      compute: ({ duration_minutes }) => duration_minutes / 60,
      classify: value => within(value, 0.25, 1.0) ? 'within_envelope' : 'outside_envelope',
      interpret: value => `${value} h endurance converted from minutes.`,
    }),
    calc({
      id: 'drone_reserve_time_minutes',
      label: 'Drone 20% reserve time',
      formula: 'duration_minutes * 0.2',
      inputs: { duration_minutes: durationMinutes, reserve_fraction: 0.2 },
      unit: 'minutes',
      linkedRequirements: ['duration_minutes'],
      envelope: 'Reserve planning marker only; flight controller failsafe needs detailed energy budget.',
      evidenceRequired: 'Confirm return-to-home reserve, hover reserve, battery ageing, wind case and payload power.',
      compute: ({ duration_minutes, reserve_fraction }) => duration_minutes * reserve_fraction,
      classify: () => 'needs_review',
      interpret: value => `${value} minutes reserved at 20% of stated endurance.`,
    }),
  ]
}

interface CalculationSpec {
  id: string
  label: string
  formula: string
  inputs: Record<string, number | undefined>
  unit: string
  envelope: string
  evidenceRequired: string
  linkedRequirements: string[]
  compute: (inputs: Record<string, number>) => number
  classify: (value: number, inputs: Record<string, number>) => EngineeringCalculationStatus
  interpret: (value: number, inputs: Record<string, number>) => string
}

function calc(spec: CalculationSpec): EngineeringCalculationRow {
  const missing = Object.entries(spec.inputs)
    .filter(([, value]) => value === undefined || !Number.isFinite(value))
    .map(([key]) => key)
  if (missing.length > 0) {
    return {
      id: spec.id,
      status: 'blocked',
      label: spec.label,
      formula: spec.formula,
      inputs: knownInputs(spec.inputs),
      result: null,
      unit: spec.unit,
      envelope: spec.envelope,
      interpretation: `Missing required numeric input(s): ${missing.join(', ')}.`,
      evidenceRequired: spec.evidenceRequired,
      linkedRequirements: spec.linkedRequirements,
    }
  }
  const inputs = spec.inputs as Record<string, number>
  const result = round(spec.compute(inputs))
  return {
    id: spec.id,
    status: spec.classify(result, inputs),
    label: spec.label,
    formula: spec.formula,
    inputs,
    result,
    unit: spec.unit,
    envelope: spec.envelope,
    interpretation: spec.interpret(result, inputs),
    evidenceRequired: spec.evidenceRequired,
    linkedRequirements: spec.linkedRequirements,
  }
}

function req(dossier: ProductDossier, requirementId: string): number | undefined {
  const value = dossier.brief.requirements.find(requirement => requirement.id === requirementId)?.value
  return typeof value === 'number' ? value : undefined
}

function within(value: number, min: number, max: number): boolean {
  return value >= min && value <= max
}

function relativeError(actual: number, expected: number): number {
  if (expected === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY
  return Math.abs(actual - expected) / Math.abs(expected)
}

function knownInputs(inputs: Record<string, number | undefined>): Record<string, number> {
  return Object.fromEntries(Object.entries(inputs).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])))
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function csvEscape(value: string): string {
  if (!/[",\n]/.test(value)) return value
  return `"${value.replaceAll('"', '""')}"`
}
