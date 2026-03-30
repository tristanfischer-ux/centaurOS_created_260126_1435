/**
 * @file manager.ts
 *
 * @description Core CRUD and query operations for the Knowledge Vault.
 * Handles note creation, querying, linking, domain management, and
 * specialist consultation queries.
 *
 * @security All database operations use the authenticated Supabase client.
 * RLS policies enforce foundry-level isolation.
 *
 * @example
 * const notes = await queryKnowledgeNotes(foundryId, {
 *   filters: { noteTypes: ['decision', 'insight'], searchQuery: 'pricing' },
 *   sortBy: 'created_at',
 *   sortOrder: 'desc',
 * })
 */

import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/types/database.types'
import type {
  KnowledgeNote,
  KnowledgeNoteSummary,
  KnowledgeLinkWithNote,
  KnowledgeDomain,
  KnowledgeNoteType,
  KnowledgeLinkRelationship,
  LinkDiscoverySource,
  KnowledgeQueryParams,
  KnowledgeQueryResult,
  VaultStats,
} from './types'
import { DEFAULT_DOMAINS } from './types'
import { getSpecialistDomainSlugs } from './specialist-domain-map'

// ─── Summary fields (used for list queries) ──────────────────────────

const SUMMARY_FIELDS = 'id, title, description, note_type, source_specialist, tags, is_pinned, is_verified, is_stale, stale_at, staleness_window_days, link_count, confidence, domain_id, created_at, updated_at'

// ─── Notes: Query ────────────────────────────────────────────────────

/**
 * Queries knowledge notes with filtering, sorting, and pagination.
 *
 * @param foundryId - The foundry to query
 * @param params - Query parameters (filters, sort, pagination)
 * @returns Paginated list of note summaries
 *
 * @security RLS enforces foundry isolation
 */
export async function queryKnowledgeNotes(
  foundryId: string,
  params: KnowledgeQueryParams
): Promise<KnowledgeQueryResult> {
  const supabase = await createClient()
  const {
    filters,
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    pageSize = 20,
  } = params

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  let query = (supabase as any)
      .from('knowledge_notes')
    .select(SUMMARY_FIELDS, { count: 'exact' })
    .eq('foundry_id', foundryId)

  // Apply filters
  if (!filters.includeArchived) {
    query = query.eq('is_archived', false)
  }
  if (filters.hideStale) {
    query = query.eq('is_stale', false)
  }
  if (filters.pinnedOnly) {
    query = query.eq('is_pinned', true)
  }
  if (filters.verifiedOnly) {
    query = query.eq('is_verified', true)
  }
  if (filters.noteTypes && filters.noteTypes.length > 0) {
    query = query.in('note_type', filters.noteTypes)
  }
  if (filters.domainId) {
    query = query.eq('domain_id', filters.domainId)
  }
  if (filters.specialistId) {
    query = query.eq('source_specialist', filters.specialistId)
  }
  if (filters.minConfidence !== undefined) {
    query = query.gte('confidence', filters.minConfidence)
  }
  if (filters.tags && filters.tags.length > 0) {
    query = query.overlaps('tags', filters.tags)
  }
  if (filters.searchQuery) {
    // INTENT: Semantic search first (pgvector cosine similarity), fall back to
    // keyword if embedding generation fails. Semantic finds "pricing strategy"
    // matching "We decided on freemium" — keyword search can't do this.
    let usedSemantic = false
    try {
      const { embedText } = await import("@/lib/search/semantic-search")
      const embedding = await embedText(filters.searchQuery)
      if (embedding) {
        const { data: semanticMatches } = await (supabase as any).rpc("match_knowledge_notes", {
          query_embedding: JSON.stringify(embedding),
          p_foundry_id: foundryId,
          match_threshold: 0.3,
          match_count: 100, // Generous — other filters + pagination narrow further
        })
        if (semanticMatches && semanticMatches.length > 0) {
          const matchedIds = semanticMatches.map((m: { id: string }) => m.id)
          query = query.in("id", matchedIds)
          usedSemantic = true
        }
      }
    } catch {
      // Semantic search unavailable — fall through to keyword
    }

    if (!usedSemantic) {
      const q = `%${filters.searchQuery}%`
      query = query.or(`title.ilike.${q},description.ilike.${q},content.ilike.${q}`)
    }
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // Apply pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data, count, error } = await query

  if (error) {
    console.error('[KnowledgeVault] Failed to query notes:', {
      foundryId,
      error: error.message,
    })
    return { notes: [], total: 0, page, pageSize, hasMore: false }
  }

  const total = count ?? 0
  return {
    notes: (data ?? []) as unknown as KnowledgeNoteSummary[],
    total,
    page,
    pageSize,
    hasMore: from + pageSize < total,
  }
}

// ─── Notes: Get Single ───────────────────────────────────────────────

/**
 * Fetches a single knowledge note by ID.
 *
 * @param noteId - The note ID
 * @returns The full note, or null if not found
 *
 * @security RLS enforces foundry isolation
 */
export async function getKnowledgeNote(
  noteId: string
): Promise<KnowledgeNote | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { data, error } = await (supabase as any)
      .from('knowledge_notes')
    .select('*')
    .eq('id', noteId)
    .maybeSingle()

  if (error) {
    console.error('[KnowledgeVault] Failed to get note:', {
      noteId,
      error: error.message,
    })
    return null
  }

  return data as unknown as KnowledgeNote | null
}

