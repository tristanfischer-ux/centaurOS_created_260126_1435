'use server'

/**
 * @file agent-artifacts.ts
 *
 * @description Server actions for managing agent workflow runs and artifacts.
 * Artifacts are first-class documents produced by workflow executions.
 * Users can browse, search, export, share, and send artifacts to external tools.
 *
 * @security All operations require authentication and enforce foundry isolation
 * via RLS policies. Only the creator can update/delete their own artifacts.
 *
 * @related
 * - supabase/migrations/20260211000000_agent_artifacts.sql - Schema
 * - src/app/(platform)/agents/artifacts/page.tsx - Listing page
 * - src/app/(platform)/agents/agents-workflow-view.tsx - Creates artifacts on chain completion
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage, isValidUUID } from '@/lib/security/sanitize'
import { getGoogleClient } from '@/lib/google/client'
import { google } from 'googleapis'
import type { Json } from '@/types/database.types'

/**
 * SECURITY: Sanitize a string for use in PostgREST filter expressions.
 * Escapes ilike wildcards (%, _) and strips PostgREST control characters.
 */
function sanitizeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/[\n\r\t]/g, ' ')
    .replace(/[,()\."*:!'[\]{}]/g, '')
}

// ============================================================================
// TYPES
// ============================================================================

/** Content types for artifacts */
export type ArtifactContentType = 'document' | 'email' | 'report' | 'presentation' | 'checklist'

/** Database row shape for agent_workflow_runs */
export interface AgentWorkflowRunRow {
  id: string
  workflow_id: string | null
  foundry_id: string
  run_by: string | null
  status: 'running' | 'completed' | 'failed' | 'partial'
  workflow_name: string
  node_count: number
  nodes_completed: number
  node_outputs: unknown[]
  started_at: string
  completed_at: string | null
  created_at: string
}

/** Database row shape for agent_artifacts */
export interface AgentArtifactRow {
  id: string
  run_id: string | null
  workflow_id: string | null
  foundry_id: string
  created_by: string | null
  title: string
  content: string
  content_type: ArtifactContentType
  metadata: Record<string, unknown>
  is_starred: boolean
  shared_with: string[]
  is_shared_with_foundry: boolean
  version_number: number
  created_at: string
  updated_at: string
}

/** Database row shape for agent_artifact_versions */
export interface AgentArtifactVersionRow {
  id: string
  artifact_id: string
  foundry_id: string
  edited_by: string | null
  title: string
  content: string
  version_number: number
  change_summary: string | null
  created_at: string
}

/** Input for creating a workflow run */
export interface CreateRunInput {
  workflowId: string | null
  workflowName: string
  nodeCount: number
}

/** Input for creating an artifact */
export interface CreateArtifactInput {
  runId?: string | null
  workflowId?: string | null
  title: string
  content: string
  contentType?: ArtifactContentType
  metadata?: Record<string, unknown>
}

/** Filters for listing artifacts */
export interface ArtifactFilters {
  search?: string
  contentType?: ArtifactContentType
  starredOnly?: boolean
  workflowId?: string
  limit?: number
  offset?: number
}

// ============================================================================
// WORKFLOW RUN ACTIONS
// ============================================================================

/**
 * Create a new workflow run record.
 *
 * @param input - Run data (workflowId, name, nodeCount)
 * @returns The created run row
 * @security RLS enforces foundry isolation
 */
export async function createWorkflowRun(input: CreateRunInput): Promise<{
  data: AgentWorkflowRunRow | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No active foundry' }
  }

  const { data, error } = await supabase
    .from('agent_workflow_runs')
    .insert({
      workflow_id: input.workflowId || null,
      foundry_id: foundryId,
      run_by: user.id,
      status: 'running',
      workflow_name: input.workflowName || 'Untitled Workflow',
      node_count: input.nodeCount,
      nodes_completed: 0,
      node_outputs: [] as Json,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to create workflow run:', {
      userId: user.id,
      foundryId,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRunRow, error: null }
}

/**
 * Complete a workflow run with final outputs.
 *
 * @param runId - UUID of the run to complete
 * @param status - Final status (completed, failed, partial)
 * @param nodeOutputs - Snapshot of all node outputs
 * @param nodesCompleted - Number of nodes that completed
 * @returns The updated run row
 * @security RLS enforces ownership
 */
export async function completeWorkflowRun(
  runId: string,
  status: 'completed' | 'failed' | 'partial',
  nodeOutputs: unknown[],
  nodesCompleted: number
): Promise<{ data: AgentWorkflowRunRow | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_workflow_runs')
    .update({
      status,
      node_outputs: nodeOutputs as unknown as Json,
      nodes_completed: nodesCompleted,
      completed_at: new Date().toISOString(),
    })
    .eq('id', runId)
    .select()
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to complete workflow run:', {
      runId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRunRow, error: null }
}

