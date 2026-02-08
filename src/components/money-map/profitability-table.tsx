'use client'

/**
 * ProfitabilityTable — Shows fully-loaded cost per revenue stream with
 * columns for Revenue, Direct Costs, Shared Costs, Overhead, Net, and Margin %.
 *
 * @component
 * @example
 * <ProfitabilityTable profitability={data.profitability} onEditStream={handleEdit} />
 */

import { useState } from 'react'
import { ArrowUpDown, Pencil } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import type { StreamProfitability } from '@/types/money-map'
import { REVENUE_CATEGORY_LABELS } from '@/types/money-map'

interface ProfitabilityTableProps {
  /** Pre-computed profitability rows — one per revenue stream */
  profitability: StreamProfitability[]
  /** Called when user clicks the edit icon on a row */
  onEditStream?: (streamId: string) => void
  /** Additional CSS classes */
  className?: string
}

type SortKey = 'name' | 'revenue' | 'direct' | 'indirect' | 'overhead' | 'net' | 'margin'

/**
 * Format currency for table cells.
 */
function fmt(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(value)
}

/**
 * Get the colour class for a margin percentage.
 */
function marginColor(pct: number): string {
  if (pct >= 20) return 'text-status-success'
  if (pct >= 0) return 'text-status-warning'
  return 'text-destructive'
}

export function ProfitabilityTable({
  profitability,
  onEditStream,
  className,
}: ProfitabilityTableProps): React.ReactElement {
  const [sortKey, setSortKey] = useState<SortKey>('revenue')
  const [sortAsc, setSortAsc] = useState(false)

  const handleSort = (key: SortKey): void => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const sorted = [...profitability].sort((a, b) => {
    let diff = 0
    const revA = a.revenue_stream.amount
    const revB = b.revenue_stream.amount
    switch (sortKey) {
      case 'name':
        diff = a.revenue_stream.name.localeCompare(b.revenue_stream.name)
        break
      case 'revenue':
        diff = revA - revB
        break
      case 'direct':
        diff = a.direct_costs - b.direct_costs
        break
      case 'indirect':
        diff = a.indirect_costs - b.indirect_costs
        break
      case 'overhead':
        diff = a.overhead_costs - b.overhead_costs
        break
      case 'net':
        diff = a.net - b.net
        break
      case 'margin':
        diff = a.margin_pct - b.margin_pct
        break
    }
    return sortAsc ? diff : -diff
  })

  const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }): React.ReactElement => (
    <button
      className="flex items-center gap-1 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => handleSort(sortKeyName)}
    >
      {label}
      <ArrowUpDown className={cn('h-3 w-3', sortKey === sortKeyName && 'text-international-orange')} />
    </button>
  )

  if (profitability.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="text-lg font-display">Profitability by Stream</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No revenue streams configured yet.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-lg font-display">Profitability by Stream</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 pr-4">
                  <SortHeader label="Stream" sortKeyName="name" />
                </th>
                <th className="text-right py-3 px-3">
                  <SortHeader label="Revenue" sortKeyName="revenue" />
                </th>
                <th className="text-right py-3 px-3">
                  <SortHeader label="Direct" sortKeyName="direct" />
                </th>
                <th className="text-right py-3 px-3">
                  <SortHeader label="Shared" sortKeyName="indirect" />
                </th>
                <th className="text-right py-3 px-3">
                  <SortHeader label="Overhead" sortKeyName="overhead" />
                </th>
                <th className="text-right py-3 px-3">
                  <SortHeader label="Net" sortKeyName="net" />
                </th>
                <th className="text-right py-3 pl-3">
                  <SortHeader label="Margin" sortKeyName="margin" />
                </th>
                {onEditStream && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.revenue_stream.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="py-3 pr-4">
                    <div>
                      <p className="font-medium text-foreground">{row.revenue_stream.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {REVENUE_CATEGORY_LABELS[row.revenue_stream.category]}
                      </p>
                    </div>
                  </td>
                  <td className="text-right py-3 px-3 font-medium text-foreground">
                    {fmt(row.revenue_stream.amount)}
                  </td>
                  <td className="text-right py-3 px-3 text-muted-foreground">
                    {fmt(row.direct_costs)}
                  </td>
                  <td className="text-right py-3 px-3 text-muted-foreground">
                    {fmt(row.indirect_costs)}
                  </td>
                  <td className="text-right py-3 px-3 text-muted-foreground">
                    {fmt(row.overhead_costs)}
                  </td>
                  <td className={cn('text-right py-3 px-3 font-semibold', row.net >= 0 ? 'text-status-success' : 'text-destructive')}>
                    {fmt(row.net)}
                  </td>
                  <td className={cn('text-right py-3 pl-3 font-semibold', marginColor(row.margin_pct))}>
                    {row.margin_pct.toFixed(1)}%
                  </td>
                  {onEditStream && (
                    <td className="py-3 pl-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEditStream(row.revenue_stream.id)}
                        aria-label={`Edit ${row.revenue_stream.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