/**
 * Fetches a note with its connected links (both directions).
 *
 * @param noteId - The note ID
 * @returns The note and its connections, or null
 *
 * @security RLS enforces foundry isolation
 */
export async function getKnowledgeNoteWithLinks(
  noteId: string
): Promise<{ note: KnowledgeNote; links: KnowledgeLinkWithNote[] } | null> {
  const supabase = await createClient()

  // Fetch note
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { data: note, error: noteError } = await (supabase as any)
      .from('knowledge_notes')
    .select('*')
    .eq('id', noteId)
    .maybeSingle()

  if (noteError || !note) {
    console.error('[KnowledgeVault] Failed to get note with links:', {
      noteId,
      error: noteError?.message,
    })
    return null
  }

  // Fetch outgoing links (this note -> others)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_links missing from generated DB types
  const { data: outgoing } = await (supabase as any)
      .from('knowledge_links')
    .select(`
      id, foundry_id, source_note_id, target_note_id,
      relationship, description, discovered_by, created_at,
      target:knowledge_notes!knowledge_links_target_note_id_fkey(${SUMMARY_FIELDS})
    `)
    .eq('source_note_id', noteId)

  // Fetch incoming links (others -> this note)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_links missing from generated DB types
  const { data: incoming } = await (supabase as any)
      .from('knowledge_links')
    .select(`
      id, foundry_id, source_note_id, target_note_id,
      relationship, description, discovered_by, created_at,
      source:knowledge_notes!knowledge_links_source_note_id_fkey(${SUMMARY_FIELDS})
    `)
    .eq('target_note_id', noteId)

  const links: KnowledgeLinkWithNote[] = []

  for (const link of outgoing ?? []) {
    const target = (link as Record<string, unknown>).target as KnowledgeNoteSummary | null
    if (target) {
      links.push({
        id: link.id,
        foundry_id: link.foundry_id,
        source_note_id: link.source_note_id,
        target_note_id: link.target_note_id,
        relationship: link.relationship as KnowledgeLinkRelationship,
        description: link.description,
        discovered_by: link.discovered_by as LinkDiscoverySource,
        created_at: link.created_at,
        connected_note: target,
      })
    }
  }

  for (const link of incoming ?? []) {
    const source = (link as Record<string, unknown>).source as KnowledgeNoteSummary | null
    if (source) {
      links.push({
        id: link.id,
        foundry_id: link.foundry_id,
        source_note_id: link.source_note_id,
        target_note_id: link.target_note_id,
        relationship: link.relationship as KnowledgeLinkRelationship,
        description: link.description,
        discovered_by: link.discovered_by as LinkDiscoverySource,
        created_at: link.created_at,
        connected_note: source,
      })
    }
  }

  // Increment view count (fire and forget)
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  ;(supabase as any)
      .from('knowledge_notes')
    .update({ view_count: ((note as Record<string, unknown>).view_count as number) + 1 })
    .eq('id', noteId)
    .then(() => { /* intentionally fire-and-forget */ })

  return {
    note: note as unknown as KnowledgeNote,
    links,
  }
}