/**
 * Get workflow runs for a specific workflow (run history).
 *
 * @param workflowId - UUID of the workflow
 * @param limit - Max runs to return (default 20)
 * @returns Run history ordered by most recent first
 * @security RLS enforces foundry isolation
 */
export async function getWorkflowRuns(
  workflowId: string,
  limit: number = 20
): Promise<{ data: AgentWorkflowRunRow[] | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_workflow_runs')
    .select('*')
    .eq('workflow_id', workflowId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[AgentArtifacts] Failed to fetch workflow runs:', {
      workflowId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRunRow[], error: null }
}

// ============================================================================
// ARTIFACT ACTIONS
// ============================================================================

/**
 * Create a new artifact from workflow output.
 *
 * @description Called automatically when a workflow chain completes.
 * Stores the combined output as a first-class document.
 *
 * @param input - Artifact data (title, content, type, metadata)
 * @returns The created artifact row
 * @security RLS enforces foundry isolation
 * @audit Artifact creation tracked via created_at
 */
export async function createArtifact(input: CreateArtifactInput): Promise<{
  data: AgentArtifactRow | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No active foundry' }
  }

  // VALIDATION: Title and content required
  if (!input.title?.trim()) {
    return { data: null, error: 'Artifact title is required' }
  }

  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('agent_artifacts')
    .insert({
      run_id: input.runId || null,
      workflow_id: input.workflowId || null,
      foundry_id: foundryId,
      created_by: user.id,
      title: input.title.trim(),
      content: input.content || '',
      content_type: input.contentType || 'document',
      metadata: (input.metadata || {}) as unknown as Json,
      is_starred: false,
      version_number: 1,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to create artifact:', {
      userId: user.id,
      foundryId,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  console.info('[AgentArtifacts] Artifact created:', {
    artifactId: (data as { id: string }).id,
    title: input.title.trim(),
    contentType: input.contentType || 'document',
    foundryId,
  })

  return { data: data as unknown as AgentArtifactRow, error: null }
}

/**
 * List artifacts for the current user's foundry with optional filters.
 *
 * @param filters - Search, content type, starred, pagination
 * @returns Filtered artifacts ordered by most recent first
 * @security RLS enforces foundry isolation
 */
export async function getArtifacts(filters?: ArtifactFilters): Promise<{
  data: AgentArtifactRow[] | null
  error: string | null
  total: number
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated', total: 0 }
  }

  let query = supabase
    .from('agent_artifacts')
    .select('*', { count: 'exact' })

  // Filter by content type
  if (filters?.contentType) {
    query = query.eq('content_type', filters.contentType)
  }

  // Filter starred only
  if (filters?.starredOnly) {
    query = query.eq('is_starred', true)
  }

  // Filter by workflow
  if (filters?.workflowId) {
    query = query.eq('workflow_id', filters.workflowId)
  }

  // Full-text search on title
  if (filters?.search?.trim()) {
    query = query.ilike('title', `%${sanitizeFilterValue(filters.search.trim())}%`)
  }

  // Pagination
  const limit = filters?.limit || 50
  const offset = filters?.offset || 0

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query

  if (error) {
    console.error('[AgentArtifacts] Failed to fetch artifacts:', {
      userId: user.id,
      filters,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error), total: 0 }
  }

  return { data: data as unknown as AgentArtifactRow[], error: null, total: count || 0 }
}

