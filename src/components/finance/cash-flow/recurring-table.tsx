/**
 * @file recurring-table.tsx — Revenue and cost breakdown tables
 *
 * @description Shows the recurring revenue streams and cost items
 * feeding the cash flow forecast.
 */

'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import type { RecurringRevenue, RecurringCost } from '@/lib/finance/forecast'

interface RecurringTableProps {
  revenue: RecurringRevenue[]
  costs: RecurringCost[]
  currency?: string
  className?: string
}

export function RecurringTable({ revenue, costs, currency = 'GBP', className }: RecurringTableProps) {
  const totalRevenue = revenue.reduce((sum, r) => sum + r.monthlyAmount, 0)
  const totalCosts = costs.reduce((sum, c) => sum + c.monthlyAmount, 0)

  return (
    <div className={className}>
      {/* Revenue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-status-success" />
            Recurring Revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {revenue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring revenue streams found.</p>
          ) : (
            <div className="space-y-2">
              {revenue.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{item.source}</span>
                  <span className="font-medium">{formatCurrency(item.monthlyAmount, currency)}/mo</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold pt-2">
                <span>Total</span>
                <span className="text-status-success">{formatCurrency(totalRevenue, currency)}/mo</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Costs */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-destructive" />
            Recurring Costs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {costs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recurring costs found. Add costs in Money Map.</p>
          ) : (
            <div className="space-y-2">
              {costs.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm py-1 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{item.source}</span>
                    <span className="text-xs text-muted-foreground capitalize">({item.category})</span>
                  </div>
                  <span className="font-medium">{formatCurrency(item.monthlyAmount, currency)}/mo</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm font-semibold pt-2">
                <span>Total</span>
                <span className="text-destructive">{formatCurrency(totalCosts, currency)}/mo</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
