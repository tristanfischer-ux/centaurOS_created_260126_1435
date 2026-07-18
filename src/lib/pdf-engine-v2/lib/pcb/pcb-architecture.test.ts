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

  it.each([
    [
      { optical_path_length_mm: 10 },
      'optical_source_daughterboard',
      [{ role: 'optical_source_channel', count: 1 }],
    ],
    [
      { tube_count: 8 },
      'thermal_power_controller',
      [
        { role: 'thermal_zone', count: 1 },
        { role: 'lid_heater_channel', count: 1 },
        { role: 'fan_channel', count: 1 },
      ],
    ],
    [
      { working_volume_ml: 20 },
      'od_optics_board',
      [{ role: 'od_measurement_channel', count: 1 }],
    ],
    [
      { working_volume_ml: 20 },
      'heater_stir_actuation_board',
      [
        { role: 'heater_channel', count: 1 },
        { role: 'stir_channel', count: 1 },
        { role: 'pump_channel', count: 1 },
      ],
    ],
    [
      { compliance_voltage_v: 10 },
      'analog_front_end_shield',
      [{ role: 'electrochemical_cell_channel', count: 1 }],
    ],
    [
      { electrode_count: 64 },
      'high_voltage_controller',
      [{ role: 'electrode_switch_channel', count: 64 }],
    ],
    [
      { electrode_count: 64 },
      'electrode_cartridge',
      [{ role: 'electrode_channel', count: 64 }],
    ],
  ] as const)(
    'derives %s channel requirements for %s from contract function evidence',
    (quantities, boardRole, expectedChannels) => {
      const plan = derivePcbArchitecture(stateWithQuantities(quantities))
      expect(plan.boards.find((item) => item.role === boardRole)?.channelRequirements)
        .toEqual(expectedChannels)
    },
  )

  it('recognises a finished modular motion stack from procurement evidence outside electronic words', () => {
    const state = stateWithQuantities({ channel_count: 4 })
    state.orchestratorContract = {
      ...(state.orchestratorContract as Record<string, unknown>),
      topology: [{
        from_part: 'main_controller_mcu',
        to_part: 'stepper_driver',
        mechanism: 'control',
        material_context: 'channel-independent step/dir',
      }],
      macro_assembly_prices: [{
        word_name: 'control_console',
        source_detail: 'MCU + CNC shield + plug-in stepper driver modules + bench PSU',
      }],
    }

    const plan = derivePcbArchitecture(state)
    expect(plan.systemDisposition).toBe('cots_only')
    expect(plan.requiresAnyKiCadDeliverable).toBe(false)
  })

  it('uses repeated topology endpoints when no explicit channel quantity exists', () => {
    const state = stateWithQuantities({ compliance_voltage_v: 10 })
    state.orchestratorContract = {
      ...(state.orchestratorContract as Record<string, unknown>),
      topology: [
        {
          from_part: 'tia_adc_front_end_1',
          to_part: 'working_electrode_connector_1',
          mechanism: 'signal',
        },
        {
          from_part: 'tia_adc_front_end_2',
          to_part: 'working_electrode_connector_2',
          mechanism: 'signal',
        },
      ],
    }

    const plan = derivePcbArchitecture(state)
    expect(plan.boards[0].channelRequirements).toEqual([
      { role: 'electrochemical_cell_channel', count: 2 },
    ])
  })

  it('assigns status and analog-monitor roles to a compatible controller board', () => {
    const state = stateWithQuantities({ electrode_count: 64 })
    state.moduleDecomposition = {
      modules: [{
        module: 'control',
        sub_modules: [{
          id: 'electronics',
          words: [
            { id: 'hv_driver', name_human: 'High voltage driver', content_character: { character_id: 'hv_driver' }, modifier_characters: [] },
            { id: 'current_tia', name_human: 'Current measurement TIA', content_character: { character_id: 'current_measurement_tia' }, modifier_characters: [] },
            { id: 'status_led', name_human: 'Status indicator', content_character: { character_id: 'status_indicator' }, modifier_characters: [] },
          ],
        }],
      }],
    }

    const plan = derivePcbArchitecture(state)
    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({ wordId: 'current_tia', placement: 'on_board', boardId: 'hv_controller_main' }),
      expect.objectContaining({ wordId: 'status_led', placement: 'on_board', boardId: 'hv_controller_main' }),
    ]))
    expect(plan.unassignedWordIds).toEqual([])
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