/**
 * Get a single artifact by ID.
 *
 * @param artifactId - UUID of the artifact
 * @returns The artifact row or null
 * @security RLS enforces foundry isolation
 */
export async function getArtifact(artifactId: string): Promise<{
  data: AgentArtifactRow | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  if (!artifactId) {
    return { data: null, error: 'Artifact ID is required' }
  }

  const { data, error } = await supabase
    .from('agent_artifacts')
    .select('*')
    .eq('id', artifactId)
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to fetch artifact:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentArtifactRow, error: null }
}

/**
 * Update an artifact (title, content, metadata, starred).
 *
 * @param artifactId - UUID of the artifact to update
 * @param updates - Partial artifact data to update
 * @returns The updated artifact row
 * @security RLS enforces ownership (only creator can update)
 */
export async function updateArtifact(
  artifactId: string,
  updates: {
    title?: string
    content?: string
    contentType?: ArtifactContentType
    metadata?: Record<string, unknown>
    is_starred?: boolean
  }
): Promise<{ data: AgentArtifactRow | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // SECURITY: Validate artifact UUID format
  if (!isValidUUID(artifactId)) {
    return { data: null, error: 'Invalid artifact ID' }
  }

  // SECURITY: Verify foundry membership
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'User not in a foundry' }
  }

  // SECURITY: Verify ownership and foundry isolation
  const { data: artifact, error: fetchError } = await supabase
    .from('agent_artifacts')
    .select('id, created_by, foundry_id')
    .eq('id', artifactId)
    .single()

  if (fetchError || !artifact) {
    return { data: null, error: 'Artifact not found' }
  }

  if (artifact.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to update artifact:', {
      artifactId, userId: user.id, ownerId: artifact.created_by,
    })
    return { data: null, error: 'You can only update your own artifacts' }
  }

  if (artifact.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on update attempt:', {
      artifactId, userFoundry: foundryId, artifactFoundry: artifact.foundry_id,
    })
    return { data: null, error: 'Artifact not found' }
  }

  // Build update object — only include provided fields
  const updateData: {
    updated_at: string
    title?: string
    content?: string
    content_type?: string
    metadata?: Json
    is_starred?: boolean
  } = {
    updated_at: new Date().toISOString(),
  }

  if (updates.title !== undefined) updateData.title = updates.title.trim()
  if (updates.content !== undefined) updateData.content = updates.content
  if (updates.contentType !== undefined) updateData.content_type = updates.contentType
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata as unknown as Json
  if (updates.is_starred !== undefined) updateData.is_starred = updates.is_starred

  const { data, error } = await supabase
    .from('agent_artifacts')
    .update(updateData)
    .eq('id', artifactId)
    .select()
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to update artifact:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentArtifactRow, error: null }
}

/**
 * Toggle starred status on an artifact.
 *
 * @param artifactId - UUID of the artifact
 * @returns Updated starred status
 * @security RLS enforces ownership
 */
export async function toggleArtifactStar(artifactId: string): Promise<{
  isStarred: boolean
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { isStarred: false, error: 'Not authenticated' }
  }

  // SECURITY: Validate artifact UUID format
  if (!isValidUUID(artifactId)) {
    return { isStarred: false, error: 'Invalid artifact ID' }
  }

  // SECURITY: Verify foundry membership
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { isStarred: false, error: 'User not in a foundry' }
  }

  // Fetch current state + ownership columns
  const { data: current } = await supabase
    .from('agent_artifacts')
    .select('is_starred, created_by, foundry_id')
    .eq('id', artifactId)
    .single()

  if (!current) {
    return { isStarred: false, error: 'Artifact not found' }
  }

  // SECURITY: Verify ownership and foundry isolation
  if (current.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to toggle star:', {
      artifactId, userId: user.id, ownerId: current.created_by,
    })
    return { isStarred: false, error: 'You can only star your own artifacts' }
  }

  if (current.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on star toggle:', {
      artifactId, userFoundry: foundryId, artifactFoundry: current.foundry_id,
    })
    return { isStarred: false, error: 'Artifact not found' }
  }

  const newStarred = !current.is_starred

  const { error } = await supabase
    .from('agent_artifacts')
    .update({ is_starred: newStarred, updated_at: new Date().toISOString() })
    .eq('id', artifactId)

  if (error) {
    console.error('[AgentArtifacts] Failed to toggle star:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { isStarred: !newStarred, error: sanitizeErrorMessage(error) }
  }

  return { isStarred: newStarred, error: null }
}

