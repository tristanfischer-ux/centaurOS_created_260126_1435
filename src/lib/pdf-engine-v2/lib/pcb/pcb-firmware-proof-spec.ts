import type { PcbArchitecturePlan } from './pcb-architecture'

export interface PcbFirmwareProofSpec {
  schema: 'pcb-firmware-proof-spec/v1'
  proofTargetId: string
  kind: 'custom_board' | 'cots_host_integration'
  boardRole: string
  workPerformed: string[]
  channels: Array<{ role: string; requiredCount: number }>
  domains: string[]
  safeByDefault: boolean
}

/** Generate minimal bring-up proof targets from the same board architecture contract. */
export function deriveFirmwareProofSpecs(architecture: PcbArchitecturePlan): PcbFirmwareProofSpec[] {
  if (architecture.systemDisposition === 'cots_only') {
    return [{
      schema: 'pcb-firmware-proof-spec/v1',
      proofTargetId: 'system_integration',
      kind: 'cots_host_integration',
      boardRole: 'cots_module_stack',
      workPerformed: ['enumerate_modules', 'verify_channel_map', 'prove_communications'],
      channels: [],
      domains: [],
      safeByDefault: true,
    }]
  }
  return architecture.boards
    .filter((board) => board.requiresKiCadDeliverable)
    .map((board) => ({
      schema: 'pcb-firmware-proof-spec/v1' as const,
      proofTargetId: board.boardId,
      kind: 'custom_board' as const,
      boardRole: board.role,
      workPerformed: board.workPerformed,
      channels: board.channelRequirements.map((item) => ({ role: item.role, requiredCount: item.count })),
      domains: board.domains,
      safeByDefault: true,
    }))
}
