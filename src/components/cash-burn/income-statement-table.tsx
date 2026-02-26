'use client'

import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import type { IncomeStatementRow } from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

interface IncomeStatementTableProps {
  rows: IncomeStatementRow[]
  periodType: 'weekly' | 'monthly'
}

// ============================================================
// Row definitions for rendering
// ============================================================

interface RowDef {
  key: keyof IncomeStatementRow
  label: string
  isBold?: boolean
  isSubtotal?: boolean
  isNegative?: boolean
}

const ROW_DEFS: RowDef[] = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'cogs', label: '(less) COGS', isNegative: true },
  { key: 'grossProfit', label: 'Gross Profit', isBold: true, isSubtotal: true },
  { key: 'opex', label: '(less) Operating Expenses', isNegative: true },
  { key: 'rnd', label: '(less) R&D', isNegative: true },
  { key: 'ebitda', label: 'EBITDA', isBold: true, isSubtotal: true },
]

// ============================================================
// Component
// ============================================================

export function IncomeStatementTable({ rows, periodType }: IncomeStatementTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">
          Income Statement ({periodType === 'weekly' ? 'Weekly' : 'Monthly'})
        </h3>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Line Item
                </th>
                {rows.map((row) => (
                  <th
                    key={row.period}
                    className="text-right py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                  >
                    {row.period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROW_DEFS.map((def) => (
                <tr
                  key={def.key}
                  className={`border-b ${
                    def.isSubtotal ? 'border-border bg-muted/30' : 'border-border/50'
                  }`}
                >
                  <td
                    className={`py-2 px-3 ${
                      def.isBold ? 'font-semibold text-foreground' : 'text-foreground'
                    }`}
                  >
                    {def.label}
                  </td>
                  {rows.map((row) => {
                    const value = row[def.key] as number
                    const isNegativeValue = value < 0
                    return (
                      <td
                        key={row.period}
                        className={`py-2 px-3 text-right tabular-nums whitespace-nowrap ${
                          def.isBold ? 'font-semibold' : ''
                        } ${isNegativeValue ? 'text-destructive' : 'text-foreground'}`}
                      >
                        {def.isNegative && value > 0 ? `(${formatCurrency(value, 'GBP', 0)})` : formatCurrency(value, 'GBP', 0)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
