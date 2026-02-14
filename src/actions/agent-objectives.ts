'use server'

/**
 * Agent Objectives and Tasks Creation
 *
 * @description Server actions that allow AI agents to create objectives and tasks.
 * All actions go through the permission guard to enforce governance tiers.
 *
 * Agents can:
 * - Create objectives (Tier 2 - requires approval by default)
 * - Create tasks (Tier 2 - requires approval by default)
 * - Execute directly if explicitly approved
 *
 * @module actions/agent-objectives
 */

import { revalidatePath } from 'next/cache'
import { Database } from '@/types/database.types'
import {
  checkAgentPermission,
  logAgentAction,
  isAlwaysAllowed,
  ActionTier,
  quickCheckPermission,
  type PermissionResult
} from '@/lib/agents/permission-guard'
import { withRetry } from '@/lib/retry'

type SupabaseClient = Database

// ============================================================================
// TYPES
// ============================================================================

export interface AgentObjectiveInput {
  title: string
  description?: string
  foundryId: string
  agentId: string
  agentName: string
  parentObjectiveId?: string
}

export interface AgentTaskInput {
  title: string
  objectiveId: string
  foundryId: string
  agentId: string
  agentName: string
  description?: string
  assigneeId?: string
  dueDate?: string
}

export interface AgentActionResult {
  success: boolean
  id?: string
  requiresApproval?: boolean
  error?: string
  permissionResult?: PermissionResult
}

// ============================================================================
// PERMISSION HELPERS
// ============================================================================

/**
 * Check if agent can create objectives
 */
async function checkObjectivePermission(
  foundryId: string,
  agentId: string
): Promise<PermissionResult> {
  return checkAgentPermission('create_objective', foundryId, agentId)
}

/**
 * Check if agent can create tasks
 */
async function checkTaskPermission(
  foundryId: string,
  agentId: string
): Promise<PermissionResult> {
  return checkAgentPermission('create_task', foundryId, agentId)
}

// ============================================================================
// AGENT OBJECTIVE CREATION
// ============================================================================

/**
 * Creates a new objective proposed by an AI agent
 *
 * @description Agents can propose objectives. By default, they require human approval
 * before becoming active. If the agent has been granted elevated permissions,
 * the objective may be created directly.
 *
 * @param input - Objective creation data
 * @returns Result with objective ID if successful
 *
 * @security
 * - Validates agent permission tier
 * - Logs all actions to agent_action_log
 * - Objectives require approval unless agent has elevated permissions
 *
 * @audit Logs create_objective action to agent_action_log
 */
export async function createAgentObjective(
  input: AgentObjectiveInput
): Promise<AgentActionResult> {
  const { title, description, foundryId, agentId, agentName, parentObjectiveId } = input

  // Validate required fields
  if (!title?.trim()) {
    return { success: false, error: 'Title is required' }
  }
  if (!foundryId) {
    return { success: false, error: 'Foundry ID is required' }
  }
  if (!agentId) {
    return { success: false, error: 'Agent ID is required' }
  }

  // Check permission
  const permission = await checkObjectivePermission(foundryId, agentId)

  // Log the action attempt
  await logAgentAction({
    foundryId,
    agentId,
    agentName,
    actionType: 'create_objective',
    actionDescription: `Propose objective: ${title}`,
    status: permission.allowed && !permission.requiresApproval ? 'executed' : 'pending',
    details: {
      title,
      description: description?.substring(0, 500),
      parentObjectiveId
    }
  })

  // If blocked, return error
  if (permission.isBlocked) {
    return {
      success: false,
      error: `Action blocked: ${permission.reason}`,
      permissionResult: permission
    }
  }

  // If requires approval, create as pending
  if (permission.requiresApproval) {
    const pendingResult = await createObjectivePending(input, permission)

    return {
      success: true,
      id: pendingResult.id,
      requiresApproval: true,
      permissionResult: permission
    }
  }

  // Otherwise, create directly (elevated permissions)
  const directResult = await createObjectiveDirect(input, permission)

  return {
    success: directResult.success,
    id: directResult.id,
    requiresApproval: false,
    error: directResult.error,
    permissionResult: permission
  }
}

