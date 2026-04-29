/**
 * @file search-telemetry.ts
 *
 * @description Phase A.5 instrumentation helper for the marketplace + investor
 * search surfaces. Writes a row to `search_query_log` after a search completes
 * and returns the row id so the UI can attach click events via
 * `recordSearchClick`. Companion to `src/actions/search-click.ts`.
 *
 * The whole module is fail-open: if anything throws, we log a warning and
 * return `null` — telemetry must NEVER block the user's search. See the
 * Tristan-flagged "never half-wire telemetry" note in the Phase A.5 brief.
 *
 * @security Inserts respect the RLS policy `sql_self_insert` on
 * `search_query_log` which checks `profile_id = auth.uid()`. The caller
 * passes a Supabase client carrying the user's session; the policy enforces
 * the rest. Anonymous searches are not logged (RLS would reject) — callers
 * must pass a non-null `profileId`.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type SearchSurface = 'investors' | 'suppliers' | 'marketplace'

export interface LogSearchQueryArgs {
  /** Authenticated supabase client (the user's session) */
  supabase: SupabaseClient
  /** Verified profile id of the searcher; null = skip logging */
  profileId: string | null
  /** Foundry id from auth context, if any */
  foundryId: string | null
  /** Which search surface fired */
  surface: SearchSurface
  /** Raw user query text (we trim + cap before insert) */
  queryText: string
  /** Optional category label, e.g. 'Finance' or 'Services,Products' */
  category?: string | null
  /** Final result count returned to the user */
  resultCount: number
  /** Pre-merge hit counts from the vector + FTS pools */
  ftsHitCount?: number | null
  vectorHitCount?: number | null
  /** Top-N result ids the user is about to see (cap 5) */
  topResultIds?: string[]
  /** Wall-clock latency in ms */
  latencyMs?: number
  /** Free-form metadata (filter shape, tier, etc.) */
  clientMeta?: Record<string, unknown>
}

/**
 * Inserts a row into `search_query_log` and returns the new row id.
 *
 * Returns `null` when:
 * - `profileId` is null (anonymous searcher — RLS would reject)
 * - the insert errors for any reason (we never block search on telemetry)
 */
export async function logSearchQuery(
  args: LogSearchQueryArgs,
): Promise<string | null> {
  if (!args.profileId) return null

  // Cap query text at a reasonable length so a runaway client cannot
  // bloat the log table. 1024 is well above any sensible search query.
  const safeQueryText = (args.queryText ?? '').toString().slice(0, 1024)
  // Count whitespace-separated terms for downstream "long-tail" analysis.
  const queryTerms = safeQueryText.trim().length > 0
    ? safeQueryText.trim().split(/\s+/).length
    : 0

  // Cap top_result_ids at 5 per the Phase A.5 spec.
  const topResultIds = (args.topResultIds ?? []).slice(0, 5)

  try {
    // We use `as any` for the table because `search_query_log` was added in
    // a migration on 2026-04-29 and `database.types.ts` has not been
    // regenerated yet. The shape is verified by the Postgres CHECK and FK
    // constraints at insert time. Types will catch up on the next
    // `npx supabase gen types`.
    const { data, error } = await (
      args.supabase as unknown as {
        from: (table: string) => {
          insert: (row: Record<string, unknown>) => {
            select: (cols: string) => {
              single: () => Promise<{
                data: { id: string } | null
                error: { message: string } | null
              }>
            }
          }
        }
      }
    )
      .from('search_query_log')
      .insert({
        profile_id: args.profileId,
        foundry_id: args.foundryId,
        surface: args.surface,
        query_text: safeQueryText,
        query_terms: queryTerms,
        category: args.category ?? null,
        result_count: args.resultCount,
        fts_hit_count: args.ftsHitCount ?? null,
        vector_hit_count: args.vectorHitCount ?? null,
        top_result_ids: topResultIds.length > 0 ? topResultIds : null,
        latency_ms: args.latencyMs ?? null,
        client_meta: args.clientMeta ?? {},
      })
      .select('id')
      .single()

    if (error) {
      console.warn('[search-telemetry] insert failed (non-fatal):', error.message)
      return null
    }
    return data?.id ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[search-telemetry] insert threw (non-fatal):', msg)
    return null
  }
}
