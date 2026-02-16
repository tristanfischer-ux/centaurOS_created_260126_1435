'use server'

/**
 * @file knowledge.ts
 *
 * @description Server actions for the Knowledge Vault — CRUD operations,
 * querying, filtering, and knowledge extraction triggers. These actions
 * are called from the Knowledge page UI and from specialist briefing flows.
 *
 * @security All operations require authentication and enforce foundry isolation.
 * RLS policies provide defense-in-depth.
 *
 * @related
 * - src/lib/knowledge-vault/ — Core library
 * - src/app/(platform)/knowledge/ — UI page
 * - src/actions/agent-memory.ts — Memory thread actions
 */

import { createClient } from '@/lib/supabase/server'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import {
  queryKnowledgeNotes,
  getKnowledgeNote,
  getKnowledgeNoteWithLinks,
  createKnowledgeNote,
  updateKnowledgeNote,
  archiveKnowledgeNote,
  deleteKnowledgeNote,
  pinKnowledgeNote,
  verifyKnowledgeNote,
  createKnowledgeLink,
  removeKnowledgeLink,
  getVaultStats,
  ensureDefaultDomains,
  getKnowledgeDomains,
  extractKnowledge,
  discoverConnections,
} from '@/lib/knowledge-vault'
import type {
  KnowledgeQueryParams,
  KnowledgeQueryResult,
  KnowledgeNote,
  KnowledgeLinkWithNote,
  KnowledgeDomain,
  KnowledgeNoteType,
  KnowledgeLinkRelationship,
  VaultStats,
  ExtractionResult,
} from '@/lib/knowledge-vault'

// ─── Auth Helper ─────────────────────────────────────────────────────

/**
 * Validates authentication and returns user + foundry context.
 * All actions call this first.
 */
async function requireAuth(): Promise<{
  userId: string
  foundryId: string
} | null> {
  // AUTH: Verify authentication
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const foundryId = await getFoundryIdCached()
  if (!foundryId) return null

  return { userId: user.id, foundryId }
}

// ─── Query / Browse ──────────────────────────────────────────────────

/**
 * Fetches paginated knowledge notes with filters.
 *
 * @description Main query endpoint for the Knowledge page. Supports
 * filtering by type, domain, specialist, tags, and full-text search.
 *
 * @param params - Query parameters
 * @returns Paginated note summaries, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function fetchKnowledgeNotes(
  params: KnowledgeQueryParams
): Promise<{ data: KnowledgeQueryResult | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const result = await queryKnowledgeNotes(auth.foundryId, params)
    return { data: result, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to fetch notes:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to fetch notes' }
  }
}

/**
 * Fetches a single note with its connections.
 *
 * @param noteId - The note to fetch
 * @returns The note and its links, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function fetchKnowledgeNoteDetail(
  noteId: string
): Promise<{
  data: { note: KnowledgeNote; links: KnowledgeLinkWithNote[] } | null
  error: string | null
}> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const result = await getKnowledgeNoteWithLinks(noteId)
    return { data: result, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to fetch note detail:', {
      noteId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to fetch note' }
  }
}

// ─── Create / Update ─────────────────────────────────────────────────

/**
 * Creates a new knowledge note (user-created, not extracted).
 *
 * @param data - Note content
 * @returns The created note, or error
 *
 * @security Requires authenticated user with foundry membership
 * @audit Note creation tracked
 */
