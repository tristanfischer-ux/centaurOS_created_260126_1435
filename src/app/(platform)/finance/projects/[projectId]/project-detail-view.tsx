/**
 * @file project-detail-view.tsx — Client component for project P&L detail
 *
 * @description Shows project summary, transaction list, and allows
 * adding/deleting transactions and editing the project header.
 */

'use client'

import { useState, useTransition, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Pencil, Trash2 } from 'lucide-react'
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
import { addProjectTransaction, updateProject, deleteProjectTransaction } from '@/actions/finance-projects'
import type { FinanceProject, ProjectTransaction, ProjectTransactionType, ProjectStatus } from '@/types/finance'

const TX_TYPES: Array<{ value: ProjectTransactionType; label: string }> = [
  { value: 'order', label: 'Order' },
  { value: 'retainer_entry', label: 'Retainer Entry' },
  { value: 'expense', label: 'Expense' },
  { value: 'cost_item', label: 'Cost Item' },
]

const PROJECT_STATUSES: Array<{ value: ProjectStatus; label: string }> = [
  { value: 'active', label: 'Active' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE: Record<ProjectStatus, 'default' | 'secondary' | 'success' | 'destructive' | 'warning'> = {
  active: 'success',
  completed: 'secondary',
  on_hold: 'warning',
  cancelled: 'destructive',
}

interface ProjectDetailViewProps {
  project: FinanceProject
  initialTransactions: ProjectTransaction[]
}

export function ProjectDetailView({ project, initialTransactions }: ProjectDetailViewProps) {
  const [projectState, setProjectState] = useState(project)
  const [transactions, setTransactions] = useState(initialTransactions)
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editProjectError, setEditProjectError] = useState<string | null>(null)
  const [confirmDeleteTxId, setConfirmDeleteTxId] = useState<string | null>(null)

  // Add transaction form state
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [isRevenue, setIsRevenue] = useState(true)
  const [txType, setTxType] = useState<ProjectTransactionType>('order')

  // Edit project form state
  const [editProjectName, setEditProjectName] = useState(project.name)
  const [editProjectClient, setEditProjectClient] = useState(project.clientName ?? '')
  const [editProjectStatus, setEditProjectStatus] = useState<ProjectStatus>(project.status)

  const summary = useMemo(() => {
    const totalRevenue = transactions.filter(t => t.isRevenue).reduce((sum, t) => sum + t.amount, 0)
    const totalExpenses = transactions.filter(t => !t.isRevenue).reduce((sum, t) => sum + t.amount, 0)
    const netProfit = totalRevenue - totalExpenses
    const marginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 100) : 0
    return { totalRevenue, totalExpenses, netProfit, marginPct }
  }, [transactions])

  const handleAdd = () => {
    const amountPence = Math.round(parseFloat(amount) * 100)
    if (!description.trim() || isNaN(amountPence) || amountPence <= 0) {
      setError('Please fill in all fields with valid values')
      return
    }

    setError(null)
    startTransition(async () => {
      const result = await addProjectTransaction({
        projectId: projectState.id,
        transactionType: txType,
        description: description.trim(),
        amount: amountPence,
        isRevenue,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setDescription('')
      setAmount('')
      setShowAdd(false)

      if (result.data) {
        setTransactions(prev => [result.data!, ...prev])
      }
    })
  }

  const handleOpenEdit = () => {
    setEditProjectName(projectState.name)
    setEditProjectClient(projectState.clientName ?? '')
    setEditProjectStatus(projectState.status)
    setEditProjectError(null)
    setShowEdit(true)
  }

  const handleUpdateProject = () => {
    if (!editProjectName.trim()) {
      setEditProjectError('Name is required')
      return
    }

    setEditProjectError(null)
    startTransition(async () => {
      const result = await updateProject(projectState.id, {
        name: editProjectName.trim(),
        clientName: editProjectClient.trim() || undefined,
        status: editProjectStatus,
      })

      if (result.error) {
        setEditProjectError(result.error)
        return
      }

      if (result.data) {
        setProjectState(result.data)
      }

      setShowEdit(false)
    })
  }

  const handleDeleteTransaction = (tx: ProjectTransaction) => {
    if (confirmDeleteTxId !== tx.id) {
      setConfirmDeleteTxId(tx.id)
      return
    }
    setConfirmDeleteTxId(null)
    startTransition(async () => {
      const result = await deleteProjectTransaction(tx.id, projectState.id)
      if (!result.error) {
        setTransactions(prev => prev.filter(t => t.id !== tx.id))
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/finance/projects">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Projects
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">{projectState.name}</h1>
            <Badge variant={STATUS_BADGE[projectState.status]}>
              {projectState.status.replace('_', ' ')}
            </Badge>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleOpenEdit}>
              <Pencil className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
          {projectState.clientName && (
            <p className="text-sm text-muted-foreground">{projectState.clientName}</p>
          )}
        </div>
        <Button onClick={() => setShowAdd(true)} className="bg-international-orange hover:bg-international-orange/90">
          <Plus className="h-4 w-4 mr-2" />
          Add Transaction
        </Button>
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Revenue</p>
            <p className="text-lg font-semibold text-status-success">{formatCurrency(summary.totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Expenses</p>
            <p className="text-lg font-semibold text-foreground">{formatCurrency(summary.totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Net Profit</p>
            <p className={`text-lg font-semibold ${summary.netProfit >= 0 ? 'text-status-success' : 'text-destructive'}`}>
              {formatCurrency(summary.netProfit)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-muted-foreground">Margin</p>
            <div className="flex items-center gap-1">
              {summary.marginPct > 0 ? (
                <TrendingUp className="h-4 w-4 text-status-success" />
              ) : summary.marginPct < 0 ? (
                <TrendingDown className="h-4 w-4 text-destructive" />
              ) : null}
              <p className={`text-lg font-semibold ${summary.marginPct >= 0 ? 'text-status-success' : 'text-destructive'}`}>
                {summary.marginPct}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No transactions yet. Add revenue or expenses to track this project&apos;s P&L.</p>
          ) : (
            <div className="space-y-1">
              <div className="grid grid-cols-6 text-xs font-medium text-muted-foreground pb-2 border-b border-border">
                <span className="col-span-2">Description</span>
                <span>Type</span>
                <span className="text-right">Amount</span>
                <span className="text-right">Date</span>
                <span />
              </div>
              {transactions.map((tx) => (
                <div key={tx.id} data-testid="tx-row" className="relative group grid grid-cols-6 items-center text-sm py-2 border-b border-border last:border-0">
                  <div className="col-span-2 flex items-center gap-2">
                    {tx.isRevenue ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-status-success flex-shrink-0" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                    )}
                    <span className="text-foreground">{tx.description}</span>
                  </div>
                  <span>
                    <Badge variant="secondary" className="text-xs">
                      {tx.transactionType.replace('_', ' ')}
                    </Badge>
                  </span>
                  <span className={`text-right font-medium ${tx.isRevenue ? 'text-status-success' : 'text-destructive'}`}>
                    {tx.isRevenue ? '+' : '-'}{formatCurrency(tx.amount)}
                  </span>
                  <span className="text-right text-muted-foreground text-xs">
                    {new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <div className="flex justify-end">
                    {tx.source !== 'linked_expense' && (
                      <Button
                        data-testid="tx-delete-btn"
                        variant="ghost"
                        size="sm"
                        className={`h-auto p-1 opacity-0 group-hover:opacity-100 transition-opacity ${confirmDeleteTxId === tx.id ? 'opacity-100 text-destructive' : ''}`}
                        onClick={() => handleDeleteTransaction(tx)}
                        onBlur={() => setConfirmDeleteTxId(null)}
                        disabled={isPending}
                      >
                        {confirmDeleteTxId === tx.id ? (
                          <span className="text-[10px] font-medium">Delete?</span>
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Transaction Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="tx-description">Description</Label>
              <Input
                id="tx-description"
                placeholder="e.g. Client payment for milestone 1"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="tx-amount">Amount ({'\u00A3'})</Label>
                <Input
                  id="tx-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={txType} onValueChange={(v) => setTxType(v as ProjectTransactionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TX_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Direction</Label>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsRevenue(true)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm transition-all ${
                    isRevenue ? 'border-status-success bg-success/10' : 'border-border hover:border-status-success/30'
                  }`}
                >
                  Revenue (in)
                </button>
                <button
                  onClick={() => setIsRevenue(false)}
                  className={`flex-1 rounded-lg border-2 p-3 text-center text-sm transition-all ${
                    !isRevenue ? 'border-destructive bg-destructive/10' : 'border-border hover:border-destructive/30'
                  }`}
                >
                  Expense (out)
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={isPending}
              className="bg-international-orange hover:bg-international-orange/90"
            >
              {isPending ? 'Adding...' : 'Add Transaction'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Project Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-project-name">Name</Label>
              <Input
                id="edit-project-name"
                placeholder="e.g. MK1 Chassis"
                value={editProjectName}
                onChange={(e) => setEditProjectName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project-client">Client (optional)</Label>
              <Input
                id="edit-project-client"
                placeholder="e.g. Acme Corp"
                value={editProjectClient}
                onChange={(e) => setEditProjectClient(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editProjectStatus} onValueChange={(v) => setEditProjectStatus(v as ProjectStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editProjectError && <p className="text-sm text-destructive">{editProjectError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button
              onClick={handleUpdateProject}
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