// ─── Notes: Create ───────────────────────────────────────────────────

/**
 * Creates a new knowledge note.
 *
 * @param foundryId - The foundry this note belongs to
 * @param data - Note content and metadata
 * @returns The created note, or null on error
 *
 * @security RLS enforces foundry isolation
 * @audit Note creation tracked via created_at
 */
export async function createKnowledgeNote(
  foundryId: string,
  data: {
    title: string
    content: string
    description?: string
    note_type: KnowledgeNoteType
    domain_id?: string | null
    source_specialist?: string | null
    source_thread_id?: string | null
    source_message_id?: string | null
    confidence?: number
    tags?: string[]
    extraction_metadata?: Record<string, unknown>
  }
): Promise<KnowledgeNote | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { data: note, error } = await (supabase as any)
      .from('knowledge_notes')
    .insert({
      foundry_id: foundryId,
      title: data.title,
      content: data.content,
      description: data.description ?? '',
      note_type: data.note_type,
      domain_id: data.domain_id ?? null,
      source_specialist: data.source_specialist ?? null,
      source_thread_id: data.source_thread_id ?? null,
      source_message_id: data.source_message_id ?? null,
      confidence: data.confidence ?? 0.8,
      tags: data.tags ?? [],
      extraction_metadata: (data.extraction_metadata ?? {}) as Json,
    })
    .select()
    .single()

  if (error) {
    console.error('[KnowledgeVault] Failed to create note:', {
      foundryId,
      title: data.title,
      error: error.message,
    })
    return null
  }

  // INTENT: Generate embedding async (fire-and-forget) so the note is
  // searchable via semantic search. Uses OpenAI text-embedding-3-small.
  // GOTCHA: PostgREST can't update pgvector columns directly — use the
  // update_knowledge_embedding RPC helper (migration 20260330400000).
  const noteRecord = note as unknown as KnowledgeNote
  const embeddingText = `${data.title}\n${data.description ?? ""}\n${data.content}`.trim()
  import("@/lib/search/semantic-search").then(({ embedText }) =>
    embedText(embeddingText).then((embedding) => {
      if (!embedding) return
      const embeddingStr = `[${embedding.join(",")}]`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(supabase as any)
        .rpc("update_knowledge_embedding", {
          p_note_id: noteRecord.id,
          p_embedding: embeddingStr,
        })
        .then(() => {})
    }),
  ).catch(() => { /* Non-critical — note saved without embedding */ })

  return noteRecord
}

// ─── Notes: Update ───────────────────────────────────────────────────

/**
 * Updates a knowledge note.
 *
 * @param noteId - The note to update
 * @param data - Fields to update
 * @returns The updated note, or null on error
 *
 * @security RLS enforces foundry isolation
 */
export async function updateKnowledgeNote(
  noteId: string,
  data: Partial<Pick<KnowledgeNote,
    'title' | 'content' | 'description' | 'note_type' | 'domain_id' | 'tags' | 'confidence'
  >>
): Promise<KnowledgeNote | null> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { data: note, error } = await (supabase as any)
      .from('knowledge_notes')
    .update(data)
    .eq('id', noteId)
    .select()
    .single()

  if (error) {
    console.error('[KnowledgeVault] Failed to update note:', {
      noteId,
      error: error.message,
    })
    return null
  }

  return note as unknown as KnowledgeNote
}