/**
 * Delete an artifact.
 *
 * @param artifactId - UUID of the artifact to delete
 * @security RLS enforces ownership (only creator can delete)
 */
export async function deleteArtifact(artifactId: string): Promise<{
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // SECURITY: Validate artifact UUID format
  if (!isValidUUID(artifactId)) {
    return { error: 'Invalid artifact ID' }
  }

  // SECURITY: Verify foundry membership
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'User not in a foundry' }
  }

  // SECURITY: Verify ownership and foundry isolation
  const { data: artifact, error: fetchError } = await supabase
    .from('agent_artifacts')
    .select('id, created_by, foundry_id')
    .eq('id', artifactId)
    .single()

  if (fetchError || !artifact) {
    return { error: 'Artifact not found' }
  }

  if (artifact.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to delete artifact:', {
      artifactId, userId: user.id, ownerId: artifact.created_by,
    })
    return { error: 'You can only delete your own artifacts' }
  }

  if (artifact.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on delete attempt:', {
      artifactId, userFoundry: foundryId, artifactFoundry: artifact.foundry_id,
    })
    return { error: 'Artifact not found' }
  }

  const { error } = await supabase
    .from('agent_artifacts')
    .delete()
    .eq('id', artifactId)

  if (error) {
    console.error('[AgentArtifacts] Failed to delete artifact:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { error: sanitizeErrorMessage(error) }
  }

  return { error: null }
}

/**
 * Delete multiple artifacts in a single operation.
 *
 * @description Bulk-deletes artifacts by their IDs. Only artifacts the user
 * owns (enforced by RLS) will actually be removed.
 *
 * @param artifactIds - Array of artifact UUIDs to delete
 * @returns Count of deleted artifacts and any error
 * @security RLS enforces ownership (only creator can delete)
 * @audit Logs bulk deletion with count and IDs
 */
export async function deleteArtifacts(artifactIds: string[]): Promise<{
  deletedCount: number
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { deletedCount: 0, error: 'Not authenticated' }
  }

  // VALIDATION: At least one ID required
  if (!artifactIds.length) {
    return { deletedCount: 0, error: 'No artifact IDs provided' }
  }

  // VALIDATION: Cap batch size to prevent abuse
  const MAX_BATCH_SIZE = 100
  if (artifactIds.length > MAX_BATCH_SIZE) {
    return { deletedCount: 0, error: `Cannot delete more than ${MAX_BATCH_SIZE} artifacts at once` }
  }

  // SECURITY: Validate all UUIDs
  if (artifactIds.some(id => !isValidUUID(id))) {
    return { deletedCount: 0, error: 'Invalid artifact ID in batch' }
  }

  // SECURITY: Verify foundry membership
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { deletedCount: 0, error: 'User not in a foundry' }
  }

  // SECURITY: Verify ownership and foundry isolation for ALL artifacts
  const { data: artifacts, error: fetchError } = await supabase
    .from('agent_artifacts')
    .select('id, created_by, foundry_id')
    .in('id', artifactIds)

  if (fetchError) {
    return { deletedCount: 0, error: 'Failed to verify artifact ownership' }
  }

  if (!artifacts || artifacts.length !== artifactIds.length) {
    return { deletedCount: 0, error: 'One or more artifacts not found' }
  }

  const unauthorizedArtifact = artifacts.find(
    a => a.created_by !== user.id || a.foundry_id !== foundryId
  )
  if (unauthorizedArtifact) {
    console.warn('[AgentArtifacts] Unauthorized bulk delete attempt:', {
      userId: user.id, foundryId,
      unauthorizedId: unauthorizedArtifact.id,
      ownerId: unauthorizedArtifact.created_by,
    })
    return { deletedCount: 0, error: 'You can only delete your own artifacts' }
  }

  const { error, count } = await supabase
    .from('agent_artifacts')
    .delete({ count: 'exact' })
    .in('id', artifactIds)

  if (error) {
    console.error('[AgentArtifacts] Failed to bulk delete artifacts:', {
      userId: user.id,
      requestedCount: artifactIds.length,
      error: error.message,
    })
    return { deletedCount: 0, error: sanitizeErrorMessage(error) }
  }

  // AUDIT: Log bulk deletion
  console.info('[AgentArtifacts] Bulk deleted artifacts:', {
    userId: user.id,
    deletedCount: count ?? 0,
    requestedCount: artifactIds.length,
  })

  return { deletedCount: count ?? 0, error: null }
}

