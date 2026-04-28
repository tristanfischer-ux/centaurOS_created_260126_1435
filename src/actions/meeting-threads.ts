'use server'

/**
 * @file meeting-threads.ts
 *
 * @description Server actions for the Brainstorming-as-Perplexity feature.
 * Every brainstorm is persisted as a meeting_thread with its entries so
 * founders can return to, share, follow up on, or branch from any session.
 *
 * @security All operations require authentication and enforce foundry
 * isolation via RLS. The foundry_id is always derived from the authenticated
 * user's profile — never trusted from the client.
 *
 * @related
 * - supabase/migrations/20260425210000_meeting_threads.sql — Schema
 * - src/app/(platform)/agents/m/[id]/page.tsx — Persistent URL view
 * - src/app/(platform)/agents/team-meeting-dialog.tsx — Meeting runner
 */

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'
import { sanitizeErrorMessage, isValidUUID } from '@/lib/security/sanitize'
import { rateLimit } from '@/lib/security/rate-limit'
import type { Json } from '@/types/database.types'

// ============================================================================
// TYPES
// ============================================================================

export interface MeetingEntryInput {
  specialistId?: string
  specialistName?: string
  councilPosition?: string
  arrivalMs?: number
  roundNumber: number
  content: string
  role: 'specialist' | 'founder'
}

export interface CreateMeetingThreadInput {
  topic: string
  councilTier: string
  specialistIds: string[]
  /** Structured wrap-up outputs — notes, decisions, action items, etc. */
  outputs?: Record<string, unknown>
  /** The agent_artifacts row id written at the same wrap-up */
  artifactId?: string
  /** Individual specialist responses, in order */
  entries: MeetingEntryInput[]
}

export interface MeetingThreadRow {
  id: string
  foundryId: string
  authorUserId: string
  topic: string
  councilTier: string
  specialistIds: string[]
  outputs: Record<string, unknown> | null
  citations: unknown[]
  artifactId: string | null
  parentThreadId: string | null
  branchedFromEntryId: string | null
  createdAt: string
  updatedAt: string
}

export interface MeetingEntryRow {
  id: string
  threadId: string
  specialistId: string | null
  specialistName: string | null
  councilPosition: string | null
  arrivalMs: number | null
  roundNumber: number
  content: string
  role: 'specialist' | 'founder'
  createdAt: string
}

export interface MeetingThreadDetail extends MeetingThreadRow {
  entries: MeetingEntryRow[]
  /** Present when this thread is a branch */
  parentTopic?: string
  parentCreatedAt?: string
}

// ============================================================================
// HELPERS
// ============================================================================

function rowToThreadRow(row: Record<string, unknown>): MeetingThreadRow {
  return {
    id: row.id as string,
    foundryId: row.foundry_id as string,
    authorUserId: row.author_user_id as string,
    topic: row.topic as string,
    councilTier: row.council_tier as string,
    specialistIds: (row.specialist_ids as string[]) ?? [],
    outputs: (row.outputs as Record<string, unknown>) ?? null,
    citations: (row.citations as unknown[]) ?? [],
    artifactId: (row.artifact_id as string) ?? null,
    parentThreadId: (row.parent_thread_id as string) ?? null,
    branchedFromEntryId: (row.branched_from_entry_id as string) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }
}

function rowToEntryRow(row: Record<string, unknown>): MeetingEntryRow {
  return {
    id: row.id as string,
    threadId: row.thread_id as string,
    specialistId: (row.specialist_id as string) ?? null,
    specialistName: (row.specialist_name as string) ?? null,
    councilPosition: (row.council_position as string) ?? null,
    arrivalMs: (row.arrival_ms as number) ?? null,
    roundNumber: (row.round_number as number) ?? 1,
    content: row.content as string,
    role: (row.role as 'specialist' | 'founder') ?? 'specialist',
    createdAt: row.created_at as string,
  }
}

// ============================================================================
// CREATE
// ============================================================================

/**
 * Persist a completed brainstorming session as a meeting_thread with entries.
 *
 * @description Called at wrap-up alongside createArtifact. Writes the thread
 * row then bulk-inserts all entries. Returns the thread id so the dialog can
 * redirect to /agents/m/<id>.
 *
 * @param input — Topic, tier, specialist list, structured outputs, all entries
 * @returns Thread id on success
 * @security AUTH + foundry isolation enforced. foundry_id derived server-side.
 */
