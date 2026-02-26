/**
 * @file cash-burn-view.tsx — Client component for the main Cash Burn page
 *
 * @description Interactive burn analysis with scenario panel, cumulative
 * balance chart, expense breakdown, and weekly table. Scenario adjustments
 * recalculate client-side via useMemo (no server round-trips).
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { Flame } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/types/payments'
import { KpiRow } from '@/components/cash-burn/kpi-row'
import { RunwayBadge } from '@/components/cash-burn/runway-badge'
import { BurnAreaChart } from '@/components/cash-burn/burn-area-chart'
import { StackedBarChart } from '@/components/cash-burn/stacked-bar-chart'
import { DonutChart } from '@/components/cash-burn/donut-chart'
import { ScenarioPanel } from '@/components/cash-burn/scenario-panel'
import { WeeklyGrid } from '@/components/cash-burn/weekly-grid'
import { generateCashOutGrid, generateCashInGrid } from '@/lib/cash-burn/weekly-projection'
import { projectBurn } from '@/lib/cash-burn/burn-engine'
import { chartColors } from '@/lib/chart-colors'
import {
  createScenario,
  updateScenario,
  deleteScenario,
} from '@/actions/cash-burn-scenarios'
import type {
  BurnScenario,
  CashOutItem,
  CashInItem,
  CreateScenarioInput,
} from '@/types/cash-burn'

interface CashBurnViewProps {
  initialData: {
    cashOut: CashOutItem[]
    cashIn: CashInItem[]
    scenarios: BurnScenario[]
  } | null
  hasError: boolean
}

const WEEKS = 52

export function CashBurnView({ initialData, hasError }: CashBurnViewProps) {
  const [scenarios, setScenarios] = useState<BurnScenario[]>(initialData?.scenarios ?? [])
  const [activeScenario, setActiveScenario] = useState<BurnScenario>(
    () => scenarios.find(s => s.isDefault) ?? scenarios[0] ?? {
      id: '', name: 'Base Case', openingBalance: 0,
      revenueDelayWeeks: 0, costDelayWeeks: 0, revenueGrowthPct: 0,
      isDefault: true, sortOrder: 0,
    }
  )

  const cashOut = initialData?.cashOut ?? []
  const cashIn = initialData?.cashIn ?? []

  // Pre-compute the weekly grids (these don't change with scenario)
  const cashOutGrid = useMemo(
    () => generateCashOutGrid(cashOut, WEEKS, new Date()),
    [cashOut]
  )
  const cashInGrid = useMemo(
    () => generateCashInGrid(cashIn, WEEKS, new Date()),
    [cashIn]
  )

  // Recompute projection whenever scenario changes
  const projection = useMemo(
    () => projectBurn(cashOutGrid, cashInGrid, activeScenario),
    [cashOutGrid, cashInGrid, activeScenario]
  )

  // Cash-zero date
  const cashZeroDate = useMemo(() => {
    if (projection.runwayWeeks === null) return null
    const cliffWeek = projection.weeks.find(w => w.cumulativeBalance < 0)
    return cliffWeek?.weekStart ?? null
  }, [projection])

  // Expense breakdown for donut chart
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {}
    for (const item of cashOut) {
      const cat = item.category.replace(/_/g, ' ')
      byCategory[cat] = (byCategory[cat] ?? 0) + item.weeklyAmount
    }
    return Object.entries(byCategory)
      .map(([name, value], i) => ({ name, value, color: chartColors[i % chartColors.length] }))
      .sort((a, b) => b.value - a.value)
  }, [cashOut])

  // Stacked bar data for cash in vs out
  const stackedBarData = useMemo(() => {
    return projection.weeks.map((w, i) => ({
      label: i % 4 === 0 ? w.weekLabel : `W${i + 1}`,
      'Cash In': cashInGrid[i]?.totalIn ?? 0,
      'Cash Out': cashOutGrid[i]?.totalOut ?? 0,
    }))
  }, [projection.weeks, cashInGrid, cashOutGrid])

  // Weekly table data
  const weeklyTableRows = useMemo(() => {
    return projection.weeks.map(w => ({
      label: w.weekLabel,
      cashIn: w.totalIn,
      cashOut: w.totalOut,
      net: w.net,
      balance: w.cumulativeBalance,
    }))
  }, [projection.weeks])

  // Scenario handlers
  const handleScenarioChange = useCallback((scenario: BurnScenario) => {
    setActiveScenario(scenario)
  }, [])

  const handleSave = useCallback(async (id: string, updates: Partial<CreateScenarioInput>) => {
    const result = await updateScenario(id, updates)
    if (result.data) {
      setScenarios(prev => prev.map(s => s.id === id ? result.data! : s))
      if (activeScenario.id === id) {
        setActiveScenario(result.data)
      }
    }
  }, [activeScenario.id])

  const handleCreate = useCallback(async (input: CreateScenarioInput) => {
    const result = await createScenario(input)
    if (result.data) {
      setScenarios(prev => [...prev, result.data!])
      setActiveScenario(result.data)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const result = await deleteScenario(id)
    if (!result.error) {
      setScenarios(prev => {
        const remaining = prev.filter(s => s.id !== id)
        if (activeScenario.id === id && remaining.length > 0) {
          setActiveScenario(remaining[0])
        }
        return remaining
      })
    }
  }, [activeScenario.id])

  if (hasError || !initialData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <Flame className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Burn</h1>
            <p className="text-sm text-muted-foreground">Scenario-based runway analysis</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              Unable to load cash burn data. Please try again.
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
          <Flame className="h-5 w-5 text-international-orange" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Burn</h1>
          <p className="text-sm text-muted-foreground">
            52-week runway analysis with scenario modelling
          </p>
        </div>
      </div>

      {/* KPI Row */}
      <KpiRow items={[
        {
          label: 'Opening Balance',
          value: formatCurrency(activeScenario.openingBalance),
        },
        {
          label: 'Weekly Burn Rate',
          value: formatCurrency(Math.round(projection.monthlyBurnRate * 12 / 52)),
          detail: projection.monthlyBurnRate > 0 ? 'Net negative' : 'Net positive',
        },
        {
          label: 'Runway',
          value: projection.runwayWeeks === null ? 'Sustainable' : `${projection.runwayWeeks} weeks`,
          detail: projection.runwayWeeks !== null && projection.runwayWeeks > 0
            ? `~${Math.round(projection.runwayWeeks / 4.33)} months`
            : undefined,
        },
        {
          label: 'Cash-Zero Date',
          value: cashZeroDate
            ? new Date(cashZeroDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'N/A',
          detail: cashZeroDate ? undefined : 'Cash positive throughout',
        },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Primary burn chart */}
          <BurnAreaChart data={projection.weeks} />

          {/* Secondary charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <StackedBarChart
              title="Weekly Cash Flow"
              data={stackedBarData}
              bars={[
                { dataKey: 'Cash In', name: 'Cash In', color: chartColors[2] },
                { dataKey: 'Cash Out', name: 'Cash Out', color: chartColors[0] },
              ]}
              height={250}
            />
            <DonutChart
              title="Expense Breakdown"
              data={expenseBreakdown}
              height={250}
            />
          </div>
        </div>

        {/* Sidebar — scenario panel */}
        <div className="space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-muted-foreground">Runway:</span>
            <RunwayBadge weeks={projection.runwayWeeks} />
          </div>
          <ScenarioPanel
            scenarios={scenarios}
            activeScenario={activeScenario}
            onScenarioChange={handleScenarioChange}
            onSave={handleSave}
            onCreate={handleCreate}
            onDelete={handleDelete}
          />
        </div>
      </div>

      {/* Weekly table */}
      <WeeklyGrid
        columns={[
          { key: 'label', label: 'Week' },
          { key: 'cashIn', label: 'Cash In' },
          { key: 'cashOut', label: 'Cash Out' },
          { key: 'net', label: 'Net' },
          { key: 'balance', label: 'Cumulative Balance' },
        ]}
        rows={weeklyTableRows}
      />
    </div>
  )
}
