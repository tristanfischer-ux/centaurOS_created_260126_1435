/**
 * @file PriceTable.tsx
 *
 * @description Tabular view of price index data with sortable columns.
 * Supports both category and product view modes.
 */

'use client'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export interface PriceTableRow {
  weekStart: string
  productCategory: string
  qualityGrade: string | null
  productName: string | null
  avgPricePerKg: number
  volumeKg: number
  sampleCount: number
  /** Week-over-week change percentage */
  weekChange?: number
}

interface PriceTableProps {
  rows: PriceTableRow[]
  mode: 'category' | 'product'
  className?: string
}

function formatPrice(value: number): string {
  return `£${value.toFixed(2)}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function PriceTable({ rows, mode, className }: PriceTableProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base font-semibold">Price Data</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Week</TableHead>
              <TableHead>{mode === 'product' ? 'Product' : 'Category / Grade'}</TableHead>
              <TableHead className="text-right">Avg Price/kg</TableHead>
              <TableHead className="text-right">Volume (kg)</TableHead>
              <TableHead className="text-right">Samples</TableHead>
              <TableHead className="text-right">WoW</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No price data for the selected filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, i) => (
                <TableRow key={`${row.weekStart}-${row.productCategory}-${row.productName ?? row.qualityGrade ?? 'agg'}-${i}`}>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(row.weekStart)}
                  </TableCell>
                  <TableCell>
                    {mode === 'product' ? (
                      <span className="font-medium text-sm">{row.productName ?? row.productCategory}</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{row.productCategory}</span>
                        {row.qualityGrade && (
                          <Badge variant="secondary" className="text-xs">
                            {row.qualityGrade}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatPrice(row.avgPricePerKg)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {row.volumeKg.toLocaleString('en-GB')}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground text-sm">
                    {row.sampleCount}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {row.weekChange != null ? (
                      <span
                        className={
                          row.weekChange > 0
                            ? 'text-success'
                            : row.weekChange < 0
                              ? 'text-destructive'
                              : 'text-muted-foreground'
                        }
                      >
                        {row.weekChange > 0 ? '+' : ''}
                        {row.weekChange.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
