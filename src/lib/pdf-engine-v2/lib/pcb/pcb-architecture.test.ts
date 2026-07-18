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

  it('assigns multi-board wet-lab roles to the correct boards', () => {
    const state = stateWithQuantities({ working_volume_ml: 20 })
    state.moduleDecomposition = {
      modules: [{
        module: 'control',
        sub_modules: [{
          id: 'electronics',
          words: [
            { id: 'host_mcu', name_human: 'Microcontroller HAT', content_character: { character_id: 'microcontroller_mcu' }, modifier_characters: [] },
            { id: 'od_adc', name_human: 'Optical density ADC sensor', content_character: { character_id: 'adc_input_stage' }, modifier_characters: [] },
            { id: 'heater_driver', name_human: 'Heater motor driver pump', content_character: { character_id: 'motor_driver' }, modifier_characters: [] },
          ],
        }],
      }],
    }
    const plan = derivePcbArchitecture(state)
    expect(plan.assignments.map((item) => [item.wordId, item.boardId])).toEqual([
      ['host_mcu', 'wet_lab_hat'],
      ['od_adc', 'od_optics'],
      ['heater_driver', 'wet_actuation'],
    ])
    expect(plan.unassignedWordIds).toEqual([])
  })

  it('records required repeated channel capacity on board plans', () => {
    const plan = derivePcbArchitecture(stateWithQuantities({ channel_count: 4 }))
    expect(plan.boards[0].channelRequirements).toEqual([{ role: 'motion_channel', count: 4 }])
  })

  it('derives board shape and work from function rather than a generic square', () => {
    const optical = derivePcbArchitecture(stateWithQuantities({ optical_path_length_mm: 10 })).boards[0]
    expect(optical.workPerformed).toContain('drive_optical_source')
    expect(optical.shape.shapeFamily).toBe('optical_registration_plate')
    expect(optical.shape.mountingHoles).toBe(4)

    const ewod = derivePcbArchitecture(stateWithQuantities({ electrode_count: 64 }))
    expect(ewod.boards.find((item) => item.role === 'electrode_cartridge')?.shape.shapeFamily).toBe('electrode_cartridge')
    expect(ewod.boards.find((item) => item.role === 'high_voltage_controller')?.workPerformed).toContain('isolate_high_voltage')
  })
})
