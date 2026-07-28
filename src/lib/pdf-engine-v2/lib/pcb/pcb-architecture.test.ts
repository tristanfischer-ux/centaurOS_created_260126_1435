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

function withElectronicWords(
  state: Record<string, unknown>,
  words: Array<{
    id: string
    nameHuman: string
    characterId: string
    modifiers?: Array<{ kind: string; value: string }>
  }>,
): Record<string, unknown> {
  return {
    ...state,
    moduleDecomposition: {
      modules: [{
        module: 'control',
        sub_modules: [{
          id: 'electronics',
          words: words.map((word) => ({
            id: word.id,
            name_human: word.nameHuman,
            content_character: { character_id: word.characterId },
            modifier_characters: word.modifiers ?? [],
          })),
        }],
      }],
    },
  }
}

interface NonComponentPlacementCase {
  name: string
  quantities: Record<string, number>
  evidence: string
  words: Array<{
    id: string
    nameHuman: string
    characterId: string
  }>
  expectedPlacement: string
  expectedBoardId?: string
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

  it('does not invent a motion board from bare channel_count alone', () => {
    const plan = derivePcbArchitecture(stateWithQuantities({ channel_count: 4 }))
    expect(plan.systemDisposition).toBe('unresolved')
    expect(plan.boards).toHaveLength(0)
    expect(plan.rationale).toContain('channel_count_without_domain_evidence')
  })

  it('records electrical channel capacity when AFE/power evidence is present', () => {
    const state = stateWithQuantities({ channel_count: 8 })
    state.moduleDecomposition = {
      modules: [{
        module: 'sensing',
        sub_modules: [{
          id: 'afe',
          words: [{
            id: 'afe',
            name_human: 'Per Channel Precision Afe',
            content_character: { character_id: 'per_channel_precision_afe' },
            modifier_characters: [],
          }],
        }],
      }],
    }
    const plan = derivePcbArchitecture(state)
    expect(plan.boards[0].role).toBe('channel_power_afe_controller')
    expect(plan.boards[0].channelRequirements).toEqual([
      { role: 'power_channel', count: 8 },
      { role: 'sense_channel', count: 8 },
      { role: 'safety_channel', count: 8 },
    ])
    expect(plan.rationale).toContain('electrical_channels_require_power_afe_safety_board')
  })

