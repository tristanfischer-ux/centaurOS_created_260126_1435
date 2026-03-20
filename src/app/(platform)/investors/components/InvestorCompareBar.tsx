/**
 * @file InvestorCompareBar.tsx
 *
 * @description Sticky bottom bar for comparing 1-3 investor firms side by side.
 * Shows selected firm chips with remove buttons, compare action, and clear link.
 */

'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { X, GitCompare } from 'lucide-react'
import type { InvestorFirm } from '@/actions/investors'

interface InvestorCompareBarProps {
  firms: InvestorFirm[]
  matchScores: Record<string, number>
  onRemove: (id: string) => void
  onClear: () => void
  onCompare: () => void
}

export function InvestorCompareBar({
  firms,
  matchScores,
  onRemove,
  onClear,
  onCompare,
}: InvestorCompareBarProps) {
  if (firms.length === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground shrink-0">
          <GitCompare className="h-4 w-4" />
          Compare ({firms.length})
        </div>

        <div className="flex items-center gap-2 overflow-x-auto flex-1">
          {firms.map(firm => (
            <Badge key={firm.id} variant="secondary" className="shrink-0 gap-1.5 py-1 px-3">
              <span className="text-xs max-w-[150px] truncate">{firm.title}</span>
              {matchScores[firm.id] != null && (
                <span className="text-[10px] text-muted-foreground">({matchScores[firm.id]})</span>
              )}
              <button
                onClick={() => onRemove(firm.id)}
                className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                aria-label={`Remove ${firm.title} from compare`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="sm" onClick={onClear} className="text-xs">
            Clear
          </Button>
          <Button
            size="sm"
            onClick={onCompare}
            disabled={firms.length < 2}
            className="bg-international-orange hover:bg-international-orange-hover text-xs"
          >
            Compare
          </Button>
        </div>
      </div>
    </div>
  )
}