export async function createMeetingThread(
  input: CreateMeetingThreadInput,
): Promise<{ threadId: string | null; error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { threadId: null, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { threadId: null, error: 'No active foundry' }
  }

  if (!input.topic?.trim()) {
    return { threadId: null, error: 'Topic is required' }
  }

  // SECURITY: rate-limit per user to prevent denial-of-wallet — every
  // saved thread schedules a ~$0.04 image + up to ~$0.20 of TTS audio
  // via after(). 20 saves per 10-minute window per user is plenty for
  // legitimate use (the unsubsidised UI tier is capped at 30 / month
  // separately). Caught by Gemini 2.5 Pro final review (P1).
  const rl = await rateLimit('api', `create-meeting-thread:${user.id}`, {
    limit: 20,
    window: 10 * 60 * 1000,
  })
  if (!rl.success) {
    console.warn('[MeetingThreads] Rate limit hit:', { userId: user.id, remaining: rl.remaining })
    return { threadId: null, error: 'Too many sessions. Please wait a moment before saving another.' }
  }

  // Insert thread row
  const { data: threadRow, error: threadError } = await supabase
    .from('meeting_threads')
    .insert({
      foundry_id: foundryId,
      author_user_id: user.id,
      topic: input.topic.trim(),
      council_tier: input.councilTier,
      specialist_ids: input.specialistIds,
      outputs: (input.outputs ?? null) as unknown as Json,
      // INTENT: jsonb column needs an empty JSON array, not the string "[]".
      // Passing the string round-trips through PostgREST as a JSON-encoded
      // string and then `(row.citations ?? []) as unknown[]` returns a
      // string in the page render, where typed.map crashes the meeting
      // thread view with "typed.map is not a function".
      citations: [] as unknown as Json,
      artifact_id: input.artifactId ?? null,
    })
    .select('id')
    .single()

  if (threadError || !threadRow) {
    console.error('[MeetingThreads] Failed to create thread:', {
      userId: user.id,
      foundryId,
      error: threadError?.message,
    })
    return { threadId: null, error: sanitizeErrorMessage(threadError ?? new Error('Insert failed')) }
  }

  const threadId = (threadRow as { id: string }).id

  // Bulk-insert entries (fire-and-forget errors — thread is still usable)
  if (input.entries.length > 0) {
    const entryRows = input.entries.map((e) => ({
      thread_id: threadId,
      specialist_id: e.specialistId ?? null,
      specialist_name: e.specialistName ?? null,
      council_position: e.councilPosition ?? null,
      arrival_ms: e.arrivalMs ?? null,
      round_number: e.roundNumber,
      content: e.content,
      role: e.role,
    }))

    const { error: entriesError } = await supabase
      .from('meeting_entries')
      .insert(entryRows)

    if (entriesError) {
      console.error('[MeetingThreads] Failed to insert entries:', {
        threadId,
        error: entriesError.message,
      })
      // Don't fail — thread row exists, entries loss is recoverable
    }
  }

  console.info('[MeetingThreads] Thread created:', {
    threadId,
    topic: input.topic.slice(0, 60),
    entryCount: input.entries.length,
    foundryId,
  })

  // F2 + F3: schedule cover-image and audio generation in the background.
  // Per CLAUDE.md "Vercel after(fetch) silently drops on short-lived
  // handlers" gotcha, we use after() here because createMeetingThread
  // returns from a longer-lived server-action context (the wrap-up
  // upstream waits on its result before navigating). The two jobs are
  // independent and run in parallel inside the after-block — no awaits
  // between them.
  after(async () => {
    try {
      // Dynamic imports keep the action module's cold-start lean and
      // avoid pulling the OpenAI client into every server-action bundle.
      const [{ generateSessionInfographic }, { generateSessionAudio }] = await Promise.all([
        import('./brainstorm-cover'),
        import('./brainstorm-audio'),
      ])

      // Fire both, await both with allSettled — neither blocks the other.
      const [coverResult, audioResult] = await Promise.allSettled([
        generateSessionInfographic(threadId),
        generateSessionAudio(threadId),
      ])

      if (coverResult.status === 'rejected') {
        console.error('[MeetingThreads] cover after() failed:', coverResult.reason)
      }
      if (audioResult.status === 'rejected') {
        console.error('[MeetingThreads] audio after() failed:', audioResult.reason)
      }
    } catch (err) {
      console.error('[MeetingThreads] after() block crashed:', err)
    }
  })

  return { threadId, error: null }
}

