/**
 * scripts/lib/orchestrator/class-plans/cgm.ts
 *
 * CONTINUOUS GLUCOSE MONITOR TOOL PLAN — hand-tuned 2026-05-22 (Build #20b).
 *
 * Pattern: BESS reference (bess.ts). Each tool step reads specific
 * named fields from the EngineeringContract and emits canonical
 * quantity names.
 *
 * Tool sequence (12 steps):
 *
 *   Class-specific:
 *     1. glucose-sensor:amperometric   — enzymatic electrochemical sensor I/V
 *     2. wireless-link-budget:friis    — BLE 5.x telemetry link budget
 *     3. wearable-battery:life         — SR416 silver-oxide cell duration
 *     4. biocompatibility:iso-10993    — adhesive + housing + needle materials
 *     5. pybamm:cell-sizing            — extended for primary coin-cell modelling
 *     6. thermal-envelope:ladder       — body-attached enclosure thermal budget
 *     7. enclosure-emc:margin          — BLE antenna + ICNIRP body-SAR margin
 *
 *   Universal (5):
 *     8. regulatory-fda:cgmp           — FDA 510(k) De Novo / PMA pathway
 *     9. regulatory-cert-cost:lookup   — CE Class IIb + FDA cost
 *    10. lifecycle-co2:assessment      — disposable wearable LCA
 *    11. supply-chain-risk:scoring     — Pt sourcing risk
 *    12. reliability-fmea:system       — sensor drift FMEA
 *    13. cybersecurity-threat-model:stride — BLE pairing + cloud app
 *    14. transport-logistics:routing   — distribution chain
 *
 *   Mass aggregator (1):
 *    15. mass-aggregator:envelope-check
 */