// ============================================================================
// PHASE 2: EXTERNAL INTEGRATIONS
// ============================================================================

/**
 * Export an artifact to Google Docs.
 *
 * @description Creates a new Google Doc with the artifact's content.
 * Requires the user to have connected their Google account.
 *
 * @param artifactId - UUID of the artifact to export
 * @returns The Google Doc URL or error
 * @security Requires authenticated user with Google OAuth connected
 */
export async function exportArtifactToGoogleDocs(artifactId: string): Promise<{
  docUrl: string | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { docUrl: null, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { docUrl: null, error: 'No active foundry' }
  }

  // Fetch the artifact
  const { data: artifact, error: fetchError } = await getArtifact(artifactId)
  if (fetchError || !artifact) {
    return { docUrl: null, error: fetchError || 'Artifact not found' }
  }

  // Get Google client
  const client = await getGoogleClient(user.id, foundryId)
  if (!client) {
    return { docUrl: null, error: 'Google account not connected. Please connect in Settings.' }
  }

  try {
    const docs = google.docs({ version: 'v1', auth: client })

    // Create a new Google Doc
    const createRes = await docs.documents.create({
      requestBody: {
        title: artifact.title,
      },
    })

    const docId = createRes.data.documentId
    if (!docId) {
      return { docUrl: null, error: 'Failed to create Google Doc' }
    }

    // Insert the artifact content into the doc
    // We insert as plain text (Google Docs doesn't accept markdown natively)
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          {
            insertText: {
              location: { index: 1 },
              text: artifact.content,
            },
          },
        ],
      },
    })

    const docUrl = `https://docs.google.com/document/d/${docId}/edit`

    // Update artifact metadata to track the export
    await updateArtifact(artifactId, {
      metadata: {
        ...artifact.metadata,
        googleDocUrl: docUrl,
        googleDocId: docId,
        exportedToGoogleAt: new Date().toISOString(),
      },
    })

    console.info('[AgentArtifacts] Exported artifact to Google Docs:', {
      artifactId,
      docId,
      userId: user.id,
    })

    return { docUrl, error: null }
  } catch (err) {
    console.error('[AgentArtifacts] Failed to export to Google Docs:', {
      artifactId,
      userId: user.id,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { docUrl: null, error: 'Failed to create Google Doc. Check your Google connection.' }
  }
}

/**
 * Create a shareable link for an artifact.
 *
 * @param artifactId - UUID of the artifact to share
 * @param expiresInDays - Number of days until the link expires (default 7)
 * @returns The public share URL or error
 * @security Requires authenticated user; only artifact access is checked via getArtifact RLS
 */
export async function createArtifactShareLink(
  artifactId: string,
  expiresInDays: number = 7
): Promise<{ shareUrl: string | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { shareUrl: null, error: 'Not authenticated' }
  }

  const { data: artifact, error: fetchError } = await getArtifact(artifactId)
  if (fetchError || !artifact) {
    return { shareUrl: null, error: fetchError || 'Artifact not found' }
  }

  const token = crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + expiresInDays)

  const { error: insertError } = await supabase
    .from('shared_artifacts')
    .insert({
      artifact_id: artifactId,
      share_token: token,
      created_by: user.id,
      expires_at: expiresAt.toISOString(),
    })

  if (insertError) {
    console.error('[AgentArtifacts] Failed to create share link:', { artifactId, error: insertError.message })
    return { shareUrl: null, error: 'Failed to create share link' }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL
    ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : ''
  const shareUrl = base ? `${base}/shared/${token}` : `/shared/${token}`

  return { shareUrl, error: null }
}

