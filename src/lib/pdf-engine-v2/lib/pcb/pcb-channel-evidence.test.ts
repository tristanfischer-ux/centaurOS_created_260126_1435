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
})
