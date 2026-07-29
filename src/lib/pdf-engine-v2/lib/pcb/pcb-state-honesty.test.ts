import { buildPcbStateHonesty } from './pcb-state-honesty'

import type { PcbArchitecturePlan } from './pcb-architecture'

const ARCHITECTURE: PcbArchitecturePlan = {
  schema: 'pcb-architecture/v1',
  systemDisposition: 'multi_board',
  requiresAnyKiCadDeliverable: true,
  assignments: [],
  boards: [{
    boardId: 'traction_gate_drive',
    role: 'traction_gate_drive_board',
    requiredWordIds: [],
    domains: ['power', 'high_voltage'],
    channelRequirements: [
      { role: 'gate_drive_channel', count: 6 },
      { role: 'desat_channel', count: 6 },
    ],
    workPerformed: ['drive_sic_half_bridges'],
    shape: {
      shapeFamily: 'traction_gate_drive',
      outlineBasis: 'channel_count',
      mountingHoles: 6,
      rationale: 'function',
    },
    requiresKiCadDeliverable: true,
  }],
  unassignedWordIds: [],
  rationale: [],
  confidence: 'medium',
  onBoardElectronicPartCount: 0,
}

describe('buildPcbStateHonesty', () => {
  it('proveCatch: stamps a non-empty fail reason when gate channels are under-implemented', () => {
    const honesty = buildPcbStateHonesty({
      architecture: ARCHITECTURE,
      evidence: {
        resolvedWordIds: [],
        unresolvedWordIds: [],
        implementedChannels: {
          gate_drive_channel: 1,
          desat_channel: 0,
        },
      },
      fabricationReady: false,
      supplierGerbers: 'OPEN',
    })

    expect(honesty.required_gate_channels).toBe(6)
    expect(honesty.implemented_gate_channels).toBe(1)
    expect(honesty.required_channel_counts).toEqual({
      gate_drive_channel: 6,
      desat_channel: 6,
    })
    expect(honesty.implemented_channel_counts).toEqual({
      gate_drive_channel: 1,
      desat_channel: 0,
    })
    expect(honesty.NOT_FABRICATION_READY).toBe(true)
    expect(honesty.supplier_gerbers).toBe('OPEN')
    expect(honesty.designFitness.ok).toBe(false)
    expect(honesty.fitness_fail_reason).toContain('requires 6 gate_drive_channel, implements 1')
  })
})