/**
 * Send an artifact as an email via Resend.
 *
 * @param artifactId - UUID of the artifact to send
 * @param recipients - Array of email addresses
 * @param subject - Email subject line
 * @returns Success status
 * @security Requires authenticated user
 */
export async function sendArtifactAsEmail(
  artifactId: string,
  recipients: string[],
  subject: string
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // VALIDATION: Recipients and subject required
  if (!recipients.length) {
    return { error: 'At least one recipient is required' }
  }
  if (!subject?.trim()) {
    return { error: 'Subject is required' }
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const invalidEmails = recipients.filter(e => !emailRegex.test(e))
  if (invalidEmails.length > 0) {
    return { error: `Invalid email addresses: ${invalidEmails.join(', ')}` }
  }

  // Fetch the artifact
  const { data: artifact, error: fetchError } = await getArtifact(artifactId)
  if (fetchError || !artifact) {
    return { error: fetchError || 'Artifact not found' }
  }

  // Import email sending dynamically to avoid circular deps
  const { sendEmail } = await import('@/lib/notifications/channels/email')

  // Send to each recipient individually (sendEmail expects a single address)
  const errors: string[] = []
  for (const recipient of recipients) {
    const result = await sendEmail({
      to: recipient,
      subject: subject.trim(),
      body: artifact.content,
    })

    if (result.error) {
      errors.push(`${recipient}: ${result.error}`)
    }
  }

  if (errors.length > 0) {
    console.error('[AgentArtifacts] Failed to send artifact email:', {
      artifactId,
      failedCount: errors.length,
      totalRecipients: recipients.length,
      errors,
    })
    return { error: `Failed to send to ${errors.length} recipient(s)` }
  }

  // Update artifact metadata to track the send
  await updateArtifact(artifactId, {
    metadata: {
      ...artifact.metadata,
      lastEmailSent: {
        to: recipients,
        subject: subject.trim(),
        sentAt: new Date().toISOString(),
      },
    },
  })

  console.info('[AgentArtifacts] Artifact sent as email:', {
    artifactId,
    recipients: recipients.length,
  })

  return { error: null }
}

// ============================================================================
// PHASE 3: VERSIONING
// ============================================================================

/**
 * Update artifact content and create a version record.
 *
 * @param artifactId - UUID of the artifact to update
 * @param content - New content
 * @param title - New title
 * @param changeSummary - Description of what changed
 * @returns Updated artifact
 * @security RLS enforces ownership
 */
export async function updateArtifactContent(
  artifactId: string,
  content: string,
  title: string,
  changeSummary?: string
): Promise<{ data: AgentArtifactRow | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // SECURITY: Validate artifact UUID format
  if (!isValidUUID(artifactId)) {
    return { data: null, error: 'Invalid artifact ID' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No active foundry' }
  }

  // Fetch current artifact to get version number
  const { data: current, error: fetchError } = await getArtifact(artifactId)
  if (fetchError || !current) {
    return { data: null, error: fetchError || 'Artifact not found' }
  }

  // SECURITY: Verify ownership and foundry isolation
  if (current.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to update artifact content:', {
      artifactId, userId: user.id, ownerId: current.created_by,
    })
    return { data: null, error: 'You can only update your own artifacts' }
  }

  if (current.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on content update:', {
      artifactId, userFoundry: foundryId, artifactFoundry: current.foundry_id,
    })
    return { data: null, error: 'Artifact not found' }
  }

  const newVersion = current.version_number + 1

  // Create version snapshot of the CURRENT state before updating
  const { error: versionError } = await supabase
    .from('agent_artifact_versions')
    .insert({
      artifact_id: artifactId,
      foundry_id: foundryId,
      edited_by: user.id,
      title: current.title,
      content: current.content,
      version_number: current.version_number,
      change_summary: changeSummary || null,
    })

  if (versionError) {
    console.error('[AgentArtifacts] Failed to create version:', {
      artifactId,
      error: versionError.message,
    })
    // Non-blocking — still update the artifact
  }

  // Update the artifact with new content
  const { data, error } = await supabase
    .from('agent_artifacts')
    .update({
      title: title.trim(),
      content,
      version_number: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq('id', artifactId)
    .select()
    .single()

  if (error) {
    console.error('[AgentArtifacts] Failed to update artifact content:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentArtifactRow, error: null }
}

/**
 * Get version history for an artifact.
 *
 * @param artifactId - UUID of the artifact
 * @returns Version history ordered by most recent first
 * @security RLS enforces foundry isolation
 */
export async function getArtifactVersions(artifactId: string): Promise<{
  data: AgentArtifactVersionRow[] | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_artifact_versions')
    .select('*')
    .eq('artifact_id', artifactId)
    .order('version_number', { ascending: false })

  if (error) {
    console.error('[AgentArtifacts] Failed to fetch versions:', {
      artifactId,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentArtifactVersionRow[], error: null }
}

/**
 * Restore an artifact to a previous version.
 *
 * @param artifactId - UUID of the artifact
 * @param versionId - UUID of the version to restore
 * @returns Updated artifact
 * @security RLS enforces ownership
 */
export async function restoreArtifactVersion(
  artifactId: string,
  versionId: string
): Promise<{ data: AgentArtifactRow | null; error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // SECURITY: Validate UUID formats
  if (!isValidUUID(artifactId) || !isValidUUID(versionId)) {
    return { data: null, error: 'Invalid ID' }
  }

  // SECURITY: Verify foundry membership
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'User not in a foundry' }
  }

  // SECURITY: Verify artifact ownership before allowing restore
  const { data: artifact, error: fetchError } = await supabase
    .from('agent_artifacts')
    .select('id, created_by, foundry_id')
    .eq('id', artifactId)
    .single()

  if (fetchError || !artifact) {
    return { data: null, error: 'Artifact not found' }
  }

  if (artifact.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to restore artifact version:', {
      artifactId, versionId, userId: user.id, ownerId: artifact.created_by,
    })
    return { data: null, error: 'You can only restore your own artifacts' }
  }

  if (artifact.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on version restore:', {
      artifactId, userFoundry: foundryId, artifactFoundry: artifact.foundry_id,
    })
    return { data: null, error: 'Artifact not found' }
  }

  // Fetch the version to restore
  const { data: version, error: versionError } = await supabase
    .from('agent_artifact_versions')
    .select('*')
    .eq('id', versionId)
    .eq('artifact_id', artifactId)
    .single()

  if (versionError || !version) {
    return { data: null, error: 'Version not found' }
  }

  // Update artifact content using the versioned update (which creates a new version snapshot)
  return updateArtifactContent(
    artifactId,
    (version as unknown as AgentArtifactVersionRow).content,
    (version as unknown as AgentArtifactVersionRow).title,
    `Restored to version ${(version as unknown as AgentArtifactVersionRow).version_number}`
  )
}