// ============================================================================
// READ — SINGLE THREAD
// ============================================================================

/**
 * Load a single meeting thread with all its entries.
 *
 * @description Server action used by /agents/m/[id]. Returns the thread,
 * all entries, and parent thread metadata for branches.
 *
 * @param threadId — UUID of the thread to load
 * @returns Full thread detail or null when not found / not authorised
 * @security RLS enforces foundry isolation
 */
export async function getMeetingThread(
  threadId: string,
): Promise<{ data: MeetingThreadDetail | null; error: string | null }> {
  if (!isValidUUID(threadId)) {
    return { data: null, error: 'Invalid thread id' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: null, error: 'Not authenticated' }
  }

  // Fetch thread
  const { data: threadRow, error: threadError } = await supabase
    .from('meeting_threads')
    .select('*')
    .eq('id', threadId)
    .single()

  if (threadError || !threadRow) {
    return { data: null, error: threadRow === null ? 'Meeting not found' : sanitizeErrorMessage(threadError!) }
  }

  // Fetch entries
  const { data: entryRows, error: entriesError } = await supabase
    .from('meeting_entries')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true })

  if (entriesError) {
    console.error('[MeetingThreads] Failed to load entries:', {
      threadId,
      error: entriesError.message,
    })
  }

  const thread = rowToThreadRow(threadRow as unknown as Record<string, unknown>)
  const entries = ((entryRows ?? []) as unknown[]).map((r) =>
    rowToEntryRow(r as Record<string, unknown>),
  )

  // Optionally fetch parent topic for branch provenance UI
  let parentTopic: string | undefined
  let parentCreatedAt: string | undefined
  if (thread.parentThreadId) {
    const { data: parentRow } = await supabase
      .from('meeting_threads')
      .select('topic, created_at')
      .eq('id', thread.parentThreadId)
      .single()

    if (parentRow) {
      const p = parentRow as unknown as Record<string, unknown>
      parentTopic = p.topic as string
      parentCreatedAt = p.created_at as string
    }
  }

  return {
    data: { ...thread, entries, parentTopic, parentCreatedAt },
    error: null,
  }
}

// ============================================================================
// READ — LIST (WITH SEARCH)
// ============================================================================

export interface MeetingThreadSummary {
  id: string
  topic: string
  councilTier: string
  specialistIds: string[]
  /** First 200 chars of the first entry's content — used in search results */
  snippet: string
  entryCount: number
  parentThreadId: string | null
  createdAt: string
  /** F1: pinned-first ordering on the saved-sessions panel */
  isPinned: boolean
  pinnedAt: string | null
  /** F2: signed URL for the generated cover image (null until ready) */
  coverImageUrl: string | null
  coverStatus: 'pending' | 'generating' | 'ready' | 'failed'
  /** F3: audio generation status — UI shows skeleton until ready */
  audioStatus: 'pending' | 'generating' | 'ready' | 'failed' | 'refused_too_long'
  audioClipsCount: number
}

export interface ListMeetingThreadsInput {
  /** Full-text search term across topic and entry content */
  search?: string
  /** Filter: 'week' | 'month' | 'all' (default 'all') */
  dateRange?: 'week' | 'month' | 'all'
  /** Only return threads that have a parent (i.e., are branches) */
  branchedOnly?: boolean
  limit?: number
  offset?: number
}

/**
 * List meeting threads for the current foundry, optionally filtered / searched.
 *
 * @description Powers the searchable history on /agents. Performs a
 * PostgreSQL full-text search across topic and entry content when a search
 * term is provided. Returns summary rows (not full entry lists).
 *
 * @param input — Search, date range, branch filter, pagination
 * @returns Array of thread summaries
 * @security RLS enforces foundry isolation
 */
