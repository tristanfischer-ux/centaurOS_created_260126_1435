'use server'

/**
 * @file agent-workflows.ts
 *
 * @description Server actions for persisting agent workflows and custom
 * prompts to Supabase. Replaces the previous localStorage-only approach
 * with proper database persistence and foundry-level isolation.
 *
 * @security All operations require authentication and enforce foundry isolation
 * via RLS policies. Only the creator can update/delete their own records.
 *
 * @related
 * - supabase/migrations/20260206500000_agent_workflows.sql - Schema
 * - src/app/(platform)/agents/agents-workflow-view.tsx - Consumer
 * - src/app/(platform)/agents/lib/custom-prompts.ts - Consumer
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage } from '@/lib/security/sanitize'
import type { Json } from '@/types/database.types'


// ============================================================================
// TYPES
// ============================================================================

/** Database row shape for agent_workflows */
export interface AgentWorkflowRow {
  id: string
  foundry_id: string
  created_by: string | null
  name: string
  description: string
  nodes: unknown[]
  edges: unknown[]
  is_template: boolean
  created_at: string
  updated_at: string
}

/** Database row shape for agent_custom_prompts */
export interface AgentCustomPromptRow {
  id: string
  foundry_id: string
  created_by: string | null
  title: string
  description: string
  category: string
  icon: string
  default_prompt: string
  input_label: string
  output_label: string
  tags: string[]
  suggested_next: string[]
  created_at: string
  updated_at: string
}

/** Input for creating/updating a workflow */
export interface SaveWorkflowInput {
  /** Pass existing ID to update, omit or null for new */
  id?: string | null
  name: string
  description?: string
  nodes: unknown[]
  edges: unknown[]
}

/** Input for creating/updating a custom prompt */
export interface SaveCustomPromptInput {
  /** Pass existing ID to update, omit or null for new */
  id?: string | null
  title: string
  description?: string
  category: string
  icon?: string
  default_prompt: string
  input_label?: string
  output_label?: string
  tags?: string[]
  suggested_next?: string[]
}

/** Input for batch-migrating workflows from localStorage */
export interface MigrateWorkflowInput {
  name: string
  description?: string
  nodes: unknown[]
  edges: unknown[]
}

// ============================================================================
// WORKFLOW ACTIONS
// ============================================================================

/**
 * Fetch all agent workflows for the current user's foundry.
 *
 * @returns Workflows ordered by most recently updated first
 * @security RLS enforces foundry isolation
 */
export async function getAgentWorkflows(): Promise<{
  data: AgentWorkflowRow[] | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_workflows')
    .select('*')
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[AgentWorkflows] Failed to fetch workflows:', {
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as unknown as AgentWorkflowRow[], error: null }
}

/**
 * Fetch a single agent workflow by ID.
 *
 * @param workflowId - UUID of the workflow
 * @returns The workflow row or null
 * @security RLS enforces foundry isolation
 */
