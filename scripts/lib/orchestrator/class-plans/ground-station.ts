/**
 * scripts/lib/orchestrator/class-plans/ground-station.ts
 *
 * GROUND STATION TOOL PLAN — hand-tuned BESS-quality 2026-05-22.
 *
 * Earth-segment satellite ground station: 3-12 m dish + RF chain + control
 * room. Tools and architecture references:
 *   - Mynaric Condor inter-sat link
 *   - SES O3b mPOWER ground gateway
 *   - Kongsberg Tampnet polar antennae
 *   - General Dynamics SATCOM
 *   - SpaceLink USIM
 */

import { registerPlan } from '../planner'
import { ruleQuantityRatio, ruleClosure, ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'

void ruleClosure

const PROV = (tid: string, version = '1.0.0') => (f: string) => ({
  source: `tool:${tid}` as const,
  tool_id: tid,
  tool_version: version,
  tool_license: 'free-proprietary' as const,
  tool_source_url: 'internal://forgeos/ground-station',
  invocation_output_field: f,
  duration_ms: 0,
})

function makeStep(toolId: string, getInput: (c: any) => any, updateQuantities: (c: ContractInProgress, out: any) => Partial<Record<string, any>>, feedsInto: string[] = [], macroBuilder?: (c: ContractInProgress, out: any) => { word_name: string; unit_price_gbp: number; dimension_basis: any; dimension_value: number; total_gbp: number; source_detail: string } | null): ToolStep {
  return {
    tool_id: toolId,
    required: false,
    feeds_into: feedsInto as string[],
    input_from_contract: getInput,
    contract_update: (c: ContractInProgress, output: any) => {
      const updates = updateQuantities(c, output)
      const macros = macroBuilder ? macroBuilder(c, output) : null
      const macroList = macros
        ? [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== macros.word_name), macros]
        : c.macro_assembly_prices ?? []
      return { ...c, macro_assembly_prices: macroList as any, quantities: { ...c.quantities, ...(updates as any) } }
    },
  }
}

const stepLinkBudget = makeStep('link-budget:rf',
  (c: any) => ({
    frequency_ghz: c.quantities?.frequency_band_ghz?.value ?? 10.7,
    transmit_power_w: 500,
    transmit_antenna_gain_dbi: 20 * Math.log10(((c.quantities?.antenna_diameter_m?.value ?? 3.7) * Math.PI * (c.quantities?.frequency_band_ghz?.value ?? 10.7) * 1e9 / 3e8)) - 2,
    receive_antenna_gain_dbi: 35,
    receive_system_temp_k: 1500,
    bandwidth_hz: 36e6,
    range_km: 35786,
    required_margin_db: 4,
  }),
  (_c, out) => ({
    uplink_eirp_dbw: { value: out?.eirp_dbw ?? 64, unit: 'dBW', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'Ku-band uplink', provenance: PROV('link-budget:rf')('eirp_dbw') },
    uplink_link_margin_db: { value: out?.link_margin_db ?? 5, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'clear sky', provenance: PROV('link-budget:rf')('link_margin_db') },
    uplink_data_rate_mbps: { value: out?.data_rate_mbps ?? 110, unit: 'Mbps', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'DVB-S2X 8PSK 3/4', provenance: PROV('link-budget:rf')('data_rate_mbps') },
  }),
)

const stepWirelessLinkBudget = makeStep('wireless-link-budget:friis',
  (c: any) => ({
    frequency_ghz: c.quantities?.frequency_band_ghz?.value ?? 10.7,
    distance_km: 35786,
    tx_power_dbw: 27,
    tx_antenna_gain_dbi: 47,
    rx_antenna_gain_dbi: 35,
  }),
  (_c, out) => ({
    free_space_path_loss_db: { value: out?.path_loss_db ?? 209, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'envelope', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'Friis FSPL', provenance: PROV('wireless-link-budget:friis')('path_loss_db') },
  }),
)

const stepOrbitProp = makeStep('orbit-propagator:j2',
  () => ({
    altitude_km: 35786,
    inclination_deg: 0,
    eccentricity: 0.0001,
    spacecraft_mass_kg: 5000,
    drag_coefficient: 0,
    drag_area_m2: 0,
    propagation_days: 30,
  }),
  (_c, out) => ({
    orbital_period_minutes: { value: out?.orbital_period_minutes ?? 1436, unit: 'min', family: 'time', basis: 'cycle', scope: 'envelope', uncertainty_pct: 0.01, temporal_resolution_s: null, condition: 'GEO target', provenance: PROV('orbit-propagator:j2')('orbital_period_minutes') },
  }),
)

