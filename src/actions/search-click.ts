/**
 * @file search-click.ts
 *
 * @description Phase A.5 click telemetry. Server action invoked by the
 * investor and supplier results UIs whenever a user opens a card, expands
 * the why-fit panel, saves to a shortlist, or exports. Writes a row to
 * `search_click_log` keyed to the originating `search_query_log.id`.
 *
 * Companion to `src/lib/search-telemetry.ts` which writes the
 * `search_query_log` rows the click events reference.
 *
 * @security Inserts respect the RLS policy `scl_self_insert` on
 * `search_click_log` which checks `profile_id = auth.uid()`. The action is
 * fail-open — telemetry errors never throw to the UI.
 */

'use server'

import { createClient } from '@/lib/supabase/server'

export type SearchClickType = 'open' | 'save' | 'export' | 'expand'

export interface RecordSearchClickArgs {
  /** UUID of the originating search_query_log row */
  queryLogId: string
  /** UUID of the marketplace_listings row clicked, if applicable */
  listingId?: string | null
  /** Zero-indexed position in the result list */
  position: number
  /** Which interaction the user took */
  clickType: SearchClickType
}

export interface RecordSearchClickResult {
  ok: boolean
  /** Populated only when ok=false; never user-facing — for log triage */
  reason?: string
}

/**
 * Records a click event against a prior search. Returns `{ ok: true }` on
 * success and `{ ok: false }` on any failure (auth, validation, RLS, network).
 * Callers MUST treat this as fire-and-forget — never await + show errors to
 * the user. Click telemetry is supporting evidence, not part of the user
 * journey.
 */
export async function recordSearchClick(
  args: RecordSearchClickArgs,
): Promise<RecordSearchClickResult> {
  try {
    // Light validation. We trust the queryLogId is a uuid the caller just
    // received from `searchInvestors` / `searchSuppliers`; the FK constraint
    // on `search_click_log.query_log_id` will reject anything malformed.
    if (!args.queryLogId || typeof args.queryLogId !== 'string') {
      return { ok: false, reason: 'queryLogId required' }
    }
    if (
      args.clickType !== 'open' &&
      args.clickType !== 'save' &&
      args.clickType !== 'export' &&
      args.clickType !== 'expand'
    ) {
      return { ok: false, reason: 'invalid clickType' }
    }
    const safePosition =
      Number.isFinite(args.position) && args.position >= 0
        ? Math.floor(args.position)
        : 0

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { ok: false, reason: 'no auth' }

    // `search_click_log` was added in the 2026-04-29 migration; types have
    // not been regenerated yet. Cast to the shape we need at the call site.
    const { error } = await (
      supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => Promise<{
            error: { message: string } | null
          }>
        }
      }
    )
      .from('search_click_log')
      .insert({
        query_log_id: args.queryLogId,
        profile_id: user.id,
        listing_id: args.listingId ?? null,
        position: safePosition,
        click_type: args.clickType,
      })

    if (error) {
      console.warn('[recordSearchClick] insert failed (non-fatal):', error.message)
      return { ok: false, reason: 'db error' }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[recordSearchClick] threw (non-fatal):', msg)
    return { ok: false, reason: 'exception' }
  }
}
