'use client'

/**
 * @file table-view.tsx
 *
 * Sortable, dense table view for /money/raise/browse. Pro-tier value prop —
 * founders pay for column sort + compare-checkbox workflows they can't get in
 * the grid view.
 *
 * Ported from `src/app/(platform)/investors/components/InvestorTableView.tsx`
 * (which keyed on InvestorFirm.attributes). This version reads from the
 * trimmed ScoredListingRow shape used throughout /money/raise.
 */

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import type { MatchBreakdown, ScoredListingRow } from '@/lib/money/match-types'
import type { SubscriptionTier } from '@/lib/billing/plans'

// ---------------------------------------------------------------------------
// Sort machinery
// ---------------------------------------------------------------------------

type SortKey =
  | 'firm'
  | 'type'
  | 'country'
  | 'stage'
  | 'cheque_min'
  | 'cheque_max'
  | 'match'
  | 'enriched'

type SortDir = 'asc' | 'desc'

type SortState = { key: SortKey; dir: SortDir } | null

function compareStrings(a: string | null, b: string | null, dir: SortDir): number {
  const av = (a ?? '').toLowerCase()
  const bv = (b ?? '').toLowerCase()
  const cmp = av.localeCompare(bv, 'en-GB', { sensitivity: 'base' })
  return dir === 'asc' ? cmp : -cmp
}

function compareNumbers(a: number | null, b: number | null, dir: SortDir): number {
  const av = a ?? Number.NEGATIVE_INFINITY
  const bv = b ?? Number.NEGATIVE_INFINITY
  const cmp = av - bv
  return dir === 'asc' ? cmp : -cmp
}

function compareDates(a: string | null, b: string | null, dir: SortDir): number {
  const av = a ? Date.parse(a) : 0
  const bv = b ? Date.parse(b) : 0
  const cmp = av - bv
  return dir === 'asc' ? cmp : -cmp
}

function formatGbpCompact(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

function formatDateShort(iso: string | null): string {
  if (!iso) return '—'
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(parsed))
}

// ---------------------------------------------------------------------------
// Header cell with sort control
// ---------------------------------------------------------------------------