export async function createNote(data: {
  title: string
  content: string
  description?: string
  note_type: KnowledgeNoteType
  domain_id?: string | null
  tags?: string[]
}): Promise<{ data: KnowledgeNote | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  // VALIDATION: Title is required
  if (!data.title.trim()) {
    return { data: null, error: 'Title is required' }
  }

  try {
    const note = await createKnowledgeNote(auth.foundryId, data)
    if (!note) return { data: null, error: 'Failed to create note' }

    // Fire-and-forget: discover connections for the new note
    discoverConnections(
      auth.foundryId,
      note.id,
      note.title,
      note.content,
      note.tags,
      false
    ).catch((err) => {
      console.error('[knowledge] Connection discovery failed:', {
        noteId: note.id,
        error: err instanceof Error ? err.message : 'Unknown',
      })
    })

    return { data: note, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to create note:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to create note' }
  }
}

/**
 * Updates an existing knowledge note.
 *
 * @param noteId - The note to update
 * @param data - Fields to update
 * @returns The updated note, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function updateNote(
  noteId: string,
  data: {
    title?: string
    content?: string
    description?: string
    note_type?: KnowledgeNoteType
    domain_id?: string | null
    tags?: string[]
    confidence?: number
  }
): Promise<{ data: KnowledgeNote | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const note = await updateKnowledgeNote(noteId, data)
    if (!note) return { data: null, error: 'Failed to update note' }
    return { data: note, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to update note:', {
      noteId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to update note' }
  }
}

// ─── Pin / Verify / Archive / Delete ─────────────────────────────────

/**
 * Toggles pin status on a knowledge note.
 *
 * @param noteId - The note to pin/unpin
 * @param pinned - Whether to pin or unpin
 *
 * @security Requires authenticated user with foundry membership
 */
export async function toggleNotePin(
  noteId: string,
  pinned: boolean
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await pinKnowledgeNote(noteId, pinned)
  return { error: ok ? null : 'Failed to update pin status' }
}

/**
 * Marks a note as verified by the current user.
 *
 * @description Verified notes are treated as confirmed organizational knowledge.
 * Unverified notes are AI-generated and may need human review.
 *
 * @param noteId - The note to verify
 * @param verified - Whether to verify or unverify
 *
 * @security Requires authenticated user with foundry membership
 * @audit Tracks who verified and when
 */
export async function toggleNoteVerified(
  noteId: string,
  verified: boolean
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await verifyKnowledgeNote(noteId, auth.userId, verified)
  return { error: ok ? null : 'Failed to update verification status' }
}

/**
 * Archives a knowledge note (soft delete).
 *
 * @param noteId - The note to archive
 * @param archived - Whether to archive or restore
 *
 * @security Requires authenticated user with foundry membership
 */
export async function archiveNote(
  noteId: string,
  archived: boolean = true
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await archiveKnowledgeNote(noteId, archived)
  return { error: ok ? null : 'Failed to archive note' }
}

/**
 * Permanently deletes a knowledge note.
 *
 * @param noteId - The note to delete
 *
 * @security Requires authenticated user with foundry membership
 */
export async function deleteNote(
  noteId: string
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await deleteKnowledgeNote(noteId)
  return { error: ok ? null : 'Failed to delete note' }
}

// ─── Links ───────────────────────────────────────────────────────────

/**
 * Creates a link between two notes (user-initiated).
 *
 * @param sourceNoteId - The source note
 * @param targetNoteId - The target note
 * @param relationship - The relationship type
 * @param description - Why these notes are linked
 *
 * @security Requires authenticated user with foundry membership
 */
export async function linkNotes(
  sourceNoteId: string,
  targetNoteId: string,
  relationship: KnowledgeLinkRelationship = 'related',
  description: string = ''
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await createKnowledgeLink(
    auth.foundryId,
    sourceNoteId,
    targetNoteId,
    relationship,
    description,
    'user'
  )
  return { error: ok ? null : 'Failed to create link' }
}

/**
 * Removes a link between notes.
 *
 * @param linkId - The link to remove
 *
 * @security Requires authenticated user with foundry membership
 */
export async function unlinkNotes(
  linkId: string
): Promise<{ error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { error: 'Unauthorized' }

  const ok = await removeKnowledgeLink(linkId)
  return { error: ok ? null : 'Failed to remove link' }
}

// ─── Domains ─────────────────────────────────────────────────────────

/**
 * Fetches all knowledge domains for the current foundry.
 * Creates default domains if none exist.
 *
 * @returns List of domains, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function fetchKnowledgeDomains(): Promise<{
  data: KnowledgeDomain[] | null
  error: string | null
}> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const domains = await ensureDefaultDomains(auth.foundryId)
    return { data: domains, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to fetch domains:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to fetch domains' }
  }
}

// ─── Vault Stats ─────────────────────────────────────────────────────

/**
 * Fetches overview statistics for the vault dashboard.
 *
 * @returns Vault stats, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function fetchVaultStats(): Promise<{
  data: VaultStats | null
  error: string | null
}> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const stats = await getVaultStats(auth.foundryId)
    return { data: stats, error: null }
  } catch (err) {
    console.error('[knowledge] Failed to fetch vault stats:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to fetch stats' }
  }
}

// ─── Knowledge Extraction ────────────────────────────────────────────

/**
 * Triggers knowledge extraction from a specialist thread.
 *
 * @description Called after a specialist conversation ends. Extracts
 * atomic knowledge notes and saves them to the vault.
 *
 * @param specialistId - The specialist that had the conversation
 * @param threadId - The memory thread to extract from
 * @param messages - The conversation messages
 * @returns Extraction results
 *
 * @security Requires authenticated user with foundry membership
 * @audit Extraction tracked in note metadata
 */
export async function triggerKnowledgeExtraction(
  specialistId: string,
  threadId: string,
  messages: Array<{ role: string; content: string }>
): Promise<{ data: ExtractionResult | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const result = await extractKnowledge({
      messages,
      specialistId,
      threadId,
      foundryId: auth.foundryId,
    })

    // Fire-and-forget: discover connections for each newly created note
    // (The extraction pipeline already handles this for notes with suggested_links)

    return { data: result, error: null }
  } catch (err) {
    console.error('[knowledge] Extraction failed:', {
      specialistId,
      threadId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Extraction failed' }
  }
}
