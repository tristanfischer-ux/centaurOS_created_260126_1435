/**
 * @file budgets-view.tsx — Client component for budget vs actual tracking
 *
 * @description Shows budget allocations with actual spend from Money Map,
 * variance indicators, and budget creation/edit dialogs.
 */

'use client'

import { useState, useTransition } from 'react'
import { PiggyBank, Plus, TrendingDown, TrendingUp, Minus, Trash2, Pencil } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { formatCurrency } from '@/types/payments'
import {
  createBudget,
  updateBudget,
  deactivateBudget,
  type Budget,
  type BudgetVsActual,
  type BudgetCategory,
  type BudgetPeriod,
} from '@/actions/finance-budgets'

const CATEGORIES: Array<{ value: BudgetCategory; label: string }> = [
  { value: 'personnel', label: 'Personnel' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'materials', label: 'Materials' },
  { value: 'production', label: 'Production' },
  { value: 'other', label: 'Other' },
]

const PERIODS: Array<{ value: BudgetPeriod; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
]

interface BudgetsViewProps {
  initialData: BudgetVsActual[]
}

export function BudgetsView({ initialData }: BudgetsViewProps) {
  const [data, setData] = useState(initialData)
  const [showCreate, setShowCreate] = useState(false)
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [category, setCategory] = useState<BudgetCategory>('operations')
  const [period, setPeriod] = useState<BudgetPeriod>('monthly')
  const [amount, setAmount] = useState('')
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0])

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<BudgetCategory>('operations')
  const [editPeriod, setEditPeriod] = useState<BudgetPeriod>('monthly')
  const [editAmount, setEditAmount] = useState('')

  const handleCreate = () => {
    const amountPence = Math.round(parseFloat(amount) * 100)
    if (!name || isNaN(amountPence) || amountPence <= 0) {
      setError('Please fill in all required fields with valid values')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await createBudget({
        name,
        category,
        period,
        amount: amountPence,
        startDate,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setName('')
      setAmount('')
      setShowCreate(false)

      if (result.data) {
        setData(prev => [...prev, { budget: result.data!, actual: 0, recurringActual: 0, expenseActual: 0, variance: amountPence, variancePct: 100 }])
        toast.success('Budget created')
      }
    })
  }

  const handleOpenEdit = (budget: Budget) => {
    setEditingBudget(budget)
    setEditName(budget.name)
    setEditCategory(budget.category)
    setEditPeriod(budget.period)
    setEditAmount(String(budget.amount / 100))
    setEditError(null)
  }

  const handleEdit = () => {
    const amountPence = Math.round(parseFloat(editAmount) * 100)
    if (!editName || isNaN(amountPence) || amountPence <= 0) {
      setEditError('Please fill in all required fields with valid values')
      return
    }
    if (!editingBudget) return

    setEditError(null)
    startTransition(async () => {
      const result = await updateBudget({
        budgetId: editingBudget.id,
        name: editName,
        category: editCategory,
        period: editPeriod,
        amount: amountPence,
      })

      if (result.error) {
        setEditError(result.error)
        return
      }

      if (result.data) {
        const updated = result.data
        setData(prev => prev.map(item => {
          if (item.budget.id !== updated.id) return item
          const monthlyBudget = normaliseToMonthly(updated.amount, updated.period)
          const newVariance = monthlyBudget - item.actual
          const newVariancePct = monthlyBudget > 0 ? Math.round((newVariance / monthlyBudget) * 100) : 0
          return { ...item, budget: updated, variance: newVariance, variancePct: newVariancePct }
        }))
        toast.success('Budget saved')
      }

      setEditingBudget(null)
    })
  }

  const handleDeactivate = (budgetId: string) => {
    startTransition(async () => {
      const result = await deactivateBudget(budgetId)
      if (!result.error) {
        setData(prev => prev.filter(d => d.budget.id !== budgetId))
        toast.success('Budget removed')
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <PiggyBank className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Budgets</h1>
            <p className="text-sm text-muted-foreground">Track budget allocations vs actual spend</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-international-orange hover:bg-international-orange/90">
          <Plus className="h-4 w-4 mr-2" />
          New Budget
        </Button>
      </div>

      {/* Budget Cards */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <PiggyBank className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No budgets yet</p>
            <p className="text-xs text-muted-foreground mt-1">Create your first budget to start tracking spend against targets</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((item) => (
            <BudgetCard
              key={item.budget.id}
              item={item}
              onEdit={handleOpenEdit}
              onDeactivate={handleDeactivate}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Variance Summary Table */}
      {data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Variance Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 overflow-x-auto">
              {/* Header row */}
              <div className="grid grid-cols-6 min-w-[600px] text-xs font-medium text-muted-foreground pb-2 border-b border-border">
                <span>Category</span>
                <span className="text-right">Budget</span>
                <span className="text-right">Recurring</span>
                <span className="text-right">Expenses</span>
                <span className="text-right">Variance</span>
                <span className="text-right">%</span>
              </div>
              {data.map((item) => {
                const monthlyBudget = normaliseToMonthly(item.budget.amount, item.budget.period)
                return (
                  <div key={item.budget.id} className="grid grid-cols-6 min-w-[600px] text-sm py-2 border-b border-border last:border-0">
                    <span className="text-foreground font-medium">{item.budget.name}</span>
                    <span className="text-right text-muted-foreground">{formatCurrency(monthlyBudget, item.budget.currency)}</span>
                    <span className="text-right text-muted-foreground">{formatCurrency(item.recurringActual, item.budget.currency)}</span>
                    <span className="text-right text-muted-foreground">{formatCurrency(item.expenseActual, item.budget.currency)}</span>
                    <span className={`text-right font-medium ${item.variance >= 0 ? 'text-status-success' : 'text-destructive'}`}>
                      {formatCurrency(Math.abs(item.variance), item.budget.currency)}
                      {item.variance < 0 ? ' over' : ' under'}
                    </span>
                    <span className={`text-right ${item.variance >= 0 ? 'text-status-success' : 'text-destructive'}`}>
                      {item.variancePct >= 0 ? '+' : ''}{item.variancePct}%
                    </span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Budget Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="budget-name">Name</Label>
              <Input
                id="budget-name"
                placeholder="e.g. Q1 Marketing Budget"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as BudgetCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={period} onValueChange={(v) => setPeriod(v as BudgetPeriod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget-amount">Amount ({'\u00A3'})</Label>
                <Input
                  id="budget-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="budget-start">Start Date</Label>
                <Input
                  id="budget-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={isPending}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              {isPending ? 'Creating...' : 'Create Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Budget Dialog */}
      <Dialog open={editingBudget !== null} onOpenChange={(open) => { if (!open) setEditingBudget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Budget</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-budget-name">Name</Label>
              <Input
                id="edit-budget-name"
                placeholder="e.g. Q1 Marketing Budget"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={editCategory} onValueChange={(v) => setEditCategory(v as BudgetCategory)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Period</Label>
                <Select value={editPeriod} onValueChange={(v) => setEditPeriod(v as BudgetPeriod)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-budget-amount">Amount ({'\u00A3'})</Label>
              <Input
                id="edit-budget-amount"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
              />
            </div>
            {editError && <p className="text-sm text-destructive">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBudget(null)}>Cancel</Button>
            <Button
              onClick={handleEdit}
              disabled={isPending}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              {isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================
// Budget Card
// ============================================================

function BudgetCard({ item, onEdit, onDeactivate, isPending }: {
  item: BudgetVsActual
  onEdit: (b: Budget) => void
  onDeactivate: (id: string) => void
  isPending: boolean
}) {
  const { budget, actual, variance, variancePct } = item
  const monthlyBudget = normaliseToMonthly(budget.amount, budget.period)
  const usagePct = monthlyBudget > 0 ? Math.min(Math.round((actual / monthlyBudget) * 100), 100) : 0

  const isOverBudget = variance < 0
  const isNearBudget = !isOverBudget && variancePct <= 20

  return (
    <Card className="relative group">
      <CardContent className="pt-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{budget.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{budget.category} &middot; {budget.period}</p>
          </div>
          <Badge variant={isOverBudget ? 'destructive' : isNearBudget ? 'warning' : 'success'}>
            {isOverBudget ? 'Over Budget' : isNearBudget ? 'Near Limit' : 'On Track'}
          </Badge>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Spent: {formatCurrency(actual, budget.currency)}</span>
            <span>Budget: {formatCurrency(monthlyBudget, budget.currency)}</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                isOverBudget ? 'bg-destructive' : isNearBudget ? 'bg-warning' : 'bg-status-success'
              }`}
              style={{ width: `${Math.min(usagePct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground mt-1">
            <span>{usagePct}% used</span>
            {item.expenseActual > 0 && (
              <span className="text-xs">
                {formatCurrency(item.recurringActual, budget.currency)} recurring · {formatCurrency(item.expenseActual, budget.currency)} expenses
              </span>
            )}
          </div>
        </div>

        {/* Variance */}
        <div className="flex items-center gap-2 text-sm">
          {isOverBudget ? (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ) : variance === 0 ? (
            <Minus className="h-4 w-4 text-muted-foreground" />
          ) : (
            <TrendingUp className="h-4 w-4 text-status-success" />
          )}
          <span className={isOverBudget ? 'text-destructive' : 'text-status-success'}>
            {formatCurrency(Math.abs(variance), budget.currency)} {isOverBudget ? 'over' : 'under'} budget
          </span>
          <span className="text-muted-foreground">({variancePct >= 0 ? '+' : ''}{variancePct}%)</span>
        </div>

        {/* Edit */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-8 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={() => onEdit(budget)}
          disabled={isPending}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>

        {/* Deactivate */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-2 right-2 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          onClick={() => onDeactivate(budget.id)}
          disabled={isPending}
        >
          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </CardContent>
    </Card>
  )
}

// ============================================================
// Helpers
// ============================================================

function normaliseToMonthly(amount: number, period: string): number {
  switch (period) {
    case 'annual': return Math.round(amount / 12)
    case 'quarterly': return Math.round(amount / 3)
    default: return amount
  }
}
