/**
 * Agent Permission Guard
 *
 * Governance layer for autonomous agent actions. Enforces permission tiers:
 * - Tier 1 (Execute): Always allowed
 * - Tier 2 (Propose): Allowed with approval
 * - Tier 3 (Communicate): Requires approval + human review
 * - Tier 4 (Spend): Requires explicit approval
 * - Tier 5 (External Commit): Blocked
 *
 * @module agents/permission-guard
 */

import { createAdminClient } from '@/lib/supabase/admin'

// SECURITY: Governance checks run in unattended agent contexts; service role is required.
const supabase = createAdminClient()

// ============================================================================
// TYPES
// ============================================================================

export enum ActionTier {
  EXECUTE = 1,
  PROPOSE = 2,
  COMMUNICATE = 3,
  SPEND = 4,
  EXTERNAL_COMMIT = 5
}

export interface PermissionResult {
  allowed: boolean
  requiresApproval: boolean
  requiresHumanReview: boolean
  requiresExplicitApproval: boolean
  isBlocked: boolean
  tier: string
  tierLevel: number
  reason: string
}

export interface ActionLogEntry {
  id?: string
  foundryId: string
  agentId?: string
  agentName?: string
  actionType: string
  actionDescription?: string
  status: 'pending' | 'approved' | 'rejected' | 'executed' | 'blocked'
  requiresApprovalFrom?: string
  approvedBy?: string
  approvedAt?: string
  details?: Record<string, unknown>
}

// ============================================================================
// ACTION CLASSIFICATIONS
// ============================================================================

/** Map action types to their required tier */
export const ACTION_TIER_MAP: Record<string, ActionTier> = {
  // Tier 1: Execute (always allowed)
  research_competitors: ActionTier.EXECUTE,
  research_market: ActionTier.EXECUTE,
  generate_report: ActionTier.EXECUTE,
  generate_document: ActionTier.EXECUTE,
  analyze_data: ActionTier.EXECUTE,
  optimize_process: ActionTier.EXECUTE,
  create_design_mockup: ActionTier.EXECUTE,

  // Tier 2: Propose (requires approval)
  create_objective: ActionTier.PROPOSE,
  create_task: ActionTier.PROPOSE,
  suggest_campaign: ActionTier.PROPOSE,
  draft_email: ActionTier.PROPOSE,
  generate_funding_package: ActionTier.PROPOSE,

  // Tier 3: Communicate (requires approval + human review)
  send_email: ActionTier.COMMUNICATE,
  post_social: ActionTier.COMMUNICATE,
  trigger_webhook: ActionTier.COMMUNICATE,
  create_public_content: ActionTier.COMMUNICATE,

  // Tier 4: Spend (requires explicit approval)
  process_payment: ActionTier.SPEND,
  create_subscription: ActionTier.SPEND,
  issue_refund: ActionTier.SPEND,
  modify_billing: ActionTier.SPEND,

  // Tier 5: External Commit (blocked)
  sign_contract: ActionTier.EXTERNAL_COMMIT,
  file_regulatory: ActionTier.EXTERNAL_COMMIT,
  commit_legal: ActionTier.EXTERNAL_COMMIT
}

/** Human-readable action names */
export const ACTION_DISPLAY_NAMES: Record<string, string> = {
  research_competitors: 'Research competitors',
  research_market: 'Research market trends',
  generate_report: 'Generate report',
  generate_document: 'Generate document',
  analyze_data: 'Analyze data',
  optimize_process: 'Optimize process',
  create_design_mockup: 'Create design mockup',
  create_objective: 'Create objective',
  create_task: 'Create task',
  suggest_campaign: 'Suggest marketing campaign',
  draft_email: 'Draft email',
  generate_funding_package: 'Generate funding package',
  send_email: 'Send email',
  post_social: 'Post to social media',
  trigger_webhook: 'Trigger webhook',
  create_public_content: 'Create public content',
  process_payment: 'Process payment',
  create_subscription: 'Create subscription',
  issue_refund: 'Issue refund',
  modify_billing: 'Modify billing',
  sign_contract: 'Sign contract',
  file_regulatory: 'File regulatory documents',
  commit_legal: 'Make legal commitment'
}

// ============================================================================
// PERMISSION CHECKING
// ============================================================================

/**
 * Check if an agent action is allowed
 *
 * @param actionType - The type of action being attempted
 * @param foundryId - The foundry context
 * @param agentId - The agent attempting the action (optional, for logging)
 * @returns Permission result with tier information
 */
export async function checkAgentPermission(
  actionType: string,
  foundryId: string,
  agentId?: string
): Promise<PermissionResult> {
  // Call the database function for accurate permission checking
  const { data, error } = await supabase.rpc('check_agent_permission', {
    p_action_type: actionType,
    p_foundry_id: foundryId,
    p_agent_id: agentId ?? null
  })

  if (error) {
    console.error('[PermissionGuard] Error checking permission:', error)
    // Default to blocked on error for safety
    return {
      allowed: false,
      requiresApproval: true,
      requiresHumanReview: true,
      requiresExplicitApproval: false,
      isBlocked: true,
      tier: 'error',
      tierLevel: 99,
      reason: 'Error checking permissions - defaulting to blocked'
    }
  }

  return {
    allowed: data.allowed,
    requiresApproval: data.requires_approval,
    requiresHumanReview: data.requires_human_review,
    requiresExplicitApproval: data.requires_explicit_approval,
    isBlocked: data.is_blocked,
    tier: data.tier,
    tierLevel: data.tier_level,
    reason: data.reason
  }
}

/**
 * Quick synchronous check using local tier map (for non-critical decisions)
 * Use checkAgentPermission() for authoritative checks
 */
