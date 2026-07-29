/**
 * @file PCB state honesty projection.
 * @description Projects architecture requirements and physical implementation
 * evidence into explicit state fields without treating DRC/export hygiene as
 * fabrication readiness.
 */

import {
  evaluatePcbDesignFitness,
  fitnessFailReason,
} from './pcb-design-fitness'

import type { PcbArchitecturePlan } from './pcb-architecture'
import type {
  PcbDesignFitnessResult,
  PcbImplementationEvidence,
} from './pcb-design-fitness'

export interface PcbStateHonesty {
  designFitness: PcbDesignFitnessResult
  required_gate_channels: number
  implemented_gate_channels: number
  required_channel_counts: Record<string, number>
  implemented_channel_counts: Record<string, number>
  NOT_FABRICATION_READY: boolean
  supplier_gerbers: 'OPEN' | 'SUPPLIED'
  fitness_fail_reason: string
}

/**
 * @description Build explicit state.pcb architecture-honesty fields.
 * @param args.architecture Required board roles and channel counts.
 * @param args.evidence Resolved parts and implemented physical channels.
 * @param args.fabricationReady True only when the caller has independent evidence
 * that permits a fabrication-ready claim.
 * @param args.supplierGerbers Supplier Gerber evidence status.
 * @returns State-safe counts, fitness, readiness, and mandatory failure reason.
 */
export function buildPcbStateHonesty(args: {
  architecture: PcbArchitecturePlan
  evidence: PcbImplementationEvidence
  fabricationReady: boolean
  supplierGerbers: 'OPEN' | 'SUPPLIED'
}): PcbStateHonesty {
  const requiredChannelCounts: Record<string, number> = {}
  for (const requirement of args.architecture.boards.flatMap(
    (board) => board.channelRequirements,
  )) {
    requiredChannelCounts[requirement.role] =
      (requiredChannelCounts[requirement.role] ?? 0) + requirement.count
  }

  const implementedChannelCounts = Object.fromEntries(
    Object.keys(requiredChannelCounts).map((role) => [
      role,
      Math.max(0, Math.floor(args.evidence.implementedChannels[role] ?? 0)),
    ]),
  )
  const evidence: PcbImplementationEvidence = {
    ...args.evidence,
    implementedChannels: implementedChannelCounts,
  }
  const designFitness = evaluatePcbDesignFitness(args.architecture, evidence)

  return {
    designFitness,
    required_gate_channels: requiredChannelCounts.gate_drive_channel ?? 0,
    implemented_gate_channels: implementedChannelCounts.gate_drive_channel ?? 0,
    required_channel_counts: requiredChannelCounts,
    implemented_channel_counts: implementedChannelCounts,
    NOT_FABRICATION_READY: !args.fabricationReady,
    supplier_gerbers: args.supplierGerbers,
    fitness_fail_reason: fitnessFailReason(designFitness),
  }
}
