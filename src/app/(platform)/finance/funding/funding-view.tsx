/**
 * @file funding-view.tsx — Client component for funding pipeline
 *
 * @description Kanban-style board showing funding opportunities
 * across pipeline stages with drag-to-move and create dialog.
 */

'use client'

import { useState, useTransition, useMemo } from 'react'
import { Landmark, Plus, ExternalLink, Trash2, ChevronRight, ChevronLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency } from '@/types/payments'
import {
  createFundingOpportunity,
  moveFundingStage,
  deleteFundingOpportunity,
  type FundingOpportunity,
  type FundingType,
  type FundingStage,
} from '@/actions/finance-funding'

const STAGES: Array<{ value: FundingStage; label: string; color: string }> = [
  { value: 'researching', label: 'Researching', color: 'bg-muted' },
  { value: 'applying', label: 'Applying', color: 'bg-info/10' },
  { value: 'submitted', label: 'Submitted', color: 'bg-warning/10' },
  { value: 'interview', label: 'Interview', color: 'bg-international-orange/10' },
  { value: 'offered', label: 'Offered', color: 'bg-status-success/10' },
  { value: 'won', label: 'Won', color: 'bg-status-success/20' },
  { value: 'lost', label: 'Lost', color: 'bg-destructive/10' },
]

const TYPES: Array<{ value: FundingType; label: string }> = [
  { value: 'grant', label: 'Grant' },
  { value: 'investment', label: 'Investment' },
  { value: 'r_and_d_tax_credit', label: 'R&D Tax Credit' },
  { value: 'loan', label: 'Loan' },
  { value: 'other', label: 'Other' },
]

const TYPE_LABELS: Record<FundingType, string> = {
  grant: 'Grant',
  investment: 'Investment',
  r_and_d_tax_credit: 'R&D Tax Credit',
  loan: 'Loan',
  other: 'Other',
}

interface FundingViewProps {
  initialData: FundingOpportunity[]
}

