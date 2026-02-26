'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/types/payments'

// ============================================================
// Types
// ============================================================

interface Column {
  key: string
  label: string
}

interface WeeklyGridProps {
  columns: Column[]
  rows: Array<Record<string, string | number>>
  formatValue?: (value: number) => string
}

// ============================================================
// Constants
// ============================================================

const WEEKS_PER_PAGE = 13

// ============================================================
// Component
// ============================================================

export function WeeklyGrid({ columns, rows, formatValue = formatCurrency }: WeeklyGridProps) {
  const [page, setPage] = useState(0)
  const totalPages = Math.ceil(rows.length / WEEKS_PER_PAGE)
  const start = page * WEEKS_PER_PAGE
  const end = start + WEEKS_PER_PAGE
  const visibleRows = rows.slice(start, end)

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">52-Week Breakdown</h3>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No data to display</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        className="text-left py-2 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                    >
                      {columns.map((col) => {
                        const val = row[col.key]
                        const isLabel = col.key === 'weekLabel' || col.key === 'label'
                        return (
                          <td
                            key={col.key}
                            className={`py-2 px-3 whitespace-nowrap ${
                              isLabel
                                ? 'text-foreground font-medium'
                                : 'text-foreground tabular-nums'
                            }`}
                          >
                            {isLabel || typeof val === 'string'
                              ? val
                              : formatValue(val as number)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-4">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm text-muted-foreground">
                  Q{page + 1} of {totalPages}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page === totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
