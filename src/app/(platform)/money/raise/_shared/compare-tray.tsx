'use client'

/**
 * @file compare-tray.tsx
 *
 * Sticky bottom tray that accumulates 1-4 investors for side-by-side compare.
 * Ported from `src/app/(platform)/investors/components/InvestorCompareBar.tsx`
 * — same visual language, adapted to the /money/raise shape and extended to
 * 4-wide comparisons.
 */

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GitCompare, X } from 'lucide-react'
import type { ScoredListingRow } from '@/lib/money/match-types'

export const MAX_COMPARE = 4

export type CompareTrayProps = {
  investors: ScoredListingRow[]
  onRemove: (id: string) => void
  onClear: () => void
  onCompare: () => void
}

export function CompareTray({ investors, onRemove, onClear, onCompare }: CompareTrayProps) {
  if (investors.length === 0) return null

  const canCompare = investors.length >= 2
  const atCap = investors.length >= MAX_COMPARE

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card shadow-lg"
      role="region"
      aria-label="Compare investors tray"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
          <GitCompare className="h-4 w-4" aria-hidden="true" />
          <span>
            {investors.length} {investors.length === 1 ? 'investor' : 'investors'} selected
            {atCap && <span className="ml-1 text-xs text-muted-foreground">(max)</span>}
          </span>
        </div>

        <div className="flex flex-1 items-center gap-2 overflow-x-auto">
          {investors.map((firm) => (
            <Badge
              key={firm.id}
              variant="secondary"
              size="sm"
              className="shrink-0 gap-1.5 px-3 py-1"
            >
              <span className="max-w-[160px] truncate text-xs">
                {firm.title ?? 'Unnamed investor'}
              </span>
              <button
                type="button"
                onClick={() => onRemove(firm.id)}
                className="ml-0.5 rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`Remove ${firm.title ?? 'investor'} from compare`}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onCompare}
            disabled={!canCompare}
            className="bg-international-orange text-xs hover:bg-international-orange/90"
          >
            Compare{canCompare ? ` (${investors.length})` : ''}
          </Button>
        </div>
      </div>
    </div>
  )
}