/**
 * Share an artifact with specific users or the entire foundry.
 *
 * @param artifactId - UUID of the artifact
 * @param userIds - Specific user IDs to share with
 * @param shareWithFoundry - Whether to share with entire foundry
 * @returns Success status
 * @security RLS enforces ownership for updates
 */
export async function shareArtifact(
  artifactId: string,
  userIds?: string[],
  shareWithFoundry?: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // SECURITY: Validate artifact UUID
  if (!isValidUUID(artifactId)) {
    return { error: 'Invalid artifact ID' }
  }

  // SECURITY: Validate each userId in the array
  if (userIds) {
    for (const uid of userIds) {
      if (!isValidUUID(uid)) {
        return { error: 'Invalid user ID in share list' }
      }
    }
  }

  // SECURITY: Verify ownership and foundry isolation before allowing share
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { error: 'User not in a foundry' }
  }

  const { data: artifact, error: fetchError } = await supabase
    .from('agent_artifacts')
    .select('id, created_by, foundry_id')
    .eq('id', artifactId)
    .single()

  if (fetchError || !artifact) {
    return { error: 'Artifact not found' }
  }

  if (artifact.created_by !== user.id) {
    console.warn('[AgentArtifacts] Non-owner attempted to share artifact:', {
      artifactId, userId: user.id, ownerId: artifact.created_by,
    })
    return { error: 'You can only share your own artifacts' }
  }

  if (artifact.foundry_id !== foundryId) {
    console.warn('[AgentArtifacts] Foundry mismatch on share attempt:', {
      artifactId, userFoundry: foundryId, artifactFoundry: artifact.foundry_id,
    })
    return { error: 'Artifact not found' }
  }

  const updateData: {
    updated_at: string
    shared_with?: string[] | null
    is_shared_with_foundry?: boolean
  } = {
    updated_at: new Date().toISOString(),
  }

  if (userIds !== undefined) {
    updateData.shared_with = userIds
  }
  if (shareWithFoundry !== undefined) {
    updateData.is_shared_with_foundry = shareWithFoundry
  }

  const { error } = await supabase
    .from('agent_artifacts')
    .update(updateData)
    .eq('id', artifactId)

  if (error) {
    console.error('[AgentArtifacts] Failed to share artifact:', {
      artifactId,
      userId: user.id,
      error: error.message,
    })
    return { error: sanitizeErrorMessage(error) }
  }

  return { error: null }
}

