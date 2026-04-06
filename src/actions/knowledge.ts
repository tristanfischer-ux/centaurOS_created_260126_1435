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
  extractKnowledge,
  extractKnowledgeFromDocument,
  discoverConnections,
} from '@/lib/knowledge-vault'
import { checkRateLimit } from '@/lib/security/rate-limit'
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
  DocumentExtractionResult,
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
      true
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

// ─── Document Knowledge Extraction ──────────────────────────────────

const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024 // 20MB
const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
  'text/csv',
] as const

/**
 * Extracts knowledge notes from an uploaded document file.
 *
 * @description Parses the file (PDF, DOCX, or TXT), extracts text, then runs
 * the document extraction pipeline to create knowledge notes in the vault.
 * All specialists can then reference this knowledge via full-text search.
 *
 * @param formData - FormData containing 'file' (the document)
 * @returns Extraction results (saved/skipped counts) or error
 *
 * @security Requires authenticated user with foundry membership.
 * Rate-limited to prevent AI cost abuse.
 */
export async function extractKnowledgeFromUpload(
  formData: FormData
): Promise<{ data: DocumentExtractionResult | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  // SECURITY: Rate limit to prevent AI cost abuse (same bucket as AI analysis)
  const rateLimitError = await checkRateLimit('aiAnalysis', `doc-extract:${auth.userId}`)
  if (rateLimitError) return { data: null, error: rateLimitError }

  const file = formData.get('file') as File | null
  if (!file) return { data: null, error: 'No file provided' }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return { data: null, error: 'File too large. Maximum size is 20 MB.' }
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type as typeof ALLOWED_DOCUMENT_TYPES[number])) {
    return { data: null, error: 'Unsupported file type. Please upload a PDF, DOCX, PPTX, XLSX, TXT, MD, or CSV file.' }
  }

  try {
    const text = await parseDocumentText(file)

    if (!text || text.length < 100) {
      return { data: null, error: 'Could not extract enough text from the file.' }
    }

    const result = await extractKnowledgeFromDocument({
      text,
      documentName: file.name,
      foundryId: auth.foundryId,
    })

    return { data: result, error: null }
  } catch (err) {
    console.error('[knowledge] Document extraction failed:', {
      fileName: file.name,
      fileSize: file.size,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to extract knowledge from document. Please try again.' }
  }
}

/**
 * Extracts knowledge from pre-parsed text (used by business plan upload flow).
 *
 * @description When the business plan analysis already has parsed text,
 * this avoids re-parsing the file. Fire-and-forget from the caller.
 *
 * @param text - Pre-parsed plaintext from the document
 * @param documentName - Original filename for provenance
 * @returns Extraction results or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function extractKnowledgeFromText(
  text: string,
  documentName: string
): Promise<{ data: DocumentExtractionResult | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  if (!text || text.length < 100) {
    return { data: null, error: 'Text too short for extraction' }
  }

  try {
    const result = await extractKnowledgeFromDocument({
      text,
      documentName,
      foundryId: auth.foundryId,
    })

    return { data: result, error: null }
  } catch (err) {
    console.error('[knowledge] Text extraction failed:', {
      documentName,
      textLength: text.length,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Extraction failed' }
  }
}


// ─── Batch Operations ───────────────────────────────────────────────

/**
 * Rebuilds connections for all non-archived notes in the vault.
 *
 * @description Iterates all notes and runs discoverConnections with the
 * updated lower threshold. Useful when connection params change.
 *
 * @returns Count of connections created and notes processed
 *
 * @security Requires authenticated user. Rate-limited.
 */
export async function rebuildAllConnections(): Promise<{
  data: { connectionsCreated: number; notesProcessed: number } | null
  error: string | null
}> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  const rateLimitError = await checkRateLimit('aiAnalysis', `rebuild-connections:${auth.userId}`)
  if (rateLimitError) return { data: null, error: rateLimitError }

  try {
    let connectionsCreated = 0
    let notesProcessed = 0
    let page = 1
    const pageSize = 50

    while (true) {
      const { notes } = await queryKnowledgeNotes(auth.foundryId, {
        filters: { includeArchived: false },
        sortBy: 'created_at',
        sortOrder: 'desc',
        page,
        pageSize,
      })

      if (notes.length === 0) break

      for (const note of notes) {
        const result = await discoverConnections(
          auth.foundryId,
          note.id,
          note.title,
          note.description,
          note.tags,
          false
        )
        connectionsCreated += result.connectionsCreated
        notesProcessed++
      }

      if (notes.length < pageSize) break
      page++
    }

    return { data: { connectionsCreated, notesProcessed }, error: null }
  } catch (err) {
    console.error('[knowledge] Rebuild connections failed:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to rebuild connections' }
  }
}

/**
 * Batch verify multiple notes at once.
 *
 * @param noteIds - IDs of notes to verify (max 100)
 * @returns Count of verified notes
 *
 * @security Requires authenticated user with foundry membership
 */
