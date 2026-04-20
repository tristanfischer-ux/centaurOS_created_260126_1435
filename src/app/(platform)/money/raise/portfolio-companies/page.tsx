/**
 * @file /money/raise/portfolio-companies/page.tsx
 *
 * Searchable directory of ~89,000 rows in `investor_portfolio_companies`,
 * deduplicated to unique portfolio companies (~689 unique). Restores the
 * legacy /investors → "Portfolio" tab surface into the new Money/Raise
 * information architecture.
 *
 * Data sources reused verbatim:
 *  - `searchPortfolioCompanies` (src/actions/portfolio.ts) — dedup + search
 *  - `count_unique_portfolio_companies` RPC — header total across all rows
 *    (stable across filters; legacy parity)
 *  - `getCompanyInvestors` — full investor list for the detail dialog
 *
 * URL params:
 *   q                   — free-text query (company name, semantic if >=3 chars)
 *   sector              — server-side filter
 *   country             — client-side post-filter on investor HQ country (ISO)
 *                         (legacy action has no per-company country column —
 *                          companies are filtered on the pages that have at
 *                          least one matching investor surfaced)
 *   investor_count_min  — client-side post-filter on deduped investor_count
 *   page                — 1-based page number
 *
 * Tier gate:
 *   Legacy portfolio tab was free (no LockedSection wrapper in legacy
 *   PortfolioDirectoryTab). Mirrored as free here — the Raise view-cap
 *   banner in the layout still applies for authenticated users.
 */

import { searchPortfolioCompanies } from '@/actions/portfolio'
import { createAdminClient } from '@/lib/supabase/admin'
import { PortfolioView } from './portfolio-view'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  sector?: string
  country?: string
  investor_count_min?: string
  page?: string
}

export default async function PortfolioCompaniesDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Math.max(parseInt(params.page ?? '1', 10) || 1, 1)
  const pageSize = 50
  const query = (params.q ?? '').trim()
  const sector = (params.sector ?? '').trim()
  const country = (params.country ?? '').trim()

  const investorCountMinRaw = params.investor_count_min
    ? Math.floor(Number(params.investor_count_min))
    : null
  const investorCountMin =
    investorCountMinRaw != null && Number.isFinite(investorCountMinRaw) && investorCountMinRaw > 0
      ? investorCountMinRaw
      : null

  const { companies, total, hasMore } = await searchPortfolioCompanies({
    query: query || undefined,
    sector: sector || undefined,
    page,
    pageSize,
  })

  // INTENT: Header total from RPC reflects the full deduplicated library size
  // (stable across filters); `total` from searchPortfolioCompanies reflects
  // the filter-matched pool.
  let uniqueCompaniesTotal = total
  try {
    const adminDb = createAdminClient()
    const { data } = await adminDb.rpc('count_unique_portfolio_companies')
    if (typeof data === 'number') uniqueCompaniesTotal = data
  } catch {
    // Non-critical — fall back to filter-matched total.
  }

  return (
    <PortfolioView
      companies={companies}
      total={total}
      uniqueCompaniesTotal={uniqueCompaniesTotal}
      hasMore={hasMore}
      initial={{
        q: query,
        sector,
        country,
        investorCountMin,
        page,
        pageSize,
      }}
    />
  )
}
