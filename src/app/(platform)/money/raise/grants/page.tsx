/**
 * @file /money/raise/grants/page.tsx
 *
 * Searchable directory of ~3,000 non-dilutive funding grants from the
 * `investor_grants` table. Restores the legacy /investors → "Grants" tab
 * surface into the new Money/Raise information architecture. The legacy
 * `searchGrants` action is reused verbatim (see src/actions/grants.ts).
 *
 * URL params:
 *   q           — free-text query (>=3 chars triggers semantic search)
 *   country     — server-side country filter (exact match on country column)
 *   amount_min  — client-side post-filter (whole pounds, lower bound)
 *   amount_max  — client-side post-filter (whole pounds, upper bound)
 *   sector      — client-side post-filter on sector_focus array
 *   page        — 1-based page number
 *
 * Filter model:
 *  - q / country — server-side (legacy action exposes these as first-class)
 *  - amount_min / amount_max / sector — client-side post-filter on the current
 *    page because the legacy action does not accept them. Noted in the view so
 *    users see when a refinement is trimming visible results.
 *
 * Amount values from the DB are stored as `amount_min_usd` / `amount_max_usd`
 * but the Money/Raise surface treats monetary values as GBP whole pounds to
 * match sibling pages (/money/raise/browse, /money/cockpit). Formatting and
 * filter input are £, consistent with the rest of the surface.
 */

import { searchGrants } from '@/actions/grants'
import { GrantsView } from './grants-view'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  country?: string
  amount_min?: string
  amount_max?: string
  sector?: string
  page?: string
}

export default async function GrantsDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Math.max(parseInt(params.page ?? '1', 10) || 1, 1)
  const pageSize = 50
  const query = (params.q ?? '').trim()
  const country = (params.country ?? '').trim()
  const sector = (params.sector ?? '').trim()

  const amountMinRaw = params.amount_min ? Math.floor(Number(params.amount_min)) : null
  const amountMaxRaw = params.amount_max ? Math.floor(Number(params.amount_max)) : null
  const amountMin =
    amountMinRaw != null && Number.isFinite(amountMinRaw) && amountMinRaw > 0 ? amountMinRaw : null
  const amountMax =
    amountMaxRaw != null && Number.isFinite(amountMaxRaw) && amountMaxRaw > 0 ? amountMaxRaw : null

  const { grants, total, hasMore } = await searchGrants({
    query: query || undefined,
    country: country || undefined,
    activeOnly: false,
    page,
    pageSize,
  })

  return (
    <GrantsView
      grants={grants}
      total={total}
      hasMore={hasMore}
      initial={{
        q: query,
        country,
        sector,
        amountMin,
        amountMax,
        page,
        pageSize,
      }}
    />
  )
}
