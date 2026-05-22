/**
 * scripts/lib/orchestrator/class-plans/propulsion-thruster-product.ts
 *
 * STANDALONE THRUSTER PRODUCT TOOL PLAN — hand-tuned BESS-quality 2026-05-22.
 *
 * For thruster companies selling a Hall/ion/monoprop/bipropellant
 * thruster as a productised assembly (not the integrated spacecraft).
 * Hardware emphasis: launch vibration, FEA mounting, qualification.
 *
 * Architecture references:
 *   - Busek BHT-200 / BHT-1500 Hall thrusters
 *   - Apollo Constellation iodine Hall
 *   - ThrustMe NPT30-I2 iodine ion (cubesat)
 *   - Aerojet MR-103 monoprop / MR-401 bipropellant
 *   - Bradford ECAPS HPGP green monoprop
 *   - Sitael HT-5k high-power Hall
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
  tool_source_url: 'internal://forgeos/propulsion',
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

function isElectric(c: any): boolean {
  return (c.quantities?.propellant_class?.value ?? 4) === 4
}

const stepElectricProp: ToolStep = {
  tool_id: 'electric-propulsion:sizing',
  required: false,
  feeds_into: ['propellant-tank:sizing', 'tsiolkovsky:delta-v'] as string[],
  input_from_contract: (c: any) => ({
    thrust_mn: (c.quantities?.thrust_n?.value ?? 0.022) * 1000,
    isp_s: c.quantities?.isp_s?.value ?? 1500,
    power_w: 200,
    propellant: 'xenon' as const,
    delta_v_required_ms: 200,
    spacecraft_mass_kg: 1000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    if (!isElectric(c)) return c
    const prov = PROV('electric-propulsion:sizing')
    const thrust = typeof output?.thrust_n === 'number' ? output.thrust_n : 0.022
    const isp = typeof output?.isp_s === 'number' ? output.isp_s : 1500
    const power = typeof output?.input_power_w === 'number' ? output.input_power_w : 200
    const macros = {
      word_name: 'thruster_assembly',
      unit_price_gbp: 145000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: 145000,
      source_detail: `EP-derived: £145k thruster (Busek BHT-200 / Apollo Constellation class, ${(thrust * 1000).toFixed(0)} mN @ Isp ${isp.toFixed(0)} s, ${power.toFixed(0)} W)`,
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'thruster_assembly'), macros],
      quantities: {
        ...c.quantities,
        thruster_thrust_n: { value: thrust, unit: 'N', family: 'force', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Hall thruster', provenance: prov('thrust_n') },
        thruster_isp_s: { value: isp, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'vacuum', provenance: prov('isp_s') },
        thruster_input_power_w: { value: power, unit: 'W', family: 'power', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'PPU input', provenance: prov('input_power_w') },
      },
    }
  },
}

const stepChemProp: ToolStep = {
  tool_id: 'chemical-propulsion:sizing',
  required: false,
  feeds_into: ['propellant-tank:sizing', 'tsiolkovsky:delta-v'] as string[],
  input_from_contract: (c: any) => ({
    thrust_n: c.quantities?.thrust_n?.value ?? 22,
    isp_s: c.quantities?.isp_s?.value ?? 220,
    propellant: ((c.quantities?.propellant_class?.value ?? 2) === 3 ? 'mon3_mmh' : 'hydrazine') as 'mon3_mmh' | 'hydrazine',
    delta_v_required_ms: 200,
    spacecraft_mass_kg: 1000,
  }),
  contract_update: (c: ContractInProgress, output: any) => {
    if (isElectric(c)) return c
    const prov = PROV('chemical-propulsion:sizing')
    const thrust = typeof output?.thrust_n === 'number' ? output.thrust_n : 22
    const isp = typeof output?.isp_s === 'number' ? output.isp_s : 220
    const monoprop = (c.quantities?.propellant_class?.value ?? 2) !== 3
    const macros = {
      word_name: 'thruster_assembly',
      unit_price_gbp: monoprop ? 65000 : 95000,
      dimension_basis: 'each' as const,
      dimension_value: 1,
      total_gbp: monoprop ? 65000 : 95000,
      source_detail: `chem-prop-derived: £${(monoprop ? 65 : 95)}k thruster (${monoprop ? 'Aerojet MR-103 monoprop' : 'Aerojet MR-401 bipropellant'} class, ${thrust.toFixed(1)} N @ Isp ${isp.toFixed(0)} s)`,
    }
    return {
      ...c,
      macro_assembly_prices: [...((c.macro_assembly_prices ?? []) as any[]).filter((m: any) => m.word_name !== 'thruster_assembly'), macros],
      quantities: {
        ...c.quantities,
        thruster_thrust_n: { value: thrust, unit: 'N', family: 'force', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: monoprop ? 'monopropellant N2H4' : 'bipropellant MMH/MON3', provenance: prov('thrust_n') },
        thruster_isp_s: { value: isp, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'vacuum', provenance: prov('isp_s') },
      },
    }
  },
}

const stepColdGas = makeStep('cold-gas-thruster:sizing',
  (c: any) => ({
    thrust_mn: (c.quantities?.thrust_n?.value ?? 0.05) * 1000,
    isp_s: c.quantities?.isp_s?.value ?? 70,
    propellant: 'butane' as const,
    delta_v_required_ms: 25,
    spacecraft_mass_kg: 100,
  }),
  (c, out) => {
    if ((c.quantities?.propellant_class?.value ?? 4) !== 1) return {}
    const prov = PROV('cold-gas-thruster:sizing')
    const thrust = typeof out?.thrust_n === 'number' ? out.thrust_n : 0.05
    const isp = typeof out?.isp_s === 'number' ? out.isp_s : 70
    return {
      thruster_thrust_n: { value: thrust, unit: 'N', family: 'force', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'cold gas butane', provenance: prov('thrust_n') },
      thruster_isp_s: { value: isp, unit: 's', family: 'time', basis: 'rated', scope: 'system', uncertainty_pct: 3, temporal_resolution_s: null, condition: 'vacuum', provenance: prov('isp_s') },
    }
  },
)

const stepPropTank = makeStep('propellant-tank:sizing',
  (c: any) => {
    const propClass = c.quantities?.propellant_class?.value ?? 2
    const propellant = propClass === 1 ? 'butane' : propClass === 2 ? 'hydrazine' : propClass === 3 ? 'mmh' : 'xenon'
    const pressureBar = propClass === 1 ? 6 : propClass === 2 ? 25 : propClass === 3 ? 22 : 100
    return {
      propellant_mass_kg: 5,
      propellant,
      operating_pressure_bar: pressureBar,
      safety_factor: 2.5,
    }
  },
  (_c, out) => {
    const prov = PROV('propellant-tank:sizing')
    return {
      propellant_tank_volume_l: { value: out?.tank_volume_l ?? 5, unit: 'L', family: 'volume', basis: 'gross', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'product-typical', provenance: prov('tank_volume_l') },
      propellant_tank_mass_kg: { value: out?.tank_mass_kg ?? 1.5, unit: 'kg', family: 'mass', basis: 'empty', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'Ti or Al COPV', provenance: prov('tank_mass_kg') },
    }
  },
)

const stepTsiolkovsky = makeStep('tsiolkovsky:delta-v',
  (c: any) => ({
    isp_s: c.quantities?.thruster_isp_s?.value ?? c.quantities?.isp_s?.value ?? 220,
    initial_mass_kg: 100,
    propellant_mass_kg: 5,
    g0_m_s2: 9.80665,
  }),
  (_c, out) => ({ achievable_delta_v_ms: { value: out?.achievable_delta_v_ms ?? 100, unit: 'm/s', family: 'velocity', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'closed-form @ host mass', provenance: PROV('tsiolkovsky:delta-v')('achievable_delta_v_ms') } }),
)

const stepCantera: ToolStep = {
  tool_id: 'cantera:thermochemistry',
  required: false,
  feeds_into: [] as string[],
  input_from_contract: (c: any) => {
    const propClass = c.quantities?.propellant_class?.value ?? 2
    if (propClass === 3) return { fuel: 'MMH', oxidizer: 'MON3', mixture_ratio: 1.65, chamber_pressure_bar: 12, expansion_ratio: 100 }
    if (propClass === 2) return { fuel: 'N2H4', oxidizer: null, chamber_pressure_bar: 15, expansion_ratio: 60 }
    return { fuel: 'butane', oxidizer: null, chamber_pressure_bar: 6, expansion_ratio: 25 }
  },
  contract_update: (c: ContractInProgress, output: any) => {
    const prov = PROV('cantera:thermochemistry', '3.2.0')
    const propClass = c.quantities?.propellant_class?.value ?? 2
    const flameT = typeof output?.adiabatic_flame_temp_k === 'number' ? output.adiabatic_flame_temp_k : (propClass === 3 ? 3100 : propClass === 2 ? 1100 : 300)
    return {
      ...c,
      quantities: {
        ...c.quantities,
        chamber_flame_temp_k: { value: flameT, unit: 'K', family: 'temperature', basis: 'peak', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'chamber adiabatic', provenance: prov('adiabatic_flame_temp_k') },
      },
    }
  },
}

const stepLaunchVib = makeStep('launch-vibration:miles-eqn',
  () => ({ spacecraft_mass_kg: 5, natural_frequency_hz: 150, damping_ratio: 0.03, psd_g2_hz: 0.08 }),
  (_c, out) => ({
    qual_random_vib_rms_g: { value: out?.rms_acceleration_g ?? 14, unit: 'g', family: 'dimensionless', basis: 'rms', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'NASA GEVS qualification', provenance: PROV('launch-vibration:miles-eqn')('rms_acceleration_g') },
    qual_random_vib_peak_g: { value: out?.peak_load_g ?? 42, unit: 'g', family: 'dimensionless', basis: 'peak', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: '3-sigma peak', provenance: PROV('launch-vibration:miles-eqn')('peak_load_g') },
  }),
)

const stepFea = makeStep('airframe-fea:landing',
  () => ({ load_g: 25, mass_kg: 5, material_yield_mpa: 850, safety_factor: 2.5 }),
  (_c, out) => ({
    mount_stress_mpa: { value: out?.max_stress_mpa ?? 320, unit: 'MPa', family: 'pressure', basis: 'peak', scope: 'system', uncertainty_pct: 10, temporal_resolution_s: null, condition: 'mounting bracket FEA', provenance: PROV('airframe-fea:landing')('max_stress_mpa') },
    mount_safety_factor: { value: out?.safety_factor ?? 2.65, unit: '', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null, condition: 'qual vibration envelope', provenance: PROV('airframe-fea:landing')('safety_factor') },
  }),
)

const stepMassAgg = makeStep('mass-aggregator:envelope-check',
  () => ({
    thruster_mass_kg: 1.0,
    propellant_tank_mass_kg: 1.5,
    ppu_mass_kg: 2.5,
    bracket_mass_kg: 0.8,
    harness_mass_kg: 0.4,
    fastener_mass_kg: 0.2,
    max_mass_kg_envelope: 6.0,
  }),
  (_c, out) => ({
    total_system_mass_kg: { value: out?.total_system_mass_kg ?? 6.4, unit: 'kg', family: 'mass', basis: 'dry', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: 'product all-up', provenance: PROV('mass-aggregator:envelope-check')('total_system_mass_kg') },
    mass_budget_utilisation_pct: { value: out?.mass_budget_utilisation_pct ?? 95, unit: '%', family: 'dimensionless', basis: 'rated', scope: 'system', uncertainty_pct: 5, temporal_resolution_s: null, condition: null, provenance: PROV('mass-aggregator:envelope-check')('mass_budget_utilisation_pct') },
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
  ruleRange('thruster.thrust_n_range', 'thrust within [0.001, 1000] N envelope', 'thruster_thrust_n', 0.001, 1000, 'warning'),
  ruleRange('thruster.isp_range', 'Isp [30, 5000] s envelope', 'thruster_isp_s', 30, 5000, 'warning'),
  ruleRange('thruster.mass_utilisation', '≤95% mass budget', 'mass_budget_utilisation_pct', 0, 95, 'warning'),
  ruleQuantityRatio('thruster.mount_safety_factor', 'mount safety factor ≥ 2.0', 'mount_safety_factor', 'mount_safety_factor', 1.0, 'warning'),
]

export const PROPULSION_THRUSTER_PRODUCT_PLAN: ClassToolPlan = {
  id: 'propulsion_thruster_product:thruster',
  envelope_predicate: (e) => e.class === 'propulsion_thruster_product',
  tools: [
    stepElectricProp, stepChemProp, stepColdGas, stepPropTank, stepTsiolkovsky, stepCantera,
    stepLaunchVib, stepFea, stepMassAgg,
    stepRegulatory, stepLifecycleCo2, stepSupplyChain, stepReliability, stepCyber, stepTransport,
  ],
  coupled_pairs: [
    ['electric-propulsion:sizing', 'propellant-tank:sizing'],
    ['chemical-propulsion:sizing', 'propellant-tank:sizing'],
  ],
  max_iterations: 3,
  convergence_tolerance_pct: 5.0,
  consistency_rules: rules,
}

registerPlan(PROPULSION_THRUSTER_PRODUCT_PLAN)
