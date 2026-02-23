/**
 * @file cash-flow-view.tsx — Client component for cash flow forecasting
 *
 * @description Renders the forecast chart with scenario panel and
 * recurring revenue/cost breakdown. Scenario adjustments recalculate
 * the projection client-side (no server round-trips).
 */

'use client'

import { useState, useMemo } from 'react'
import { Activity } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { ForecastChart } from '@/components/finance/cash-flow/forecast-chart'
import { RunwayCard } from '@/components/finance/cash-flow/runway-card'
import { ScenarioPanel } from '@/components/finance/cash-flow/scenario-panel'
import { RecurringTable } from '@/components/finance/cash-flow/recurring-table'
import {
  projectCashFlow,
  calculateRunway,
  applyScenarios,
  type ScenarioAdjustment,
} from '@/lib/finance/forecast'
import type { CashFlowData } from '@/actions/finance-forecast'

interface CashFlowViewProps {
  initialData: CashFlowData | null
  hasError: boolean
}

export function CashFlowView({ initialData, hasError }: CashFlowViewProps) {
  const [adjustments, setAdjustments] = useState<ScenarioAdjustment[]>([])

  // Recompute forecast whenever adjustments change
  const { forecastPoints, runway } = useMemo(() => {
    if (!initialData) {
      return { forecastPoints: [], runway: null }
    }

    const input = adjustments.length > 0
      ? applyScenarios(initialData.forecastInput, adjustments)
      : initialData.forecastInput

    const points = projectCashFlow(input)
    const runwayResult = calculateRunway(
      input.currentBalance,
      input.recurringRevenue,
      input.recurringCosts
    )

    return { forecastPoints: points, runway: runwayResult }
  }, [initialData, adjustments])

  if (hasError || !initialData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Flow</h1>
            <p className="text-sm text-muted-foreground">Forward-looking projections with scenario modeling</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Unable to load cash flow data. Please try again.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
          <Activity className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Flow</h1>
          <p className="text-sm text-muted-foreground">
            Forward-looking projections with scenario modeling
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area — chart */}
        <div className="lg:col-span-2 space-y-6">
          <ForecastChart data={forecastPoints} />

          {/* Revenue & Cost Tables */}
          <RecurringTable
            revenue={initialData.revenueBreakdown}
            costs={initialData.costBreakdown}
          />
        </div>

        {/* Sidebar — runway + scenarios */}
        <div className="space-y-6">
          {runway && <RunwayCard runway={runway} />}
          <ScenarioPanel onAdjustmentsChange={setAdjustments} />
        </div>
      </div>
    </div>
  )
}
