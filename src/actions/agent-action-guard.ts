'use server'

/**
 * @file agent-action-guard.ts
 *
 * @description Server actions that wrap AI agent proposed actions with
 * permission checks and audit logging. Every action executed via the
 * ProposedActionsCard (or any future agent action UI) flows through here.
 *
 * This wires up the dormant permission-guard infrastructure so that:
 * 1. Every action is checked against the 5-tier permission system
 * 2. Every action is logged to agent_action_log for audit
 * 3. Tier 3+ actions are blocked with an explanation
 *
 * @security All operations require authentication and foundry isolation.
 * @audit All actions logged to agent_action_log table.
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import {
  checkAgentPermission,
  logAgentAction,
  quickCheckPermission,
  type PermissionResult,
} from '@/lib/agents/permission-guard'

// ============================================================================
// TYPES
// ============================================================================

export interface ProposedActionInput {
  type: 'objective' | 'task' | 'archive_objective' | 'archive_task'
  title: string
  description?: string
}

export interface ActionValidationResult {
  index: number
  allowed: boolean
  requiresApproval: boolean
  blocked: boolean
  reason: string
  tier: string
}

export interface BatchValidationResult {
  results: ActionValidationResult[]
  allAllowed: boolean
  blockedCount: number
}

// ============================================================================
// ACTION TYPE MAPPING
// ============================================================================

/**
 * Maps ProposedAction types to permission-guard action types.
 * Archive actions are Tier 2 (propose) — same as create.
 */
function mapToPermissionActionType(proposedType: string): string {
  switch (proposedType) {
    case 'objective':
      return 'create_objective'
    case 'task':
      return 'create_task'
    case 'archive_objective':
      return 'create_objective'
    case 'archive_task':
      return 'create_task'
    default:
      return proposedType
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validates a batch of proposed actions against the permission system.
 *
 * @description Checks each action against the foundry's permission tiers
 * and returns per-action results. The UI uses this to disable blocked
 * actions and show explanatory tooltips.
 *
 * For Tier 2 (propose) actions where the user is clicking the button
 * themselves, the user's click IS the approval — these are marked as allowed.
 *
 * @param actions - Array of proposed actions to validate
 * @param specialistId - The specialist that proposed these actions
 * @returns Per-action validation results
 *
 * @security Requires authenticated user with foundry membership
 */
export async function validateProposedActions(
  actions: ProposedActionInput[],
  specialistId: string,
): Promise<BatchValidationResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      results: actions.map((_, i) => ({
        index: i,
        allowed: false,
        requiresApproval: false,
        blocked: true,
        reason: 'Not authenticated',
        tier: 'error',
      })),
      allAllowed: false,
      blockedCount: actions.length,
    }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return {
      results: actions.map((_, i) => ({
        index: i,
        allowed: false,
        requiresApproval: false,
        blocked: true,
        reason: 'No active foundry',
        tier: 'error',
      })),
      allAllowed: false,
      blockedCount: actions.length,
    }
  }

  const results: ActionValidationResult[] = []
  let blockedCount = 0

  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    const permissionType = mapToPermissionActionType(action.type)

    let permission: PermissionResult
    try {
      permission = await checkAgentPermission(permissionType, foundryId, specialistId)
    } catch {
      // If the RPC doesn't exist, fall back to local tier check
      permission = quickCheckPermission(permissionType)
    }

    // Tier 2 "propose" actions: user clicking the button IS the approval
    const isUserApproved = permission.requiresApproval && !permission.isBlocked && !permission.requiresHumanReview
    const effectivelyAllowed = permission.allowed || isUserApproved

    if (!effectivelyAllowed) {
      blockedCount++
    }

    results.push({
      index: i,
      allowed: effectivelyAllowed,
      requiresApproval: permission.requiresApproval,
      blocked: permission.isBlocked,
      reason: permission.reason,
      tier: permission.tier,
    })
  }

  return {
    results,
    allAllowed: blockedCount === 0,
    blockedCount,
  }
}

// ============================================================================
// AUDIT LOGGING
// ============================================================================

/**
 * Logs a batch of executed proposed actions to the audit trail.
 *
 * @description Called after actions are successfully executed. Records each
 * action with the specialist that proposed it and the user who approved it.
 *
 * @param actions - The proposed actions that were executed
 * @param specialistId - The specialist that proposed these actions
 * @param specialistName - Human-readable specialist name
 * @param executedResults - Per-action execution results (success/failure)
 *
 * @audit Logs to agent_action_log table with foundry_id isolation
 */
export async function logProposedActionsExecution(
  actions: ProposedActionInput[],
  specialistId: string,
  specialistName: string,
  executedResults: Array<{ index: number; success: boolean; id?: string }>,
): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return

  for (const result of executedResults) {
    const action = actions[result.index]
    if (!action) continue

    try {
      await logAgentAction({
        foundryId,
        agentId: specialistId,
        agentName: specialistName,
        actionType: mapToPermissionActionType(action.type),
        actionDescription: `${action.type}: ${action.title}`,
        status: result.success ? 'executed' : 'rejected',
        approvedBy: user.id,
        details: {
          proposedActionType: action.type,
          title: action.title,
          description: action.description,
          resultId: result.id,
          approvedByUser: user.id,
        },
      })
    } catch (err) {
      // AUDIT: Non-critical — don't fail the user action over logging
      console.error('[AgentActionGuard] Failed to log action:', {
        actionType: action.type,
        title: action.title,
        error: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }
}
