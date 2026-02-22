'use server'

/**
 * @file agent-handoffs.ts
 *
 * @description Server actions that persist specialist-to-specialist handoffs
 * into the collaboration hub database. When a user clicks "Continue with
 * [Specialist]", this records the delegation so there's a persistent audit
 * trail of inter-specialist collaboration.
 *
 * This wires the previously-unwired collaboration-hub.ts infrastructure
 * into the actual user-facing handoff flow.
 *
 * @security All operations require authentication and foundry isolation.
 */

import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import {
  requestDelegation,
  sendAgentMessage,
} from '@/lib/agents/collaboration-hub'
import { logAgentAction } from '@/lib/agents/permission-guard'

// ============================================================================
// TYPES
// ============================================================================

export interface HandoffInput {
  fromSpecialistId: string
  fromSpecialistName: string
  toSpecialistId: string
  toSpecialistName: string
  /** Summary of what was discussed before handoff */
  conversationSummary?: string
  /** The NEXT_SPECIALIST reason extracted from the LLM response */
  handoffReason?: string
}

// ============================================================================
// PERSIST HANDOFF
// ============================================================================

/**
 * Persist a specialist-to-specialist handoff to the collaboration hub.
 *
 * Called fire-and-forget from the client when the user clicks a specialist
 * suggestion chip or tension card. Does NOT block the UI.
 */
export async function persistSpecialistHandoff(
  input: HandoffInput
): Promise<{ success: boolean; error?: string }> {
  try {
    const foundryId = await getFoundryIdCached()
    if (!foundryId) {
      return { success: false, error: 'No foundry context' }
    }

    const description = [
      input.handoffReason,
      input.conversationSummary
        ? `Context: ${input.conversationSummary.slice(0, 300)}`
        : undefined,
    ]
      .filter(Boolean)
      .join('\n\n')

    // 1. Create a delegation request in the DB
    const delegationResult = await requestDelegation({
      foundryId,
      requestingAgentId: input.fromSpecialistId,
      requestingAgentName: input.fromSpecialistName,
      targetAgentId: input.toSpecialistId,
      targetAgentName: input.toSpecialistName,
      requestType: 'collaboration',
      title: `Handoff: ${input.fromSpecialistName} → ${input.toSpecialistName}`,
      description: description || `${input.fromSpecialistName} recommended continuing with ${input.toSpecialistName}`,
    })

    if (!delegationResult.success) {
      console.error('[AgentHandoffs] Failed to persist delegation:', delegationResult.error)
      // Don't fail the handoff — this is supplementary persistence
    }

    // 2. Log the handoff action for audit trail
    await logAgentAction({
      foundryId,
      agentId: input.fromSpecialistId,
      agentName: input.fromSpecialistName,
      actionType: 'specialist_handoff',
      actionDescription: `Handed off to ${input.toSpecialistName}: ${input.handoffReason ?? 'user-initiated'}`,
      status: 'executed',
      details: {
        toSpecialistId: input.toSpecialistId,
        toSpecialistName: input.toSpecialistName,
        reason: input.handoffReason,
      },
    })

    return { success: true }
  } catch (err) {
    console.error('[AgentHandoffs] Error persisting handoff:', err)
    // Never let persistence errors break the handoff UX
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
