'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { archivePlanLine, updatePlanLine, type PlanLineDetail } from '@/actions/money-plan'
import { toast } from 'sonner'

const FREQUENCY_OPTIONS: Array<PlanLineDetail['frequency']> = [
  'one_off',
  'weekly',
  'monthly',
  'quarterly',
  'annual',
  'variable',
]

const COST_CATEGORIES = ['people', 'premises', 'tools', 'materials', 'growth', 'other']
const INCOME_CATEGORIES = ['revenue', 'grants', 'equity', 'loans']

export function PlanLineView({ line }: { line: PlanLineDetail }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState(line.name)
  const [amount, setAmount] = useState((line.amount_cents / 100).toString())
  const [frequency, setFrequency] = useState<PlanLineDetail['frequency']>(line.frequency)
  const [probability, setProbability] = useState(String(line.probability_pct))
  const [effectiveFrom, setEffectiveFrom] = useState(line.effective_from)
  const [effectiveTo, setEffectiveTo] = useState(line.effective_to ?? '')
  const [notes, setNotes] = useState(line.notes ?? '')
  const [category, setCategory] = useState(line.category)

  const onSave = () => {
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents)) {
      toast.error('Amount must be a number')
      return
    }
    startTransition(async () => {
      const result = await updatePlanLine(line.id, {
        name: name.trim(),
        amount_cents: amountCents,
        frequency,
        probability_pct: Number(probability),
        effective_from: effectiveFrom,
        effective_to: effectiveTo || null,
        notes: notes.trim() || null,
        category,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Line updated')
      router.refresh()
    })
  }

  const onArchive = () => {
    if (!confirm('Archive this line? It will stop affecting forecasts.')) return
    startTransition(async () => {
      const result = await archivePlanLine(line.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Line archived')
      router.push('/money/plan')
    })
  }

  const categoryOptions = line.direction === 'out' ? COST_CATEGORIES : INCOME_CATEGORIES

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{line.name}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={line.direction === 'out' ? 'destructive' : 'success'}>
              {line.direction === 'out' ? 'Cost' : 'Income'}
            </Badge>
            <Badge variant="secondary">{line.source}</Badge>
          </div>
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Back to plan</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Edit line</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (£)</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as PlanLineDetail['frequency'])}
                disabled={pending}
              >
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f.replace('_', ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select value={category} onValueChange={setCategory} disabled={pending}>
                <SelectTrigger id="category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {line.direction === 'in' && (
              <div className="space-y-2">
                <Label htmlFor="probability">Probability (%)</Label>
                <Input
                  id="probability"
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(e) => setProbability(e.target.value)}
                  disabled={pending}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="from">Effective from</Label>
              <Input
                id="from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="to">Effective to (optional)</Label>
              <Input
                id="to"
                type="date"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button variant="ghost" onClick={onArchive} disabled={pending}>
              Archive line
            </Button>
            <Button onClick={onSave} disabled={pending}>
              {pending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
