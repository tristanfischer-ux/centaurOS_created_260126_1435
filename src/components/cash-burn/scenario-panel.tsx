'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Save, AlertTriangle } from 'lucide-react'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { BurnScenario, CreateScenarioInput } from '@/types/cash-burn'

// ============================================================
// Types
// ============================================================

interface ScenarioPanelProps {
  scenarios: BurnScenario[]
  activeScenario: BurnScenario
  onScenarioChange: (scenario: BurnScenario) => void
  onSave: (id: string, updates: Partial<CreateScenarioInput>) => void | Promise<void>
  onCreate: (input: CreateScenarioInput) => void
  onDelete: (id: string) => void
}

// ============================================================
// Component
// ============================================================

export function ScenarioPanel({
  scenarios,
  activeScenario,
  onScenarioChange,
  onSave,
  onCreate,
  onDelete,
}: ScenarioPanelProps) {
  // Local state for instant slider feedback
  const [openingBalancePounds, setOpeningBalancePounds] = useState(
    String(activeScenario.openingBalance / 100)
  )
  const [revenueDelay, setRevenueDelay] = useState(activeScenario.revenueDelayWeeks)
  const [costDelay, setCostDelay] = useState(activeScenario.costDelayWeeks)
  const [revenueGrowth, setRevenueGrowth] = useState(activeScenario.revenueGrowthPct)
  const [isSaving, setIsSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Sync local state when active scenario changes (e.g. switching dropdown)
  useEffect(() => {
    setOpeningBalancePounds(String(activeScenario.openingBalance / 100))
    setRevenueDelay(activeScenario.revenueDelayWeeks)
    setCostDelay(activeScenario.costDelayWeeks)
    setRevenueGrowth(activeScenario.revenueGrowthPct)
    setConfirmDelete(false)
  }, [activeScenario])

  // Propagate slider changes for live chart updates
  function propagateChanges(updates: Partial<BurnScenario>) {
    onScenarioChange({ ...activeScenario, ...updates })
  }

  function handleRevenueDelayChange(value: number) {
    setRevenueDelay(value)
    propagateChanges({ revenueDelayWeeks: value })
  }

  function handleCostDelayChange(value: number) {
    setCostDelay(value)
    propagateChanges({ costDelayWeeks: value })
  }

  function handleRevenueGrowthChange(value: number) {
    setRevenueGrowth(value)
    propagateChanges({ revenueGrowthPct: value })
  }

  function handleOpeningBalanceBlur() {
    const pence = Math.round(parseFloat(openingBalancePounds || '0') * 100)
    propagateChanges({ openingBalance: pence })
  }

  async function handleSave() {
    setIsSaving(true)
    const pence = Math.round(parseFloat(openingBalancePounds || '0') * 100)
    await onSave(activeScenario.id, {
      name: activeScenario.name,
      opening_balance: pence,
      revenue_delay_weeks: revenueDelay,
      cost_delay_weeks: costDelay,
      revenue_growth_pct: revenueGrowth,
    })
    setIsSaving(false)
  }

  function handleCreate() {
    onCreate({
      name: `Scenario ${scenarios.length + 1}`,
      opening_balance: activeScenario.openingBalance,
      revenue_delay_weeks: 0,
      cost_delay_weeks: 0,
      revenue_growth_pct: 0,
    })
  }

  function handleDelete() {
    if (activeScenario.isDefault) return
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    setConfirmDelete(false)
    onDelete(activeScenario.id)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <h3 className="text-lg font-semibold text-foreground">Scenarios</h3>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scenario selector */}
        <div className="space-y-1.5">
          <label htmlFor="scenario-select" className="text-sm font-medium text-foreground">
            Active Scenario
          </label>
          <div className="flex gap-2">
            <select
              id="scenario-select"
              value={activeScenario.id}
              onChange={(e) => {
                const selected = scenarios.find((s) => s.id === e.target.value)
                if (selected) onScenarioChange(selected)
              }}
              className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.isDefault ? ' (Default)' : ''}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="icon" onClick={handleCreate} aria-label="New scenario">
              <Plus className="h-4 w-4" />
            </Button>
            <Button
              variant={confirmDelete ? 'destructive' : 'ghost'}
              size="icon"
              onClick={handleDelete}
              disabled={activeScenario.isDefault}
              aria-label={confirmDelete ? 'Confirm delete scenario' : 'Delete scenario'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Opening cash */}
        <div className="space-y-1.5">
          <label htmlFor="opening-balance" className="text-sm font-medium text-foreground">
            Opening Cash
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              &pound;
            </span>
            <input
              id="opening-balance"
              type="number"
              min={0}
              step={100}
              value={openingBalancePounds}
              onChange={(e) => setOpeningBalancePounds(e.target.value)}
              onBlur={handleOpeningBalanceBlur}
              className="w-full h-10 rounded-md border border-input bg-background pl-7 pr-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>

        {/* Revenue delay */}
        <div className="space-y-1.5">
          <label htmlFor="revenue-delay" className="text-sm font-medium text-foreground">
            Revenue Delay: <span className="text-international-orange font-semibold">{revenueDelay} weeks</span>
          </label>
          <input
            id="revenue-delay"
            type="range"
            aria-label="Revenue delay in weeks"
            min={-4}
            max={26}
            step={1}
            value={revenueDelay}
            onChange={(e) => handleRevenueDelayChange(Number(e.target.value))}
            className="w-full accent-international-orange"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-4 wks</span>
            <span>0</span>
            <span>+26 wks</span>
          </div>
        </div>

        {/* Cost delay */}
        <div className="space-y-1.5">
          <label htmlFor="cost-delay" className="text-sm font-medium text-foreground">
            Cost Delay: <span className="text-international-orange font-semibold">{costDelay} weeks</span>
          </label>
          <input
            id="cost-delay"
            type="range"
            aria-label="Cost delay in weeks"
            min={-4}
            max={26}
            step={1}
            value={costDelay}
            onChange={(e) => handleCostDelayChange(Number(e.target.value))}
            className="w-full accent-international-orange"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-4 wks</span>
            <span>0</span>
            <span>+26 wks</span>
          </div>
        </div>

        {/* Revenue growth */}
        <div className="space-y-1.5">
          <label htmlFor="revenue-growth" className="text-sm font-medium text-foreground">
            Revenue Growth: <span className="text-international-orange font-semibold">{revenueGrowth}%</span>
          </label>
          <input
            id="revenue-growth"
            type="range"
            aria-label="Revenue growth percentage"
            min={-50}
            max={200}
            step={5}
            value={revenueGrowth}
            onChange={(e) => handleRevenueGrowthChange(Number(e.target.value))}
            className="w-full accent-international-orange"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>-50%</span>
            <span>0%</span>
            <span>+200%</span>
          </div>
        </div>

        {/* Extreme scenario warning */}
        {(revenueGrowth > 100 || revenueGrowth < -30
          || revenueDelay > 12 || costDelay > 12) && (
          <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 px-3 py-2 rounded-md">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Extreme scenario — projections may be unrealistic
          </div>
        )}

        {/* Save button */}
        {(() => {
          // INTENT: Compare against persisted scenario from scenarios array, NOT activeScenario.
          // activeScenario is updated live via propagateChanges for chart preview, so comparing
          // against it would always yield false (values match immediately after slider change).
          const persisted = scenarios.find(s => s.id === activeScenario.id)
          const isDirty = persisted ? (
            revenueDelay !== persisted.revenueDelayWeeks
            || costDelay !== persisted.costDelayWeeks
            || revenueGrowth !== persisted.revenueGrowthPct
            || Math.round(parseFloat(openingBalancePounds || '0') * 100) !== persisted.openingBalance
          ) : false
          return (
            <>
              <Button onClick={handleSave} disabled={isSaving} className="w-full">
                <Save className="h-4 w-4" />
                {isSaving ? 'Saving...' : isDirty ? 'Save Changes' : 'Save Scenario'}
              </Button>
              {isDirty && (
                <p className="text-xs text-warning text-center">You have unsaved changes</p>
              )}
            </>
          )
        })()}
      </CardContent>
    </Card>
  )
}