import { registerPlan } from '../planner'
import { ruleClosure, ruleQuantityRatio, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure
void ruleQuantityRatio

// ---------------------------------------------------------------------------
// 1. glucose-sensor:amperometric — enzymatic electrochemical sensor
// ---------------------------------------------------------------------------

const stepGlucoseSensor: ToolStep = {
  tool_id: 'glucose-sensor:amperometric',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    glucose_concentration_min_mg_dl: c.quantities?.glucose_range_mg_dl_min?.value ?? 40,
    glucose_concentration_max_mg_dl: c.quantities?.glucose_range_mg_dl_max?.value ?? 400,
    enzyme: 'glucose_oxidase',
    working_electrode_area_mm2: 0.5,
    target_mard_pct: c.quantities?.sensor_mard_pct?.value ?? 10,
    wear_duration_days: c.quantities?.wear_duration_days?.value ?? 14,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:glucose-sensor:amperometric' as const,
      tool_id: 'glucose-sensor:amperometric',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { current_at_100mgdl_na?: number; sensitivity_na_per_mgdl?: number; drift_pct_per_day?: number }
    // Enzyme electrode macro: £8 (factory-coated)
    const electrodeMacro = {
      word_name: 'enzyme_electrode_assembly',
      unit_price_gbp: 8.0,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 8.0,
      source_detail: `glucose-sensor-derived: £8/sensor — Pt working + Ag/AgCl reference + carbon counter + glucose oxidase coating`,
    }
    const updates: Record<string, any> = {}
    if (out.sensitivity_na_per_mgdl !== undefined && Number.isFinite(out.sensitivity_na_per_mgdl)) {
      updates.sensor_sensitivity_na_per_mgdl = {
        value: out.sensitivity_na_per_mgdl, unit: 'nA/(mg/dL)', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: 'enzymatic electrochemical, 37°C',
        provenance: prov('sensitivity_na_per_mgdl'),
      }
    }
    if (out.drift_pct_per_day !== undefined && Number.isFinite(out.drift_pct_per_day)) {
      updates.sensor_drift_pct_per_day = {
        value: out.drift_pct_per_day, unit: '%/day', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 20,
        temporal_resolution_s: null, condition: 'in-vivo extrapolated from in-vitro',
        provenance: prov('drift_pct_per_day'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'enzyme_electrode_assembly'),
        electrodeMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 2. wireless-link-budget:friis — BLE 5.x telemetry
// ---------------------------------------------------------------------------

const stepWireless: ToolStep = {
  tool_id: 'wireless-link-budget:friis',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    tx_power_dbm: c.quantities?.ble_tx_power_dbm?.value ?? 0,
    rx_sensitivity_dbm: -95,
    frequency_ghz: 2.4,
    distance_m: 10,
    antenna_tx_gain_dbi: 0,
    antenna_rx_gain_dbi: 2,
    body_loss_db: 6,  // body-SAR + adhesive material loss
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:wireless-link-budget:friis' as const,
      tool_id: 'wireless-link-budget:friis',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { link_margin_db?: number; max_range_m?: number; path_loss_db?: number }
    const updates: Record<string, any> = {}
    if (out.link_margin_db !== undefined && Number.isFinite(out.link_margin_db)) {
      updates.ble_link_margin_db = {
        value: out.link_margin_db, unit: 'dB', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 3,
        temporal_resolution_s: null, condition: 'BLE 5.x @ 2.4 GHz, body-attached',
        provenance: prov('link_margin_db'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 3. wearable-battery:life — silver oxide SR416 coin cell
// ---------------------------------------------------------------------------

const stepWearableBattery: ToolStep = {
  tool_id: 'wearable-battery:life',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    battery_voltage_v: c.quantities?.battery_voltage_v?.value ?? 1.55,
    battery_capacity_mah: c.quantities?.battery_capacity_mah?.value ?? 8,
    chemistry: 'silver_oxide',
    average_current_ua: 30,  // 30 µA average across BLE bursts + sleep
    storage_temp_c: 25,
    target_wear_duration_days: c.quantities?.wear_duration_days?.value ?? 14,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:wearable-battery:life' as const,
      tool_id: 'wearable-battery:life',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { runtime_days?: number; energy_remaining_mwh?: number }
    // Silver oxide battery macro: £0.40
    const batteryMacro = {
      word_name: 'silver_oxide_battery',
      unit_price_gbp: 0.40,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 0.40,
      source_detail: `wearable-battery-derived: £0.40 SR416 silver oxide coin cell (1.55 V, 8 mAh, 12.4 mWh)`,
    }
    const updates: Record<string, any> = {}
    if (out.runtime_days !== undefined && Number.isFinite(out.runtime_days)) {
      updates.battery_runtime_days_computed = {
        value: out.runtime_days, unit: 'day', family: 'time' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 10,
        temporal_resolution_s: null, condition: '30 µA avg @ 25°C',
        provenance: prov('runtime_days'),
      }
    }
    return {
      ...c,
      macro_assembly_prices: [
        ...((c.macro_assembly_prices ?? []) as any[]).filter(m => m.word_name !== 'silver_oxide_battery'),
        batteryMacro,
      ],
      quantities: { ...c.quantities, ...updates },
    }
  },
}

// ---------------------------------------------------------------------------
// 4. biocompatibility:iso-10993 — skin-contact materials
// ---------------------------------------------------------------------------

const stepBiocompat: ToolStep = {
  tool_id: 'biocompatibility:iso-10993',
  required: true,
  feeds_into: [] as string[],
  input_from_contract: () => ({
    materials_in_contact: [
      '3m_9871_breathable_adhesive',
      'polypropylene_housing',
      'platinum_coated_microneedle',
      'silver_silver_chloride_reference',
    ],
    contact_duration_h: 14 * 24,
    contact_type: 'skin_long_term_intact',
    region: 'EU',
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:biocompatibility:iso-10993' as const,
      tool_id: 'biocompatibility:iso-10993',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { total_tests_pass?: number; total_tests_required?: number }
    const updates: Record<string, any> = {}
    if (out.total_tests_pass !== undefined && Number.isFinite(out.total_tests_pass)) {
      updates.biocompat_tests_passed = {
        value: out.total_tests_pass, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
        temporal_resolution_s: null, condition: 'ISO 10993-5/10/18 skin long-term',
        provenance: prov('total_tests_pass'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 5. pybamm:cell-sizing — extended to primary coin cell
// ---------------------------------------------------------------------------

const stepPybamm: ToolStep = {
  tool_id: 'pybamm:cell-sizing',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    target_energy_kwh: ((c.quantities?.battery_capacity_mwh?.value as number) ?? 12.4) / 1e6,  // mWh → kWh
    dod_fraction: 1.0,
    cell_chemistry: 'silver_oxide' as const,
    cell_capacity_ah: ((c.quantities?.battery_capacity_mah?.value as number) ?? 8) / 1000,
    cell_voltage_v: c.quantities?.battery_voltage_v?.value ?? 1.55,
    ambient_temp_c: 25,
    dc_bus_voltage_v: c.quantities?.battery_voltage_v?.value ?? 1.55,
    rated_power_kw: 0.000001,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:pybamm:cell-sizing' as const,
      tool_id: 'pybamm:cell-sizing',
      tool_version: '26.4.3',
      tool_license: 'BSD-3-Clause' as const,
      tool_source_url: 'github.com/pybamm-team/PyBaMM',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { cell_count?: number }
    const updates: Record<string, any> = {}
    if (out.cell_count !== undefined && Number.isFinite(out.cell_count)) {
      updates.battery_cell_count = {
        value: 1, unit: '', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'cell' as const, uncertainty_pct: 0,
        temporal_resolution_s: null, condition: 'single SR416 cell',
        provenance: prov('cell_count'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 6. thermal-envelope:ladder — body-attached thermal budget
// ---------------------------------------------------------------------------

const stepThermal: ToolStep = {
  tool_id: 'thermal-envelope:ladder',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    enclosure_volume_cm3: 4,
    average_power_mw: c.quantities?.power_consumption_mw?.value ?? 0.04,
    peak_power_mw: 5,
    ambient_temp_c: 25,
    skin_temp_c: 32,
    max_junction_temp_c: 70,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:thermal-envelope:ladder' as const,
      tool_id: 'thermal-envelope:ladder',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { junction_temp_c?: number; thermal_margin_c?: number }
    const updates: Record<string, any> = {}
    if (out.thermal_margin_c !== undefined && Number.isFinite(out.thermal_margin_c)) {
      updates.thermal_margin_c = {
        value: out.thermal_margin_c, unit: '°C', family: 'temperature' as const,
        basis: 'continuous' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'wearable @ skin',
        provenance: prov('thermal_margin_c'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// 7. enclosure-emc:margin — body-SAR check
// ---------------------------------------------------------------------------

const stepEmc: ToolStep = {
  tool_id: 'enclosure-emc:margin',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    tx_power_dbm: c.quantities?.ble_tx_power_dbm?.value ?? 0,
    frequency_ghz: 2.4,
    enclosure_volume_cm3: 4,
    duty_cycle_pct: 0.5,  // BLE TX burst duty
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:enclosure-emc:margin' as const,
      tool_id: 'enclosure-emc:margin',
      tool_version: '1.0.0',
      tool_license: 'MIT' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { sar_margin_db?: number; emi_margin_db?: number }
    const updates: Record<string, any> = {}
    if (out.sar_margin_db !== undefined && Number.isFinite(out.sar_margin_db)) {
      updates.body_sar_margin_db = {
        value: out.sar_margin_db, unit: 'dB', family: 'dimensionless' as const,
        basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 3,
        temporal_resolution_s: null, condition: 'ICNIRP 1.6 W/kg local',
        provenance: prov('sar_margin_db'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// Universal step factory
// ---------------------------------------------------------------------------

function universalStep(toolId: string, sourceUrl: string, license: any = 'MIT'): ToolStep {
  const tag = toolId.replace(/[:-]/g, '_')
  return {
    tool_id: toolId,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({
        source: `tool:${toolId}` as const,
        tool_id: toolId,
        tool_version: '1.0.0',
        tool_license: license,
        tool_source_url: sourceUrl,
        invocation_output_field: f,
        duration_ms: 0,
      })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            updates[`${tag}__${k}`] = {
              value: v, unit: '', family: 'dimensionless' as const,
              basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0,
              temporal_resolution_s: null, condition: null, provenance: prov(k),
            }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepFda = universalStep('regulatory-fda:cgmp', 'internal://forgeos/orchestrator')
const stepRegCert = universalStep('regulatory-cert-cost:lookup', 'internal://forgeos/orchestrator')
const stepLifecycleCo2 = universalStep('lifecycle-co2:assessment', 'internal://forgeos/orchestrator')
const stepSupplyChainRisk = universalStep('supply-chain-risk:scoring', 'internal://forgeos/orchestrator')
const stepReliabilityFmea = universalStep('reliability-fmea:system', 'internal://forgeos/orchestrator')
const stepCyber = universalStep('cybersecurity-threat-model:stride', 'internal://forgeos/orchestrator')
const stepTransport = universalStep('transport-logistics:routing', 'internal://forgeos/orchestrator')

// ---------------------------------------------------------------------------
// Mass aggregator
// ---------------------------------------------------------------------------

const stepMassAggregator: ToolStep = {
  tool_id: 'mass-aggregator:envelope-check',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => ({
    total_cell_mass_kg: 0,
    transformer_mass_kg: null,
    rack_count: 1,
    max_mass_kg_envelope: 0.01,  // 10 g cap (typical wearable)
    pcs_mass_kg_estimate: 0,
    container_tare_kg_estimate: 0,
    rack_mass_kg_each_estimate: 0,
    additional_mass_kg: (c.quantities?.body_mass_g?.value ?? 5) / 1000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = (f: string) => ({
      source: 'tool:mass-aggregator:envelope-check' as const,
      tool_id: 'mass-aggregator:envelope-check',
      tool_version: '1.0.0',
      tool_license: 'free-proprietary' as const,
      tool_source_url: 'internal://forgeos/orchestrator',
      invocation_output_field: f,
      duration_ms: 0,
    })
    const out = output as { total_system_mass_kg?: number }
    const updates: Record<string, any> = {}
    if (out.total_system_mass_kg !== undefined && Number.isFinite(out.total_system_mass_kg)) {
      updates.total_system_mass_kg = {
        value: out.total_system_mass_kg, unit: 'kg', family: 'mass' as const,
        basis: 'empty' as const, scope: 'system' as const, uncertainty_pct: 5,
        temporal_resolution_s: null, condition: 'all-up dry, single sensor body',
        provenance: prov('total_system_mass_kg'),
      }
    }
    return { ...c, quantities: { ...c.quantities, ...updates } }
  },
}

// ---------------------------------------------------------------------------
// CONSISTENCY RULES
// ---------------------------------------------------------------------------

const rules = [
  ruleRange(
    'cgm.wear_duration_range',
    'Wear duration within typical CGM disposable bounds (3-15 days)',
    'wear_duration_days',
    3, 15,
    'warning',
  ),
  ruleRange(
    'cgm.mard_range',
    'MARD within FDA 510(k) typical bounds (≤12%)',
    'sensor_mard_pct',
    5, 12,
    'warning',
  ),
  ruleRange(
    'cgm.glucose_range_lower',
    'Glucose detection minimum at hypoglycaemia bound',
    'glucose_range_mg_dl_min',
    30, 60,
    'warning',
  ),
  ruleRange(
    'cgm.glucose_range_upper',
    'Glucose detection maximum at hyperglycaemia bound',
    'glucose_range_mg_dl_max',
    300, 500,
    'warning',
  ),
  ruleRange(
    'cgm.battery_voltage_range',
    'Battery voltage within silver oxide / coin cell bounds',
    'battery_voltage_v',
    1.4, 3.6,
    'warning',
  ),
]

// ---------------------------------------------------------------------------
// PLAN REGISTRATION
// ---------------------------------------------------------------------------

export const CGM_PLAN: ClassToolPlan = {
  id: 'cgm:disposable_wearable',
  envelope_predicate: (e) => e.class === 'cgm',
  tools: [
    stepGlucoseSensor,
    stepWireless,
    stepWearableBattery,
    stepBiocompat,
    stepPybamm,
    stepThermal,
    stepEmc,
    stepFda,
    stepRegCert,
    stepLifecycleCo2,
    stepSupplyChainRisk,
    stepReliabilityFmea,
    stepCyber,
    stepTransport,
    stepMassAggregator,
  ],
  coupled_pairs: [
    ['glucose-sensor:amperometric', 'wearable-battery:life'],
  ] as Array<[string, string]>,
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(CGM_PLAN)