// ─── Notes: Archive / Delete ─────────────────────────────────────────

/**
 * Archives or unarchives a knowledge note (soft delete).
 *
 * @param noteId - The note to archive
 * @param archived - Whether to archive (true) or restore (false)
 *
 * @security RLS enforces foundry isolation
 */
export async function archiveKnowledgeNote(
  noteId: string,
  archived: boolean = true
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_notes')
    .update({ is_archived: archived })
    .eq('id', noteId)

  if (error) {
    console.error('[KnowledgeVault] Failed to archive note:', {
      noteId,
      error: error.message,
    })
    return false
  }

  return true
}

/**
 * Permanently deletes a knowledge note and its links.
 *
 * @param noteId - The note to delete
 *
 * @security RLS enforces foundry isolation
 */
export async function deleteKnowledgeNote(noteId: string): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_notes')
    .delete()
    .eq('id', noteId)

  if (error) {
    console.error('[KnowledgeVault] Failed to delete note:', {
      noteId,
      error: error.message,
    })
    return false
  }

  return true
}

// ─── Notes: Pin / Verify ─────────────────────────────────────────────

/**
 * Pins or unpins a knowledge note.
 *
 * @param noteId - The note to pin/unpin
 * @param pinned - Whether to pin (true) or unpin (false)
 *
 * @security RLS enforces foundry isolation
 */
export async function pinKnowledgeNote(
  noteId: string,
  pinned: boolean = true
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_notes')
    .update({ is_pinned: pinned })
    .eq('id', noteId)

  if (error) {
    console.error('[KnowledgeVault] Failed to pin note:', {
      noteId,
      error: error.message,
    })
    return false
  }

  return true
}

/**
 * Marks a knowledge note as verified by a user.
 *
 * @description Verified notes are treated as confirmed facts. Unverified
 * notes are treated as AI-generated claims that may need human review.
 *
 * @param noteId - The note to verify
 * @param userId - The user verifying
 * @param verified - Whether to verify (true) or unverify (false)
 *
 * @security RLS enforces foundry isolation
 * @audit Tracks who verified and when
 */
export async function verifyKnowledgeNote(
  noteId: string,
  userId: string,
  verified: boolean = true
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_notes')
    .update({
      is_verified: verified,
      verified_by: verified ? userId : null,
      verified_at: verified ? new Date().toISOString() : null,
    })
    .eq('id', noteId)

  if (error) {
    console.error('[KnowledgeVault] Failed to verify note:', {
      noteId,
      error: error.message,
    })
    return false
  }

  return true
}

// ─── Links: Create / Remove ──────────────────────────────────────────

/**
 * Creates a link between two knowledge notes.
 *
 * @param foundryId - The foundry these notes belong to
 * @param sourceNoteId - The source note
 * @param targetNoteId - The target note
 * @param relationship - The semantic relationship
 * @param description - Optional description of why they're linked
 * @param discoveredBy - How this link was discovered
 * @returns True if created, false on error
 *
 * @security RLS enforces foundry isolation
 */
export async function createKnowledgeLink(
  foundryId: string,
  sourceNoteId: string,
  targetNoteId: string,
  relationship: KnowledgeLinkRelationship = 'related',
  description: string = '',
  discoveredBy: LinkDiscoverySource = 'system'
): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_links missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_links')
    .insert({
      foundry_id: foundryId,
      source_note_id: sourceNoteId,
      target_note_id: targetNoteId,
      relationship,
      description,
      discovered_by: discoveredBy,
    })

  if (error) {
    // Unique constraint violation means link already exists — not an error
    if (error.code === '23505') {
      return true
    }
    console.error('[KnowledgeVault] Failed to create link:', {
      sourceNoteId,
      targetNoteId,
      error: error.message,
    })
    return false
  }

  // INTENT: When a note supersedes another, the target is automatically stale
  if (relationship === 'supersedes') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
    await (supabase as any)
      .from('knowledge_notes')
      .update({ is_stale: true, stale_at: new Date().toISOString() })
      .eq('id', targetNoteId)
  }

  return true
}

