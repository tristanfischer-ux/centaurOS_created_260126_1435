/**
 * @file InvestorCompareDialog.tsx
 *
 * @description Side-by-side comparison dialog for 2-3 investor firms.
 * Shows key metrics in rows with green highlights on best values.
 */

'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { InvestorFirm } from '@/actions/investors'

interface InvestorCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  firms: InvestorFirm[]
  matchScores: Record<string, number>
}

function formatFundSize(gbp: number | undefined): string {
  if (gbp == null) return '—'
  if (gbp >= 1_000_000_000) {
    const b = gbp / 1_000_000_000
    return `£${b % 1 === 0 ? b : b.toFixed(1)}B`
  }
  if (gbp >= 1_000_000) {
    const m = gbp / 1_000_000
    return `£${m % 1 === 0 ? m : m.toFixed(0)}M`
  }
  return `£${gbp.toLocaleString()}`
}

function formatCheque(range: { min: number | null; max: number | null } | undefined): string {
  if (!range) return '—'
  const min = range.min != null ? formatFundSize(range.min) : '?'
  const max = range.max != null ? formatFundSize(range.max) : '?'
  return `${min} – ${max}`
}

type CompareRow = {
  label: string
  getValue: (firm: InvestorFirm) => string | number | null
  getNumeric?: (firm: InvestorFirm) => number | null
  higherIsBetter?: boolean
}

const ROWS: CompareRow[] = [
  { label: 'Fund Size', getValue: f => formatFundSize(f.attributes.fund_size_gbp), getNumeric: f => f.attributes.fund_size_gbp ?? null, higherIsBetter: true },
  { label: 'Cheque Range', getValue: f => formatCheque(f.attributes.cheque_range_gbp) },
  { label: 'Stage Focus', getValue: f => (f.attributes.stage_focus ?? []).join(', ') || '—' },
  { label: 'Sectors', getValue: f => (f.attributes.sectors ?? []).slice(0, 4).join(', ') || '—' },
  { label: 'Geo Focus', getValue: f => (f.attributes.geo_focus ?? []).join(', ') || '—' },
  { label: 'Hardware Fit', getValue: f => f.attributes.hardware_fit_score != null ? `${f.attributes.hardware_fit_score.toFixed(1)}/10` : '—', getNumeric: f => f.attributes.hardware_fit_score ?? null, higherIsBetter: true },
  { label: 'Quality Score', getValue: f => f.attributes.data_quality_score != null ? `${f.attributes.data_quality_score.toFixed(1)}/10` : '—', getNumeric: f => f.attributes.data_quality_score ?? null, higherIsBetter: true },
  { label: 'Active Deploying', getValue: f => f.attributes.is_active_deploying ? 'Yes' : 'No' },
  { label: 'Firm Type', getValue: f => f.attributes.firm_type ?? '—' },
  { label: 'Portfolio', getValue: f => `${f.attributes.portfolio_companies?.length ?? 0} companies` },
]

export function InvestorCompareDialog({ open, onOpenChange, firms, matchScores }: InvestorCompareDialogProps) {
  // GOTCHA: Don't return null when open — it breaks controlled Dialog state.
  // Instead, render the Dialog but keep it closed when data is insufficient.
  if (firms.length < 2) {
    return <Dialog open={false} onOpenChange={onOpenChange}><DialogContent><DialogHeader><DialogTitle>Compare</DialogTitle></DialogHeader></DialogContent></Dialog>
  }

  // Compute best values for numeric rows
  const bestValues: Record<string, string> = {}
  for (const row of ROWS) {
    if (!row.getNumeric || !row.higherIsBetter) continue
    let bestId = ''
    let bestVal = -Infinity
    for (const firm of firms) {
      const val = row.getNumeric(firm)
      if (val != null && val > bestVal) {
        bestVal = val
        bestId = firm.id
      }
    }
    if (bestId) bestValues[row.label] = bestId
  }

  // Match score best
  let bestMatchId = ''
  let bestMatch = -1
  for (const firm of firms) {
    const score = matchScores[firm.id] ?? 0
    if (score > bestMatch) {
      bestMatch = score
      bestMatchId = firm.id
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compare Investors</DialogTitle>
        </DialogHeader>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 pr-4 text-muted-foreground font-medium w-[140px]" />
                {firms.map(firm => (
                  <th key={firm.id} className="text-left py-3 px-3 font-semibold text-foreground">
                    <div className="space-y-1">
                      <p className="line-clamp-2">{firm.title}</p>
                      {firm.attributes.firm_type && (
                        <Badge variant="outline" className="text-xs">{firm.attributes.firm_type}</Badge>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Match Score row */}
              <tr className="border-b border-border">
                <td className="py-2.5 pr-4 text-muted-foreground font-medium">Match Score</td>
                {firms.map(firm => (
                  <td
                    key={firm.id}
                    className={cn(
                      'py-2.5 px-3',
                      bestMatchId === firm.id && 'text-success font-semibold'
                    )}
                  >
                    {matchScores[firm.id] != null ? `${matchScores[firm.id]}/100` : '—'}
                  </td>
                ))}
              </tr>

              {ROWS.map(row => (
                <tr key={row.label} className="border-b border-border">
                  <td className="py-2.5 pr-4 text-muted-foreground font-medium">{row.label}</td>
                  {firms.map(firm => {
                    const value = row.getValue(firm)
                    const isBest = bestValues[row.label] === firm.id
                    return (
                      <td
                        key={firm.id}
                        className={cn(
                          'py-2.5 px-3',
                          isBest && 'text-success font-semibold'
                        )}
                      >
                        {row.label === 'Active Deploying' ? (
                          firm.attributes.is_active_deploying ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground" />
                          )
                        ) : (
                          value ?? '—'
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