function SortHeader({
  label,
  sortKey,
  current,
  onSort,
  className,
  align = 'left',
}: {
  label: string
  sortKey: SortKey
  current: SortState
  onSort: (key: SortKey) => void
  className?: string
  align?: 'left' | 'right'
}) {
  const active = current?.key === sortKey
  const Icon = !active ? ChevronsUpDown : current.dir === 'asc' ? ChevronUp : ChevronDown
  return (
    <TableHead className={cn('whitespace-nowrap', className)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wider',
          'hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded',
          active ? 'text-foreground' : 'text-muted-foreground',
          align === 'right' && 'justify-end w-full',
        )}
        aria-label={`Sort by ${label}${active ? ` (${current.dir})` : ''}`}
      >
        {label}
        <Icon className="h-3 w-3" aria-hidden="true" />
      </button>
    </TableHead>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export type TableViewProps = {
  results: ScoredListingRow[]
  hasActiveThesis: boolean
  scoresByListingId?: Record<string, { total: number; breakdown: MatchBreakdown }> | null
  currentTier: SubscriptionTier
  onToggleCompare: (id: string) => void
  comparedIds: Set<string>
}

export function InvestorTableView({
  results,
  hasActiveThesis,
  scoresByListingId,
  currentTier: _currentTier,
  onToggleCompare,
  comparedIds,
}: TableViewProps) {
  // Default sort: match score desc if thesis active, otherwise freshness desc.
  const [sort, setSort] = useState<SortState>(() =>
    hasActiveThesis ? { key: 'match', dir: 'desc' } : { key: 'enriched', dir: 'desc' },
  )

  const handleSort = (key: SortKey) => {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' }
      if (prev.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  const sorted = useMemo<ScoredListingRow[]>(() => {
    if (!sort) return results
    const copy = [...results]
    const { key, dir } = sort
    copy.sort((a, b) => {
      switch (key) {
        case 'firm':
          return compareStrings(a.title, b.title, dir)
        case 'type':
          return compareStrings(
            a.subcategory ?? a.highlights.firm_type,
            b.subcategory ?? b.highlights.firm_type,
            dir,
          )
        case 'country':
          return compareStrings(a.country_iso ?? a.country, b.country_iso ?? b.country, dir)
        case 'stage':
          return compareStrings(
            (a.highlights.stage_focus ?? []).join(', '),
            (b.highlights.stage_focus ?? []).join(', '),
            dir,
          )
        case 'cheque_min':
          return compareNumbers(
            a.highlights.cheque_range_gbp?.min ?? null,
            b.highlights.cheque_range_gbp?.min ?? null,
            dir,
          )
        case 'cheque_max':
          return compareNumbers(
            a.highlights.cheque_range_gbp?.max ?? null,
            b.highlights.cheque_range_gbp?.max ?? null,
            dir,
          )
        case 'match':
          return compareNumbers(
            scoresByListingId?.[a.id]?.total ?? null,
            scoresByListingId?.[b.id]?.total ?? null,
            dir,
          )
        case 'enriched':
          return compareDates(a.last_enriched_at, b.last_enriched_at, dir)
        default:
          return 0
      }
    })
    return copy
  }, [results, sort, scoresByListingId])

  return (
    <div className="rounded-lg border border-border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <span className="sr-only">Compare</span>
            </TableHead>
            <SortHeader
              label="Firm"
              sortKey="firm"
              current={sort}
              onSort={handleSort}
              className="min-w-[200px]"
            />
            <SortHeader
              label="Type"
              sortKey="type"
              current={sort}
              onSort={handleSort}
              className="w-[140px]"
            />
            <SortHeader
              label="Country"
              sortKey="country"
              current={sort}
              onSort={handleSort}
              className="w-[100px]"
            />
            <SortHeader
              label="Stage focus"
              sortKey="stage"
              current={sort}
              onSort={handleSort}
              className="hidden md:table-cell w-[180px]"
            />
            <SortHeader
              label="Cheque min"
              sortKey="cheque_min"
              current={sort}
              onSort={handleSort}
              className="hidden lg:table-cell w-[110px]"
            />
            <SortHeader
              label="Cheque max"
              sortKey="cheque_max"
              current={sort}
              onSort={handleSort}
              className="hidden lg:table-cell w-[110px]"
            />
            {hasActiveThesis && (
              <SortHeader
                label="Match"
                sortKey="match"
                current={sort}
                onSort={handleSort}
                className="w-[90px]"
              />
            )}
            <SortHeader
              label="Last enriched"
              sortKey="enriched"
              current={sort}
              onSort={handleSort}
              className="hidden xl:table-cell w-[130px]"
            />
            <TableHead className="w-[90px] text-right">
              <span className="text-xs font-medium uppercase tracking-wider">Action</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="h-24 text-center text-sm text-muted-foreground">
                No investors match those filters.
              </TableCell>
            </TableRow>
          ) : (
            sorted.map((row) => {
              const score = scoresByListingId?.[row.id]?.total ?? null
              const countryLabel = row.country_iso ?? row.country ?? '—'
              const stages = row.highlights.stage_focus ?? []
              const checkedForCompare = comparedIds.has(row.id)
              return (
                <TableRow key={row.id} data-state={checkedForCompare ? 'selected' : undefined}>
                  <TableCell className="px-4">
                    <Checkbox
                      checked={checkedForCompare}
                      onCheckedChange={() => onToggleCompare(row.id)}
                      aria-label={`Select ${row.title ?? 'investor'} for comparison`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link
                      href={`/money/raise/investor/${row.id}`}
                      className="hover:text-international-orange hover:underline"
                    >
                      {row.title ?? 'Unnamed investor'}
                    </Link>
                    {row.city && (
                      <div className="mt-0.5 text-xs text-muted-foreground">{row.city}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {row.subcategory ? (
                      <Badge variant="secondary" size="sm">
                        {row.subcategory}
                      </Badge>
                    ) : row.highlights.firm_type ? (
                      <Badge variant="outline" size="sm">
                        {row.highlights.firm_type}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{countryLabel}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {stages.length === 0 ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {stages.slice(0, 2).map((s) => (
                          <Badge key={s} variant="outline" size="sm" className="text-[10px]">
                            {s}
                          </Badge>
                        ))}
                        {stages.length > 2 && (
                          <Badge variant="outline" size="sm" className="text-[10px]">
                            +{stages.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular-nums">
                    {formatGbpCompact(row.highlights.cheque_range_gbp?.min ?? null)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell tabular-nums">
                    {formatGbpCompact(row.highlights.cheque_range_gbp?.max ?? null)}
                  </TableCell>
                  {hasActiveThesis && (
                    <TableCell className="tabular-nums">
                      {score != null ? (
                        <span
                          className={cn(
                            'font-semibold',
                            score >= 80 && 'text-emerald-700',
                            score >= 60 && score < 80 && 'text-blue-700',
                            score >= 40 && score < 60 && 'text-amber-700',
                            score < 40 && 'text-muted-foreground',
                          )}
                        >
                          {score}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  )}
                  <TableCell className="hidden xl:table-cell text-sm text-muted-foreground">
                    {formatDateShort(row.last_enriched_at)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/money/raise/investor/${row.id}`}>View</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