export async function listMeetingThreads(
  input: ListMeetingThreadsInput = {},
): Promise<{ data: MeetingThreadSummary[]; total: number; error: string | null }> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { data: [], total: 0, error: 'Not authenticated' }
  }

  const limit = Math.min(input.limit ?? 50, 100)
  const offset = input.offset ?? 0

  // Base query — fetch threads with a count of entries via a subquery join
  // F1: pinned-first ordering, then most recent. The partial index on
  // (foundry_id, pinned_at, created_at) WHERE is_pinned = true keeps this
  // fast even at hundreds of saved sessions.
  let query = supabase
    .from('meeting_threads')
    .select(
      'id, topic, council_tier, specialist_ids, parent_thread_id, created_at, is_pinned, pinned_at, cover_image_url, cover_status, audio_clips, audio_status',
      { count: 'exact' },
    )
    .order('is_pinned', { ascending: false })
    .order('pinned_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Date range filter
  if (input.dateRange === 'week') {
    const since = new Date()
    since.setDate(since.getDate() - 7)
    query = query.gte('created_at', since.toISOString())
  } else if (input.dateRange === 'month') {
    const since = new Date()
    since.setDate(since.getDate() - 30)
    query = query.gte('created_at', since.toISOString())
  }

  // Branched-only filter
  if (input.branchedOnly) {
    query = query.not('parent_thread_id', 'is', null)
  }

  // Simple topic search (ILIKE) — server-side full-text search via .textSearch
  // is only available on text columns, and we want to search both topic and
  // entry content. For now, topic ILIKE covers the primary case; entry-content
  // search happens via a separate entries fetch below.
  if (input.search?.trim()) {
    const term = input.search.trim().replace(/[%_\\]/g, (c) => `\\${c}`)
    query = query.ilike('topic', `%${term}%`)
  }

  const { data: threadRows, error, count } = await query

  if (error) {
    console.error('[MeetingThreads] Failed to list threads:', { error: error.message })
    return { data: [], total: 0, error: sanitizeErrorMessage(error) }
  }

  const threads = threadRows ?? []

  if (threads.length === 0) {
    return { data: [], total: count ?? 0, error: null }
  }

  // Fetch first entry snippet for each thread in one query
  const threadIds = threads.map((t) => (t as Record<string, unknown>).id as string)

  const { data: snippetRows } = await supabase
    .from('meeting_entries')
    .select('thread_id, content, round_number, role')
    .in('thread_id', threadIds)
    .eq('role', 'specialist')
    .order('created_at', { ascending: true })

  // Group snippets by thread_id, take first
  const snippetMap = new Map<string, string>()
  const countMap = new Map<string, number>()

  for (const row of snippetRows ?? []) {
    const r = row as Record<string, unknown>
    const tid = r.thread_id as string
    if (!snippetMap.has(tid)) {
      const content = (r.content as string) ?? ''
      snippetMap.set(tid, content.slice(0, 200))
    }
    countMap.set(tid, (countMap.get(tid) ?? 0) + 1)
  }

  const summaries: MeetingThreadSummary[] = threads.map((t) => {
    const row = t as Record<string, unknown>
    const id = row.id as string
    const audioClips = (row.audio_clips as unknown[]) ?? []
    return {
      id,
      topic: row.topic as string,
      councilTier: row.council_tier as string,
      specialistIds: (row.specialist_ids as string[]) ?? [],
      snippet: snippetMap.get(id) ?? '',
      entryCount: countMap.get(id) ?? 0,
      parentThreadId: (row.parent_thread_id as string) ?? null,
      createdAt: row.created_at as string,
      isPinned: (row.is_pinned as boolean) ?? false,
      pinnedAt: (row.pinned_at as string) ?? null,
      coverImageUrl: (row.cover_image_url as string) ?? null,
      coverStatus: ((row.cover_status as string) ?? 'pending') as MeetingThreadSummary['coverStatus'],
      audioStatus: ((row.audio_status as string) ?? 'pending') as MeetingThreadSummary['audioStatus'],
      audioClipsCount: Array.isArray(audioClips) ? audioClips.length : 0,
    }
  })

  return { data: summaries, total: count ?? summaries.length, error: null }
}

// ============================================================================
// FOLLOW-UP — ADD ENTRIES TO EXISTING THREAD
// ============================================================================

