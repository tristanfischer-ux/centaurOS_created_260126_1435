/**
 * @file proveCatch for deriveImplementedChannelCounts (channel silence bug).
 */

import {
  deriveImplementedChannelCounts,
  hasHeaterChannelGoldTopology,
  hasHeaterChannelMinimalTopology,
  HEATER_CHANNEL_GOLD_MPNS,
} from './pcb-channel-evidence'

describe('pcb-channel-evidence', () => {
  it('proveCatch: heater gold MPNs mint heater_channel=1', () => {
    const components = HEATER_CHANNEL_GOLD_MPNS.map((partNumber, i) => ({
      partNumber,
      characterId: `heater_part_${i}`,
    }))
    expect(hasHeaterChannelGoldTopology(components)).toBe(true)
    const counts = deriveImplementedChannelCounts({
      components,
      functionRequirements: [{
        role: 'heater_channel',
        implementation: 'unresolved_board_function',
        reason: 'test',
      }],
      requiredRoles: ['heater_channel', 'stir_channel', 'pump_channel'],
    })
    expect(counts.heater_channel).toBe(1)
    // GOTCHA: stir/pump stay 0 without HAT electrical evidence
    expect(counts.stir_channel).toBe(0)
    expect(counts.pump_channel).toBe(0)
  })

  it('proveCatch: temp sense + heater load mints heater_channel without full gold', () => {
    // INTENT: organoid wet_actuation often resolves TMP1075 + ESR18/cartridge
    // without DRV5021 + FFC — still a closed heater loop.
    const components = [
      { partNumber: 'TMP1075DSGR', characterId: 'temperature_sensor' },
      { partNumber: 'ESR18EZPJ3R9', characterId: 'cartridge_heater' },
    ]
    expect(hasHeaterChannelGoldTopology(components)).toBe(false)
    expect(hasHeaterChannelMinimalTopology(components)).toBe(true)
    const counts = deriveImplementedChannelCounts({
      components,
      functionRequirements: [],
      requiredRoles: ['heater_channel', 'stir_channel'],
    })
    expect(counts.heater_channel).toBe(1)
    expect(counts.stir_channel).toBe(0)
  })

  it('proveCatch: temp sense alone does NOT mint heater_channel', () => {
    const counts = deriveImplementedChannelCounts({
      components: [{ partNumber: 'TMP1075DSGR', characterId: 'temperature_sensor' }],
      functionRequirements: [],
      requiredRoles: ['heater_channel'],
    })
    expect(counts.heater_channel).toBe(0)
  })

  it('proveCatch: heater load alone does NOT mint heater_channel', () => {
    const counts = deriveImplementedChannelCounts({
      components: [{ characterId: 'cartridge_heater', nameHuman: 'Cartridge Heater' }],
      functionRequirements: [],
      requiredRoles: ['heater_channel'],
    })
    expect(counts.heater_channel).toBe(0)
  })

  it('proveCatch: OD source+detector mints od_measurement_channel', () => {
    const counts = deriveImplementedChannelCounts({
      components: [
        { characterId: 'od_source_led', nameHuman: 'OD LED Emitter' },
        { characterId: 'od_detector_pd', nameHuman: 'OD Photodiode' },
      ],
      functionRequirements: [],
      requiredRoles: ['od_measurement_channel'],
    })
    expect(counts.od_measurement_channel).toBe(1)
  })

  it('proveCatch: fitted LED + ADS1114 function classes mint OD channel', () => {
    // After OD-proxy synthesis, characterIds stay anonymous but functionClass/MPN
    // prove the optical path.
    const counts = deriveImplementedChannelCounts({
      components: [
        {
          characterId: 'sensing_instrumentation_subcomponent_1',
          functionClass: 'led',
          partNumber: 'SZYY0603B',
        },
        {
          characterId: 'sensing_instrumentation_subcomponent_2',
          functionClass: 'sensor_ic',
          partNumber: 'ADS1114IDGSR',
        },
      ],
      functionRequirements: [],
      requiredRoles: ['od_measurement_channel'],
    })
    expect(counts.od_measurement_channel).toBe(1)
  })

  it('proveCatch: electrode passive geometry still counts', () => {
    const counts = deriveImplementedChannelCounts({
      components: [],
      functionRequirements: [{
        role: 'electrode_channel',
        implementation: 'passive_board_geometry',
        reason: 'patterned copper',
      }],
      requiredRoles: ['electrode_channel'],
    })
    expect(counts.electrode_channel).toBe(1)
  })

  it('proveCatch: host-HAT DRV8876 instances mint stir/pump channels', () => {
    const counts = deriveImplementedChannelCounts({
      components: [
        { partNumber: 'DRV8876PWPR', characterId: 'stir_motor_driver' },
        { partNumber: 'DRV8876PWPR', characterId: 'pump_motor_driver' },
      ],
      functionRequirements: [],
      requiredRoles: ['stir_channel', 'pump_channel'],
    })
    expect(counts.stir_channel).toBe(1)
    expect(counts.pump_channel).toBe(1)
  })

  it('proveCatch: eight expanded MOSFET/shunt/comparator instances mint power/sense/safety=8', () => {
    const components = Array.from({ length: 8 }, (_, i) => ([
      { characterId: 'per_channel_discharge_load_mosfet', nameHuman: `MOSFET ${i + 1}` },
      { characterId: 'per_channel_charge_current_source', nameHuman: `Charge ${i + 1}` },
      { characterId: 'per_channel_current_shunt_measurement', nameHuman: `Shunt ${i + 1}` },
      { characterId: 'per_channel_precision_afe', nameHuman: `AFE ${i + 1}` },
      { characterId: 'per_channel_overcurrent_comparator', nameHuman: `OC ${i + 1}` },
      { characterId: 'per_channel_reverse_polarity_detector', nameHuman: `RP ${i + 1}` },
    ])).flat()
    const counts = deriveImplementedChannelCounts({
      components,
      functionRequirements: [],
      requiredRoles: ['power_channel', 'sense_channel', 'safety_channel'],
    })
    expect(counts.power_channel).toBe(8)
    expect(counts.sense_channel).toBe(8)
    expect(counts.safety_channel).toBe(8)
  })

  it('proveCatch: MOSFET×8 without charge source does not mint power_channel (incomplete path)', () => {
    const components = Array.from({ length: 8 }, (_, i) => ({
      characterId: 'per_channel_discharge_load_mosfet',
      nameHuman: `MOSFET ${i + 1}`,
    }))
    const counts = deriveImplementedChannelCounts({
      components,
      functionRequirements: [],
      requiredRoles: ['power_channel'],
    })
    expect(counts.power_channel).toBe(0)
  })

  it('proveCatch: missing channel power instances stay at 0 (token board)', () => {
    const counts = deriveImplementedChannelCounts({
      components: [
        { characterId: 'main_controller_mcu', nameHuman: 'MCU' },
        { characterId: 'precision_adc', nameHuman: 'ADC' },
      ],
      functionRequirements: [],
      requiredRoles: ['power_channel', 'sense_channel', 'safety_channel'],
    })
    expect(counts.power_channel).toBe(0)
    expect(counts.sense_channel).toBe(0)
    expect(counts.safety_channel).toBe(0)
  })

  it('proveCatch: FE traction topology mints only evidenced draft channels', () => {
    const counts = deriveImplementedChannelCounts({
      components: [
        { characterId: 'phase_current_sensor', nameHuman: 'Phase current sensor x3' },
        { characterId: 'current_sense_frontend', nameHuman: 'Phase current sense front-end x3' },
        { characterId: 'resolver_signal_interface', nameHuman: 'Resolver signal interface' },
        { characterId: 'decoupling_capacitor', nameHuman: 'Decoupling capacitor (Resolver signal interface)' },
        { characterId: 'can_fd_transceiver', nameHuman: 'CAN-FD transceiver' },
        { characterId: 'lv_buck_rails', nameHuman: 'LV buck power rails x3' },
      ],
      functionRequirements: [],
      requiredRoles: [
        'gate_drive_channel',
        'desat_channel',
        'phase_current_sense',
        'resolver_channel',
        'vehicle_can',
        'lv_buck_rail',
        'hv_lv_isolation_barrier',
      ],
    })
    expect(counts.phase_current_sense).toBe(3)
    expect(counts.resolver_channel).toBe(1)
    expect(counts.vehicle_can).toBe(1)
    expect(counts.lv_buck_rail).toBe(3)
    // GOTCHA: channel requirements alone must not mint safety-critical power-stage proof.
    expect(counts.gate_drive_channel).toBe(0)
    expect(counts.desat_channel).toBe(0)
    expect(counts.hv_lv_isolation_barrier).toBe(0)
  })

  it('proveCatch: six paired draft gate-driver and desat footprints mint six channels', () => {
    const components = Array.from({ length: 6 }, (_, i) => ([
      {
        characterId: 'isolated_gate_driver_channel',
        nameHuman: `Isolated gate driver ${i + 1}`,
      },
      {
        characterId: 'desat_protection_channel',
        nameHuman: `Desaturation protection ${i + 1}`,
      },
    ])).flat()
    const counts = deriveImplementedChannelCounts({
      components,
      functionRequirements: [],
      requiredRoles: ['gate_drive_channel', 'desat_channel'],
    })

    expect(counts.gate_drive_channel).toBe(6)
    expect(counts.desat_channel).toBe(6)
  })

  it('proveCatch: phase current count requires both sensor and front-end footprints', () => {
    const counts = deriveImplementedChannelCounts({
      components: [
        { characterId: 'phase_current_sensor', quantityInDesign: 3 },
        { characterId: 'current_sense_frontend', quantityInDesign: 2 },
      ],
      functionRequirements: [],
      requiredRoles: ['phase_current_sense'],
    })

    expect(counts.phase_current_sense).toBe(2)
  })
})