/**
 * Create objective requiring human approval
 */
async function createObjectivePending(
  input: AgentObjectiveInput,
  permission: PermissionResult
): Promise<{ id: string | null; success: boolean; error?: string }> {
  const { title, description, foundryId, agentId, parentObjectiveId } = input

  try {
    const { data, error } = await withRetry(async () => {
      return await (await import('@/lib/supabase/server'))
        .supabase.from('objectives')
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          foundry_id: foundryId,
          creator_id: agentId, // Use agent as creator for tracking
          created_by_agent_id: agentId,
          parent_objective_id: parentObjectiveId || null,
          // Default to In Progress but marked as agent-created
          status: 'In Progress',
          agent_approved: false // Requires approval
        })
        .select()
        .single()
    })

    if (error) {
      console.error('[AgentObjectives] Error creating pending objective:', error)
      return { id: null, success: false, error: error.message }
    }

    return { id: data?.id || null, success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception creating pending objective:', err)
    return { id: null, success: false, error: 'Failed to create objective' }
  }
}

/**
 * Create objective directly (elevated permissions)
 */
async function createObjectiveDirect(
  input: AgentObjectiveInput,
  permission: PermissionResult
): Promise<{ id: string | null; success: boolean; error?: string }> {
  const { title, description, foundryId, agentId, parentObjectiveId } = input

  try {
    const { data, error } = await withRetry(async () => {
      return await (await import('@/lib/supabase/server'))
        .supabase.from('objectives')
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          foundry_id: foundryId,
          creator_id: agentId,
          created_by_agent_id: agentId,
          owner_agent_id: agentId,
          parent_objective_id: parentObjectiveId || null,
          status: 'In Progress',
          agent_approved: true // Approved by default for elevated agents
        })
        .select()
        .single()
    })

    if (error) {
      console.error('[AgentObjectives] Error creating direct objective:', error)
      return { id: null, success: false, error: error.message }
    }

    return { id: data?.id || null, success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception creating direct objective:', err)
    return { id: null, success: false, error: 'Failed to create objective' }
  }
}

// ============================================================================
// AGENT TASK CREATION
// ============================================================================

/**
 * Creates a new task proposed by an AI agent
 *
 * @description Agents can propose tasks under objectives. By default, they require
 * human approval before becoming active.
 *
 * @param input - Task creation data
 * @returns Result with task ID if successful
 *
 * @security
 * - Validates agent permission tier
 * - Logs all actions to agent_action_log
 * - Tasks require approval unless agent has elevated permissions
 *
 * @audit Logs create_task action to agent_action_log
 */
export async function createAgentTask(
  input: AgentTaskInput
): Promise<AgentActionResult> {
  const {
    title,
    objectiveId,
    foundryId,
    agentId,
    agentName,
    description,
    assigneeId,
    dueDate
  } = input

  // Validate required fields
  if (!title?.trim()) {
    return { success: false, error: 'Title is required' }
  }
  if (!objectiveId) {
    return { success: false, error: 'Objective ID is required' }
  }
  if (!foundryId) {
    return { success: false, error: 'Foundry ID is required' }
  }
  if (!agentId) {
    return { success: false, error: 'Agent ID is required' }
  }

  // Check permission
  const permission = await checkTaskPermission(foundryId, agentId)

  // Log the action attempt
  await logAgentAction({
    foundryId,
    agentId,
    agentName,
    actionType: 'create_task',
    actionDescription: `Propose task: ${title}`,
    status: permission.allowed && !permission.requiresApproval ? 'executed' : 'pending',
    details: {
      title,
      objectiveId,
      description: description?.substring(0, 500),
      assigneeId,
      dueDate
    }
  })

  // If blocked, return error
  if (permission.isBlocked) {
    return {
      success: false,
      error: `Action blocked: ${permission.reason}`,
      permissionResult: permission
    }
  }

  // If requires approval, create as pending
  if (permission.requiresApproval) {
    const pendingResult = await createTaskPending(input, permission)

    return {
      success: true,
      id: pendingResult.id,
      requiresApproval: true,
      permissionResult: permission
    }
  }

  // Otherwise, create directly (elevated permissions)
  const directResult = await createTaskDirect(input, permission)

  return {
    success: directResult.success,
    id: directResult.id,
    requiresApproval: false,
    error: directResult.error,
    permissionResult: permission
  }
}

