import type { PcbArchitecturePlan } from './pcb-architecture'

export interface PcbImplementationEvidence {
  resolvedWordIds: string[]
  unresolvedWordIds: string[]
  implementedChannels: Record<string, number>
}

export interface PcbFitnessFinding {
  severity: 'high' | 'medium'
  code: 'unassigned_electronic_role' | 'partial_board_scope' | 'unresolved_component' | 'channel_under_implementation'
  message: string
  fixStage: string
}

export interface PcbDesignFitnessResult {
  ok: boolean
  findings: PcbFitnessFinding[]
}

/** Pure architecture-vs-implementation fitness; never evaluates DRC/export hygiene. */
export function evaluatePcbDesignFitness(
  architecture: PcbArchitecturePlan,
  evidence: PcbImplementationEvidence,
): PcbDesignFitnessResult {
  const findings: PcbFitnessFinding[] = []
  const resolved = new Set(evidence.resolvedWordIds)

  for (const wordId of architecture.unassignedWordIds) {
    findings.push({
      severity: 'high', code: 'unassigned_electronic_role',
      message: `electronic role ${wordId} is not assigned to a board or COTS module`,
      fixStage: 'pcb-architecture',
    })
  }
  for (const board of architecture.boards) {
    const missing = board.requiredWordIds.filter((wordId) => !resolved.has(wordId))
    if (missing.length) {
      findings.push({
        severity: 'high', code: 'partial_board_scope',
        message: `${board.boardId} is missing required roles: ${missing.join(', ')}`,
        fixStage: 'component-resolution',
      })
    }
    for (const requirement of board.channelRequirements) {
      const implemented = evidence.implementedChannels[requirement.role] ?? 0
      if (implemented < requirement.count) {
        // DECISION (2026-07-21): stir/pump at 0 is honest DRAFT until a HAT
        // drive topology exists — medium, not HIGH. Heater/OD under-count stays HIGH.
        const isDeferredActuation =
          implemented === 0
          && (requirement.role === 'stir_channel' || requirement.role === 'pump_channel')
        findings.push({
          severity: isDeferredActuation ? 'medium' : 'high',
          code: 'channel_under_implementation',
          message: isDeferredActuation
            ? `${board.boardId} defers ${requirement.role} until host HAT drive topology exists (implements 0)`
            : `${board.boardId} requires ${requirement.count} ${requirement.role}, implements ${implemented}`,
          fixStage: 'atopile-generator',
        })
      }
    }
  }
  for (const wordId of evidence.unresolvedWordIds) {
    findings.push({
      severity: 'high', code: 'unresolved_component',
      message: `component ${wordId} has no verified implementation`,
      fixStage: 'component-resolution',
    })
  }
  // GOTCHA: medium deferred-actuation findings must not block fitness.ok /
  // firmware-proof entry — only HIGH findings do.
  return { ok: !findings.some((finding) => finding.severity === 'high'), findings }
}
