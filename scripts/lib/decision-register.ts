/**
 * @file scripts/lib/decision-register.ts
 * @description Universal Decision Register — durable owned human freezes that
 * survive when Questions/Holds flip to resolved.
 *
 * INTENT (2026-07-28 SOL): Questions disappear when answered; Holds disappear
 * when cleared. A chartered engineer needs a lasting table: what was decided,
 * by whom, on what evidence, what it freezes, what residual risk remains.
 *
 * Seeded from noun/signal cues on the contract (never a product-class branch).
 * Excel renders `state.decisionRegister`; empty on classes with no seeds is OK.
 */

export type DecisionRegisterStatus = 'OPEN' | 'PROPOSED' | 'APPROVED' | 'SUPERSEDED'

export interface DecisionRegisterEntry {
  id: string
  decision: string
  owner: string
  status: DecisionRegisterStatus
  evidence: string
  freezes: string[]
  residual_risk: string
  date?: string
  notes?: string
  provenance?: string
}

type QtyMap = Record<string, { value?: unknown } | undefined>

function qn(q: QtyMap, key: string): number | null {
  const v = q[key]?.value
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function hasColdPlate(topology: unknown): boolean {
  if (!Array.isArray(topology)) return false
  return topology.some((e: unknown) => {
    const edge = e as { mechanism?: string; from_part?: string; to_part?: string }
    if (String(edge?.mechanism ?? '') !== 'fluid_loop') return false
    return /cold[_\s-]?plates?/i.test(`${edge?.from_part ?? ''} ${edge?.to_part ?? ''}`)
  })
}

/**
 * @description Seed OPEN decisions for a traction-drive pack (cold-plate loop +
 * shaft torque / phase current). Universal — keyed on signals, not class slug.
 * @param contract Orchestrator / engineering contract (quantities + topology)
 * @returns Decision rows (may be empty)
 */
export function seedTractionDriveDecisionRegister(contract: {
  quantities?: QtyMap
  topology?: unknown
}): DecisionRegisterEntry[] {
  const q = contract.quantities ?? {}
  const torque = qn(q, 'mgu_shaft_torque_nm')
  const iph = qn(q, 'phase_current_max_a')
  const rearKw = qn(q, 'rear_axle_electrical_power_kw')
  const isTraction =
    hasColdPlate(contract.topology)
    && ((torque !== null && torque > 0) || (iph !== null && iph >= 100) || (rearKw !== null && rearKw >= 50))
  if (!isTraction) return []

  const margin = qn(q, 'rotor_stress_margin')
  const gear = qn(q, 'gear_ratio')
  const mass = qn(q, 'mgu_mcu_mass_cap_kg')
  const coolantC = qn(q, 'coolant_inlet_c')
  const continuous = qn(q, 'continuous_power_kw')

  const rows: DecisionRegisterEntry[] = [
    {
      id: 'DEC-001',
      decision: `Peak phase current / SiC die class — design I_ph = ${iph ?? 'TBD'} A_rms`,
      owner: 'Power electronics lead',
      status: 'OPEN',
      evidence: 'tool:inverter:current-voltage-envelope + brief phase_current_max_a',
      freezes: ['phase_current_max_a', 'traction_inverter_power_kw'],
      residual_risk: 'Module thermal limit and die class not FE/dyno confirmed',
      provenance: 'traction-drive seed',
    },
    {
      id: 'DEC-002',
      decision: `Continuous vs peak thermal duty — continuous design ${continuous ?? 'TBD'} kW vs peak ${rearKw ?? 'TBD'} kW electrical`,
      owner: 'Thermal / systems lead',
      status: 'OPEN',
      evidence: 'contract continuous_power_kw vs rear_axle_electrical_power_kw',
      freezes: ['continuous_power_kw', 'coolant_flow_l_min', 'coolant_inlet_c'],
      residual_risk: 'Race-stint definition and duty bins not customer-approved',
      provenance: 'traction-drive seed',
    },
    {
      id: 'DEC-003',
      decision: `Gear ratio lock — ratio ${gear ?? 'TBD'} (freeze before dyno or keep open?)`,
      owner: 'Mechanical lead',
      status: 'OPEN',
      evidence: 'tool:gear:traction-ratio',
      freezes: ['gear_ratio', 'wheel_torque_nm'],
      residual_risk: 'Vehicle tyre/radius context only — not designing the car',
      provenance: 'traction-drive seed',
    },
    {
      id: 'DEC-004',
      decision: `Coolant chemistry + inlet temperature — inlet ${coolantC ?? 'TBD'} °C`,
      owner: 'Thermal lead',
      status: 'OPEN',
      evidence: 'brief coolant_inlet_c + coolant_flow_l_min',
      freezes: ['coolant_inlet_c', 'coolant_flow_l_min'],
      residual_risk: 'Chemistry (glycol mix) not stated — corrosion/boil margin open',
      provenance: 'traction-drive seed',
    },
    {
      id: 'DEC-005',
      decision: `Pack mass allocation within ${mass ?? 35} kg (motor / inverter / gear / cold plate)`,
      owner: 'Chief engineer',
      status: 'OPEN',
      evidence: 'brief mgu_mcu_mass_cap_kg',
      freezes: ['mgu_mcu_mass_cap_kg'],
      residual_risk: 'No weighed BOM — allocation is an OPEN trial assumption',
      provenance: 'traction-drive seed',
    },
    {
      id: 'DEC-006',
      decision: margin !== null && margin < 1.5
        ? `Accept analytical rotor stress margin ${margin} < 1.5 as HOLD until FE/dyno`
        : 'Confirm rotor retention margin ≥ 1.5 at max used speed (FE/dyno)',
      owner: 'Rotor / structures lead',
      status: 'OPEN',
      evidence: 'tool:motor:rotor-centrifugal-stress',
      freezes: ['rotor_stress_margin', 'mgu_base_speed_rpm'],
      residual_risk: 'Analytical thin-ring hoop only — not FE demag / sleeve interference',
      provenance: 'traction-drive seed',
      notes: 'Do not invent APPROVED — Jaguar/team must stamp',
    },
    {
      id: 'DEC-007',
      decision: 'Duty-cycle binning authority — which lap / CSV defines energy & loss integral',
      owner: 'Systems / performance lead',
      status: 'OPEN',
      evidence: 'tool:powertrain:duty-cycle-energy',
      freezes: ['duty_net_electrical_energy_kwh', 'duty_loss_energy_kwh'],
      residual_risk: 'Illustrative bins until customer supplies signed speed/torque trace',
      provenance: 'traction-drive seed',
    },
  ]
  return rows
}