/**
 * Removes a link between two knowledge notes.
 *
 * @param linkId - The link to remove
 *
 * @security RLS enforces foundry isolation
 */
export async function removeKnowledgeLink(linkId: string): Promise<boolean> {
  const supabase = await createClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_links missing from generated DB types
  const { error } = await (supabase as any)
      .from('knowledge_links')
    .delete()
    .eq('id', linkId)

  if (error) {
    console.error('[KnowledgeVault] Failed to remove link:', {
      linkId,
      error: error.message,
    })
    return false
  }

  return true
}

// ─── Domains ─────────────────────────────────────────────────────────

/**
 * Ensures default domains exist for a foundry. Creates them if missing.
 * Called when the Knowledge page is first accessed.
 *
 * @param foundryId - The foundry to seed domains for
 * @returns The list of domains (existing + newly created)
 *
 * @security RLS enforces foundry isolation
 */
export async function ensureDefaultDomains(
  foundryId: string
): Promise<KnowledgeDomain[]> {
  const supabase = await createClient()

  // Check if domains already exist
  const { data: existing } = await supabase
    .from('knowledge_domains')
    .select('*')
    .eq('foundry_id', foundryId)
    .order('sort_order', { ascending: true })

  if (existing && existing.length > 0) {
    return existing as unknown as KnowledgeDomain[]
  }

  // Seed defaults
  const domainsToInsert = DEFAULT_DOMAINS.map((d) => ({
    foundry_id: foundryId,
    ...d,
  }))

  const { data: created, error } = await supabase
    .from('knowledge_domains')
    .insert(domainsToInsert)
    .select()

  if (error) {
    console.error('[KnowledgeVault] Failed to seed default domains:', {
      foundryId,
      error: error.message,
    })
    return []
  }

  return (created ?? []) as unknown as KnowledgeDomain[]
}

/**
 * Fetches all domains for a foundry.
 *
 * @param foundryId - The foundry to fetch domains for
 * @returns Ordered list of domains
 *
 * @security RLS enforces foundry isolation
 */
export async function getKnowledgeDomains(
  foundryId: string
): Promise<KnowledgeDomain[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('knowledge_domains')
    .select('*')
    .eq('foundry_id', foundryId)
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[KnowledgeVault] Failed to fetch domains:', {
      foundryId,
      error: error.message,
    })
    return []
  }

  return (data ?? []) as unknown as KnowledgeDomain[]
}

// ─── Specialist Consultation ─────────────────────────────────────────

/**
 * Searches the knowledge vault for notes relevant to a specialist's query.
 * Used to inject context into specialist prompts before they respond.
 *
 * @description Returns the most relevant notes by matching the query
 * against note titles, content, and descriptions. Prioritizes verified
 * and high-confidence notes.
 *
 * @param foundryId - The foundry to search in
 * @param query - The search query (typically the user's message to the specialist)
 * @param specialistId - The specialist requesting context (excluded from results to avoid self-reference)
 * @param limit - Maximum number of notes to return
 * @returns Formatted context string ready for injection into a prompt
 *
 * @security RLS enforces foundry isolation
 */
export interface KnowledgeSearchResult {
  /** Formatted prompt block for specialist context injection */
  promptBlock: string
  /** Number of knowledge notes referenced */
  noteCount: number
  /** Titles of referenced notes (for UI display) */
  noteTitles: string[]
}