/**
 * Create task requiring human approval
 */
async function createTaskPending(
  input: AgentTaskInput,
  permission: PermissionResult
): Promise<{ id: string | null; success: boolean; error?: string }> {
  const { title, objectiveId, foundryId, agentId, description, assigneeId, dueDate } = input

  try {
    const { data, error } = await withRetry(async () => {
      return await (await import('@/lib/supabase/server'))
        .supabase.from('tasks')
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          objective_id: objectiveId,
          foundry_id: foundryId,
          creator_id: agentId,
          created_by_agent_id: agentId,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          // Default status - approval
          status: 'Pending',
          agent_approved: false
        })
        .select()
        .single()
    })

    if (error) {
      console.error('[AgentObjectives] Error creating pending task:', error)
      return { id: null, success: false, error: error.message }
    }

    return { id: data?.id || null, success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception creating pending task:', err)
    return { id: null, success: false, error: 'Failed to create task' }
  }
}

/**
 * Create task directly (elevated permissions)
 */
async function createTaskDirect(
  input: AgentTaskInput,
  permission: PermissionResult
): Promise<{ id: string | null; success: boolean; error?: string }> {
  const { title, objectiveId, foundryId, agentId, description, assigneeId, dueDate } = input

  try {
    const { data, error } = await withRetry(async () => {
      return await (await import('@/lib/supabase/server'))
        .supabase.from('tasks')
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          objective_id: objectiveId,
          foundry_id: foundryId,
          creator_id: agentId,
          created_by_agent_id: agentId,
          owner_agent_id: agentId,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          status: 'Pending',
          agent_approved: true // Approved by default for elevated agents
        })
        .select()
        .single()
    })

    if (error) {
      console.error('[AgentObjectives] Error creating direct task:', error)
      return { id: null, success: false, error: error.message }
    }

    return { id: data?.id || null, success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception creating direct task:', err)
    return { id: null, success: false, error: 'Failed to create task' }
  }
}

// ============================================================================
// APPROVAL ACTIONS
// ============================================================================

/**
 * Approve an agent-created objective
 */
export async function approveAgentObjective(
  objectiveId: string,
  approvedBy: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (await import('@/lib/supabase/server'))
      .supabase
      .from('objectives')
      .update({
        agent_approved: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', objectiveId)
      .eq('agent_approved', false)

    if (error) {
      return { success: false, error: error.message }
    }

    // Revalidate
    revalidatePath('/objectives')
    revalidatePath('/today')

    return { success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception approving objective:', err)
    return { success: false, error: 'Failed to approve objective' }
  }
}

/**
 * Reject an agent-created objective
 */
export async function rejectAgentObjective(
  objectiveId: string,
  rejectedBy: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (await import('@/lib/supabase/server'))
      .supabase
      .from('objectives')
      .update({
        status: 'Rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', objectiveId)
      .eq('agent_approved', false)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/objectives')

    return { success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception rejecting objective:', err)
    return { success: false, error: 'Failed to reject objective' }
  }
}

/**
 * Approve an agent-created task
 */
export async function approveAgentTask(
  taskId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (await import('@/lib/supabase/server'))
      .supabase
      .from('tasks')
      .update({
        agent_approved: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('agent_approved', false)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/tasks')
    revalidatePath('/today')

    return { success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception approving task:', err)
    return { success: false, error: 'Failed to approve task' }
  }
}

/**
 * Reject an agent-created task
 */
export async function rejectAgentTask(
  taskId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (await import('@/lib/supabase/server'))
      .supabase
      .from('tasks')
      .update({
        status: 'Rejected',
        updated_at: new Date().toISOString()
      })
      .eq('id', taskId)
      .eq('agent_approved', false)

    if (error) {
      return { success: false, error: error.message }
    }

    revalidatePath('/tasks')

    return { success: true }
  } catch (err) {
    console.error('[AgentObjectives] Exception rejecting task:', err)
    return { success: false, error: 'Failed to reject task' }
  }
}