export async function batchVerifyNotes(
  noteIds: string[]
): Promise<{ data: { count: number } | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  if (noteIds.length === 0) return { data: { count: 0 }, error: null }
  if (noteIds.length > 100) return { data: null, error: 'Maximum 100 notes per batch' }

  try {
    let count = 0
    for (const noteId of noteIds) {
      const ok = await verifyKnowledgeNote(noteId, auth.userId, true)
      if (ok) count++
    }
    return { data: { count }, error: null }
  } catch (err) {
    console.error('[knowledge] Batch verify failed:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to batch verify notes' }
  }
}

/**
 * Batch archive multiple notes at once.
 *
 * @param noteIds - IDs of notes to archive (max 100)
 * @returns Count of archived notes
 *
 * @security Requires authenticated user with foundry membership
 */
export async function batchArchiveNotes(
  noteIds: string[]
): Promise<{ data: { count: number } | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  if (noteIds.length === 0) return { data: { count: 0 }, error: null }
  if (noteIds.length > 100) return { data: null, error: 'Maximum 100 notes per batch' }

  try {
    let count = 0
    for (const noteId of noteIds) {
      const ok = await archiveKnowledgeNote(noteId, true)
      if (ok) count++
    }
    return { data: { count }, error: null }
  } catch (err) {
    console.error('[knowledge] Batch archive failed:', {
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to batch archive notes' }
  }
}

/**
 * Updates a note and marks it as verified in a single call.
 * Used by the edit-on-verify flow in the detail dialog.
 *
 * @param noteId - The note to update and verify
 * @param updates - Fields to update
 * @returns The updated note, or error
 *
 * @security Requires authenticated user with foundry membership
 */
export async function verifyAndUpdateNote(
  noteId: string,
  updates: {
    title?: string
    content?: string
    description?: string
    note_type?: KnowledgeNoteType
  }
): Promise<{ data: KnowledgeNote | null; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { data: null, error: 'Unauthorized' }

  try {
    const note = await updateKnowledgeNote(noteId, updates)
    if (!note) return { data: null, error: 'Failed to update note' }

    await verifyKnowledgeNote(noteId, auth.userId, true)

    return {
      data: {
        ...note,
        is_verified: true,
        verified_by: auth.userId,
        verified_at: new Date().toISOString(),
      },
      error: null,
    }
  } catch (err) {
    console.error('[knowledge] Verify and update failed:', {
      noteId,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
    return { data: null, error: 'Failed to update and verify note' }
  }
}

// ─── File Parsing Helper ────────────────────────────────────────────

/**
 * Extracts plaintext from a document file.
 * Delegates to the shared extractDocumentText action which supports
 * PDF, DOCX, PPTX, XLSX, TXT, MD, and CSV.
 */
async function parseDocumentText(file: File): Promise<string> {
  const { extractDocumentText } = await import('@/actions/extract-document-text')
  const formData = new FormData()
  formData.append('file', file)
  const result = await extractDocumentText(formData)
  if (!result.success) {
    throw new Error(result.error)
  }
  return result.text
}

// ─── Semantic Search ─────────────────────────────────────────────────

/**
 * Searches knowledge notes using vector similarity (semantic search).
 * Falls back to keyword search if embedding generation fails.
 *
 * @param query - Natural language search query
 * @param limit - Max results (default 15)
 * @returns Matching notes sorted by relevance
 */
export async function searchKnowledgeSemantic(
  query: string,
  limit: number = 15,
): Promise<{ notes: Array<{
  id: string
  title: string
  content: string
  description: string
  note_type: string
  source_specialist: string | null
  tags: string[]
  confidence: number
  similarity: number
}>; error: string | null }> {
  const auth = await requireAuth()
  if (!auth) return { notes: [], error: 'Unauthorized' }

  const { embedText } = await import('@/lib/search/semantic-search')
  const embedding = await embedText(query)

  if (!embedding) {
    // FALLBACK: keyword search if embedding fails
    const supabase = await createClient()
    const q = `%${query.trim()}%`
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('knowledge_notes')
      .select('id, title, content, description, note_type, source_specialist, tags, confidence')
      .eq('foundry_id', auth.foundryId)
      .eq('is_archived', false)
      .or(`title.ilike.${q},description.ilike.${q},content.ilike.${q}`)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (error) return { notes: [], error: error.message }
    return {
      notes: ((data ?? []) as Array<Record<string, unknown>>).map((n) => ({ ...n, similarity: 0 })) as unknown as Array<{
        id: string; title: string; content: string; description: string;
        note_type: string; source_specialist: string | null; tags: string[];
        confidence: number; similarity: number;
      }>,
      error: null,
    }
  }

  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- match_knowledge_notes not in generated types (custom RPC)
  const { data, error } = await (supabase as any).rpc('match_knowledge_notes', {
    query_embedding: JSON.stringify(embedding),
    p_foundry_id: auth.foundryId,
    match_threshold: 0.35,
    match_count: limit,
  })

  if (error) return { notes: [], error: error.message }
  return { notes: (data ?? []) as unknown as Array<{
    id: string; title: string; content: string; description: string;
    note_type: string; source_specialist: string | null; tags: string[];
    confidence: number; similarity: number;
  }>, error: null }
}
