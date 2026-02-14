/**
 * Agent Collaboration Hub
 *
 * Enables agents to:
 * - Send messages to each other
 * - Delegate tasks to other agents
 * - Collaborate on complex issues
 * - Report back findings
 *
 * @module agents/collaboration-hub
 */

import { supabase } from '@/lib/supabase/server'
import { logAgentAction } from './permission-guard'

// ============================================================================
// TYPES
// ============================================================================

export type MessageType = 'message' | 'delegation_request' | 'delegation_response' | 'info_request' | 'report_back'
export type ContributionType = 'contribution' | 'question' | 'finding' | 'vote' | 'synthesis' | 'reference'
export type DelegationType = 'task_assignment' | 'info_request' | 'collaboration' | 'review'
export type SessionStatus = 'active' | 'synthesizing' | 'completed' | 'cancelled'

export interface AgentMessage {
  id?: string
  foundryId: string
  fromAgentId: string
  fromAgentName: string
  toAgentId?: string
  toAgentName?: string
  messageType: MessageType
  content: string
  contextObjectiveId?: string
  contextTaskId?: string
  metadata?: Record<string, unknown>
}

export interface DelegationRequest {
  id?: string
  foundryId: string
  requestingAgentId: string
  requestingAgentName: string
  targetAgentId: string
  targetAgentName: string
  requestType: DelegationType
  title: string
  description?: string
  contextObjectiveId?: string
  contextTaskId?: string
}

export interface CollaborationSession {
  id?: string
  foundryId: string
  title: string
  description?: string
  initiatedByAgentId: string
  initiatedByAgentName: string
  status: SessionStatus
}

