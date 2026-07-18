import { derivePcbArchitecture } from './pcb-architecture'

function stateWithQuantities(quantities: Record<string, number>): Record<string, unknown> {
  return {
    isInstrumentDevice: true,
    orchestratorContract: {
      quantities: Object.fromEntries(
        Object.entries(quantities).map(([key, value]) => [key, { value }]),
      ),
    },
    moduleDecomposition: { modules: [] },
  }
}

describe('derivePcbArchitecture', () => {
  it.each([
    [{ optical_path_length_mm: 10 }, 'daughterboard', ['optical_source_daughterboard']],
    [{ tube_count: 8 }, 'single_custom', ['thermal_power_controller']],
    [{ working_volume_ml: 20 }, 'multi_board', ['wet_lab_hat', 'od_optics_board', 'heater_stir_actuation_board']],
    [{ compliance_voltage_v: 10 }, 'daughterboard', ['analog_front_end_shield']],
    [{ electrode_count: 64 }, 'multi_board', ['high_voltage_controller', 'electrode_cartridge']],
  ] as const)('maps function quantities %o to %s', (quantities, disposition, roles) => {
    const plan = derivePcbArchitecture(stateWithQuantities(quantities))
    expect(plan.systemDisposition).toBe(disposition)
    expect(plan.boards.map((board) => board.role)).toEqual(roles)
    expect(plan.requiresAnyKiCadDeliverable).toBe(true)
  })

  it('keeps a module-backed motion stack COTS-only', () => {
    const state = stateWithQuantities({ channel_count: 4 })
    state.moduleDecomposition = {
      modules: [{
        module: 'control',
        sub_modules: [{
          id: 'motion',
          words: [{
            id: 'motion_stack',
            name_human: 'Arduino CNC shield stepper driver module',
            content_character: { character_id: 'motor_controller_board' },
            modifier_characters: [],
          }],
        }],
      }],
    }
    const plan = derivePcbArchitecture(state)
    expect(plan.systemDisposition).toBe('cots_only')
    expect(plan.boards).toHaveLength(0)
    expect(plan.requiresAnyKiCadDeliverable).toBe(false)
  })

  it('returns unresolved instead of inventing a board when no functional evidence exists', () => {
    const plan = derivePcbArchitecture(stateWithQuantities({}))
    expect(plan.systemDisposition).toBe('unresolved')
    expect(plan.requiresAnyKiCadDeliverable).toBe(false)
  })
})