  it('records motion channel capacity only when motion evidence is present', () => {
    const state = stateWithQuantities({ channel_count: 4 })
    state.moduleDecomposition = {
      modules: [{
        module: 'control',
        sub_modules: [{
          id: 'motion',
          words: [{
            id: 'driver',
            name_human: 'Stepper motor driver channel',
            content_character: { character_id: 'stepper_motor_driver' },
            modifier_characters: [],
          }],
        }],
      }],
    }
    const plan = derivePcbArchitecture(state)
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
      // GOTCHA: stir/pump publish on wet_lab_hat (Forge host-HAT drive); actuation keeps heater only
      [{ role: 'heater_channel', count: 1 }],
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

  it('proveCatch: stir/pump publish on wet_lab_hat when Forge host-HAT drive fixture ok', () => {
    const plan = derivePcbArchitecture(stateWithQuantities({ working_volume_ml: 20 }))
    const hat = plan.boards.find((item) => item.role === 'wet_lab_hat')
    const actuation = plan.boards.find((item) => item.role === 'heater_stir_actuation_board')
    expect(actuation?.channelRequirements).toEqual([{ role: 'heater_channel', count: 1 }])
    expect(actuation?.deferredChannelRequirements ?? []).toEqual([])
    expect(hat?.channelRequirements).toEqual(
      expect.arrayContaining([
        { role: 'stir_channel', count: 1 },
        { role: 'pump_channel', count: 1 },
      ]),
    )
    expect(plan.rationale).toContain('stir_pump_published_on_host_hat_drive_topology')
  })

  it('proveCatch: culture boards declare mounting-hole phenotypes (HAT 4 / OD 2 / actuation 4)', () => {
    const plan = derivePcbArchitecture(stateWithQuantities({ working_volume_ml: 20 }))
    expect(plan.boards.find((b) => b.role === 'wet_lab_hat')?.shape.mountingHoles).toBe(4)
    expect(plan.boards.find((b) => b.role === 'od_optics_board')?.shape.mountingHoles).toBe(2)
    expect(plan.boards.find((b) => b.role === 'heater_stir_actuation_board')?.shape.mountingHoles)
      .toBe(4)
  })

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

  it.each<NonComponentPlacementCase>([
    {
      name: 'mechanical detector registration',
      quantities: { optical_path_length_mm: 10 },
      evidence: 'COTS detector module and detector mounting plate',
      words: [{
        id: 'detector_mount_plate_word',
        nameHuman: 'Detector mounting plate',
        characterId: 'detector_mount_plate',
      }],
      expectedPlacement: 'mechanical_only',
      expectedBoardId: 'optical_source',
    },
    {
      name: 'host-owned USB on a COTS compute shield',
      quantities: { compliance_voltage_v: 10 },
      evidence: 'ItsyBitsy M4 COTS compute module owns USB power and data',
      words: [{
        id: 'usb_interface_word',
        nameHuman: 'USB interface',
        characterId: 'usb_interface',
      }],
      expectedPlacement: 'off_board_module',
      expectedBoardId: undefined,
    },
    {
      name: 'direct host bus rather than a bridge IC',
      quantities: { working_volume_ml: 20 },
      evidence: 'Raspberry Pi host exposes direct I2C and SPI buses',
      words: [{
        id: 'host_protocol_bridge_word',
        nameHuman: 'Host protocol bridge',
        characterId: 'host_protocol_bridge',
      }],
      expectedPlacement: 'interconnect_only',
      expectedBoardId: 'wet_lab_hat',
    },
  ])('keeps $name in whole-system scope without treating it as a fitted component', ({
    quantities,
    evidence,
    words,
    expectedPlacement,
    expectedBoardId,
  }) => {
    const state = withElectronicWords(stateWithQuantities(quantities), words)
    state.parsedBrief = { original_text: evidence }

    const plan = derivePcbArchitecture(state)
    const assignment = plan.assignments.find((item) => item.wordId === words[0].id)

    expect(assignment).toMatchObject({
      placement: expectedPlacement,
      ...(expectedBoardId ? { boardId: expectedBoardId } : {}),
    })
    expect(plan.boards.flatMap((item) => item.requiredWordIds)).not.toContain(words[0].id)
    expect(plan.unassignedWordIds).not.toContain(words[0].id)
  })

  it('keeps bare-MCU wet-lab USB power on-board and routes heater sense to wet_actuation', () => {
    // INTENT / proveCatch (organoid 1546): without COTS compute host evidence,
    // USB power entry must stay a fitted HAT footprint; culture temperature +
    // cartridge heater must land on heater_stir_actuation_board — never OD optics
    // via sibling form-prose smear.
    const state = withElectronicWords(stateWithQuantities({ working_volume_ml: 20 }), [
      {
        id: 'microcontroller_mcu_word',
        nameHuman: 'Microcontroller Mcu',
        characterId: 'microcontroller_mcu',
      },
      {
        id: 'usb_power_entry_word',
        nameHuman: 'Usb Power Entry',
        characterId: 'usb_power_entry',
      },
      {
        id: 'cartridge_heater_word',
        nameHuman: 'Cartridge Heater',
        characterId: 'cartridge_heater',
      },
      {
        id: 'culture_temperature_probe_word',
        nameHuman: 'Culture Temperature Probe',
        characterId: 'culture_temperature_probe',
        modifiers: [{
          kind: 'form',
          value: 'representative optical density (od600) sensor & temperature probe assembly',
        }],
      },
      {
        id: 'esd_protection_network_word',
        nameHuman: 'Esd Protection Network',
        characterId: 'esd_protection_network',
      },
    ])
    // GOTCHA: do not mention Raspberry/Pi/PyBadge here — hasCotsComputeHost is a
    // positive presence regex and will false-trigger on "no Raspberry Pi".
    state.parsedBrief = {
      original_text: 'benchtop bioreactor with bare MCU control board and USB power entry on the HAT',
    }

    const plan = derivePcbArchitecture(state)
    expect(plan.systemDisposition).toBe('multi_board')
    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'usb_power_entry_word',
        placement: 'on_board',
        boardId: 'wet_lab_hat',
      }),
      expect.objectContaining({
        wordId: 'cartridge_heater_word',
        placement: 'on_board',
        boardId: 'wet_actuation',
      }),
      expect.objectContaining({
        wordId: 'culture_temperature_probe_word',
        placement: 'on_board',
        boardId: 'wet_actuation',
      }),
      expect.objectContaining({
        wordId: 'esd_protection_network_word',
        placement: 'on_board',
        boardId: 'wet_lab_hat',
      }),
    ]))
    expect(plan.boards.find((item) => item.role === 'od_optics_board')?.requiredWordIds)
      .toEqual([])
    expect(plan.boards.find((item) => item.role === 'heater_stir_actuation_board')?.requiredWordIds)
      .toEqual(expect.arrayContaining([
        'cartridge_heater_word',
        'culture_temperature_probe_word',
      ]))
  })

  it('proveCatch: bare NTC temperature_sensor parks when digital culture probe is present', () => {
    // INTENT (fixpack14): dual NTCG+TMP1075 on heater_20ml is half-wired junk —
    // NTC has VCC/GND only once TMP1075 owns the sense channel.
    const state = withElectronicWords(stateWithQuantities({ working_volume_ml: 20 }), [
      {
        id: 'temperature_sensor_word',
        nameHuman: 'Temperature Sensor',
        characterId: 'temperature_sensor',
        modifiers: [{ kind: 'part_number', value: 'NTCG163JF103FT1S' }],
      },
      {
        id: 'culture_temperature_probe_word',
        nameHuman: 'Culture Temperature Probe',
        characterId: 'culture_temperature_probe',
        modifiers: [{ kind: 'part_number', value: 'TMP1075DSGR' }],
      },
      {
        id: 'cartridge_heater_word',
        nameHuman: 'Cartridge Heater',
        characterId: 'cartridge_heater',
      },
    ])

    const plan = derivePcbArchitecture(state)
    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'temperature_sensor_word',
        placement: 'off_board_module',
        reasons: expect.arrayContaining(['superseded_by_on_board_digital_temperature_ic']),
      }),
      expect.objectContaining({
        wordId: 'culture_temperature_probe_word',
        placement: 'on_board',
        boardId: 'wet_actuation',
      }),
    ]))
    expect(plan.boards.find((item) => item.role === 'heater_stir_actuation_board')?.requiredWordIds)
      .toEqual(expect.arrayContaining(['culture_temperature_probe_word', 'cartridge_heater_word']))
    expect(plan.boards.find((item) => item.role === 'heater_stir_actuation_board')?.requiredWordIds)
      .not.toContain('temperature_sensor_word')
  })

  it('proveCatch: lone NTC temperature_sensor stays on_board when no digital temp IC', () => {
    const state = withElectronicWords(stateWithQuantities({ working_volume_ml: 20 }), [
      {
        id: 'temperature_sensor_word',
        nameHuman: 'Temperature Sensor',
        characterId: 'temperature_sensor',
        modifiers: [{ kind: 'part_number', value: 'NTCG163JF103FT1S' }],
      },
      {
        id: 'cartridge_heater_word',
        nameHuman: 'Cartridge Heater',
        characterId: 'cartridge_heater',
      },
    ])

    const plan = derivePcbArchitecture(state)
    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'temperature_sensor_word',
        placement: 'on_board',
        boardId: 'wet_actuation',
      }),
    ]))
  })

  it('proveCatch: OD-form sensing_instrumentation proxies route to od_optics, not wet_actuation', () => {
    // INTENT: organoid emits OD emitter/detector only as anonymous
    // sensing_instrumentation_subcomponent_N with OD in form — must populate
    // od_optics.requiredWordIds without stealing culture_temperature_probe.
    const state = withElectronicWords(stateWithQuantities({ working_volume_ml: 20 }), [
      {
        id: 'sensing_instrumentation_subcomponent_1_word',
        nameHuman: 'Sensing Instrumentation Subcomponent 1',
        characterId: 'sensing_instrumentation_subcomponent_1',
        modifiers: [{
          kind: 'form',
          value: 'representative optical density (od600) sensor & temperature probe assembly',
        }],
      },
      {
        id: 'sensing_instrumentation_subcomponent_2_word',
        nameHuman: 'Sensing Instrumentation Subcomponent 2',
        characterId: 'sensing_instrumentation_subcomponent_2',
        modifiers: [{
          kind: 'form',
          value: 'representative optical density (od600) sensor & temperature probe assembly',
        }],
      },
      {
        id: 'culture_temperature_probe_word',
        nameHuman: 'Culture Temperature Probe',
        characterId: 'culture_temperature_probe',
        modifiers: [{
          kind: 'form',
          value: 'representative optical density (od600) sensor & temperature probe assembly',
        }],
      },
    ])

    const plan = derivePcbArchitecture(state)
    expect(plan.boards.find((item) => item.role === 'od_optics_board')?.requiredWordIds)
      .toEqual(expect.arrayContaining([
        'sensing_instrumentation_subcomponent_1_word',
        'sensing_instrumentation_subcomponent_2_word',
      ]))
    expect(plan.boards.find((item) => item.role === 'heater_stir_actuation_board')?.requiredWordIds)
      .toEqual(expect.arrayContaining(['culture_temperature_probe_word']))
    expect(plan.boards.find((item) => item.role === 'od_optics_board')?.requiredWordIds)
      .not.toContain('culture_temperature_probe_word')
  })

  it('collapses a duplicate USB-interface concept while retaining the physical USB entry', () => {
    const state = withElectronicWords(stateWithQuantities({ electrode_count: 64 }), [
      {
        id: 'usb_power_entry_word',
        nameHuman: 'USB-C power and data receptacle',
        characterId: 'usb_power_entry',
        modifiers: [{ kind: 'part_number', value: '12401610E4-2A' }],
      },
      {
        id: 'usb_interface_word',
        nameHuman: 'USB interface',
        characterId: 'usb_interface',
      },
    ])

    const plan = derivePcbArchitecture(state)

    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'usb_power_entry_word',
        placement: 'on_board',
        boardId: 'hv_controller_main',
      }),
      expect.objectContaining({
        wordId: 'usb_interface_word',
        placement: 'interconnect_only',
        boardId: 'hv_controller_main',
      }),
    ]))
    expect(plan.boards.find((item) => item.boardId === 'hv_controller_main')?.requiredWordIds)
      .toEqual(['usb_power_entry_word'])
  })

  it('keeps integrated MCU firmware storage and protocol work as board requirements, not packages', () => {
    const state = withElectronicWords(stateWithQuantities({ electrode_count: 64 }), [
      {
        id: 'microcontroller_word',
        nameHuman: 'SAMD21 microcontroller',
        characterId: 'microcontroller_mcu',
      },
      {
        id: 'firmware_storage_word',
        nameHuman: 'SPI firmware storage',
        characterId: 'firmware_storage',
      },
      {
        id: 'host_protocol_bridge_word',
        nameHuman: 'Host protocol bridge',
        characterId: 'host_protocol_bridge',
      },
    ])

    const plan = derivePcbArchitecture(state)

    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'firmware_storage_word',
        placement: 'functional_requirement',
        boardId: 'hv_controller_main',
      }),
      expect.objectContaining({
        wordId: 'host_protocol_bridge_word',
        placement: 'functional_requirement',
        boardId: 'hv_controller_main',
      }),
    ]))
    expect(plan.boards.find((item) => item.boardId === 'hv_controller_main')?.requiredWordIds)
      .toEqual(['microcontroller_word'])
  })

  // proveCatch: bare MCU role (no SAMD/ESP/STM token) still owns firmware.
  it('treats bare microcontroller_mcu role as integrated firmware owner', () => {
    const state = withElectronicWords(stateWithQuantities({ working_volume_ml: 20 }), [
      {
        id: 'microcontroller_mcu_word',
        nameHuman: 'Microcontroller Mcu',
        characterId: 'microcontroller_mcu',
      },
      {
        id: 'firmware_storage_word',
        nameHuman: 'Firmware Storage',
        characterId: 'firmware_storage',
      },
    ])

    const plan = derivePcbArchitecture(state)

    expect(plan.assignments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        wordId: 'firmware_storage_word',
        placement: 'functional_requirement',
        boardId: 'wet_lab_hat',
      }),
    ]))
    expect(plan.boards.find((item) => item.boardId === 'wet_lab_hat')?.requiredWordIds)
      .not.toContain('firmware_storage_word')
  })

  // INTENT (Sol+Fable 2026-07-27): cold-v10 token board — channel power roles
  // were dropped at collectElectronicWords; cooling fan bloated the Gate 38 denom.
  it('proveCatch: channel power/sense/safety roles collect on_board; fan/heatsink off_board', () => {
    const state = withElectronicWords(
      stateWithQuantities({ channel_count: 8 }),
      [
        { id: 'per_channel_discharge_load_mosfet_word', nameHuman: 'Discharge MOSFET', characterId: 'per_channel_discharge_load_mosfet', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_charge_current_source_word', nameHuman: 'Charge Source', characterId: 'per_channel_charge_current_source', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_current_shunt_measurement_word', nameHuman: 'Shunt', characterId: 'per_channel_current_shunt_measurement', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_current_control_loop_word', nameHuman: 'Control Loop', characterId: 'per_channel_current_control_loop', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_overcurrent_comparator_word', nameHuman: 'OC Comp', characterId: 'per_channel_overcurrent_comparator', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_precision_afe_word', nameHuman: 'AFE', characterId: 'per_channel_precision_afe', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_power_heatsink_word', nameHuman: 'Heatsink', characterId: 'per_channel_power_heatsink', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'per_channel_power_cooling_fan_word', nameHuman: 'Cooling Fan', characterId: 'per_channel_power_cooling_fan', modifiers: [{ kind: 'quantity', value: '×8' }] },
        { id: 'main_controller_mcu_word', nameHuman: 'MCU', characterId: 'main_controller_mcu' },
      ],
    )
    const plan = derivePcbArchitecture(state)
    expect(plan.boards[0]?.role).toBe('channel_power_afe_controller')
    const byId = Object.fromEntries(plan.assignments.map((a) => [a.wordId, a.placement]))
    expect(byId.per_channel_discharge_load_mosfet_word).toBe('on_board')
    expect(byId.per_channel_charge_current_source_word).toBe('on_board')
    expect(byId.per_channel_current_shunt_measurement_word).toBe('on_board')
    expect(byId.per_channel_current_control_loop_word).toBe('on_board')
    expect(byId.per_channel_overcurrent_comparator_word).toBe('on_board')
    expect(byId.per_channel_power_heatsink_word).toBe('off_board_module')
    expect(byId.per_channel_power_cooling_fan_word).toBe('off_board_module')
    expect(plan.boards[0]?.requiredWordIds).toEqual(expect.arrayContaining([
      'per_channel_discharge_load_mosfet_word',
      'per_channel_current_shunt_measurement_word',
    ]))
    expect(plan.boards[0]?.requiredWordIds).not.toContain('per_channel_power_cooling_fan_word')
    // 6 channel roles ×8 + MCU ×1 = 49 on-board fitted instances
    expect(plan.onBoardElectronicPartCount).toBe(49)
  })

  // proveCatch (cold-v12): lone usb_c_host_interface is the physical Type-C land —
  // must stay on_board required, not self-collapse to interconnect_only.
  it('proveCatch: lone usb_c_host_interface stays on_board (not duplicate self-collapse)', () => {
    const state = withElectronicWords(
      stateWithQuantities({ channel_count: 8 }),
      [
        { id: 'main_controller_mcu_word', nameHuman: 'MCU', characterId: 'main_controller_mcu' },
        {
          id: 'usb_c_host_interface_word',
          nameHuman: 'Usb C Host Interface',
          characterId: 'usb_c_host_interface',
        },
        {
          id: 'per_channel_discharge_load_mosfet_word',
          nameHuman: 'MOSFET',
          characterId: 'per_channel_discharge_load_mosfet',
          modifiers: [{ kind: 'quantity', value: '×8' }],
        },
      ],
    )
    const plan = derivePcbArchitecture(state)
    const byId = Object.fromEntries(plan.assignments.map((a) => [a.wordId, a.placement]))
    expect(byId.usb_c_host_interface_word).toBe('on_board')
    expect(plan.boards[0]?.requiredWordIds).toContain('usb_c_host_interface_word')
  })
})