export async function searchKnowledgeForSpecialist(
  foundryId: string,
  query: string,
  specialistId?: string,
  limit: number = 12
): Promise<KnowledgeSearchResult> {
  const supabase = await createClient()

  // DECISION: Search title + content + description, not just title.
  // The GIN index exists but Supabase JS can't target a combined tsvector.
  // Using ilike on all three columns with OR — fast enough for <1000 notes.
  const searchTerms = query
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 6)

  if (searchTerms.length === 0) {
    return { promptBlock: '', noteCount: 0, noteTitles: [] }
  }

  // Build OR filter: each term matches title, content, or description
  const orFilters = searchTerms
    .map((term) => `title.ilike.%${term}%,content.ilike.%${term}%,description.ilike.%${term}%`)
    .join(',')

  const selectFields = 'id, title, content, description, note_type, source_specialist, confidence, is_verified, tags, created_at, domain_id'

  type SpecialistSearchNote = {
    id: string
    title: string
    content: string | null
    description: string | null
    note_type: string
    source_specialist: string | null
    confidence: number | null
    is_verified: boolean | null
    tags: string[] | null
    created_at: string | null
    domain_id: string | null
  }

  // DECISION: Domain-boosted two-query approach when specialist has domain mappings.
  // Query 1 fetches notes in the specialist's domain(s) (limit 8), Query 2 fetches
  // cross-domain notes (limit 4). This prioritizes domain-relevant knowledge while
  // still surfacing cross-cutting insights.
  const domainSlugs = getSpecialistDomainSlugs(specialistId ?? '')
  let notes: SpecialistSearchNote[] = []

  if (domainSlugs.length > 0) {
    // Fetch domain IDs for the specialist's domains
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_domains may not be in generated types
    const { data: domainRows } = await (supabase as any)
      .from('knowledge_domains')
      .select('id')
      .eq('foundry_id', foundryId)
      .in('slug', domainSlugs)

    const domainIds = (domainRows ?? []).map((d: { id: string }) => d.id)

    if (domainIds.length > 0) {
      // Query 1: domain-matched notes (up to 8)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
      let domainQuery = (supabase as any)
        .from('knowledge_notes')
        .select(selectFields)
        .eq('foundry_id', foundryId)
        .eq('is_archived', false)
        .eq('is_stale', false)
        .in('domain_id', domainIds)
        .or(orFilters)
        .order('is_verified', { ascending: false })
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(8)

      if (specialistId) {
        domainQuery = domainQuery.neq('source_specialist', specialistId)
      }

      // Query 2: cross-domain notes (fetch enough to fill after dedup)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
      let crossQuery = (supabase as any)
        .from('knowledge_notes')
        .select(selectFields)
        .eq('foundry_id', foundryId)
        .eq('is_archived', false)
        .eq('is_stale', false)
        .or(orFilters)
        .order('is_verified', { ascending: false })
        .order('confidence', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit)

      if (specialistId) {
        crossQuery = crossQuery.neq('source_specialist', specialistId)
      }

      const [domainResult, crossResult] = await Promise.all([domainQuery, crossQuery])

      const domainNotes = (domainResult.data ?? []) as SpecialistSearchNote[]
      const domainNoteIds = new Set(domainNotes.map((n) => n.id))

      // Merge: domain notes first, then cross-domain (excluding duplicates), capped at 4
      const crossNotes = ((crossResult.data ?? []) as SpecialistSearchNote[])
        .filter((n) => !domainNoteIds.has(n.id))
        .slice(0, 4)

      notes = [...domainNotes, ...crossNotes]
    }
  }

  // Fallback: no specialist domains or no domain IDs found — use single query
  if (notes.length === 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes missing from generated DB types
    let fallbackQuery = (supabase as any)
      .from('knowledge_notes')
      .select(selectFields)
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .eq('is_stale', false)
      .or(orFilters)
      .order('is_verified', { ascending: false })
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit)

    if (specialistId) {
      fallbackQuery = fallbackQuery.neq('source_specialist', specialistId)
    }

    const { data: rawNotes } = await fallbackQuery
    notes = (rawNotes ?? []) as SpecialistSearchNote[]
  }

  if (notes.length === 0) {
    return { promptBlock: '', noteCount: 0, noteTitles: [] }
  }

  // Format for prompt injection
  const lines: string[] = [
    '## Organizational Knowledge (from your team\'s Knowledge Vault)',
    '',
    'IMPORTANT: When your response draws on this knowledge, cite it naturally.',
    'Example: "Based on your decision from March 12 to focus on enterprise customers..."',
    'If your advice CONTRADICTS a stored decision or fact, flag it explicitly:',
    '"Note: this differs from your earlier decision to [X] because [reason]."',
    '',
  ]

  for (const note of notes) {
    const verifiedTag = note.is_verified ? ' ✓ VERIFIED' : ''
    const specialist = note.source_specialist ? ` (from ${note.source_specialist})` : ''
    const date = new Date(note.created_at ?? '').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })

    lines.push(`### ${note.title}${verifiedTag}`)
    lines.push(`*${note.note_type}${specialist} — ${date}*`)
    lines.push('')
    lines.push(note.content ?? '')
    lines.push('')
  }

  return {
    promptBlock: lines.join('\n'),
    noteCount: notes.length,
    noteTitles: notes.map(n => n.title),
  }
}

