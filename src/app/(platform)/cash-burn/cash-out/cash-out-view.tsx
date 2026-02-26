/**
 * @file cash-out-view.tsx — Client component for Cash Out page
 *
 * @description Displays fixed and variable cost items in two sections
 * with summary charts and a 52-week breakdown table.
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingDown, AlertTriangle, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/types/payments'
import { Button } from '@/components/ui/button'
import { ItemsSection } from '@/components/cash-burn/items-section'
import { ItemDialog } from '@/components/cash-burn/item-dialog'
import { CashOutSetupWizard } from '@/components/cash-burn/cash-out-setup-wizard'
import { DonutChart } from '@/components/cash-burn/donut-chart'
import { StackedBarChart } from '@/components/cash-burn/stacked-bar-chart'
import { WeeklyGrid } from '@/components/cash-burn/weekly-grid'
import { generateCashOutGrid, normaliseToWeeklyPence } from '@/lib/cash-burn/weekly-projection'
import { chartColors } from '@/lib/chart-colors'
import {
  createCashOutItem,
  updateCashOutItem,
  deleteCashOutItem,
} from '@/actions/cash-burn-out'
import type { CashOutItem, CreateCashOutInput } from '@/types/cash-burn'
import type { WizardProfile } from '@/actions/cash-burn-out'

interface CashOutViewProps {
  initialItems: CashOutItem[]
  hasError: boolean
  humanProfiles: WizardProfile[]
}

export function CashOutView({ initialItems, hasError, humanProfiles }: CashOutViewProps) {
  const [items, setItems] = useState<CashOutItem[]>(initialItems)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CashOutItem | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fixedItems = useMemo(() => items.filter(i => i.costType === 'fixed'), [items])
  const variableItems = useMemo(() => items.filter(i => i.costType === 'variable'), [items])

  const weeklyFixedTotal = useMemo(() => fixedItems.reduce((s, i) => s + i.weeklyAmount, 0), [fixedItems])
  const weeklyVariableTotal = useMemo(() => variableItems.reduce((s, i) => s + i.weeklyAmount, 0), [variableItems])
  const weeklyTotal = weeklyFixedTotal + weeklyVariableTotal
  const monthlyTotal = Math.round(weeklyTotal * 52 / 12)
  const annualTotal = weeklyTotal * 52

  // Donut chart: fixed vs variable
  const donutData = useMemo(() => [
    { name: 'Fixed Costs', value: weeklyFixedTotal, color: chartColors[0] },
    { name: 'Variable Costs', value: weeklyVariableTotal, color: chartColors[1] },
  ], [weeklyFixedTotal, weeklyVariableTotal])

  // 52-week stacked area chart data
  const cashOutGrid = useMemo(() => generateCashOutGrid(items, 52, new Date()), [items])
  const stackedData = useMemo(() => cashOutGrid.map((row, i) => ({
    label: i % 4 === 0 ? row.weekLabel : `W${i + 1}`,
    'Fixed': row.fixedCosts,
    'Variable': row.variableCosts,
  })), [cashOutGrid])

  // Weekly table rows
  const weeklyTableRows = useMemo(() => cashOutGrid.map(row => ({
    label: row.weekLabel,
    fixed: row.fixedCosts,
    variable: row.variableCosts,
    total: row.totalOut,
  })), [cashOutGrid])

  const handleAdd = useCallback((costType?: string) => {
    setEditingItem(null)
    setDialogOpen(true)
  }, [])

  const handleEdit = useCallback((id: string) => {
    const item = items.find(i => i.id === id)
    if (item) {
      setEditingItem(item)
      setDialogOpen(true)
    }
  }, [items])

  const handleDelete = useCallback(async (id: string) => {
    setError(null)
    const result = await deleteCashOutItem(id)
    if (result.error) {
      setError(result.error)
    } else {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }, [])

  const handleWizardComplete = useCallback((newItems: CashOutItem[]) => {
    setItems(prev => [...prev, ...newItems])
  }, [])

  const handleSave = useCallback(async (data: CreateCashOutInput) => {
    setError(null)
    if (editingItem) {
      const result = await updateCashOutItem(editingItem.id, data)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setItems(prev => prev.map(i => i.id === editingItem.id ? result.data! : i))
      }
    } else {
      const result = await createCashOutItem(data)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setItems(prev => [...prev, result.data!])
      }
    }
    setDialogOpen(false)
    setEditingItem(null)
  }, [editingItem])

  if (hasError) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <TrendingDown className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Out</h1>
            <p className="text-sm text-muted-foreground">Fixed and variable cost management</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Unable to load cost items. Please try again.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with KPI badges */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <TrendingDown className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash Out</h1>
            <p className="text-sm text-muted-foreground">Fixed and variable cost management</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={items.length < 3 ? 'default' : 'secondary'}
            size="sm"
            onClick={() => setWizardOpen(true)}
          >
            <Zap className="h-3.5 w-3.5 mr-1.5" />
            Quick Setup
          </Button>
          <Badge variant="secondary" size="sm">{formatCurrency(weeklyTotal)}/wk</Badge>
          <Badge variant="secondary" size="sm">{formatCurrency(monthlyTotal)}/mo</Badge>
          <Badge variant="secondary" size="sm">{formatCurrency(annualTotal)}/yr</Badge>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DonutChart
          title="Fixed vs Variable Costs"
          data={donutData}
          height={250}
        />
        <StackedBarChart
          title="52-Week Cost Projection"
          data={stackedData}
          bars={[
            { dataKey: 'Fixed', name: 'Fixed Costs', color: chartColors[0] },
            { dataKey: 'Variable', name: 'Variable Costs', color: chartColors[1] },
          ]}
          height={250}
        />
      </div>

      {/* Two-section layout: Fixed | Variable */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ItemsSection
          title="Fixed Costs"
          items={fixedItems.map(i => ({
            id: i.id,
            name: i.name,
            label: i.category.replace(/_/g, ' '),
            weeklyAmount: i.weeklyAmount,
            frequency: i.frequency,
            amount: i.amount,
          }))}
          weeklySubtotal={weeklyFixedTotal}
          onAdd={() => handleAdd('fixed')}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage="No fixed costs yet. Add recurring expenses like rent and salaries."
        />
        <ItemsSection
          title="Variable Costs"
          items={variableItems.map(i => ({
            id: i.id,
            name: i.name,
            label: i.category.replace(/_/g, ' '),
            weeklyAmount: i.weeklyAmount,
            frequency: i.frequency,
            amount: i.amount,
          }))}
          weeklySubtotal={weeklyVariableTotal}
          onAdd={() => handleAdd('variable')}
          onEdit={handleEdit}
          onDelete={handleDelete}
          emptyMessage="No variable costs yet. Add expenses like contractors and materials."
        />
      </div>

      {/* 52-Week Breakdown Table */}
      <WeeklyGrid
        columns={[
          { key: 'label', label: 'Week' },
          { key: 'fixed', label: 'Fixed Costs' },
          { key: 'variable', label: 'Variable Costs' },
          { key: 'total', label: 'Total' },
        ]}
        rows={weeklyTableRows}
      />

      {/* Add/Edit Dialog */}
      <ItemDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditingItem(null)
        }}
        mode="cash-out"
        initialData={editingItem ? {
          name: editingItem.name,
          category: editingItem.category,
          cost_type: editingItem.costType,
          pnl_category: editingItem.pnlCategory,
          amount: editingItem.amount,
          frequency: editingItem.frequency,
          effective_from: editingItem.effectiveFrom,
          effective_to: editingItem.effectiveTo ?? undefined,
          notes: editingItem.notes ?? undefined,
        } : undefined}
        onSave={handleSave as (data: CreateCashOutInput | import('@/types/cash-burn').CreateCashInInput) => void}
      />

      {/* Quick Setup Wizard */}
      <CashOutSetupWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
        existingItemCount={items.length}
        humanProfiles={humanProfiles}
      />
    </div>
  )
}
