'use client'

/**
 * @file compare-dialog.tsx
 *
 * Side-by-side comparison dialog for 2-4 investor listings. Opens from the
 * sticky <CompareTray />. Reads the same ScoredListingRow shape already
 * loaded on /money/raise/browse — we deliberately do NOT refetch the full
 * MarketplaceListingRow, because highlights already carries the fields the
 * dialog renders (thesis, cheque range, stages, sectors).
 *
 * Ported from `src/app/(platform)/investors/components/InvestorCompareDialog.tsx`.
 */

import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { MatchBreakdown, ScoredListingRow } from '@/lib/money/match-types'

export type CompareDialogProps = {
  open: boolean
  investors: ScoredListingRow[]
  scoresByListingId?: Record<string, { total: number; breakdown: MatchBreakdown }> | null
  onClose: () => void
}

function formatGbp(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

function formatChequeRange(
  range: ScoredListingRow['highlights']['cheque_range_gbp'],
): string {
  if (!range) return '—'
  const { min, max } = range
  if (min == null && max == null) return '—'
  if (min != null && max != null) return `${formatGbp(min)} – ${formatGbp(max)}`
  if (min != null) return `${formatGbp(min)}+`
  return `up to ${formatGbp(max)}`
}

function truncate(text: string | null | undefined, max: number): string {
  if (!text) return '—'
  return text.length > max ? `${text.slice(0, max).trim()}…` : text
}

export function CompareDialog({
  open,
  investors,
  scoresByListingId,
  onClose,
}: CompareDialogProps) {
  // Guard against renders with <2 selections (tray button is disabled there
  // but callers could pass a stale selection).
  if (investors.length < 2) {
    return (
      <Dialog open={false} onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Compare investors</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    )
  }

  // Best match-score highlight.
  let bestMatchId = ''
  let bestMatch = -1
  for (const firm of investors) {
    const score = scoresByListingId?.[firm.id]?.total ?? -1
    if (score > bestMatch) {
      bestMatch = score
      bestMatchId = firm.id
    }
  }
  const hasAnyScore = bestMatch >= 0

  const colWidth =
    investors.length === 2
      ? 'w-1/2'
      : investors.length === 3
        ? 'w-1/3'
        : 'w-1/4'

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare investors</DialogTitle>
          <DialogDescription>
            Side-by-side view of the {investors.length} firms you selected.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="w-[140px] py-3 pr-4 text-left font-medium text-muted-foreground">
                  <span className="sr-only">Field</span>
                </th>
                {investors.map((firm) => (
                  <th
                    key={firm.id}
                    className={cn('px-3 py-3 text-left align-top', colWidth)}
                  >
                    <div className="space-y-1">
                      <p className="line-clamp-2 text-sm font-semibold text-foreground">
                        {firm.title ?? 'Unnamed investor'}
                      </p>
                      {firm.subcategory && (
                        <Badge variant="outline" size="sm" className="text-[10px]">
                          {firm.subcategory}
                        </Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hasAnyScore && (
                <tr className="border-b border-border">
                  <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                    Match score
                  </td>
                  {investors.map((firm) => {
                    const score = scoresByListingId?.[firm.id]?.total ?? null
                    const isBest = bestMatchId === firm.id && score != null
                    return (
                      <td
                        key={firm.id}
                        className={cn(
                          'px-3 py-2.5 tabular-nums',
                          isBest && 'font-semibold text-emerald-700',
                        )}
                      >
                        {score != null ? `${score}/100` : '—'}
                      </td>
                    )
                  })}
                </tr>
              )}

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                  Firm type
                </td>
                {investors.map((firm) => (
                  <td key={firm.id} className="px-3 py-2.5">
                    {firm.highlights.firm_type ?? firm.subcategory ?? '—'}
                  </td>
                ))}
              </tr>

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                  Country
                </td>
                {investors.map((firm) => (
                  <td key={firm.id} className="px-3 py-2.5">
                    {firm.country_iso ?? firm.country ?? '—'}
                    {firm.city && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        · {firm.city}
                      </span>
                    )}
                  </td>
                ))}
              </tr>

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                  Cheque range
                </td>
                {investors.map((firm) => (
                  <td key={firm.id} className="px-3 py-2.5 tabular-nums">
                    {formatChequeRange(firm.highlights.cheque_range_gbp)}
                  </td>
                ))}
              </tr>

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                  Stage focus
                </td>
                {investors.map((firm) => {
                  const stages = firm.highlights.stage_focus ?? []
                  return (
                    <td key={firm.id} className="px-3 py-2.5">
                      {stages.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {stages.map((s) => (
                            <Badge
                              key={s}
                              variant="outline"
                              size="sm"
                              className="text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 font-medium text-muted-foreground">
                  Sectors
                </td>
                {investors.map((firm) => {
                  const sectors = firm.highlights.sectors ?? []
                  return (
                    <td key={firm.id} className="px-3 py-2.5">
                      {sectors.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {sectors.slice(0, 6).map((s) => (
                            <Badge
                              key={s}
                              variant="secondary"
                              size="sm"
                              className="text-[10px]"
                            >
                              {s}
                            </Badge>
                          ))}
                          {sectors.length > 6 && (
                            <Badge variant="secondary" size="sm" className="text-[10px]">
                              +{sectors.length - 6}
                            </Badge>
                          )}
                        </div>
                      )}
                    </td>
                  )
                })}
              </tr>

              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 align-top font-medium text-muted-foreground">
                  Investment thesis
                </td>
                {investors.map((firm) => (
                  <td
                    key={firm.id}
                    className="px-3 py-2.5 align-top text-xs leading-relaxed text-muted-foreground"
                  >
                    {truncate(firm.highlights.investment_thesis, 200)}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="py-3 pr-4 font-medium text-muted-foreground" />
                {investors.map((firm) => (
                  <td key={firm.id} className="px-3 py-3">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/money/raise/investor/${firm.id}`}>
                        Go to detail <ExternalLink className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
