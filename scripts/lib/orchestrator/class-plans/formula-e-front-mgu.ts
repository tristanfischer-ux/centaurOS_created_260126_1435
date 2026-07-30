/**
 * scripts/lib/orchestrator/class-plans/formula-e-front-mgu.ts
 *
 * FORMULA E FRONT FPK — analytical tool plan (2026-07-29).
 *
 * INTENT: Spec front MGU+inverter+gear+diff for Gen3/Evo. Morphology and
 * envelope are forced by the front-axle bay (`max_dimensions_mm`). Reuses the
 * rear MGU analytical tool pack + FIA axle/energy tools; does NOT fall through
 * to vehicle/plant bootstrap.
 *
 * GOTCHA (2026-07-29 red-team): rear pack overwrites mgu_shaft_power_kw from
 * IPMSM while later updating η_inv/η_mgu from sic-loss / loss-point — the
 * continuous DC→shaft chain then disagrees (250×0.98766×0.98995 ≠ 238.9).
 * Front wraps every tool step with reconcileFrontFpkPowerChain so the
 * authoritative plane is always:
 *   P_dc_cont → ×η_inv → P_ac → ×η_mgu → P_shaft → ×η_gear → P_wheel
 * IPMSM shaft_power is retained as ipmsm_capability_shaft_power_kw (EM check).
 */

import { registerPlan } from '../planner'
import { ruleRange } from '../verifier'
import type { ClassToolPlan, ContractInProgress, ToolStep } from '../types'
import { FORMULA_E_REAR_MGU_PLAN } from './formula-e-rear-mgu'

function qv(c: ContractInProgress, key: string, fallback: number): number {
  const raw = (c.quantities as any)?.[key]
  const v = typeof raw === 'object' && raw !== null ? Number(raw.value) : Number(raw)
  return Number.isFinite(v) && v !== 0 ? v : fallback
}

function qNum(c: ContractInProgress, key: string): number | null {
  const raw = (c.quantities as any)?.[key]
  const v = typeof raw === 'object' && raw !== null ? Number(raw.value) : Number(raw)
  return Number.isFinite(v) ? v : null
}

/**
 * @description Reconcile continuous DC→wheel power / torque / thermal ΔT after any
 * tool mutates efficiencies or losses. Universal for front FPK reference planes.
 */
