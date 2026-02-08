'use server'

/**
 * @file whiteboards.ts
 *
 * @description Server actions for creating, updating, listing, and deleting
 * Excalidraw whiteboards. Each whiteboard stores its canvas state as JSONB
 * and is scoped to a foundry with optional linking to an objective.
 *
 * @security All actions use withAuth wrapper for authentication + foundry isolation.
 * RLS policies provide defense-in-depth on the whiteboards table.
 */

import { withAuth } from '@/lib/server-action-utils'
import { revalidatePath } from 'next/cache'

/** Row shape returned from the whiteboards table */
export interface WhiteboardRow {
  id: string
  foundry_id: string
  created_by: string
  title: string
  linked_entity_type: string | null
  linked_entity_id: string | null
  state: Record<string, unknown>
  created_at: string
  updated_at: string
}

/**
 * Fetch all whiteboards for the current foundry.
 *
 * @returns List of whiteboards ordered by last updated
 */
export async function getWhiteboards(): Promise<{ data: WhiteboardRow[] | null; error: string | null }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('whiteboards')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Whiteboards] Failed to fetch whiteboards:', {
        foundryId,
        error: error.message,
      })
      return { data: null, error: error.message }
    }

    return { data: data as WhiteboardRow[], error: null }
  }) as Promise<{ data: WhiteboardRow[] | null; error: string | null }>
}

/**
 * Fetch a single whiteboard by ID.
 *
 * @param whiteboardId - The whiteboard UUID
 * @returns The whiteboard row or error
 */
export async function getWhiteboard(
  whiteboardId: string
): Promise<{ data: WhiteboardRow | null; error: string | null }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { data, error } = await supabase
      .from('whiteboards')
      .select('*')
      .eq('id', whiteboardId)
      .eq('foundry_id', foundryId)
      .single()

    if (error) {
      console.error('[Whiteboards] Failed to fetch whiteboard:', {
        whiteboardId,
        foundryId,
        error: error.message,
      })
      return { data: null, error: error.message }
    }

    return { data: data as WhiteboardRow, error: null }
  }) as Promise<{ data: WhiteboardRow | null; error: string | null }>
}

/**
 * Create a new whiteboard.
 *
 * @param params - Title and optional entity link
 * @returns The created whiteboard row
 */
export async function createWhiteboard(params: {
  title: string
  linked_entity_type?: 'objective' | 'project' | 'general'
  linked_entity_id?: string
  state?: Record<string, unknown>
}): Promise<{ data: WhiteboardRow | null; error: string | null }> {
  return withAuth(async ({ supabase, user, foundryId }) => {
    // VALIDATION: Title must be non-empty
    const title = params.title?.trim()
    if (!title) {
      return { data: null, error: 'Title is required' }
    }

    const { data, error } = await supabase
      .from('whiteboards')
      .insert({
        foundry_id: foundryId,
        created_by: user.id,
        title,
        linked_entity_type: params.linked_entity_type ?? 'general',
        linked_entity_id: params.linked_entity_id ?? null,
        state: params.state ?? {},
      })
      .select()
      .single()

    if (error) {
      console.error('[Whiteboards] Failed to create whiteboard:', {
        foundryId,
        error: error.message,
      })
      return { data: null, error: error.message }
    }

    revalidatePath('/canvas')
    return { data: data as WhiteboardRow, error: null }
  }) as Promise<{ data: WhiteboardRow | null; error: string | null }>
}

/**
 * Update a whiteboard's state (and optionally title).
 *
 * @param whiteboardId - The whiteboard UUID
 * @param updates - Fields to update
 * @returns The updated whiteboard row
 */
export async function updateWhiteboard(
  whiteboardId: string,
  updates: {
    title?: string
    state?: Record<string, unknown>
  }
): Promise<{ data: WhiteboardRow | null; error: string | null }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const updatePayload: Record<string, unknown> = {}

    if (updates.title !== undefined) {
      const title = updates.title.trim()
      if (!title) return { data: null, error: 'Title cannot be empty' }
      updatePayload.title = title
    }

    if (updates.state !== undefined) {
      updatePayload.state = updates.state
    }

    if (Object.keys(updatePayload).length === 0) {
      return { data: null, error: 'No updates provided' }
    }

    const { data, error } = await supabase
      .from('whiteboards')
      .update(updatePayload)
      .eq('id', whiteboardId)
      .eq('foundry_id', foundryId)
      .select()
      .single()

    if (error) {
      console.error('[Whiteboards] Failed to update whiteboard:', {
        whiteboardId,
        foundryId,
        error: error.message,
      })
      return { data: null, error: error.message }
    }

    return { data: data as WhiteboardRow, error: null }
  }) as Promise<{ data: WhiteboardRow | null; error: string | null }>
}

/**
 * Delete a whiteboard.
 *
 * @param whiteboardId - The whiteboard UUID
 * @returns Success or error
 */
export async function deleteWhiteboard(
  whiteboardId: string
): Promise<{ error: string | null }> {
  return withAuth(async ({ supabase, foundryId }) => {
    const { error } = await supabase
      .from('whiteboards')
      .delete()
      .eq('id', whiteboardId)
      .eq('foundry_id', foundryId)

    if (error) {
      console.error('[Whiteboards] Failed to delete whiteboard:', {
        whiteboardId,
        foundryId,
        error: error.message,
      })
      return { error: error.message }
    }

    revalidatePath('/canvas')
    return { error: null }
  }) as Promise<{ error: string | null }>
}
