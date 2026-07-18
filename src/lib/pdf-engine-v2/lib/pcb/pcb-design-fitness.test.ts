import { evaluatePcbDesignFitness } from './pcb-design-fitness'
import type { PcbArchitecturePlan } from './pcb-architecture'

function plan(): PcbArchitecturePlan {
  return {
    schema: 'pcb-architecture/v1',
    systemDisposition: 'single_custom',
    requiresAnyKiCadDeliverable: true,
    assignments: [{ wordId: 'driver', placement: 'on_board', boardId: 'main', reasons: [] }],
    boards: [{
      boardId: 'main', role: 'motion_driver_board', requiredWordIds: ['driver'],
      domains: ['logic', 'motion_actuation'], channelRequirements: [{ role: 'motion_channel', count: 4 }],
      workPerformed: ['drive_repeated_motion_channels'],
      shape: { shapeFamily: 'linear_channel_spine', outlineBasis: 'channel_pitch', mountingHoles: 4, rationale: 'function' },
      requiresKiCadDeliverable: true,
    }],
    unassignedWordIds: [], rationale: [], confidence: 'medium',
  }
}

describe('evaluatePcbDesignFitness', () => {
  it('passes complete assigned components and channels', () => {
    const result = evaluatePcbDesignFitness(plan(), {
      resolvedWordIds: ['driver'], unresolvedWordIds: [], implementedChannels: { motion_channel: 4 },
    })
    expect(result.ok).toBe(true)
    expect(result.findings).toEqual([])
  })

  it('fails unresolved and missing required roles', () => {
    const result = evaluatePcbDesignFitness(plan(), {
      resolvedWordIds: [], unresolvedWordIds: ['driver'], implementedChannels: {},
    })
    expect(result.findings.map((item) => item.code)).toEqual(expect.arrayContaining([
      'partial_board_scope', 'unresolved_component', 'channel_under_implementation',
    ]))
  })
})
