'use server'

/**
 * @file audit.ts — Business audit logging for ForgeOS.
 *
 * @description Provides `logAudit()` (fire-and-forget writer) and
 * `getAuditLogs()` (Founder-only reader) for the audit_log table.
 * Separate from security_audit_log which tracks auth/security events.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getFoundryIdCached } from '@/lib/supabase/foundry-context'

// ─── Types ───────────────────────────────────────────────────────────────────

export type AuditAction =
  | 'user.invited'
  | 'team.deleted'
  | 'task.deleted'
  | 'objective.deleted'
  | 'listing.claimed'
  | 'settings.updated'

interface LogAuditParams {
  action: AuditAction
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
  /** Pass from withAuth context to avoid redundant lookups */
  userId?: string
  /** Pass from withAuth context to avoid redundant lookups */
  foundryId?: string
}

interface AuditLogEntry {
  id: string
  action: string
  entity_type: string | null
  entity_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  user_id: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
    role: string | null
  } | null
}

interface GetAuditLogsOptions {
  action?: string
  limit?: number
  offset?: number
}

// ─── Writer ──────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget audit log writer.
 *
 * @description Writes to audit_log via the admin client (bypasses RLS).
 * NEVER throws — logs errors to console on failure.
 *
 * @param params - Audit event details
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    // Resolve userId if not passed
    let userId = params.userId
    if (!userId) {
      const supabase = await createClient()
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id
    }
    if (!userId) return

    // Resolve foundryId if not passed
    let foundryId = params.foundryId
    if (!foundryId) {
      foundryId = await getFoundryIdCached() ?? undefined
    }
    // Some flows (e.g. supplier claim) may not have a foundry — skip audit
    if (!foundryId) return

    // SECURITY: admin client — audit log writes, foundry_id filtered
    const adminClient = createAdminClient()
    const { error } = await adminClient.from('audit_log').insert({
      foundry_id: foundryId,
      user_id: userId,
      action: params.action,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
      metadata: params.metadata ?? {},
    })

    if (error) {
      console.error('[Audit] Failed to write audit log:', {
        action: params.action,
        error: error.message,
      })
    }
  } catch (err) {
    console.error('[Audit] Audit log error:', {
      action: params.action,
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

// ─── Reader ──────────────────────────────────────────────────────────────────

/**
 * Query audit logs for the current user's foundry.
 *
 * @description Uses the user's Supabase client so RLS enforces
 * Founder-only access. Joins profiles for user name/avatar.
 *
 * @param options - Filter and pagination options
 * @returns Paginated audit log entries with user details
 */
export async function getAuditLogs(options: GetAuditLogsOptions = {}): Promise<{
  data: AuditLogEntry[]
  count: number
  error?: string
}> {
  const { action, limit: rawLimit = 50, offset: rawOffset = 0 } = options
  const limit = Math.min(Math.max(1, rawLimit), 100)
  const offset = Math.max(0, rawOffset)

  const supabase = await createClient()

  let query = supabase
    .from('audit_log')
    .select(
      `id, action, entity_type, entity_id, metadata, created_at, user_id,
       profiles!audit_log_user_id_fkey(full_name, avatar_url, role)`,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (action) {
    query = query.eq('action', action)
  }

  const { data, count, error } = await query

  if (error) {
    console.error('[Audit] Failed to fetch audit logs:', error.message)
    return { data: [], count: 0, error: 'Failed to load audit logs' }
  }

  return {
    data: (data as unknown as AuditLogEntry[]) ?? [],
    count: count ?? 0,
  }
}
