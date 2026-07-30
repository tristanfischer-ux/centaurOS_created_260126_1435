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

  it('proveCatch: all-empty traction channels fail fitness but stamp draft-only honesty', () => {
    const tractionArchitecture: PcbArchitecturePlan = {
      ...ARCHITECTURE,
      boards: [
        ARCHITECTURE.boards[0],
        {
          ...ARCHITECTURE.boards[0],
          boardId: 'traction_control',
          role: 'traction_control_board',
          domains: ['logic', 'analog'],
          channelRequirements: [
            { role: 'phase_current_sense', count: 3 },
            { role: 'resolver_channel', count: 1 },
            { role: 'vehicle_can', count: 1 },
            { role: 'lv_buck_rail', count: 3 },
            { role: 'hv_lv_isolation_barrier', count: 1 },
          ],
        },
      ],
    }

    const honesty = buildPcbStateHonesty({
      architecture: tractionArchitecture,
      evidence: {
        resolvedWordIds: [],
        unresolvedWordIds: [],
        implementedChannels: {},
      },
      fabricationReady: false,
      supplierGerbers: 'OPEN',
    })

    expect(honesty.designFitness.ok).toBe(false)
    expect(honesty.NOT_FABRICATION_READY).toBe(true)
    expect(honesty.forgeDraftOnly).toBe(true)
    expect(honesty.supplierGerbers).toBe(false)
    expect(honesty.hilPresent).toBe(false)
    expect(honesty.ship_ok).toBe(false)
    expect(honesty.implemented_channel_counts).toEqual({
      gate_drive_channel: 0,
      desat_channel: 0,
      phase_current_sense: 0,
      resolver_channel: 0,
      vehicle_can: 0,
      lv_buck_rail: 0,
      hv_lv_isolation_barrier: 0,
    })
    expect(honesty.fitness_fail_reason).toContain('requires 6 gate_drive_channel, implements 0')
    expect(honesty.fitness_fail_reason).toContain('requires 3 phase_current_sense, implements 0')
  })

  it('proveCatch: complete draft channels never mint fabrication or ship readiness', () => {
    const controlBoard: PcbArchitecturePlan['boards'][number] = {
      ...ARCHITECTURE.boards[0],
      boardId: 'traction_control',
      role: 'traction_control_board',
      domains: ['logic', 'analog'],
      channelRequirements: [
        { role: 'phase_current_sense', count: 3 },
        { role: 'resolver_channel', count: 1 },
        { role: 'vehicle_can', count: 1 },
        { role: 'lv_buck_rail', count: 3 },
        { role: 'hv_lv_isolation_barrier', count: 1 },
      ],
    }
    const honesty = buildPcbStateHonesty({
      architecture: {
        ...ARCHITECTURE,
        boards: [ARCHITECTURE.boards[0], controlBoard],
      },
      evidence: {
        resolvedWordIds: [],
        unresolvedWordIds: [],
        implementedChannels: {
          gate_drive_channel: 6,
          desat_channel: 6,
          phase_current_sense: 3,
          resolver_channel: 1,
          vehicle_can: 1,
          lv_buck_rail: 3,
          hv_lv_isolation_barrier: 1,
        },
      },
      fabricationReady: false,
      supplierGerbers: 'OPEN',
    })

    expect(honesty.designFitness.ok).toBe(true)
    expect(honesty.NOT_FABRICATION_READY).toBe(true)
    expect(honesty.forgeDraftOnly).toBe(true)
    expect(honesty.supplier_gerbers).toBe('OPEN')
    expect(honesty.ship_ok).toBe(false)
  })
})
