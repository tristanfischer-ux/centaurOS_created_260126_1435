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

  it('proveCatch: deferred stir/pump at 0 are medium and do not fail fitness.ok', () => {
    const wetPlan: PcbArchitecturePlan = {
      ...plan(),
      systemDisposition: 'multi_board',
      boards: [{
        boardId: 'wet_actuation',
        role: 'heater_stir_actuation_board',
        requiredWordIds: ['heater'],
        domains: ['power'],
        channelRequirements: [
          { role: 'heater_channel', count: 1 },
          { role: 'stir_channel', count: 1 },
          { role: 'pump_channel', count: 1 },
        ],
        workPerformed: ['drive_heater_stir_pumps'],
        shape: {
          shapeFamily: 'wet_actuation_base',
          outlineBasis: 'wet_connector_edge',
          mountingHoles: 4,
          rationale: 'function',
        },
        requiresKiCadDeliverable: true,
      }],
    }
    const result = evaluatePcbDesignFitness(wetPlan, {
      resolvedWordIds: ['heater'],
      unresolvedWordIds: [],
      implementedChannels: { heater_channel: 1, stir_channel: 0, pump_channel: 0 },
    })
    expect(result.ok).toBe(true)
    expect(result.findings.filter((f) => f.severity === 'high')).toEqual([])
    expect(result.findings.filter((f) => f.severity === 'medium')).toHaveLength(2)
  })
})