export function quickCheckPermission(actionType: string): PermissionResult {
  const tier = ACTION_TIER_MAP[actionType]

  if (!tier) {
    return {
      allowed: false,
      requiresApproval: true,
      requiresHumanReview: false,
      requiresExplicitApproval: false,
      isBlocked: false,
      tier: 'unknown',
      tierLevel: 99,
      reason: 'Unknown action type - requires manual review'
    }
  }

  switch (tier) {
    case ActionTier.EXECUTE:
      return {
        allowed: true,
        requiresApproval: false,
        requiresHumanReview: false,
        requiresExplicitApproval: false,
        isBlocked: false,
        tier: 'execute',
        tierLevel: 1,
        reason: 'Action is always allowed'
      }

    case ActionTier.PROPOSE:
      return {
        allowed: true,
        requiresApproval: true,
        requiresHumanReview: false,
        requiresExplicitApproval: false,
        isBlocked: false,
        tier: 'propose',
        tierLevel: 2,
        reason: 'Action can proceed but requires approval'
      }

    case ActionTier.COMMUNICATE:
      return {
        allowed: false,
        requiresApproval: true,
        requiresHumanReview: true,
        requiresExplicitApproval: false,
        isBlocked: false,
        tier: 'communicate',
        tierLevel: 3,
        reason: 'Action requires human review before execution'
      }

    case ActionTier.SPEND:
      return {
        allowed: false,
        requiresApproval: true,
        requiresHumanReview: true,
        requiresExplicitApproval: true,
        isBlocked: false,
        tier: 'spend',
        tierLevel: 4,
        reason: 'Action requires explicit human approval'
      }

    case ActionTier.EXTERNAL_COMMIT:
      return {
        allowed: false,
        requiresApproval: false,
        requiresHumanReview: false,
        requiresExplicitApproval: false,
        isBlocked: true,
        tier: 'external_commit',
        tierLevel: 5,
        reason: 'Action is blocked - external commitments require human execution'
      }
  }
}

// ============================================================================
// ACTION LOGGING
// ============================================================================

/**
 * Log an agent action for audit trail
 */
export async function logAgentAction(
  entry: Omit<ActionLogEntry, 'id'>
): Promise<string | null> {
  const { data, error } = await supabase.rpc('log_agent_action', {
    p_foundry_id: entry.foundryId,
    p_agent_id: entry.agentId ?? null,
    p_agent_name: entry.agentName ?? null,
    p_action_type: entry.actionType,
    p_action_description: entry.actionDescription ?? null,
    p_status: entry.status,
    p_requires_approval_from: entry.requiresApprovalFrom ?? null,
    p_details: entry.details ?? {}
  })

  if (error) {
    console.error('[PermissionGuard] Error logging action:', error)
    return null
  }

  return data
}

// ============================================================================
// APPROVAL WORKFLOW
// ============================================================================

/**
 * Request approval for an agent action
 */
export async function requestAgentActionApproval(
  actionType: string,
  foundryId: string,
  agentId: string,
  agentName: string,
  details: Record<string, unknown> = {}
): Promise<{ requestId: string | null; requiresApproval: boolean; allowed: boolean }> {
  // Check permission
  const permission = await checkAgentPermission(actionType, foundryId, agentId)

  // If not allowed or doesn't need approval, return early
  if (!permission.allowed && !permission.requiresApproval) {
    return {
      requestId: null,
      requiresApproval: false,
      allowed: false
    }
  }

  // Log the action
  const logId = await logAgentAction({
    foundryId,
    agentId,
    agentName,
    actionType,
    actionDescription: ACTION_DISPLAY_NAMES[actionType] ?? actionType,
    status: permission.requiresApproval ? 'pending' : 'executed',
    requiresApprovalFrom: undefined, // Would be set to founder's user ID
    details
  })

  return {
    requestId: logId,
    requiresApproval: permission.requiresApproval,
    allowed: permission.allowed
  }
}

/**
 * Approve a pending agent action
 */
export async function approveAgentAction(
  actionLogId: string,
  approvedBy: string
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_action_log')
    .update({
      status: 'approved',
      approved_by: approvedBy,
      approved_at: new Date().toISOString()
    })
    .eq('id', actionLogId)
    .eq('status', 'pending')

  if (error) {
    console.error('[PermissionGuard] Error approving action:', error)
    return false
  }

  return true
}

/**
 * Reject a pending agent action
 */
export async function rejectAgentAction(
  actionLogId: string,
  rejectedBy: string,
  reason: string
): Promise<boolean> {
  const { error } = await supabase
    .from('agent_action_log')
    .update({
      status: 'rejected',
      approved_by: rejectedBy,
      approved_at: new Date().toISOString(),
      rejection_reason: reason
    })
    .eq('id', actionLogId)
    .eq('status', 'pending')

  if (error) {
    console.error('[PermissionGuard] Error rejecting action:', error)
    return false
  }

  return true
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Check if action type is Tier 1 (always allowed)
 */
export function isAlwaysAllowed(actionType: string): boolean {
  const tier = ACTION_TIER_MAP[actionType]
  return tier === ActionTier.EXECUTE
}

/**
 * Check if action type requires human review before execution
 */
export function requiresHumanReview(actionType: string): boolean {
  const permission = quickCheckPermission(actionType)
  return permission.requiresHumanReview
}

/**
 * Check if action type is blocked entirely
 */
export function isBlocked(actionType: string): boolean {
  const permission = quickCheckPermission(actionType)
  return permission.isBlocked
}

/**
 * Get display name for action type
 */
export function getActionDisplayName(actionType: string): string {
  return ACTION_DISPLAY_NAMES[actionType] ?? actionType
}
