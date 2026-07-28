import { deriveFirmwareProofSpecs } from './pcb-firmware-proof-spec'
import { derivePcbArchitecture } from './pcb-architecture'

describe('deriveFirmwareProofSpecs', () => {
  it('creates one proof target per custom board with channel requirements', () => {
    const architecture = derivePcbArchitecture({
      orchestratorContract: { quantities: { channel_count: { value: 4 } } },
      moduleDecomposition: {
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
      },
    })
    const specs = deriveFirmwareProofSpecs(architecture)
    expect(specs).toHaveLength(1)
    expect(specs[0].proofTargetId).toBe('motion_controller')
    expect(specs[0].channels).toEqual([{ role: 'motion_channel', requiredCount: 4 }])
    expect(specs[0].safeByDefault).toBe(true)
  })

  it('uses a host-integration target for COTS-only systems', () => {
    const architecture = {
      ...derivePcbArchitecture({ orchestratorContract: { quantities: {} }, moduleDecomposition: { modules: [] } }),
      systemDisposition: 'cots_only' as const,
      requiresAnyKiCadDeliverable: false,
    }
    const specs = deriveFirmwareProofSpecs(architecture)
    expect(specs).toEqual([expect.objectContaining({ kind: 'cots_host_integration' })])
  })
})
