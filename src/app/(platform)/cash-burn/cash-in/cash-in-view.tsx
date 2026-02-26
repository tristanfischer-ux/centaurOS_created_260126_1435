/**
 * @file cash-in-view.tsx — Client component for Cash In page
 *
 * @description Displays revenue, loans, equity, grants, and other inflows
 * in collapsible section cards with charts and 52-week breakdown.
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import { TrendingUp, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/types/payments'
import { ItemsSection } from '@/components/cash-burn/items-section'
import { ItemDialog } from '@/components/cash-burn/item-dialog'
import { DonutChart } from '@/components/cash-burn/donut-chart'
import { StackedBarChart } from '@/components/cash-burn/stacked-bar-chart'
import { WeeklyGrid } from '@/components/cash-burn/weekly-grid'
import { generateCashInGrid } from '@/lib/cash-burn/weekly-projection'
import { chartColors } from '@/lib/chart-colors'
import {
  createCashInItem,
  updateCashInItem,
  deleteCashInItem,
} from '@/actions/cash-burn-in'
import type { CashInItem, CashInSourceType, CreateCashInInput } from '@/types/cash-burn'

interface CashInViewProps {
  initialItems: CashInItem[]
  hasError: boolean
}

const SOURCE_TYPE_CONFIG: Array<{
  type: CashInSourceType
  label: string
  color: string
}> = [
  { type: 'revenue', label: 'Revenue', color: chartColors[2] },
  { type: 'loan', label: 'Loans', color: chartColors[3] },
  { type: 'equity', label: 'Equity', color: chartColors[4] },
  { type: 'government_grant', label: 'Government Grants', color: chartColors[5] },
  { type: 'other', label: 'Other', color: chartColors[1] },
]

export function CashInView({ initialItems, hasError }: CashInViewProps) {
  const [items, setItems] = useState<CashInItem[]>(initialItems)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CashInItem | null>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const weeklyTotal = useMemo(() => items.reduce((s, i) => s + i.weeklyAmount, 0), [items])
  const monthlyTotal = Math.round(weeklyTotal * 52 / 12)

  // Group items by source type
  const groupedItems = useMemo(() => {
    const groups: Record<string, CashInItem[]> = {}
    for (const cfg of SOURCE_TYPE_CONFIG) {
      groups[cfg.type] = items.filter(i => i.sourceType === cfg.type)
    }
    return groups
  }, [items])

  // Donut chart data
  const donutData = useMemo(() => {
    return SOURCE_TYPE_CONFIG.map(cfg => {
      const total = (groupedItems[cfg.type] ?? []).reduce((s, i) => s + i.weeklyAmount, 0)
      return { name: cfg.label, value: total, color: cfg.color }
    }).filter(d => d.value > 0)
  }, [groupedItems])

  // 52-week cash in grid and bar chart data
  const cashInGrid = useMemo(() => generateCashInGrid(items, 52, new Date()), [items])
  const barChartData = useMemo(() => cashInGrid.map((row, i) => ({
    label: i % 4 === 0 ? row.weekLabel : `W${i + 1}`,
    Revenue: row.revenue,
    Loans: row.loans,
    Equity: row.equity,
    Grants: row.grants,
    Other: row.other,
  })), [cashInGrid])

  // Weekly table rows
  const weeklyTableRows = useMemo(() => cashInGrid.map(row => ({
    label: row.weekLabel,
    revenue: row.revenue,
    loans: row.loans,
    equity: row.equity,
    grants: row.grants,
    other: row.other,
    total: row.totalIn,
  })), [cashInGrid])

  const toggleSection = useCallback((type: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  const handleAdd = useCallback(() => {
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
    const result = await deleteCashInItem(id)
    if (result.error) {
      setError(result.error)
    } else {
      setItems(prev => prev.filter(i => i.id !== id))
    }
  }, [])

  const handleSave = useCallback(async (data: CreateCashInInput) => {
    setError(null)
    if (editingItem) {
      const result = await updateCashInItem(editingItem.id, data)
      if (result.error) {
        setError(result.error)
      } else if (result.data) {
        setItems(prev => prev.map(i => i.id === editingItem.id ? result.data! : i))
      }
    } else {
      const result = await createCashInItem(data)
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
            <TrendingUp className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash In</h1>
            <p className="text-sm text-muted-foreground">Revenue and funding management</p>
          </div>
        </div>
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">Unable to load income items. Please try again.</p>
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
            <TrendingUp className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Cash In</h1>
            <p className="text-sm text-muted-foreground">Revenue and funding management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" size="sm">{formatCurrency(weeklyTotal)}/wk</Badge>
          <Badge variant="secondary" size="sm">{formatCurrency(monthlyTotal)}/mo</Badge>
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {/* Summary Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <DonutChart
          title="Income Sources"
          data={donutData}
          height={250}
        />
        <StackedBarChart
          title="52-Week Cash Inflow"
          data={barChartData}
          bars={SOURCE_TYPE_CONFIG.map(cfg => ({
            dataKey: cfg.label === 'Government Grants' ? 'Grants' : cfg.label,
            name: cfg.label,
            color: cfg.color,
          }))}
          height={250}
        />
      </div>

      {/* Section Cards per source type */}
      <div className="space-y-4">
        {SOURCE_TYPE_CONFIG.map(cfg => {
          const sectionItems = groupedItems[cfg.type] ?? []
          const sectionTotal = sectionItems.reduce((s, i) => s + i.weeklyAmount, 0)
          const isCollapsed = collapsedSections.has(cfg.type)

          return (
            <Card key={cfg.type}>
              <button
                onClick={() => toggleSection(cfg.type)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  {isCollapsed
                    ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  }
                  <span className="font-medium text-foreground">{cfg.label}</span>
                  <Badge variant="outline" size="sm">{sectionItems.length} item{sectionItems.length !== 1 ? 's' : ''}</Badge>
                </div>
                <span className="text-sm font-medium text-muted-foreground">
                  {formatCurrency(sectionTotal)}/wk
                </span>
              </button>
              {!isCollapsed && (
                <CardContent className="pt-0">
                  <ItemsSection
                    title=""
                    items={sectionItems.map(i => ({
                      id: i.id,
                      name: i.name,
                      label: `${i.probabilityPct}%`,
                      weeklyAmount: i.weeklyAmount,
                      frequency: i.frequency,
                      amount: i.amount,
                      probabilityPct: i.probabilityPct,
                    }))}
                    weeklySubtotal={sectionTotal}
                    onAdd={handleAdd}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    emptyMessage={`No ${cfg.label.toLowerCase()} items yet.`}
                  />
                </CardContent>
              )}
            </Card>
          )
        })}
      </div>

      {/* 52-Week Breakdown Table */}
      <WeeklyGrid
        columns={[
          { key: 'label', label: 'Week' },
          { key: 'revenue', label: 'Revenue' },
          { key: 'loans', label: 'Loans' },
          { key: 'equity', label: 'Equity' },
          { key: 'grants', label: 'Grants' },
          { key: 'other', label: 'Other' },
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
        mode="cash-in"
        initialData={editingItem ? {
          name: editingItem.name,
          source_type: editingItem.sourceType,
          amount: editingItem.amount,
          frequency: editingItem.frequency,
          probability_pct: editingItem.probabilityPct,
          effective_from: editingItem.effectiveFrom,
          effective_to: editingItem.effectiveTo ?? undefined,
          notes: editingItem.notes ?? undefined,
        } : undefined}
        onSave={handleSave as (data: import('@/types/cash-burn').CreateCashOutInput | CreateCashInInput) => void}
      />
    </div>
  )
}