export function FundingView({ initialData }: FundingViewProps) {
  const [data, setData] = useState(initialData)
  const [showCreate, setShowCreate] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Create form state
  const [name, setName] = useState('')
  const [type, setType] = useState<FundingType>('grant')
  const [amount, setAmount] = useState('')
  const [funderName, setFunderName] = useState('')
  const [deadline, setDeadline] = useState('')
  const [notes, setNotes] = useState('')
  const [url, setUrl] = useState('')

  const byStage = useMemo(() => {
    const grouped: Record<FundingStage, FundingOpportunity[]> = {
      researching: [], applying: [], submitted: [], interview: [], offered: [], won: [], lost: [],
    }
    for (const opp of data) {
      grouped[opp.stage].push(opp)
    }
    return grouped
  }, [data])

  const totalPipeline = data
    .filter(d => !['won', 'lost'].includes(d.stage))
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)

  const totalWon = data
    .filter(d => d.stage === 'won')
    .reduce((sum, d) => sum + (d.amount ?? 0), 0)

  const handleCreate = () => {
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    const amountPence = amount ? Math.round(parseFloat(amount) * 100) : undefined
    setError(null)

    startTransition(async () => {
      const result = await createFundingOpportunity({
        name: name.trim(),
        type,
        amount: amountPence,
        funderName: funderName.trim() || undefined,
        deadline: deadline || undefined,
        notes: notes.trim() || undefined,
        url: url.trim() || undefined,
      })

      if (result.error) {
        setError(result.error)
        return
      }

      setName('')
      setAmount('')
      setFunderName('')
      setDeadline('')
      setNotes('')
      setUrl('')
      setShowCreate(false)

      if (result.data) {
        setData(prev => [result.data!, ...prev])
      }
    })
  }

  const handleMoveStage = (oppId: string, newStage: FundingStage) => {
    // Optimistic update
    setData(prev => prev.map(d => d.id === oppId ? { ...d, stage: newStage } : d))

    startTransition(async () => {
      const result = await moveFundingStage(oppId, newStage)
      if (result.error) {
        // Revert on error
        setData(prev => prev.map(d => d.id === oppId ? { ...d, stage: data.find(x => x.id === oppId)?.stage ?? d.stage } : d))
      }
    })
  }

  const handleDelete = (oppId: string) => {
    startTransition(async () => {
      const result = await deleteFundingOpportunity(oppId)
      if (!result.error) {
        setData(prev => prev.filter(d => d.id !== oppId))
      }
    })
  }

  const getAdjacentStages = (current: FundingStage): { prev?: FundingStage; next?: FundingStage } => {
    const idx = STAGES.findIndex(s => s.value === current)
    return {
      prev: idx > 0 ? STAGES[idx - 1].value : undefined,
      next: idx < STAGES.length - 1 ? STAGES[idx + 1].value : undefined,
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-international-orange/10 flex items-center justify-center">
            <Landmark className="h-5 w-5 text-international-orange" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground tracking-tight">Funding</h1>
            <p className="text-sm text-muted-foreground">Track funding opportunities and grant applications</p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} className="bg-international-orange hover:bg-international-orange/90">
          <Plus className="h-4 w-4 mr-2" />
          New Opportunity
        </Button>
      </div>

      {/* Summary */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Pipeline Value</p>
              <p className="text-lg font-semibold text-foreground">{formatCurrency(totalPipeline)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Won</p>
              <p className="text-lg font-semibold text-status-success">{formatCurrency(totalWon)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Active Opportunities</p>
              <p className="text-lg font-semibold text-foreground">{data.filter(d => !['won', 'lost'].includes(d.stage)).length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Pipeline Board */}
      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Landmark className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No funding opportunities yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add your first grant, investment, or funding lead</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {STAGES.map((stage) => {
            const items = byStage[stage.value]
            return (
              <div key={stage.value} className="space-y-2">
                <div className={`rounded-lg px-3 py-2 ${stage.color}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{stage.label}</span>
                    <Badge variant="secondary" className="text-[10px] h-5">{items.length}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  {items.map((opp) => {
                    const { prev, next } = getAdjacentStages(opp.stage)
                    return (
                      <Card key={opp.id} className="group">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start justify-between">
                            <p className="text-sm font-medium text-foreground leading-tight">{opp.name}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleDelete(opp.id)}
                              disabled={isPending}
                            >
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="secondary" className="text-[10px]">{TYPE_LABELS[opp.type]}</Badge>
                            {opp.amount && (
                              <span className="text-xs font-medium text-foreground">{formatCurrency(opp.amount)}</span>
                            )}
                          </div>
                          {opp.funderName && (
                            <p className="text-xs text-muted-foreground">{opp.funderName}</p>
                          )}
                          {opp.deadline && (
                            <p className="text-xs text-muted-foreground">
                              Due: {new Date(opp.deadline).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </p>
                          )}
                          {opp.url && (
                            <a href={opp.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-international-orange hover:underline">
                              Link <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {/* Stage navigation */}
                          <div className="flex items-center justify-between pt-1">
                            {prev ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => handleMoveStage(opp.id, prev)}
                                disabled={isPending}
                              >
                                <ChevronLeft className="h-3.5 w-3.5" />
                              </Button>
                            ) : <span />}
                            {next ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-1"
                                onClick={() => handleMoveStage(opp.id, next)}
                                disabled={isPending}
                              >
                                <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            ) : <span />}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Funding Opportunity</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="funding-name">Name</Label>
              <Input
                id="funding-name"
                placeholder="e.g. Innovate UK Smart Grant"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={(v) => setType(v as FundingType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-amount">Amount ({'\u00A3'}, optional)</Label>
                <Input
                  id="funding-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="funding-funder">Funder (optional)</Label>
                <Input
                  id="funding-funder"
                  placeholder="e.g. Innovate UK"
                  value={funderName}
                  onChange={(e) => setFunderName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="funding-deadline">Deadline (optional)</Label>
                <Input
                  id="funding-deadline"
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding-url">URL (optional)</Label>
              <Input
                id="funding-url"
                type="url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="funding-notes">Notes (optional)</Label>
              <Textarea
                id="funding-notes"
                placeholder="Key requirements, eligibility notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
              />
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
              {isPending ? 'Creating...' : 'Create Opportunity'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
