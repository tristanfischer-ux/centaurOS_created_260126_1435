/**
 * @file expenses-view.tsx — Client component for expense tracking
 *
 * @description Shows expense list with filters, category breakdown,
 * and quick expense entry dialog.
 */

'use client'

import { useState, useTransition, useMemo } from 'react'
import { Receipt, Plus, Trash2, Check, X } from 'lucide-react'
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
import { formatCurrency } from '@/types/payments'
import {
  createExpense,
  updateExpenseStatus,
  deleteExpense,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
} from '@/actions/finance-expenses'

const CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'personnel', label: 'Personnel' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'operations', label: 'Operations' },
  { value: 'materials', label: 'Materials' },
  { value: 'production', label: 'Production' },
  { value: 'travel', label: 'Travel' },
  { value: 'office', label: 'Office' },
  { value: 'other', label: 'Other' },
]

const STATUS_VARIANTS: Record<ExpenseStatus, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  paid: 'secondary',
}

interface ExpensesViewProps {
  initialData: Expense[]
}

export function ExpensesView({ initialData }: ExpensesViewProps) {
  const [data, setData] = useState(initialData)
  const [showCreate, setShowCreate] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<ExpenseStatus | 'all'>('all')
  const [filterCategory, setFilterCategory] = useState<ExpenseCategory | 'all'>('all')

  // Create form state
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('operations')
  const [vendor, setVendor] = useState('')
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().split('T')[0])

  const filtered = useMemo(() => {
    return data.filter(e => {
      if (filterStatus !== 'all' && e.status !== filterStatus) return false
      if (filterCategory !== 'all' && e.category !== filterCategory) return false
      return true
    })
  }, [data, filterStatus, filterCategory])

  const totalAmount = filtered.reduce((sum, e) => sum + e.amount, 0)

  const handleCreate = () => {
    const amountPence = Math.round(parseFloat(amount) * 100)
    if (!description.trim() || isNaN(amountPence) || amountPence <= 0) {
      setError('Please fill in all required fields')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await createExpense({
        amount: amountPence,
        category,
        description: description.trim(),
        vendor: vendor.trim() || undefined,
        expenseDate,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setDescription('')
      setAmount('')
      setVendor('')
      setShowCreate(false)

      if (result.data) {
        setData(prev => [result.data!, ...prev])
      }
    })
  }

  const handleStatusUpdate = (expenseId: string, status: ExpenseStatus) => {
    startTransition(async () => {
      const result = await updateExpenseStatus(expenseId, status)
      if (!result.error) {
        setData(prev => prev.map(e => e.id === expenseId ? { ...e, status } : e))
      }
    })
  }

  const handleDelete = (expenseId: string) => {
    startTransition(async () => {
      const result = await deleteExpense(expenseId)
      if (!result.error) {
        setData(prev => prev.filter(e => e.id !== expenseId))
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <Receipt className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Expenses</h1>
            <p className="text-sm text-muted-foreground">Track and manage business expenses</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-international-orange hover:bg-international-orange/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Expense
        </Button>
      </div>

      {/* Filters & Summary */}
      <div className="flex items-end gap-4">
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Status</label>
          <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as ExpenseStatus | 'all')}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">Category</label>
          <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as ExpenseCategory | 'all')}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">{filtered.length} expenses</p>
          <p className="text-lg font-semibold text-foreground">{formatCurrency(totalAmount)}</p>
        </div>
      </div>

      {/* Expenses List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Receipt className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No expenses found</p>
            <p className="text-xs text-muted-foreground mt-1">Add an expense to start tracking your spending</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">All Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="grid grid-cols-7 text-xs font-medium text-muted-foreground pb-2 border-b border-border">
                <span className="col-span-2">Description</span>
                <span>Category</span>
                <span>Vendor</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Status</span>
                <span className="text-right">Actions</span>
              </div>
              {filtered.map((expense) => (
                <div key={expense.id} className="grid grid-cols-7 items-center text-sm py-2 border-b border-border last:border-0 group">
                  <div className="col-span-2">
                    <p className="text-foreground font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(expense.expenseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <span className="text-muted-foreground capitalize">{expense.category}</span>
                  <span className="text-muted-foreground">{expense.vendor ?? '-'}</span>
                  <span className="text-right font-medium text-foreground">{formatCurrency(expense.amount, expense.currency)}</span>
                  <span className="text-right">
                    <Badge variant={STATUS_VARIANTS[expense.status]}>{expense.status}</Badge>
                  </span>
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {expense.status === 'pending' && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusUpdate(expense.id, 'approved')}
                          disabled={isPending}
                        >
                          <Check className="h-3.5 w-3.5 text-status-success" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleStatusUpdate(expense.id, 'rejected')}
                          disabled={isPending}
                        >
                          <X className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(expense.id)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Expense Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Expense</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="expense-description">Description</Label>
              <Input
                id="expense-description"
                placeholder="e.g. Office supplies from Staples"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense-amount">Amount ({'\u00A3'})</Label>
                <Input
                  id="expense-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="expense-vendor">Vendor (optional)</Label>
                <Input
                  id="expense-vendor"
                  placeholder="e.g. Staples"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expense-date">Date</Label>
                <Input
                  id="expense-date"
                  type="date"
                  value={expenseDate}
                  onChange={(e) => setExpenseDate(e.target.value)}
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
              {isPending ? 'Adding...' : 'Add Expense'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