/**
 * Append new entries to an existing meeting thread (follow-up round).
 *
 * @description Called when a founder submits a follow-up question on
 * /agents/m/[id]. Adds the founder's message and any specialist replies
 * as new entries with incremented round_number.
 *
 * @param threadId — Thread to append to
 * @param entries  — New entries to append
 * @returns New entry ids
 * @security RLS INSERT policy only allows the thread author to add entries
 */
export async function appendMeetingEntries(
  threadId: string,
  entries: MeetingEntryInput[],
): Promise<{ entryIds: string[]; error: string | null }> {
  if (!isValidUUID(threadId)) {
    return { entryIds: [], error: 'Invalid thread id' }
  }

  if (entries.length === 0) {
    return { entryIds: [], error: 'No entries provided' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { entryIds: [], error: 'Not authenticated' }
  }

  const entryRows = entries.map((e) => ({
    thread_id: threadId,
    specialist_id: e.specialistId ?? null,
    specialist_name: e.specialistName ?? null,
    council_position: e.councilPosition ?? null,
    arrival_ms: e.arrivalMs ?? null,
    round_number: e.roundNumber,
    content: e.content,
    role: e.role,
  }))

  const { data: inserted, error } = await supabase
    .from('meeting_entries')
    .insert(entryRows)
    .select('id')

  if (error) {
    console.error('[MeetingThreads] Failed to append entries:', {
      threadId,
      error: error.message,
    })
    return { entryIds: [], error: sanitizeErrorMessage(error) }
  }

  // Touch updated_at on the parent thread
  await supabase
    .from('meeting_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', threadId)

  const ids = ((inserted ?? []) as Array<{ id: string }>).map((r) => r.id)
  return { entryIds: ids, error: null }
}

// ============================================================================
// BRANCH — CREATE CHILD THREAD FROM AN ENTRY
// ============================================================================

/**
 * Branch a new meeting thread from a specific specialist entry.
 *
 * @description Creates a child thread with parent_thread_id and
 * branched_from_entry_id set. Copies entries up to and including the
 * branch point so the new thread has full context. Returns the new thread id.
 *
 * @param sourceThreadId    — Parent thread
 * @param branchFromEntryId — Entry to branch from (context copied up to here)
 * @param newTopic          — Optional override topic for the branch; defaults
 *                            to "Follow-up: <parent topic>"
 * @returns New thread id
 * @security AUTH + foundry isolation
 */
export async function branchMeetingThread(
  sourceThreadId: string,
  branchFromEntryId: string,
  newTopic?: string,
): Promise<{ threadId: string | null; error: string | null }> {
  if (!isValidUUID(sourceThreadId) || !isValidUUID(branchFromEntryId)) {
    return { threadId: null, error: 'Invalid id' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { threadId: null, error: 'Not authenticated' }
  }

  const foundryId = await getFoundryIdCached()
  if (!foundryId) {
    return { threadId: null, error: 'No active foundry' }
  }

  // Load source thread
  const { data: sourceRow, error: srcError } = await supabase
    .from('meeting_threads')
    .select('topic, council_tier, specialist_ids, outputs')
    .eq('id', sourceThreadId)
    .single()

  if (srcError || !sourceRow) {
    return { threadId: null, error: 'Source thread not found' }
  }

  const src = sourceRow as unknown as Record<string, unknown>

  // Load entries up to and including the branch point
  const { data: allEntries, error: entryErr } = await supabase
    .from('meeting_entries')
    .select('*')
    .eq('thread_id', sourceThreadId)
    .order('created_at', { ascending: true })

  if (entryErr) {
    return { threadId: null, error: sanitizeErrorMessage(entryErr) }
  }

  // Find the branch entry and take everything up to that point (inclusive)
  const branchIdx = (allEntries ?? []).findIndex(
    (e) => (e as unknown as Record<string, unknown>).id === branchFromEntryId,
  )
  const priorEntries = branchIdx >= 0
    ? (allEntries ?? []).slice(0, branchIdx + 1)
    : (allEntries ?? [])

  const derivedTopic = newTopic?.trim() || `Follow-up: ${String(src.topic).slice(0, 70)}`

  // Insert branch thread
  const { data: branchRow, error: branchError } = await supabase
    .from('meeting_threads')
    .insert({
      foundry_id: foundryId,
      author_user_id: user.id,
      topic: derivedTopic,
      council_tier: src.council_tier as string,
      specialist_ids: (src.specialist_ids as string[]) ?? [],
      outputs: null,
      parent_thread_id: sourceThreadId,
      branched_from_entry_id: branchFromEntryId,
    })
    .select('id')
    .single()

  if (branchError || !branchRow) {
    return { threadId: null, error: sanitizeErrorMessage(branchError ?? new Error('Insert failed')) }
  }

  const newThreadId = (branchRow as { id: string }).id

  // Copy prior entries into the new thread
  if (priorEntries.length > 0) {
    const copiedRows = priorEntries.map((e) => {
      const entry = e as unknown as Record<string, unknown>
      return {
        thread_id: newThreadId,
        specialist_id: entry.specialist_id as string | null,
        specialist_name: entry.specialist_name as string | null,
        council_position: entry.council_position as string | null,
        arrival_ms: entry.arrival_ms as number | null,
        round_number: entry.round_number as number,
        content: entry.content as string,
        role: entry.role as string,
      }
    })

    const { error: copyError } = await supabase
      .from('meeting_entries')
      .insert(copiedRows)

    if (copyError) {
      console.error('[MeetingThreads] Failed to copy prior entries to branch:', {
        newThreadId,
        error: copyError.message,
      })
    }
  }

  console.info('[MeetingThreads] Branch created:', {
    sourceThreadId,
    newThreadId,
    branchFromEntryId,
    priorEntryCount: priorEntries.length,
  })

  return { threadId: newThreadId, error: null }
}

// ============================================================================
// DELETE — F1
// ============================================================================

/**
 * Delete a meeting thread and ALL its assets.
 *
 * @description Cascade-deletes the meeting_entries (FK ON DELETE CASCADE),
 * removes the storage objects under brainstorm-assets/<thread_id>/, then
 * the thread row itself. The RLS DELETE policy
 * (meeting_threads_delete WHERE author_user_id = auth.uid()) gates this —
 * a non-author seeing the same row through SELECT will not be able to
 * delete it.
 *
 * Storage cleanup uses the admin client because storage RLS DELETE policy
 * is owner-scoped: server-side asset writers run as service_role, so
 * `owner = auth.uid()` would be false. The user's identity is verified
 * via the row-level RLS check on the meeting_threads.delete first.
 *
 * @param threadId — UUID of the thread to remove
 * @returns ok flag + error string
 * @security Verifies author via the standard authed client BEFORE any
 *           admin-client write happens.
 */
export async function deleteMeetingThread(
  threadId: string,
): Promise<{ ok: boolean; error: string | null }> {
  if (!isValidUUID(threadId)) {
    return { ok: false, error: 'Invalid thread id' }
  }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Not authenticated' }
  }

  // Step 1 — verify the caller authored this thread via the authed client.
  // RLS will hide threads they don't own; SELECT here is the access check.
  const { data: row, error: ownErr } = await supabase
    .from('meeting_threads')
    .select('id, author_user_id')
    .eq('id', threadId)
    .single()

  if (ownErr || !row) {
    return { ok: false, error: 'Thread not found' }
  }

  if ((row as { author_user_id: string }).author_user_id !== user.id) {
    return { ok: false, error: 'Not authorised' }
  }

  // Step 2 — clean storage. Admin client because we wrote the assets as
  // service_role and the storage owner column doesn't match the user.
  const admin = createAdminClient()
  try {
    const { data: list } = await admin.storage
      .from('brainstorm-assets')
      .list(threadId, { limit: 1000 })
    const { data: audioList } = await admin.storage
      .from('brainstorm-assets')
      .list(`${threadId}/audio`, { limit: 1000 })

    const paths: string[] = []
    for (const file of list ?? []) {
      paths.push(`${threadId}/${file.name}`)
    }
    for (const file of audioList ?? []) {
      paths.push(`${threadId}/audio/${file.name}`)
    }

    if (paths.length > 0) {
      const { error: removeErr } = await admin.storage
        .from('brainstorm-assets')
        .remove(paths)
      if (removeErr) {
        console.error('[MeetingThreads] Storage cleanup failed:', {
          threadId,
          error: removeErr.message,
        })
        // Non-fatal — proceed to delete the row so the user's intent
        // (gone from their list) is honoured. Cron will sweep stragglers.
      }
    }
  } catch (storageErr) {
    console.error('[MeetingThreads] Storage cleanup threw:', {
      threadId,
      error: storageErr instanceof Error ? storageErr.message : 'unknown',
    })
  }

  // Step 3 — delete the row. meeting_entries cascade via FK.
  const { error: deleteErr } = await supabase
    .from('meeting_threads')
    .delete()
    .eq('id', threadId)

  if (deleteErr) {
    console.error('[MeetingThreads] Delete failed:', {
      threadId,
      error: deleteErr.message,
    })
    return { ok: false, error: sanitizeErrorMessage(deleteErr) }
  }

  console.info('[MeetingThreads] Thread deleted:', { threadId, userId: user.id })
  return { ok: true, error: null }
}

// ============================================================================
// PIN / UNPIN — F1
// ============================================================================

/**
 * Toggle the pinned state of a meeting thread.
 *
 * @description Pinned threads sort to the top of the saved-sessions panel.
 * The trigger touch_meeting_thread_pinned_at handles the pinned_at
 * timestamp server-side — we just flip the boolean.
 *
 * @param threadId — Thread to pin/unpin
 * @param pinned — Desired state
 * @returns ok flag + error
 */
export async function togglePinMeetingThread(
  threadId: string,
  pinned: boolean,
): Promise<{ ok: boolean; error: string | null }> {
  if (!isValidUUID(threadId)) {
    return { ok: false, error: 'Invalid thread id' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'Not authenticated' }
  }

  const { error } = await supabase
    .from('meeting_threads')
    .update({ is_pinned: pinned })
    .eq('id', threadId)
    .eq('author_user_id', user.id)

  if (error) {
    console.error('[MeetingThreads] Pin toggle failed:', { threadId, pinned, error: error.message })
    return { ok: false, error: sanitizeErrorMessage(error) }
  }

  return { ok: true, error: null }
}

// ============================================================================
// SIGNED-URL REFRESH — F2 / F3
// ============================================================================

/**
 * Refresh signed URLs for a thread's stored assets.
 *
 * @description Generated assets are stored privately. The cover_image_url
 * column holds the most recent signed URL, but it expires; this action
 * re-signs the storage path on demand for in-app render. Used by the
 * SavedSessionCard and the meeting-detail page.
 *
 * @param threadId — Thread to fetch URLs for
 * @returns Signed URLs (image + audio clip array) on success
 */
export async function refreshSessionAssetUrls(
  threadId: string,
): Promise<{
  coverUrl: string | null
  audioClips: Array<{ specialistId: string; voice: string; url: string; durationMs: number | null }>
  error: string | null
}> {
  if (!isValidUUID(threadId)) {
    return { coverUrl: null, audioClips: [], error: 'Invalid thread id' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { coverUrl: null, audioClips: [], error: 'Not authenticated' }
  }

  // RLS on meeting_threads enforces foundry isolation
  const { data: row, error } = await supabase
    .from('meeting_threads')
    .select('cover_status, audio_clips')
    .eq('id', threadId)
    .single()

  if (error || !row) {
    return { coverUrl: null, audioClips: [], error: 'Thread not found' }
  }

  const admin = createAdminClient()
  let coverUrl: string | null = null

  if ((row as { cover_status: string }).cover_status === 'ready') {
    const { data: signed } = await admin.storage
      .from('brainstorm-assets')
      .createSignedUrl(`${threadId}/cover.png`, 60 * 60 * 24) // 24h
    coverUrl = signed?.signedUrl ?? null
  }

  const clipsRaw = ((row as { audio_clips: unknown }).audio_clips as Array<Record<string, unknown>>) ?? []
  const refreshedClips: Array<{ specialistId: string; voice: string; url: string; durationMs: number | null }> = []

  for (const clip of clipsRaw) {
    const path = clip.path as string | undefined
    if (!path) continue
    const { data: signed } = await admin.storage
      .from('brainstorm-assets')
      .createSignedUrl(path, 60 * 60 * 24)
    if (signed?.signedUrl) {
      refreshedClips.push({
        specialistId: (clip.specialist_id as string) ?? '',
        voice: (clip.voice as string) ?? '',
        url: signed.signedUrl,
        durationMs: (clip.duration_ms as number) ?? null,
      })
    }
  }

  return { coverUrl, audioClips: refreshedClips, error: null }
}
