'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { Search, Plus, Check, ExternalLink } from 'lucide-react'
import { addInvestorToPipeline, type BrowseInvestorsResult, type BrowseInvestorRow } from '@/actions/money-raise'
import { toast } from 'sonner'

type Filters = {
  query: string
  subcategory: string
  country: string
  page: number
  limit: number
}

function RowCard({
  row,
  onAdded,
  isAdding,
}: {
  row: BrowseInvestorRow
  onAdded: (id: string) => void
  isAdding: boolean
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          {/* Logo / initial avatar */}
          <div className="flex-shrink-0 h-12 w-12 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {row.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image_url}
                alt={`${row.title ?? 'Investor'} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">
                {(row.title ?? '?').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-semibold text-base truncate">
                  {row.title ?? 'Unnamed investor'}
                </h3>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  {row.subcategory && (
                    <Badge variant="secondary" size="sm">
                      {row.subcategory}
                    </Badge>
                  )}
                  {(row.city || row.country) && (
                    <span className="text-xs text-muted-foreground">
                      {[row.city, row.country].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {row.website_url && (
                    <a
                      href={row.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-international-orange inline-flex items-center gap-0.5 hover:underline"
                    >
                      Website <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
                {row.description && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                    {row.description}
                  </p>
                )}
              </div>

              <div className="flex-shrink-0">
                {row.already_in_pipeline && row.pipeline_state_id ? (
                  <Link href={`/money/raise/investor/${row.pipeline_state_id}`}>
                    <Button size="sm" variant="secondary">
                      <Check className="h-4 w-4 mr-1" />
                      In pipeline
                    </Button>
                  </Link>
                ) : (
                  <Button
                    size="sm"
                    disabled={isAdding}
                    onClick={() => onAdded(row.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add to pipeline
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BrowseInvestorsView({
  result,
  subcategories,
  filters,
}: {
  result: BrowseInvestorsResult
  subcategories: readonly string[]
  filters: Filters
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [q, setQ] = useState(filters.query)
  const [subcategory, setSubcategory] = useState(filters.subcategory)
  const [country, setCountry] = useState(filters.country)
  const [addingId, setAddingId] = useState<string | null>(null)

  const applyFilters = (nextPage = 1) => {
    const params = new URLSearchParams()
    if (q.trim()) params.set('q', q.trim())
    if (subcategory && subcategory !== 'all') params.set('subcategory', subcategory)
    if (country.trim()) params.set('country', country.trim())
    if (nextPage > 1) params.set('page', String(nextPage))
    const qs = params.toString()
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const handleAdd = (listingId: string) => {
    setAddingId(listingId)
    startTransition(async () => {
      const res = await addInvestorToPipeline({ marketplace_listing_id: listingId })
      setAddingId(null)
      if ('error' in res) {
        toast.error(res.error)
      } else if (res.already_existed) {
        toast.info('Already in pipeline')
        router.push(`/money/raise/investor/${res.pipeline_state_id}`)
      } else {
        toast.success('Added to pipeline')
        router.push(`/money/raise/investor/${res.pipeline_state_id}`)
      }
    })
  }

  const startIdx = (filters.page - 1) * filters.limit + 1
  const endIdx = startIdx + result.rows.length - 1

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Browse investors</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {result.total.toLocaleString()} firms in the Fractional Forge directory —
          VC funds, PE firms, accelerators, family offices, corporate venture, advisory.
          Filter and add to your pipeline in one click.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              applyFilters(1)
            }}
            className="grid gap-3 sm:grid-cols-[1fr_200px_200px_auto]"
          >
            <div>
              <Label htmlFor="browse-q" className="text-xs">Search</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="browse-q"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="e.g. SaaS, robotics, seed"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="browse-sub" className="text-xs">Type</Label>
              <Select value={subcategory} onValueChange={setSubcategory}>
                <SelectTrigger id="browse-sub" className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {subcategories.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="browse-country" className="text-xs">Country</Label>
              <Input
                id="browse-country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="e.g. United Kingdom"
                className="mt-1"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={isPending}>
                Apply
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {result.rows.length > 0
            ? `Showing ${startIdx}–${endIdx} of ${result.total.toLocaleString()}`
            : 'No results for those filters'}
        </span>
        <Link href="/money/raise" className="text-international-orange hover:underline">
          Back to pipeline
        </Link>
      </div>

      {result.rows.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="No matches"
              description="Widen the filters or try a different search term."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {result.rows.map((row) => (
            <RowCard
              key={row.id}
              row={row}
              onAdded={handleAdd}
              isAdding={isPending && addingId === row.id}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="secondary"
          disabled={filters.page <= 1}
          onClick={() => applyFilters(filters.page - 1)}
        >
          ← Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {filters.page}</span>
        <Button
          variant="secondary"
          disabled={!result.hasMore}
          onClick={() => applyFilters(filters.page + 1)}
        >
          Next →
        </Button>
      </div>
    </div>
  )
}