// ─── Vault Stats ─────────────────────────────────────────────────────

/**
 * Fetches overview statistics for the vault dashboard.
 *
 * @param foundryId - The foundry to get stats for
 * @returns Vault statistics
 *
 * @security RLS enforces foundry isolation
 */
/** Row shape for knowledge_notes stats query (table may be missing from generated DB types). */
type KnowledgeNoteStatsRow = { note_type: string | null; source_specialist: string | null; is_verified: boolean | null; is_stale: boolean | null }

export async function getVaultStats(
  foundryId: string
): Promise<VaultStats> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge_notes/knowledge_links missing from generated DB types
  const db = supabase as any
  const [
    notesResult,
    linksResult,
    domainsResult,
    recentResult,
    pinnedResult,
    docsResult,
  ] = await Promise.allSettled([
    db
      .from('knowledge_notes')
      .select('note_type, source_specialist, is_verified, is_stale', { count: 'exact' })
      .eq('foundry_id', foundryId)
      .eq('is_archived', false),
    db
      .from('knowledge_links')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId),
    supabase
      .from('knowledge_domains')
      .select('*')
      .eq('foundry_id', foundryId)
      .order('sort_order', { ascending: true }),
    db
      .from('knowledge_notes')
      .select(SUMMARY_FIELDS)
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(5),
    db
      .from('knowledge_notes')
      .select(SUMMARY_FIELDS)
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .eq('is_pinned', true)
      .order('updated_at', { ascending: false })
      .limit(10),
    // Count notes created from document uploads (non-empty extraction_metadata)
    db
      .from('knowledge_notes')
      .select('id', { count: 'exact', head: true })
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .neq('extraction_metadata', '{}'),
  ])

  const notes = (notesResult.status === 'fulfilled' ? notesResult.value.data ?? [] : []) as unknown as KnowledgeNoteStatsRow[]
  const totalLinks = linksResult.status === 'fulfilled' ? linksResult.value.count ?? 0 : 0
  const domains = domainsResult.status === 'fulfilled'
    ? (domainsResult.value.data ?? []) as unknown as KnowledgeDomain[]
    : []
  const recentNotes = recentResult.status === 'fulfilled'
    ? (recentResult.value.data ?? []) as unknown as KnowledgeNoteSummary[]
    : []
  const pinnedNotes = pinnedResult.status === 'fulfilled'
    ? (pinnedResult.value.data ?? []) as unknown as KnowledgeNoteSummary[]
    : []
  const documentsProcessed = docsResult.status === 'fulfilled' ? docsResult.value.count ?? 0 : 0

  // Aggregate note types
  const notesByType: Record<string, number> = {}
  const specialistCounts: Record<string, number> = {}
  let verifiedCount = 0
  let unverifiedCount = 0
  let staleCount = 0

  for (const note of notes) {
    const nt = note.note_type ?? ''
    notesByType[nt] = (notesByType[nt] ?? 0) + 1

    if (note.source_specialist) {
      specialistCounts[note.source_specialist] = (specialistCounts[note.source_specialist] ?? 0) + 1
    }

    if (note.is_verified) {
      verifiedCount++
    } else {
      unverifiedCount++
    }

    if (note.is_stale) {
      staleCount++
    }
  }

  return {
    totalNotes: notes.length,
    totalLinks,
    notesByType: notesByType as Record<KnowledgeNoteType, number>,
    notesByDomain: domains.map((d) => ({ domain: d, count: d.note_count })),
    notesBySpecialist: Object.entries(specialistCounts).map(([specialistId, count]) => ({
      specialistId,
      count,
    })),
    recentNotes,
    pinnedNotes,
    verifiedCount,
    unverifiedCount,
    staleCount,
    documentsProcessed,
  }
}

