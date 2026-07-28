import { seedTractionDriveDecisionRegister } from './decision-register'

describe('seedTractionDriveDecisionRegister', () => {
  it('seeds durable owned decisions for a signal-backed traction-drive pack', () => {
    const rows = seedTractionDriveDecisionRegister({
      quantities: {
        rear_axle_electrical_power_kw: { value: 350 },
        continuous_power_kw: { value: 250 },
        phase_current_max_a: { value: 530 },
        mgu_shaft_torque_nm: { value: 77 },
        rotor_stress_margin: { value: 1.22 },
        gear_ratio: { value: 3.188 },
        coolant_inlet_c: { value: 40 },
        mgu_mcu_mass_cap_kg: { value: 35 },
      },
      topology: [{
        from_part: 'coolant_loop',
        to_part: 'rear_mgu_mcu_cold_plates',
        mechanism: 'fluid_loop',
      }],
    })

    expect(rows).toHaveLength(7)
    expect(rows.map((row) => row.id)).toEqual([
      'DEC-001', 'DEC-002', 'DEC-003', 'DEC-004', 'DEC-005', 'DEC-006', 'DEC-007',
    ])
    expect(rows.every((row) => row.status === 'OPEN')).toBe(true)
    expect(rows.every((row) => row.owner && row.evidence && row.freezes.length > 0)).toBe(true)
    expect(rows[5]?.decision).toContain('1.22 < 1.5')
  })

  it('does not seed unrelated contracts with no traction cooling topology', () => {
    expect(seedTractionDriveDecisionRegister({
      quantities: {
        continuous_power_kw: { value: 350 },
        phase_current_max_a: { value: 530 },
      },
      topology: [{
        from_part: 'process_coolant_loop',
        to_part: 'plant_heat_exchanger',
        mechanism: 'fluid_loop',
      }],
    })).toEqual([])
  })
})