// ============================================================================
// MEETING HISTORY
// ============================================================================

/** Shape returned by getMeetingHistory for each past team meeting */
export interface MeetingHistoryItem {
  id: string
  title: string
  createdAt: string
  topic: string
  attendees: string[]
  roundCount: number
  summary: string
  actionItemCount: number
  objectiveCount: number
  content: string
  metadata: Record<string, unknown>
}

/**
 * Get past team meetings saved as artifacts.
 *
 * @description Queries agent_artifacts where metadata.source = 'team-meeting',
 * ordered by created_at DESC. Returns structured meeting summaries.
 *
 * @param limit - Maximum number of meetings to return (default 20)
 * @returns Array of meeting history items
 * @security RLS enforces foundry isolation
 */
export async function getMeetingHistory(limit: number = 20): Promise<{
  data: MeetingHistoryItem[]
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_artifacts')
    .select('id, title, content, metadata, created_at')
    .eq('metadata->>source', 'team-meeting')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[AgentArtifacts] Failed to fetch meeting history:', {
      userId: user.id,
      error: error.message,
    })
    return { data: [], error: sanitizeErrorMessage(error) }
  }

  // Transform raw rows into MeetingHistoryItem
  const meetings: MeetingHistoryItem[] = (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    const notes = (meta.notes ?? {}) as Record<string, unknown>
    const actionItems = Array.isArray(notes.actionItems) ? notes.actionItems : []
    const attendees = Array.isArray(meta.attendees) ? meta.attendees as string[] : []

    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      topic: (meta.topic as string) ?? '',
      attendees,
      roundCount: (meta.roundCount as number) ?? 0,
      summary: (notes.summary as string) ?? '',
      actionItemCount: actionItems.length,
      objectiveCount: (meta.objectiveCount as number) ?? 0,
      content: row.content ?? '',
      metadata: meta,
    }
  })

  return { data: meetings, error: null }
}

