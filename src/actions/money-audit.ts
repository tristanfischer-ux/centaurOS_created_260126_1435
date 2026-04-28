'use server'

/**
 * Money Audit server actions.
 *
 * Reads from the SHARED audit_log table filtered to section='money' for the
 * caller's foundry. Cursor-based pagination over created_at + id (id breaks
 * timestamp ties — postgres `gen_random_uuid()` ordering is stable enough
 * within a single timestamp).
 *
 * The shared audit_log RLS policy ("Founders can view audit log") already
 * restricts SELECT to Founder role. We layer a server-side Founder check on
 * top so the export action can hard-fail before generating CSV bytes (RLS
 * would also block, but failing earlier is clearer).
 */

import { withAuth } from '@/lib/server-action-utils'
import type { Database } from '@/types/database.types'

type MemberRole = Database['public']['Enums']['member_role']

export type MoneyAuditEntry = {
  id: string
  created_at: string
  actor_user_id: string | null
  actor_full_name: string | null
  actor_email: string | null
  actor_specialist: string | null
  event: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Record<string, unknown> | null
}

export type MoneyAuditCursor = {
  created_at: string
  id: string
}

export type MoneyAuditPage = {
  rows: MoneyAuditEntry[]
  nextCursor: MoneyAuditCursor | null
  hasMore: boolean
}

const MAX_PAGE_LIMIT = 100
const DEFAULT_PAGE_LIMIT = 50

type AuditRowJoined = {
  id: string
  created_at: string
  actor_user_id: string | null
  user_id: string | null
  actor_specialist: string | null
  event: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  payload: Database['public']['Tables']['audit_log']['Row']['payload']
  metadata: Database['public']['Tables']['audit_log']['Row']['metadata']
}

async function getCallerFoundryRole(
  supabase: Awaited<ReturnType<typeof import('@/lib/supabase/server').createClient>>,
  userId: string,
  foundryId: string,
): Promise<MemberRole | null> {
  const { data } = await supabase
    .from('foundry_memberships')
    .select('role, active')
    .eq('user_id', userId)
    .eq('foundry_id', foundryId)
    .maybeSingle()
  if (!data || !data.active) return null
  return data.role
}

function parseCursor(raw: string | undefined | null): MoneyAuditCursor | null {
  if (!raw) return null
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
    const parsed = JSON.parse(decoded) as { created_at?: unknown; id?: unknown }
    if (typeof parsed.created_at !== 'string' || typeof parsed.id !== 'string') {
      return null
    }
    if (Number.isNaN(new Date(parsed.created_at).getTime())) return null
    return { created_at: parsed.created_at, id: parsed.id }
  } catch {
    return null
  }
}

function serialiseCursor(c: MoneyAuditCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf-8').toString('base64url')
}

function coercePayload(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  return null
}

/**
 * Read a page of money-scoped audit_log rows. Cursor is base64url(JSON) of
 * the previous page's last { created_at, id }. Returns { rows, nextCursor }.
 */