// ─── Staleness ──────────────────────────────────────────────────────

/**
 * Marks notes as stale based on their age and domain.
 *
 * @description Strategy domain notes go stale after 90 days, all others after
 * 180 days. Notes with a custom `staleness_window_days` override the default.
 * Uses two batch UPDATE queries for efficiency (one per window).
 *
 * @param foundryId - The foundry to scan for stale notes
 * @returns Number of notes marked stale
 *
 * @security RLS enforces foundry isolation
 */
export async function markStaleNotes(foundryId: string): Promise<number> {
  const supabase = await createClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge tables missing from generated DB types
  const db = supabase as any

  // STEP 1: Handle notes with custom staleness_window_days
  // Fetch all non-archived, non-stale notes that have a custom window
  const { data: customWindowNotes } = await db
    .from('knowledge_notes')
    .select('id, updated_at, staleness_window_days')
    .eq('foundry_id', foundryId)
    .eq('is_archived', false)
    .eq('is_stale', false)
    .not('staleness_window_days', 'is', null)

  const now = new Date()
  const customStaleIds: string[] = []

  for (const note of customWindowNotes ?? []) {
    const updatedAt = new Date(note.updated_at)
    const windowMs = (note.staleness_window_days as number) * 24 * 60 * 60 * 1000
    if (now.getTime() - updatedAt.getTime() > windowMs) {
      customStaleIds.push(note.id as string)
    }
  }

  let markedCount = 0

  if (customStaleIds.length > 0) {
    const { count } = await db
      .from('knowledge_notes')
      .update({ is_stale: true, stale_at: now.toISOString() })
      .in('id', customStaleIds)
    markedCount += count ?? customStaleIds.length
  }

  // STEP 2: Get the strategy domain ID for this foundry
  const { data: strategyDomain } = await supabase
    .from('knowledge_domains')
    .select('id')
    .eq('slug', 'strategy')
    .eq('foundry_id', foundryId)
    .maybeSingle()

  const strategyDomainId = strategyDomain?.id ?? null

  // STEP 3: Mark strategy-domain notes stale (90 days) — exclude custom-window notes
  if (strategyDomainId) {
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString()

    const strategyQuery = db
      .from('knowledge_notes')
      .update({ is_stale: true, stale_at: now.toISOString() })
      .eq('foundry_id', foundryId)
      .eq('is_archived', false)
      .eq('is_stale', false)
      .eq('domain_id', strategyDomainId)
      .is('staleness_window_days', null)
      .lt('updated_at', ninetyDaysAgo)

    const { count: strategyCount } = await strategyQuery
    markedCount += strategyCount ?? 0
  }

  // STEP 4: Mark all other notes stale (180 days) — exclude strategy domain and custom-window notes
  const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString()

  let othersQuery = db
    .from('knowledge_notes')
    .update({ is_stale: true, stale_at: now.toISOString() })
    .eq('foundry_id', foundryId)
    .eq('is_archived', false)
    .eq('is_stale', false)
    .is('staleness_window_days', null)
    .lt('updated_at', oneEightyDaysAgo)

  if (strategyDomainId) {
    othersQuery = othersQuery.neq('domain_id', strategyDomainId)
  }

  const { count: othersCount } = await othersQuery
  markedCount += othersCount ?? 0

  return markedCount
}
