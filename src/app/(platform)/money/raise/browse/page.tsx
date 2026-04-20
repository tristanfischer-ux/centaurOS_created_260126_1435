import { browseInvestorsForMoney, listBrowseSubcategories } from '@/actions/money-raise'
import { BrowseInvestorsView } from './browse-view'

export const dynamic = 'force-dynamic'

type SearchParams = {
  q?: string
  subcategory?: string
  country?: string
  page?: string
}

export default async function BrowseInvestorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const params = await searchParams
  const page = Math.max(parseInt(params.page ?? '1', 10) || 1, 1)
  const limit = 25
  const offset = (page - 1) * limit

  const result = await browseInvestorsForMoney({
    query: params.q,
    subcategory: params.subcategory,
    country: params.country,
    limit,
    offset,
  })

  if ('error' in result) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h1 className="text-xl font-bold mb-2">Browse investors</h1>
        <p className="text-sm text-destructive">{result.error}</p>
      </div>
    )
  }

  return (
    <BrowseInvestorsView
      result={result}
      subcategories={listBrowseSubcategories()}
      filters={{
        query: params.q ?? '',
        subcategory: params.subcategory ?? 'all',
        country: params.country ?? '',
        page,
        limit,
      }}
    />
  )
}