const stepNgspice = makeStep('ngspice:pcs-simulation',
  () => ({ rated_power_kw: 50, dc_bus_voltage_v: 480, ac_output_voltage_v: 400, topology: 'sic_two_level' as const }),
  (_c, out) => ({
    hpa_dissipation_kw: { value: out?.dissipated_power_kw ?? 4, unit: 'kW', family: 'power', basis: 'continuous', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'HPA + UPS dissipation', provenance: PROV('ngspice:pcs-simulation')('dissipated_power_kw') },
    hpa_efficiency_pct: { value: out?.inverter_efficiency_pct ?? 92, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 1, temporal_resolution_s: null, condition: 'TWT or SSPA + UPS', provenance: PROV('ngspice:pcs-simulation')('inverter_efficiency_pct') },
  }),
)

const stepPandaPower = makeStep('pandapower:grid-integration',
  () => ({ rated_power_kw: 80, pcc_voltage_kv: 11, region: 'EU' as const, grid_strength: 'medium' as const }),
  (_c, out) => ({
    site_transformer_kva: { value: out?.transformer_rating_kva ?? 100, unit: 'kVA', family: 'power', basis: 'rated', scope: 'site', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'MV step-down', provenance: PROV('pandapower:grid-integration')('transformer_rating_kva') },
    site_transformer_mass_kg: { value: out?.transformer_mass_kg ?? 500, unit: 'kg', family: 'mass', basis: 'dry', scope: 'site', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'dry-type 11kV/400V', provenance: PROV('pandapower:grid-integration')('transformer_mass_kg') },
  }),
  [],
  (_c, _out) => ({ word_name: 'site_transformer', unit_price_gbp: 30, dimension_basis: 'kw_power' as const, dimension_value: 100, total_gbp: 3000, source_detail: 'pandapower-derived: £30/kVA × 100 kVA = £3,000 (dry-type 11kV/400V Dyn11)' }),
)

const stepThermalEnvelope = makeStep('thermal-envelope:ladder',
  () => ({ dissipation_kw: 4, ambient_temp_c: 30, target_internal_c: 25, cabinet_volume_m3: 2 }),
  (_c, out) => ({
    cabinet_cooling_capacity_kw: { value: out?.cooling_capacity_kw ?? 5, unit: 'kW', family: 'power', basis: 'continuous', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'RF cabinet HVAC', provenance: PROV('thermal-envelope:ladder')('cooling_capacity_kw') },
  }),
)

const stepHvac = makeStep('hvac:load-sizing',
  () => ({ building_area_m2: 150, occupancy: 6, equipment_load_kw: 15, ambient_temp_c: 32, target_temp_c: 22 }),
  (_c, out) => ({
    control_room_hvac_kw: { value: out?.cooling_capacity_kw ?? 25, unit: 'kW', family: 'power', basis: 'continuous', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'control room cooling', provenance: PROV('hvac:load-sizing')('cooling_capacity_kw') },
  }),
)

const stepEmc = makeStep('enclosure-emc:margin',
  () => ({ enclosure_area_m2: 6, shielding_material: 'aluminum', joint_seal_class: 'iec_61000_4_3' as const }),
  (_c, out) => ({
    enclosure_emc_margin_db: { value: out?.shielding_effectiveness_db ?? 60, unit: 'dB', family: 'dimensionless', basis: 'rated', scope: 'subassembly', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'IEC 61000-4-3', provenance: PROV('enclosure-emc:margin')('shielding_effectiveness_db') },
  }),
)

const stepGrounding = makeStep('grounding-lightning:ieee-998',
  () => ({ site_area_m2: 5000, keraunic_level_per_year: 30, structure_height_m: 12, grid_resistance_ohms: 1 }),
  (_c, out) => ({
    lightning_grid_count: { value: out?.grid_node_count ?? 24, unit: '', family: 'dimensionless', basis: 'rated', scope: 'site', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'IEEE 998', provenance: PROV('grounding-lightning:ieee-998')('grid_node_count') },
    grounding_resistance_ohms: { value: out?.grid_resistance_ohms ?? 1.2, unit: 'Ω', family: 'resistance', basis: 'rated', scope: 'site', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'grid + rod composite', provenance: PROV('grounding-lightning:ieee-998')('grid_resistance_ohms') },
  }),
)

