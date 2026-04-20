/**
 * @file /money/raise/browse/page.tsx
 *
 * Rich investor directory. Semantic search (auto-fallback to ilike) + multi-
 * facet filters + match-score sort (when an active thesis is present) + match
 * badges on cards. URL-only state model — every filter change round-trips via
 * searchParams so deep-links + back/forward work.
 */

import {
  searchInvestorsSemantic,
  scoreInvestorsAgainstThesis,
} from '@/actions/money-raise'
import { getActiveThesis } from '@/actions/money-thesis'
import { getInvestorTierAccess } from '@/actions/investors'
import { BROWSE_SUBCATEGORIES } from '@/lib/money/browse-subcategories'
import type { RichInvestorFilters, MatchBreakdown, ScoredListingRow } from '@/lib/money/match-types'
import { createClient } from '@/lib/supabase/server'
import { BrowseInvestorsView } from './browse-view'

export const dynamic = 'force-dynamic'

type SortMode = 'match' | 'freshness' | 'az'

type SearchParams = {
  q?: string
  subcategory?: string | string[]
  country?: string | string[]
  stage?: string | string[]
  sector?: string | string[]
  firm_type?: string | string[]
  cheque_min?: string
  cheque_max?: string
  sort?: string
  page?: string
}

// ---------------------------------------------------------------------------
// Query-param parsing
// ---------------------------------------------------------------------------

/** Accept both `?k=a&k=b` (array) and `?k=a,b` (comma-joined). */
function asList(v: string | string[] | undefined): string[] {
  if (!v) return []
  if (Array.isArray(v)) return v.flatMap((x) => x.split(',')).map((s) => s.trim()).filter(Boolean)
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

function parseSort(v: string | undefined, hasThesis: boolean): SortMode {
  if (v === 'freshness' || v === 'az') return v
  if (v === 'match') return hasThesis ? 'match' : 'freshness'
  return hasThesis ? 'match' : 'freshness'
}

function toRichFilters(params: SearchParams): RichInvestorFilters {
  const minGbp = params.cheque_min ? Math.max(0, Math.floor(Number(params.cheque_min))) : null
  const maxGbp = params.cheque_max ? Math.max(0, Math.floor(Number(params.cheque_max))) : null
  return {
    subcategory: asList(params.subcategory),
    country: asList(params.country).map((c) => c.toUpperCase()),
    stage: asList(params.stage),
    sector: asList(params.sector),
    firm_type: asList(params.firm_type),
    cheque_min_cents: minGbp != null && minGbp > 0 ? minGbp * 100 : undefined,
    cheque_max_cents: maxGbp != null && maxGbp > 0 ? maxGbp * 100 : undefined,
  }
}

// ---------------------------------------------------------------------------
// Server component
// ---------------------------------------------------------------------------

export default async function BrowseInvestorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Math.max(parseInt(params.page ?? '1', 10) || 1, 1)
  const limit = 25
  const offset = (page - 1) * limit
  const query = (params.q ?? '').trim()

  const richFilters = toRichFilters(params)

  // Fetch results + thesis + tier access in parallel.
  const [searchResult, thesisResult, tierAccess] = await Promise.all([
    searchInvestorsSemantic({
      query,
      filters: richFilters,
      limit,
      offset,
    }),
    getActiveThesis(),
    getInvestorTierAccess(),
  ])

  if ('error' in searchResult) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h1 className="text-xl font-bold mb-2">Browse investors</h1>
        <p className="text-sm text-destructive">{searchResult.error}</p>
      </div>
    )
  }

  const hasActiveThesis =
    !('error' in thesisResult) && !!thesisResult.thesis && !!thesisResult.thesis.is_active

  const sortMode = parseSort(params.sort, hasActiveThesis)
  // User asked for match sort but has no thesis — flag for UI banner.
  const matchSortFellBackToFreshness =
    params.sort === 'match' && !hasActiveThesis

  // ---------------------------------------------------------------------
  // Match-score resolution
  //
  // When the user picks "match" sort AND has an active thesis, run the
  // scorer (bounded at 200 candidates) so we have match scores to both
  // (a) reorder the current page, and (b) render the badge on every card
  // with a known score. Listings not in the scored set get `null` score
  // and sink to the bottom of the results when sort===match.
  // ---------------------------------------------------------------------
  let scoresByListingId: Record<
    string,
    { total: number; breakdown: MatchBreakdown }
  > | null = null
  let results: ScoredListingRow[] = searchResult.results

  if (hasActiveThesis) {
    const scoreResult = await scoreInvestorsAgainstThesis({
      limit: 200,
      filters: richFilters,
    })
    if (!('error' in scoreResult)) {
      const map: Record<string, { total: number; breakdown: MatchBreakdown }> = {}
      for (const s of scoreResult.scored) {
        map[s.listing.id] = { total: s.breakdown.total, breakdown: s.breakdown }
      }
      scoresByListingId = map

      if (sortMode === 'match') {
        // Outer-join reorder: listings with a score sort by score desc;
        // listings without a score retain their original semantic/ilike order
        // but sink below all scored listings.
        const scored: ScoredListingRow[] = []
        const unscored: ScoredListingRow[] = []
        for (const r of results) {
          if (map[r.id]) scored.push(r)
          else unscored.push(r)
        }
        scored.sort((a, b) => (map[b.id]?.total ?? 0) - (map[a.id]?.total ?? 0))
        results = [...scored, ...unscored]
      }
    }
  }

  if (sortMode === 'az') {
    results = [...results].sort((a, b) =>
      (a.title ?? '').localeCompare(b.title ?? '', 'en-GB', { sensitivity: 'base' }),
    )
  } else if (sortMode === 'freshness') {
    results = [...results].sort((a, b) => {
      const ta = a.last_enriched_at ? Date.parse(a.last_enriched_at) : 0
      const tb = b.last_enriched_at ? Date.parse(b.last_enriched_at) : 0
      return tb - ta
    })
  }

  // Resolve which listings the foundry already has in pipeline — same
  // pattern as /money/raise/for-you. Uses the same RLS-scoped client.
  const alreadyInPipelineIds = await loadAlreadyInPipelineIds(
    results.map((r) => r.id),
  )

  return (
    <BrowseInvestorsView
      results={results}
      total={searchResult.total}
      mode={searchResult.mode}
      hasActiveThesis={hasActiveThesis}
      scoresByListingId={scoresByListingId}
      alreadyInPipelineIds={alreadyInPipelineIds}
      subcategories={BROWSE_SUBCATEGORIES}
      currentTier={tierAccess.tier}
      initial={{
        q: query,
        sort: sortMode,
        page,
        limit,
        filters: richFilters,
        matchSortFellBackToFreshness,
      }}
    />
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch marketplace_listing_ids the active foundry already has in pipeline.
 * Safe fail-open on error (user can still click Add; the action is idempotent).
 */
async function loadAlreadyInPipelineIds(listingIds: string[]): Promise<string[]> {
  if (listingIds.length === 0) return []
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('investor_pipeline_state')
      .select('marketplace_listing_id')
      .in('marketplace_listing_id', listingIds)
      .is('archived_at', null)
    if (error || !data) return []
    return data
      .map((r) => r.marketplace_listing_id)
      .filter((id): id is string => !!id)
  } catch {
    return []
  }
}