export function reconcileFrontFpkPowerChain(c: ContractInProgress): ContractInProgress {
  const pDc = qv(c, 'continuous_power_kw', qv(c, 'front_regen_electrical_cap_kw', 250))
  const etaInv = qv(c, 'inverter_efficiency', 0.985)
  const etaMgu = qv(c, 'mgu_efficiency', 0.97)
  const etaGear = qv(c, 'gear_efficiency', 0.97)
  const rpm = qv(c, 'mgu_base_speed_rpm', 19500)
  const omega = rpm * 2 * Math.PI / 60
  const flowLMin = qv(c, 'coolant_flow_l_min', 12)
  const coolantInlet = qv(c, 'coolant_inlet_c', 60)
  // Prefer CoolProp-written contract quantities (MEG 50/50); handbook only if absent.
  const rhoKgM3 = qv(c, 'coolant_density_kg_m3', 1040.5)
  const cpFromJ = qNum(c, 'coolant_cp_j_kgk')
  const cpFromKj = qNum(c, 'coolant_cp_kj_kgk')
  const cpJPerKgK =
    cpFromJ != null && cpFromJ > 500
      ? cpFromJ
      : cpFromKj != null && cpFromKj > 0
        ? cpFromKj * 1000
        : 3503

  const pAc = pDc * etaInv
  const pShaft = pAc * etaMgu
  const pWheel = pShaft * etaGear
  const tShaft = (pShaft * 1000) / Math.max(omega, 1e-9)
  const lossChainKw = Math.max(0, pDc - pShaft)
  // Prefer measured loss sum when tools provided both inverter + motor loss terms
  const invLoss = qNum(c, 'inverter_dissipated_kw')
  const cu = qNum(c, 'mgu_copper_loss_w')
  const fe = qNum(c, 'mgu_iron_loss_w')
  const mag = qNum(c, 'mgu_magnet_loss_w')
  const lossSumKw =
    invLoss != null && cu != null
      ? invLoss + (cu + (fe ?? 0) + (mag ?? 0)) / 1000
      : lossChainKw
  const mDotKgS = (flowLMin / 60) * (rhoKgM3 / 1000)
  const dT = mDotKgS > 0 ? (lossSumKw * 1000) / (mDotKgS * cpJPerKgK) : 0
  const hwKw = qv(c, 'front_hardware_power_class_kw', 350)
  const vdcMin = qv(c, 'assumed_vdc_min_v', qv(c, 'v_dc_min_v', 600))
  const iPhHw = Math.ceil((hwKw * 1000) / (Math.sqrt(3) * (vdcMin / Math.SQRT2)))
  // Modulation / device headroom vs ideal SVPWM envelope (red-team: 8–15%)
  const iPhDesign = Math.ceil(iPhHw * 1.12)

  const round1 = (n: number) => Math.round(n * 10) / 10
  const round3 = (n: number) => Math.round(n * 1000) / 1000

  // Preserve IPMSM capability as a separate check quantity when present
  const ipmsmShaft = qNum(c, 'mgu_shaft_power_kw')
  const priorIpmsm = qNum(c, 'ipmsm_capability_shaft_power_kw') ?? ipmsmShaft

  return {
    ...c,
    quantities: {
      ...c.quantities,
      dc_input_electrical_kw_continuous: {
        value: pDc, unit: 'kW', family: 'power', basis: 'continuous',
        scope: 'system', uncertainty_pct: 0, temporal_resolution_s: null,
        condition: 'RESS → inverter DC terminals (motoring/regen design duty)',
        source: 'calculator',
        source_detail: 'dc_input_electrical_kw_continuous = continuous_power_kw',
        lineage: { from: ['continuous_power_kw'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'dc_input_electrical_kw_continuous', duration_ms: 0 },
      },
      mgu_ac_electrical_input_kw: {
        value: round3(pAc), unit: 'kW', family: 'power', basis: 'continuous',
        scope: 'module', uncertainty_pct: 5, temporal_resolution_s: null,
        condition: `P_dc × η_inv (${etaInv})`,
        source: 'calculator',
        source_detail: 'mgu_ac_electrical_input_kw = continuous_power_kw*inverter_efficiency',
        lineage: { from: ['continuous_power_kw', 'inverter_efficiency'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'mgu_ac_electrical_input_kw', duration_ms: 0 },
      },
      mgu_shaft_power_kw: {
        value: round3(pShaft), unit: 'kW', family: 'power', basis: 'continuous',
        scope: 'module', uncertainty_pct: 5, temporal_resolution_s: null,
        condition: `P_dc × η_inv × η_mgu (${etaInv}×${etaMgu}) — mechanical shaft`,
        source: 'calculator',
        source_detail: 'mgu_shaft_power_kw = continuous_power_kw*inverter_efficiency*mgu_efficiency',
        lineage: { from: ['continuous_power_kw', 'inverter_efficiency', 'mgu_efficiency'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'mgu_shaft_power_kw', duration_ms: 0 },
      },
      gear_output_power_kw: {
        value: round3(pWheel), unit: 'kW', family: 'power', basis: 'continuous',
        scope: 'module', uncertainty_pct: 8, temporal_resolution_s: null,
        condition: `P_shaft × η_gear (${etaGear})`,
        source: 'calculator',
        source_detail: 'gear_output_power_kw = mgu_shaft_power_kw*gear_efficiency',
        lineage: { from: ['mgu_shaft_power_kw', 'gear_efficiency'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'gear_output_power_kw', duration_ms: 0 },
      },
      mgu_shaft_torque_nm: {
        value: round1(tShaft), unit: 'Nm', family: 'force', basis: 'continuous',
        scope: 'module', uncertainty_pct: 5, temporal_resolution_s: null,
        condition: `T = P_shaft/ω at ${rpm} rpm (mechanical shaft, post η_inv×η_mgu)`,
        source: 'calculator',
        source_detail: 'mgu_shaft_torque_nm = mgu_shaft_power_kw*1000/(mgu_base_speed_rpm*2*3.141592653589793/60)',
        lineage: { from: ['mgu_shaft_power_kw', 'mgu_base_speed_rpm'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'mgu_shaft_torque_nm', duration_ms: 0 },
      },
      total_dissipated_kw_continuous: {
        value: round3(lossSumKw), unit: 'kW', family: 'power', basis: 'continuous',
        scope: 'system', uncertainty_pct: 15, temporal_resolution_s: null,
        condition: 'inverter + motor loss at continuous DC duty (to coolant)',
        source: 'calculator',
        source_detail: 'total_dissipated_kw_continuous = inverter_dissipated_kw+(mgu_copper_loss_w+mgu_iron_loss_w+mgu_magnet_loss_w)/1000',
        lineage: { from: ['inverter_dissipated_kw', 'mgu_copper_loss_w', 'mgu_iron_loss_w', 'mgu_magnet_loss_w'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'total_dissipated_kw_continuous', duration_ms: 0 },
      },
      coolant_delta_t_k: {
        value: round3(dT), unit: 'K', family: 'temperature', basis: 'continuous',
        scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null,
        condition: `ΔT = Q/(ṁ·cp); ṁ from ${flowLMin} L/min EGW ρ=${rhoKgM3} cp=${cpJPerKgK}`,
        source: 'calculator',
        source_detail: 'coolant_delta_t_k = total_dissipated_kw_continuous*1000/((coolant_flow_l_min/60)*(coolant_density_kg_m3/1000)*coolant_cp_j_kgk)',
        lineage: { from: ['total_dissipated_kw_continuous', 'coolant_flow_l_min', 'coolant_density_kg_m3', 'coolant_cp_j_kgk'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'coolant_delta_t_k', duration_ms: 0 },
      },
      coolant_outlet_c: {
        value: round1(coolantInlet + dT), unit: '°C', family: 'temperature', basis: 'continuous',
        scope: 'system', uncertainty_pct: 20, temporal_resolution_s: null,
        condition: 'inlet + ΔT (single-pass lump; no radiator model)',
        source: 'calculator',
        source_detail: 'coolant_outlet_c = coolant_inlet_c+coolant_delta_t_k',
        lineage: { from: ['coolant_inlet_c', 'coolant_delta_t_k'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'coolant_outlet_c', duration_ms: 0 },
      },
      phase_current_max_a: {
        value: iPhHw, unit: 'A', family: 'current', basis: 'peak',
        scope: 'module', uncertainty_pct: 10, temporal_resolution_s: null,
        condition: `ideal SVPWM at Vdc,min=${vdcMin} V for P_hw=${hwKw} kW (no dead-time)`,
        source: 'calculator',
        source_detail: 'phase_current_max_a = front_hardware_power_class_kw*1000/(1.7320508075688772*(assumed_vdc_min_v/1.4142135623730951))',
        lineage: { from: ['front_hardware_power_class_kw', 'assumed_vdc_min_v'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'phase_current_max_a', duration_ms: 0 },
      },
      phase_current_design_a: {
        value: iPhDesign, unit: 'A', family: 'current', basis: 'peak',
        scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null,
        condition: 'I_ph_max × 1.12 design margin (modulation/dead-time/device drop)',
        source: 'calculator',
        source_detail: 'phase_current_design_a = phase_current_max_a*1.12',
        lineage: { from: ['phase_current_max_a'] },
        provenance: { source: 'tool:front_fpk_power_reconcile' as const, tool_id: 'front_fpk_power_reconcile',
          tool_version: '1.0.0', tool_license: 'free-proprietary' as const,
          tool_source_url: 'internal://forgeos/mgu-mcu-pack',
          invocation_output_field: 'phase_current_design_a', duration_ms: 0 },
      },
      ...(priorIpmsm != null
        ? {
            ipmsm_capability_shaft_power_kw: {
              value: priorIpmsm, unit: 'kW', family: 'power', basis: 'rated',
              scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null,
              condition: 'IPMSM D²L analytical capability (EM check; not the power-flow shaft)',
              source: 'tool:motor:ipmsm-analytical-sizing',
              source_detail: 'IPMSM D2L analytical capability retained as EM check; front_fpk_power_reconcile owns the power-flow shaft value',
              provenance: { source: 'tool:motor:ipmsm-analytical-sizing' as const,
                tool_id: 'motor:ipmsm-analytical-sizing', tool_version: '1.0.0',
                tool_license: 'free-proprietary' as const,
                tool_source_url: 'internal://forgeos/mgu-mcu-pack',
                invocation_output_field: 'shaft_power_kw', duration_ms: 0 },
            },
          }
        : {}),
    },
  }
}

function wrapWithFrontReconcile(step: ToolStep): ToolStep {
  return {
    ...step,
    contract_update: (c, output) => {
      const next = step.contract_update ? step.contract_update(c, output) : c
      // After IPMSM, stash capability before reconcile overwrites shaft
      if (step.tool_id === 'motor:ipmsm-analytical-sizing') {
        const out = output as { shaft_power_kw?: number }
        if (typeof out.shaft_power_kw === 'number') {
          const withCap: ContractInProgress = {
            ...next,
            quantities: {
              ...next.quantities,
              ipmsm_capability_shaft_power_kw: {
                value: out.shaft_power_kw, unit: 'kW', family: 'power', basis: 'rated',
                scope: 'module', uncertainty_pct: 15, temporal_resolution_s: null,
                condition: 'IPMSM D²L analytical capability (EM check)',
                provenance: {
                  source: 'tool:motor:ipmsm-analytical-sizing' as const,
                  tool_id: 'motor:ipmsm-analytical-sizing',
                  tool_version: '1.0.0',
                  tool_license: 'free-proprietary' as const,
                  tool_source_url: 'internal://forgeos/mgu-mcu-pack',
                  invocation_output_field: 'shaft_power_kw',
                  duration_ms: 0,
                },
              },
            },
          }
          return reconcileFrontFpkPowerChain(withCap)
        }
      }
      return reconcileFrontFpkPowerChain(next)
    },
  }
}

const rules = [
  ruleRange('formula_e_front_mgu.front_regen_cap', 'front regen ≤ 250 kW', 'front_regen_electrical_cap_kw', 50, 250, 'warning'),
  ruleRange('formula_e_front_mgu.vdc_window', 'usable Vdc in [500, 1000]', 'dc_bus_voltage_v', 500, 1000, 'warning'),
  ruleRange('formula_e_front_mgu.mass_cap', 'FPK mass aspiration ≤ 32 kg', 'fpk_mass_cap_kg', 5, 32, 'warning'),
  ruleRange('formula_e_front_mgu.bay_w', 'bay width ~343 mm class', 'front_bay_envelope_w_mm', 200, 400, 'warning'),
  ruleRange('formula_e_front_mgu.coolant_dt', 'coolant ΔT at continuous ≤ 25 K (lump)', 'coolant_delta_t_k', 0, 25, 'warning'),
]

export const FORMULA_E_FRONT_MGU_PLAN: ClassToolPlan = {
  id: 'formula_e_front_mgu:analytical',
  envelope_predicate: (e) => e.class === 'formula_e_front_mgu',
  // Same analytical stack as rear — wrapped so power planes cannot diverge.
  tools: FORMULA_E_REAR_MGU_PLAN.tools.map(wrapWithFrontReconcile),
  coupled_pairs: FORMULA_E_REAR_MGU_PLAN.coupled_pairs,
  max_iterations: 4,
  convergence_tolerance_pct: 3.0,
  consistency_rules: rules,
}

registerPlan(FORMULA_E_FRONT_MGU_PLAN)