export async function getAgentWorkflow(workflowId: string): Promise<{
  data: AgentWorkflowRow | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // VALIDATION: Ensure workflowId is provided
  if (!workflowId) {
    return { data: null, error: 'Workflow ID is required' }
  }

  const { data, error } = await supabase
    .from('agent_workflows')
    .select('*')
    .eq('id', workflowId)
    .single()

  if (error) {
    console.error('[AgentWorkflows] Failed to fetch workflow:', {
      workflowId,
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRow, error: null }
}

/**
 * Create or update an agent workflow.
 *
 * @description If `input.id` is provided, updates the existing workflow.
 * Otherwise creates a new one. The foundry_id is automatically set from
 * the user's active foundry.
 *
 * @param input - Workflow data to save
 * @returns The saved workflow row
 * @security RLS enforces foundry isolation and ownership for updates
 * @audit Workflow creation/updates are tracked via updated_at
 */
export async function saveAgentWorkflow(input: SaveWorkflowInput): Promise<{
  data: AgentWorkflowRow | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // Get foundry context
  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { data: null, error: 'No active foundry' }
  }

  // VALIDATION: Name is required
  if (!input.name?.trim()) {
    return { data: null, error: 'Workflow name is required' }
  }

  const now = new Date().toISOString()

  if (input.id) {
    // Update existing workflow
    const { data, error } = await supabase
      .from('agent_workflows')
      .update({
        name: input.name.trim(),
        description: input.description ?? '',
        nodes: input.nodes as unknown as Json,
        edges: input.edges as unknown as Json,
        updated_at: now,
      })
      .eq('id', input.id)
      .select()
      .single()

    if (error) {
      console.error('[AgentWorkflows] Failed to update workflow:', {
        workflowId: input.id,
        userId: user.id,
        error: error.message,
      })
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    return { data: data as unknown as AgentWorkflowRow, error: null }
  }

  // Create new workflow
  const { data, error } = await supabase
    .from('agent_workflows')
    .insert({
      foundry_id: foundryId,
      created_by: user.id,
      name: input.name.trim(),
      description: input.description ?? '',
      nodes: input.nodes as unknown as Json,
      edges: input.edges as unknown as Json,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentWorkflows] Failed to create workflow:', {
      userId: user.id,
      foundryId,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRow, error: null }
}

/**
 * Delete an agent workflow by ID.
 *
 * @param workflowId - UUID of the workflow to delete
 * @security RLS enforces ownership (only creator can delete)
 */
export async function deleteAgentWorkflow(workflowId: string): Promise<{
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // VALIDATION: workflowId is required
  if (!workflowId) {
    return { error: 'Workflow ID is required' }
  }

  const { error } = await supabase
    .from('agent_workflows')
    .delete()
    .eq('id', workflowId)

  if (error) {
    console.error('[AgentWorkflows] Failed to delete workflow:', {
      workflowId,
      userId: user.id,
      error: error.message,
    })
    return { error: sanitizeErrorMessage(error) }
  }

  return { error: null }
}

/**
 * Batch-import workflows from localStorage during migration.
 *
 * @description Called once per user when they first load the Agents page
 * after the database migration. Imports all localStorage workflows into
 * the database and returns the created rows.
 *
 * @param workflows - Array of workflow data from localStorage
 * @returns The created workflow rows
 * @security RLS enforces foundry isolation
 */
export async function migrateLocalWorkflows(workflows: MigrateWorkflowInput[]): Promise<{
  data: AgentWorkflowRow[] | null
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

  if (!workflows.length) {
    return { data: [], error: null }
  }

  const now = new Date().toISOString()
  const rows = workflows.map((wf) => ({
    foundry_id: foundryId,
    created_by: user.id,
    name: wf.name?.trim() || 'Untitled Workflow',
    description: wf.description ?? '',
    nodes: (wf.nodes ?? []) as unknown as Json,
    edges: (wf.edges ?? []) as unknown as Json,
    is_template: false,
    created_at: now,
    updated_at: now,
  }))

  const { data, error } = await supabase
    .from('agent_workflows')
    .insert(rows)
    .select()

  if (error) {
    console.error('[AgentWorkflows] Failed to migrate localStorage workflows:', {
      userId: user.id,
      foundryId,
      count: workflows.length,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentWorkflowRow[], error: null }
}

// ============================================================================
// CUSTOM PROMPT ACTIONS
// ============================================================================

/**
 * Fetch all custom prompts for the current user's foundry.
 *
 * @returns Custom prompts ordered by most recently created first
 * @security RLS enforces foundry isolation
 */
export async function getAgentCustomPrompts(): Promise<{
  data: AgentCustomPromptRow[] | null
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  const { data, error } = await supabase
    .from('agent_custom_prompts')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[AgentWorkflows] Failed to fetch custom prompts:', {
      userId: user.id,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentCustomPromptRow[], error: null }
}

/**
 * Create or update a custom prompt.
 *
 * @param input - Custom prompt data
 * @returns The saved custom prompt row
 * @security RLS enforces foundry isolation and ownership for updates
 */
export async function saveAgentCustomPrompt(input: SaveCustomPromptInput): Promise<{
  data: AgentCustomPromptRow | null
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

  // VALIDATION: Title and prompt text are required
  if (!input.title?.trim()) {
    return { data: null, error: 'Prompt title is required' }
  }
  if (!input.default_prompt?.trim()) {
    return { data: null, error: 'Prompt text is required' }
  }

  const now = new Date().toISOString()

  if (input.id) {
    // Update existing custom prompt
    const { data, error } = await supabase
      .from('agent_custom_prompts')
      .update({
        title: input.title.trim(),
        description: input.description ?? '',
        category: input.category,
        icon: input.icon ?? 'Sparkles',
        default_prompt: input.default_prompt.trim(),
        input_label: input.input_label ?? 'Your input',
        output_label: input.output_label ?? 'AI output',
        tags: input.tags ?? [],
        suggested_next: input.suggested_next ?? [],
        updated_at: now,
      })
      .eq('id', input.id)
      .select()
      .single()

    if (error) {
      console.error('[AgentWorkflows] Failed to update custom prompt:', {
        promptId: input.id,
        userId: user.id,
        error: error.message,
      })
      return { data: null, error: sanitizeErrorMessage(error) }
    }

    return { data: data as unknown as AgentCustomPromptRow, error: null }
  }

  // Create new custom prompt
  const { data, error } = await supabase
    .from('agent_custom_prompts')
    .insert({
      foundry_id: foundryId,
      created_by: user.id,
      title: input.title.trim(),
      description: input.description ?? '',
      category: input.category,
      icon: input.icon ?? 'Sparkles',
      default_prompt: input.default_prompt.trim(),
      input_label: input.input_label ?? 'Your input',
      output_label: input.output_label ?? 'AI output',
      tags: input.tags ?? [],
      suggested_next: input.suggested_next ?? [],
      created_at: now,
      updated_at: now,
    })
    .select()
    .single()

  if (error) {
    console.error('[AgentWorkflows] Failed to create custom prompt:', {
      userId: user.id,
      foundryId,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentCustomPromptRow, error: null }
}

/**
 * Delete a custom prompt by ID.
 *
 * @param promptId - UUID of the custom prompt to delete
 * @security RLS enforces ownership (only creator can delete)
 */
export async function deleteAgentCustomPrompt(promptId: string): Promise<{
  error: string | null
}> {
  const supabase = await createClient()

  // AUTH: Verify user is authenticated
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // VALIDATION: promptId is required
  if (!promptId) {
    return { error: 'Prompt ID is required' }
  }

  const { error } = await supabase
    .from('agent_custom_prompts')
    .delete()
    .eq('id', promptId)

  if (error) {
    console.error('[AgentWorkflows] Failed to delete custom prompt:', {
      promptId,
      userId: user.id,
      error: error.message,
    })
    return { error: sanitizeErrorMessage(error) }
  }

  return { error: null }
}

/**
 * Batch-import custom prompts from localStorage during migration.
 *
 * @param prompts - Array of custom prompt data from localStorage
 * @returns The created custom prompt rows
 * @security RLS enforces foundry isolation
 */
export async function migrateLocalCustomPrompts(prompts: SaveCustomPromptInput[]): Promise<{
  data: AgentCustomPromptRow[] | null
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

  if (!prompts.length) {
    return { data: [], error: null }
  }

  const now = new Date().toISOString()
  const rows = prompts.map((p) => ({
    foundry_id: foundryId,
    created_by: user.id,
    title: p.title?.trim() || 'Untitled Prompt',
    description: p.description ?? '',
    category: p.category ?? 'strategy',
    icon: p.icon ?? 'Sparkles',
    default_prompt: p.default_prompt?.trim() || '',
    input_label: p.input_label ?? 'Your input',
    output_label: p.output_label ?? 'AI output',
    tags: p.tags ?? [],
    suggested_next: p.suggested_next ?? [],
    created_at: now,
    updated_at: now,
  }))

  const { data, error } = await supabase
    .from('agent_custom_prompts')
    .insert(rows)
    .select()

  if (error) {
    console.error('[AgentWorkflows] Failed to migrate localStorage custom prompts:', {
      userId: user.id,
      foundryId,
      count: prompts.length,
      error: error.message,
    })
    return { data: null, error: sanitizeErrorMessage(error) }
  }

  return { data: data as unknown as AgentCustomPromptRow[], error: null }
}