export async function getMoneyAuditLog(opts: {
  cursor?: string | null
  limit?: number
} = {}): Promise<MoneyAuditPage | { error: string }> {
  const limit = Math.min(
    Math.max(1, opts.limit ?? DEFAULT_PAGE_LIMIT),
    MAX_PAGE_LIMIT,
  )
  const cursor = parseCursor(opts.cursor ?? null)

  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can view the money audit log' }
    }

    let query = supabase
      .from('audit_log')
      .select(
        'id, created_at, actor_user_id, user_id, actor_specialist, event, action, entity_type, entity_id, payload, metadata',
      )
      .eq('foundry_id', foundryId)
      .eq('section', 'money')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      // +1 so we can detect a next page without a count query.
      .limit(limit + 1)

    if (cursor) {
      // Strict cursor: rows with created_at < cursor.created_at,
      // OR (created_at = cursor.created_at AND id < cursor.id).
      // Postgrest .or() filter keeps the same ordering.
      query = query.or(
        `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
      )
    }

    const { data: raw, error } = await query

    if (error) return { error: error.message }

    const rows = (raw ?? []) as AuditRowJoined[]

    const hasMore = rows.length > limit
    const trimmed = hasMore ? rows.slice(0, limit) : rows

    // Resolve actor names — single follow-up query rather than nested join,
    // which keeps the audit_log type signature simple and avoids RLS
    // surprises on the profiles join.
    const userIds = Array.from(
      new Set(
        trimmed
          .map((r) => r.actor_user_id ?? r.user_id)
          .filter((id): id is string => !!id),
      ),
    )

    const profileById = new Map<string, { full_name: string | null; email: string | null }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const p of profiles ?? []) {
        profileById.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null })
      }
    }

    const entries: MoneyAuditEntry[] = trimmed.map((r) => {
      const actorId = r.actor_user_id ?? r.user_id
      const actor = actorId ? profileById.get(actorId) : undefined
      return {
        id: r.id,
        created_at: r.created_at,
        actor_user_id: actorId,
        actor_full_name: actor?.full_name ?? null,
        actor_email: actor?.email ?? null,
        actor_specialist: r.actor_specialist,
        event: r.event,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        // Prefer the SHARED-SCHEMA `payload` column; fall back to legacy
        // `metadata` for rows written before the dual-write helper landed.
        payload: coercePayload(r.payload) ?? coercePayload(r.metadata),
      }
    })

    const nextCursor: MoneyAuditCursor | null = hasMore
      ? { created_at: entries[entries.length - 1].created_at, id: entries[entries.length - 1].id }
      : null

    return { rows: entries, nextCursor, hasMore }
  })
}

/**
 * Encode a cursor for use in a URL query string. Exposed so the page
 * component can build pagination links.
 */
export async function encodeMoneyAuditCursor(c: MoneyAuditCursor): Promise<string> {
  return serialiseCursor(c)
}

/**
 * Export the FULL money audit log as CSV bytes. Founder only (defence in
 * depth — RLS also enforces). Caps the export at 50,000 rows to avoid an
 * unbounded query exhausting memory; the response carries a flag if the
 * cap was hit so the caller can warn the user.
 */
export async function exportMoneyAuditLogCsv(): Promise<
  | { csv: string; rows: number; truncated: boolean; filename: string }
  | { error: string }
> {
  const HARD_CAP = 50_000

  return withAuth(async ({ supabase, foundryId, user }) => {
    const role = await getCallerFoundryRole(supabase, user.id, foundryId)
    if (role !== 'Founder') {
      return { error: 'Only founders can export the money audit log' }
    }

    const { data: raw, error } = await supabase
      .from('audit_log')
      .select(
        'id, created_at, actor_user_id, user_id, actor_specialist, event, action, entity_type, entity_id, payload, metadata, ip_address, user_agent',
      )
      .eq('foundry_id', foundryId)
      .eq('section', 'money')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(HARD_CAP + 1)

    if (error) return { error: error.message }

    const rows = raw ?? []
    const truncated = rows.length > HARD_CAP
    const exportRows = truncated ? rows.slice(0, HARD_CAP) : rows

    // Resolve actor names in one pass.
    const userIds = Array.from(
      new Set(
        exportRows
          .map((r) => r.actor_user_id ?? r.user_id)
          .filter((id): id is string => !!id),
      ),
    )

    const profileById = new Map<string, { full_name: string | null; email: string | null }>()
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      for (const p of profiles ?? []) {
        profileById.set(p.id, { full_name: p.full_name ?? null, email: p.email ?? null })
      }
    }

    const headers = [
      'timestamp',
      'actor_user_id',
      'actor_name',
      'actor_email',
      'actor_specialist',
      'event',
      'action',
      'entity_type',
      'entity_id',
      'ip_address',
      'user_agent',
      'payload_json',
    ]

    const lines: string[] = [headers.join(',')]
    for (const r of exportRows) {
      const actorId = r.actor_user_id ?? r.user_id
      const actor = actorId ? profileById.get(actorId) : undefined
      const payloadJson = JSON.stringify(
        coercePayload(r.payload) ?? coercePayload(r.metadata) ?? {},
      )
      lines.push(
        [
          r.created_at,
          actorId ?? '',
          actor?.full_name ?? '',
          actor?.email ?? '',
          r.actor_specialist ?? '',
          r.event ?? '',
          r.action ?? '',
          r.entity_type ?? '',
          r.entity_id ?? '',
          // ip_address comes back as the unknown type from postgrest — cast
          // through String to a safe representation.
          r.ip_address ? String(r.ip_address) : '',
          r.user_agent ?? '',
          payloadJson,
        ]
          .map(csvEscape)
          .join(','),
      )
    }

    const filename = `money-audit-${foundryId}-${new Date().toISOString().slice(0, 10)}.csv`

    return {
      csv: lines.join('\n'),
      rows: exportRows.length,
      truncated,
      filename,
    }
  })
}

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}