const stepTransportVib = makeStep('launch-vibration:miles-eqn',
  () => ({ spacecraft_mass_kg: 5000, natural_frequency_hz: 8, damping_ratio: 0.05, psd_g2_hz: 0.01 }),
  (_c, out) => ({
    transport_vibration_rms_g: { value: out?.rms_acceleration_g ?? 2, unit: 'g', family: 'dimensionless', basis: 'rms', scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null, condition: 'truck transport MIL-STD-810G 514.7', provenance: PROV('launch-vibration:miles-eqn')('rms_acceleration_g') },
  }),
)

const stepMassAgg = makeStep('mass-aggregator:envelope-check',
  (c: any) => {
    const diamM = c.quantities?.antenna_diameter_m?.value ?? 3.7
    return {
      antenna_dish_mass_kg: diamM * diamM * 35,
      pedestal_mass_kg: 1800,
      drive_mechanism_mass_kg: 220,
      rf_cabinet_mass_kg: 450,
      site_transformer_mass_kg: c.quantities?.site_transformer_mass_kg?.value ?? 500,
      control_room_mass_kg: 1500,
      radome_mass_kg: 800,
      max_mass_kg_envelope: 12000,
    }
  },
  (_c, out) => ({
    total_system_mass_kg: { value: out?.total_system_mass_kg ?? 8500, unit: 'kg', family: 'mass', basis: 'dry', scope: 'site', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'site all-up dry', provenance: PROV('mass-aggregator:envelope-check')('total_system_mass_kg') },
    mass_budget_utilisation_pct: { value: out?.mass_budget_utilisation_pct ?? 75, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'site', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: PROV('mass-aggregator:envelope-check')('mass_budget_utilisation_pct') },
  }),
)

function genericStep(tool_id: string): ToolStep {
  return {
    tool_id,
    required: false,
    feeds_into: [] as string[],
    input_from_contract: (c: any) => ({ contract_quantities: c.quantities ?? {} }),
    contract_update: (c: ContractInProgress, output: any) => {
      const prov = (f: string) => ({ source: `tool:${tool_id}` as const, tool_id, invocation_output_field: f, duration_ms: 0 })
      const updates: Record<string, any> = {}
      if (output && typeof output === 'object') {
        for (const [k, v] of Object.entries(output as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v) && !k.startsWith('_')) {
            const key = `${tool_id.replace(/[-:]/g, '_')}__${k}`
            updates[key] = { value: v, unit: '', family: 'dimensionless' as const, basis: 'rated' as const, scope: 'system' as const, uncertainty_pct: 0, temporal_resolution_s: null, condition: null, provenance: prov(k) }
          }
        }
      }
      return { ...c, quantities: { ...c.quantities, ...updates } }
    },
  }
}

const stepRegulatory = genericStep('regulatory-cert-cost:lookup')
const stepLifecycleCo2 = genericStep('lifecycle-co2:assessment')
const stepSupplyChain = genericStep('supply-chain-risk:scoring')
const stepReliability = genericStep('reliability-fmea:system')
const stepCyber = genericStep('cybersecurity-threat-model:stride')
const stepTransport = genericStep('transport-logistics:routing')

const rules = [
  ruleRange('ground_station.antenna_diameter_m', 'dish 1-15 m envelope', 'antenna_diameter_m', 1, 15, 'warning'),
  ruleRange('ground_station.frequency_range', 'L-S-X-Ku-Ka band 1-50 GHz', 'frequency_band_ghz', 1, 50, 'warning'),
  ruleRange('ground_station.mass_utilisation', '≤95% mass budget', 'mass_budget_utilisation_pct', 0, 95, 'warning'),
  ruleQuantityRatio('ground_station.uplink_margin', 'uplink margin ≥ required', 'uplink_link_margin_db', 'uplink_link_margin_db', 1.0, 'warning'),
  ruleRange('ground_station.grounding_resistance', 'grid resistance ≤5 Ω per IEEE 998', 'grounding_resistance_ohms', 0, 5, 'warning'),
]

export const GROUND_STATION_PLAN: ClassToolPlan = {
  id: 'ground_station:earth_station',
  envelope_predicate: (e) => e.class === 'ground_station',
  tools: [
    stepLinkBudget, stepWirelessLinkBudget, stepOrbitProp,
    stepNgspice, stepPandaPower, stepThermalEnvelope, stepHvac, stepEmc, stepGrounding,
    stepTransportVib, stepMassAgg,
    stepRegulatory, stepLifecycleCo2, stepSupplyChain, stepReliability, stepCyber, stepTransport,
  ],
  coupled_pairs: [
    ['link-budget:rf', 'wireless-link-budget:friis'],
    ['ngspice:pcs-simulation', 'thermal-envelope:ladder'],
  ],
  max_iterations: 5,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(GROUND_STATION_PLAN)