export interface CollaborationContribution {
  sessionId: string
  agentId: string
  agentName: string
  contributionType: ContributionType
  content: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// MESSAGING
// ============================================================================

/**
 * Send a message from one agent to another
 */
export async function sendAgentMessage(
  message: AgentMessage
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('agent_messages')
    .insert({
      foundry_id: message.foundryId,
      from_agent_id: message.fromAgentId,
      from_agent_name: message.fromAgentName,
      to_agent_id: message.toAgentId,
      to_agent_name: message.toAgentName,
      message_type: message.messageType,
      content: message.content,
      context_objective_id: message.contextObjectiveId,
      context_task_id: message.contextTaskId,
      metadata: message.metadata ?? {}
    })
    .select()
    .single()

  if (error) {
    console.error('[CollaborationHub] Error sending message:', error)
    return { success: false, error: error.message }
  }

  // Log the action
  await logAgentAction({
    foundryId: message.foundryId,
    agentId: message.fromAgentId,
    agentName: message.fromAgentName,
    actionType: 'agent_message',
    actionDescription: `Message to ${message.toAgentName}: ${message.content.substring(0, 50)}...`,
    status: 'executed',
    details: { messageType: message.messageType, toAgent: message.toAgentName }
  })

  return { success: true, id: data?.id }
}

/**
 * Get messages for an agent
 */
export async function getAgentMessages(
  agentId: string,
  limit: number = 50
): Promise<{ success: boolean; messages?: any[]; error?: string }> {
  const { data, error } = await supabase
    .from('agent_messages')
    .select('*')
    .or(`to_agent_id.eq.${agentId},from_agent_id.eq.${agentId}`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[CollaborationHub] Error getting messages:', error)
    return { success: false, error: error.message }
  }

  return { success: true, messages: data }
}

/**
 * Mark messages as read
 */
export async function markMessagesRead(
  agentId: string,
  messageIds: string[]
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agent_messages')
    .update({ is_read: true })
    .in('id', messageIds)
    .eq('to_agent_id', agentId)

  if (error) {
    console.error('[CollaborationHub] Error marking read:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get unread message count for an agent
 */
export async function getAgentUnreadCount(agentId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_agent_unread_count', {
    p_agent_id: agentId
  })

  if (error) {
    console.error('[CollaborationHub] Error getting unread count:', error)
    return 0
  }

  return data ?? 0
}

// ============================================================================
// DELEGATION
// ============================================================================

/**
 * Request delegation from another agent
 */
export async function requestDelegation(
  request: DelegationRequest
): Promise<{ success: boolean; id?: string; error?: string }> {
  // Log the delegation request
  await logAgentAction({
    foundryId: request.foundryId,
    agentId: request.requestingAgentId,
    agentName: request.requestingAgentName,
    actionType: 'delegation_request',
    actionDescription: `Delegation to ${request.targetAgentName}: ${request.title}`,
    status: 'pending',
    details: {
      targetAgent: request.targetAgentName,
      requestType: request.requestType,
      description: request.description
    }
  })

  const { data, error } = await supabase
    .from('agent_delegation_requests')
    .insert({
      foundry_id: request.foundryId,
      requesting_agent_id: request.requestingAgentId,
      requesting_agent_name: request.requestingAgentName,
      target_agent_id: request.targetAgentId,
      target_agent_name: request.targetAgentName,
      request_type: request.requestType,
      title: request.title,
      description: request.description,
      context_objective_id: request.contextObjectiveId,
      context_task_id: request.contextTaskId,
      status: 'pending'
    })
    .select()
    .single()

  if (error) {
    console.error('[CollaborationHub] Error requesting delegation:', error)
    return { success: false, error: error.message }
  }

  // Send notification message to target agent
  await sendAgentMessage({
    foundryId: request.foundryId,
    fromAgentId: request.requestingAgentId,
    fromAgentName: request.requestingAgentName,
    toAgentId: request.targetAgentId,
    toAgentName: request.targetAgentName,
    messageType: 'delegation_request',
    content: `New delegation request: ${request.title}\n\n${request.description || ''}`,
    contextObjectiveId: request.contextObjectiveId,
    contextTaskId: request.contextTaskId
  })

  return { success: true, id: data?.id }
}

/**
 * Respond to a delegation request
 */
export async function respondToDelegation(
  requestId: string,
  accepted: boolean,
  responseNote?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agent_delegation_requests')
    .update({
      status: accepted ? 'accepted' : 'rejected',
      response_note: responseNote,
      responded_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) {
    console.error('[CollaborationHub] Error responding to delegation:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Get pending delegation requests for an agent
 */
export async function getPendingDelegations(
  agentId: string
): Promise<{ success: boolean; delegations?: any[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_pending_delegations', {
    p_agent_id: agentId
  })

  if (error) {
    console.error('[CollaborationHub] Error getting pending delegations:', error)
    return { success: false, error: error.message }
  }

  return { success: true, delegations: data }
}

// ============================================================================
// COLLABORATION SESSIONS
// ============================================================================

/**
 * Start a collaboration session
 */
export async function startCollaboration(
  session: CollaborationSession,
  initialContributions?: CollaborationContribution[]
): Promise<{ success: boolean; id?: string; error?: string }> {
  // Log the collaboration start
  await logAgentAction({
    foundryId: session.foundryId,
    agentId: session.initiatedByAgentId,
    agentName: session.initiatedByAgentName,
    actionType: 'start_collaboration',
    actionDescription: `Started collaboration: ${session.title}`,
    status: 'executed',
    details: { description: session.description }
  })

  const { data, error } = await supabase
    .from('agent_collaboration_sessions')
    .insert({
      foundry_id: session.foundryId,
      title: session.title,
      description: session.description,
      initiated_by_agent_id: session.initiatedByAgentId,
      initiated_by_agent_name: session.initiatedByAgentName,
      status: 'active'
    })
    .select()
    .single()

  if (error) {
    console.error('[CollaborationHub] Error starting collaboration:', error)
    return { success: false, error: error.message }
  }

  const sessionId = data?.id

  // Add initial contributions if provided
  if (initialContributions && sessionId) {
    for (const contrib of initialContributions) {
      await addContribution({
        ...contrib,
        sessionId
      })
    }
  }

  return { success: true, id: sessionId }
}

/**
 * Add a contribution to a collaboration session
 */
export async function addContribution(
  contribution: CollaborationContribution
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { data, error } = await supabase
    .from('agent_collaboration_contributions')
    .insert({
      session_id: contribution.sessionId,
      agent_id: contribution.agentId,
      agent_name: contribution.agentName,
      contribution_type: contribution.contributionType,
      content: contribution.content,
      metadata: contribution.metadata ?? {}
    })
    .select()
    .single()

  if (error) {
    console.error('[CollaborationHub] Error adding contribution:', error)
    return { success: false, error: error.message }
  }

  return { success: true, id: data?.id }
}

/**
 * Get active collaboration sessions for a foundry
 */
export async function getActiveCollaborations(
  foundryId: string
): Promise<{ success: boolean; sessions?: any[]; error?: string }> {
  const { data, error } = await supabase.rpc('get_active_collaborations', {
    p_foundry_id: foundryId
  })

  if (error) {
    console.error('[CollaborationHub] Error getting active collaborations:', error)
    return { success: false, error: error.message }
  }

  return { success: true, sessions: data }
}

/**
 * Get contributions for a session
 */
export async function getSessionContributions(
  sessionId: string
): Promise<{ success: boolean; contributions?: any[]; error?: string }> {
  const { data, error } = await supabase
    .from('agent_collaboration_contributions')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[CollaborationHub] Error getting contributions:', error)
    return { success: false, error: error.message }
  }

  return { success: true, contributions: data }
}

/**
 * Complete a collaboration session with synthesis
 */
export async function completeCollaboration(
  sessionId: string,
  summary: string,
  artifactId?: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('agent_collaboration_sessions')
    .update({
      status: 'completed',
      result_summary: summary,
      result_artifact_id: artifactId,
      completed_at: new Date().toISOString()
    })
    .eq('id', sessionId)
    .eq('status', 'active')

  if (error) {
    console.error('[CollaborationHub] Error completing collaboration:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Report back findings from an agent to another
 */
export async function reportBack(
  foundryId: string,
  fromAgentId: string,
  fromAgentName: string,
  toAgentId: string,
  toAgentName: string,
  content: string,
  contextObjectiveId?: string,
  contextTaskId?: string
): Promise<{ success: boolean; error?: string }> {
  return sendAgentMessage({
    foundryId,
    fromAgentId,
    fromAgentName,
    toAgentId,
    toAgentName,
    messageType: 'report_back',
    content,
    contextObjectiveId,
    contextTaskId
  })
}

/**
 * Request information from another agent
 */
export async function requestInfo(
  foundryId: string,
  fromAgentId: string,
  fromAgentName: string,
  toAgentId: string,
  toAgentName: string,
  question: string,
  contextObjectiveId?: string
): Promise<{ success: boolean; error?: string }> {
  return sendAgentMessage({
    foundryId,
    fromAgentId,
    fromAgentName,
    toAgentId,
    toAgentName,
    messageType: 'info_request',
    content: question,
    contextObjectiveId
  })
}
