/**
 * @file InvestorTableView.tsx
 *
 * @description Dense table view for the investor directory. Renders investor
 * firms in a compact, information-rich table with sticky headers, row-click
 * navigation, shortlist toggling, and responsive column hiding. Designed to
 * complement the existing grid/board/map views.
 */

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Heart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { formatFundSize } from '@/lib/format'
import type { InvestorFirm, ShortlistStage } from '@/actions/investors'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface InvestorTableViewProps {
  firms: InvestorFirm[]
  matchScores: Record<string, number>
  shortlistIds: Record<string, ShortlistStage>
  onToggleShortlist: (firmId: string) => void
  onToggleCompare: (firmId: string) => void
  compareIds: string[]
  isPending: boolean
  /** Called when user clicks a row — opens modal detail instead of navigating */
  onSelectFirm?: (firmId: string) => void
  /** Contact counts per listing_id — from batch query */
  contactCounts?: Record<string, number>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a semantic background token for the quality dot / progress bar. */
function qualityColor(score: number): string {
  if (score >= 7) return 'bg-success'
  if (score >= 4) return 'bg-warning'
  return 'bg-muted-foreground'
}

/** Truncates a string to `max` characters, appending an ellipsis if needed. */
function truncate(text: string | undefined | null, max: number): string {
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max)}...` : text
}

// ---------------------------------------------------------------------------
// Column header definitions
// ---------------------------------------------------------------------------

const COLUMN_HEADERS: { label: string; className?: string }[] = [
  { label: '' },                           // shortlist heart (LEFT)
  { label: '' },                           // quality dot
  { label: 'Firm' },
  { label: 'Type' },
  { label: 'Location' },
  { label: 'Sectors' },
  { label: 'Stage' },
  { label: 'Fund Size', className: 'hidden lg:table-cell' },
  { label: 'Intel Preview', className: 'hidden xl:table-cell' },
  { label: 'Quality' },
  { label: 'Contacts', className: 'hidden md:table-cell' },
  { label: 'Portfolio', className: 'hidden lg:table-cell' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvestorTableView({
  firms,
  matchScores: _matchScores,
  shortlistIds,
  onToggleShortlist,
  onToggleCompare: _onToggleCompare,
  compareIds: _compareIds,
  isPending,
  onSelectFirm,
  contactCounts = {},
}: InvestorTableViewProps) {
  const router = useRouter()

  return (
    <div
      className={cn(
        'w-full overflow-x-auto rounded-lg border border-border',
        isPending && 'opacity-60 pointer-events-none',
      )}
    >
      <table className="w-full text-sm">
        {/* ---- Sticky header ---- */}
        <thead className="sticky top-0 z-10 bg-background border-b border-border">
          <tr>
            {COLUMN_HEADERS.map((col, i) => (
              <th
                key={i}
                className={cn(
                  'px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap',
                  col.className,
                )}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- Body ---- */}
        <tbody className="divide-y divide-border">
          {firms.map((firm) => {
            const attrs = firm.attributes
            const score = attrs.data_quality_score ?? 0
            const isShortlisted = firm.id in shortlistIds
            const location = attrs.hq_city || attrs.location || '—'
            const sectors = attrs.sectors ?? []
            const stages = attrs.stage_focus ?? []
            const portfolioCount = attrs.portfolio_companies?.length ?? 0
            const fundLabel = formatFundSize(attrs.fund_size_gbp)

            return (
              <tr
                key={firm.id}
                onClick={() => onSelectFirm ? onSelectFirm(firm.id) : router.push(`/investors/${firm.id}`)}
                className="hover:bg-muted/50 transition-colors cursor-pointer"
              >
                {/* 0. Shortlist heart (LEFT) */}
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={isShortlisted ? 'Remove from shortlist' : 'Add to shortlist'}
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleShortlist(firm.id)
                    }}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                  >
                    <Heart
                      className={cn(
                        'h-4 w-4 transition-colors',
                        isShortlisted
                          ? 'fill-international-orange text-international-orange'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    />
                  </button>
                </td>

                {/* 1. Quality dot */}
                <td className="px-3 py-2">
                  <span
                    className={cn('inline-block h-2.5 w-2.5 rounded-full', qualityColor(score))}
                    title={`Quality: ${score.toFixed(1)}`}
                  />
                </td>

                {/* 2. Firm name */}
                <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">
                  <Link
                    href={`/investors/${firm.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="hover:text-international-orange transition-colors"
                  >
                    {firm.title}
                  </Link>
                </td>

                {/* 3. Type */}
                <td className="px-3 py-2">
                  {attrs.firm_type ? (
                    <Badge variant="outline" className="text-xs">
                      {attrs.firm_type}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>

                {/* 4. Location */}
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {location}
                </td>

                {/* 5. Sectors (first 2 + overflow) */}
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {sectors.slice(0, 2).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                    {sectors.length > 2 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        +{sectors.length - 2}
                      </Badge>
                    )}
                    {sectors.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </td>

                {/* 6. Stage focus (first 2) */}
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {stages.slice(0, 2).map((s) => (
                      <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">
                        {s}
                      </Badge>
                    ))}
                    {stages.length > 2 && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        +{stages.length - 2}
                      </Badge>
                    )}
                    {stages.length === 0 && (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </td>

                {/* 7. Fund size */}
                <td className="hidden lg:table-cell px-3 py-2 text-foreground whitespace-nowrap">
                  {fundLabel ?? <span className="text-muted-foreground">—</span>}
                </td>

                {/* 8. Intel Preview (thesis/connection brief snippet) */}
                <td className="hidden xl:table-cell px-3 py-2 text-muted-foreground max-w-[260px]">
                  <span className="line-clamp-2 text-xs leading-snug">
                    {truncate(attrs.connection_brief || attrs.investment_thesis, 120)}
                  </span>
                </td>

                {/* 9. Quality bar */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn('h-full rounded-full transition-all', qualityColor(score))}
                        style={{ width: `${Math.min(score / 10, 1) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {score.toFixed(1)}
                    </span>
                  </div>
                </td>

                {/* 10. Contacts count */}
                <td className="hidden md:table-cell px-3 py-2 text-muted-foreground tabular-nums">
                  {contactCounts[firm.id] ?? 0}
                </td>

                {/* 11. Portfolio count */}
                <td className="hidden lg:table-cell px-3 py-2 text-muted-foreground tabular-nums">
                  {portfolioCount}
                </td>

                {/* Heart moved to column 0 (left side) */}
              </tr>
            )
          })}

          {firms.length === 0 && (
            <tr>
              <td
                colSpan={COLUMN_HEADERS.length}
                className="px-3 py-12 text-center text-muted-foreground"
              >
                No investors match your current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
