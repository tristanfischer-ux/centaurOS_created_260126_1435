/**
 * @file cash-burn-view.tsx — Client component for the main Cash Burn page
 *
 * @description Interactive burn analysis with scenario panel, cumulative
 * balance chart, expense breakdown, and weekly table. Scenario adjustments
 * recalculate client-side via useMemo (no server round-trips).
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { Flame, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency } from '@/types/payments'
import { KpiRow } from '@/components/cash-burn/kpi-row'
import { RunwayBadge } from '@/components/cash-burn/runway-badge'
import { BurnAreaChart } from '@/components/cash-burn/burn-area-chart'
import { StackedBarChart } from '@/components/cash-burn/stacked-bar-chart'
import { DonutChart } from '@/components/cash-burn/donut-chart'
import { ScenarioPanel } from '@/components/cash-burn/scenario-panel'
import { WeeklyGrid } from '@/components/cash-burn/weekly-grid'
import { SpecialistBriefingHero } from '@/components/specialists/specialist-briefing-hero'
import { generateCashOutGrid, generateCashInGrid, normaliseToWeeklyPence } from '@/lib/cash-burn/weekly-projection'
import { projectBurn } from '@/lib/cash-burn/burn-engine'
import { chartColors, moneyMapColors } from '@/lib/chart-colors'
import {
  createScenario,
  updateScenario,
  deleteScenario,
} from '@/actions/cash-burn-scenarios'
import { ErrorBoundary } from '@/components/ErrorBoundary'
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
  const [error, setError] = useState<string | null>(null)
  const [startDate] = useState(() => new Date())
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
    () => generateCashOutGrid(cashOut, WEEKS, startDate),
    [cashOut, startDate]
  )
  const cashInGrid = useMemo(
    () => generateCashInGrid(cashIn, WEEKS, startDate),
    [cashIn, startDate]
  )

  // Recompute projection whenever scenario changes
  const projection = useMemo(
    () => projectBurn(cashOutGrid, cashInGrid, activeScenario),
    [cashOutGrid, cashInGrid, activeScenario]
  )

  // Cash-zero date
  const cashZeroDate = useMemo(() => {
    if (projection.runwayWeeks === null) return null
    // INTENT: Match computeRunway which uses <= 0 (balance at exactly 0 = exhausted)
    const cliffWeek = projection.weeks.find(w => w.cumulativeBalance <= 0)
    if (cliffWeek) return cliffWeek.weekStart
    // INTENT: Runway exceeds 52-week window — extrapolate approximate date
    if (projection.runwayWeeks > 0) {
      const d = new Date()
      d.setDate(d.getDate() + projection.runwayWeeks * 7)
      return d.toISOString().split('T')[0]
    }
    return null
  }, [projection])

  // Expense breakdown for donut chart
  const expenseBreakdown = useMemo(() => {
    const byCategory: Record<string, number> = {}
    for (const item of cashOut) {
      const cat = item.category.replace(/_/g, ' ')
      // INTENT: Normalise all frequencies to weekly for fair comparison in donut
      const weeklyNorm = normaliseToWeeklyPence(item.amount, item.frequency)
      byCategory[cat] = (byCategory[cat] ?? 0) + weeklyNorm
    }
    return Object.entries(byCategory)
      .map(([name, value], i) => ({ name, value, color: chartColors[i % chartColors.length] }))
      .sort((a, b) => b.value - a.value)
  }, [cashOut])

  // Stacked bar data for cash in vs out (scenario-adjusted)
  const stackedBarData = useMemo(() => {
    return projection.weeks.map((w, i) => ({
      label: i % 4 === 0 ? w.weekLabel : `W${i + 1}`,
      'Cash In': w.totalIn,
      'Cash Out': w.totalOut,
    }))
  }, [projection.weeks])

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
    setError(null)
    const result = await updateScenario(id, updates)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setScenarios(prev => prev.map(s => s.id === id ? result.data! : s))
      if (activeScenario.id === id) {
        setActiveScenario(result.data)
      }
    }
  }, [activeScenario.id])

  const handleCreate = useCallback(async (input: CreateScenarioInput) => {
    setError(null)
    const result = await createScenario(input)
    if (result.error) {
      setError(result.error)
    } else if (result.data) {
      setScenarios(prev => [...prev, result.data!])
      setActiveScenario(result.data)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    setError(null)
    const result = await deleteScenario(id)
    if (result.error) {
      setError(result.error)
    } else {
      setScenarios(prev => {
        const remaining = prev.filter(s => s.id !== id)
        if (activeScenario.id === id) {
          setActiveScenario(remaining[0] ?? {
            id: '', name: 'Base Case', openingBalance: 0,
            revenueDelayWeeks: 0, costDelayWeeks: 0, revenueGrowthPct: 0,
            isDefault: true, sortOrder: 0,
          })
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

      <SpecialistBriefingHero
        specialistId="finance-lead"
        specialistName="Finn"
        specialistTitle="Finance"
        narrative={null}
        fallbackMessage="I'll help you model your runway and cash projections. Start by adding your costs on Cash Out and revenue on Cash In — I'll calculate everything else."
        isLoading={false}
        severity="success"
        context={{ type: 'general', title: 'Cash Burn', description: 'Finn on cash burn.', metadata: {} }}
        storageKey="cash-burn"
      />

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Color legend */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chartColors[2] }} />
          <span className="text-xs text-muted-foreground">Cash In / Balance</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: chartColors[0] }} />
          <span className="text-xs text-muted-foreground">Cash Out</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: moneyMapColors.loss }} />
          <span className="text-xs text-muted-foreground">Zero Line / Negative</span>
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
          tooltip: 'Weekly spend based on the last 3 months of expenses. Runway = cash ÷ burn rate.',
          value: formatCurrency(Math.round(projection.monthlyBurnRate * 12 / 52)),
          detail: cashOut.length === 0 && cashIn.length === 0
            ? 'No data entered'
            : projection.monthlyBurnRate > 0 ? 'Net negative' : 'Net positive',
        },
        {
          label: 'Runway',
          tooltip: 'How many weeks your current cash will last at the current burn rate.',
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

      {cashOut.length === 0 && cashIn.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <div className="flex justify-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingDown className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No costs or revenue entered yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Set up your costs and revenue to see burn rate, runway, and cash projections.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button asChild variant="default" size="sm">
                <Link href="/cash-burn/cash-out">
                  <TrendingDown className="h-4 w-4 mr-1.5" />
                  Set up costs
                </Link>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <Link href="/cash-burn/cash-in">
                  <TrendingUp className="h-4 w-4 mr-1.5" />
                  Add revenue
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main area */}
        <div className="lg:col-span-2 space-y-6">
          <ErrorBoundary>
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
          </ErrorBoundary>
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
