/**
 * @file proveCatch for deriveImplementedChannelCounts (channel silence bug).
 */

import {
  deriveImplementedChannelCounts,
  hasHeaterChannelGoldTopology,
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

  it('proveCatch: missing one heater MPN does NOT mint heater_channel', () => {
    const components = HEATER_CHANNEL_GOLD_MPNS.slice(0, 3).map((partNumber) => ({ partNumber }))
    const counts = deriveImplementedChannelCounts({
      components,
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
