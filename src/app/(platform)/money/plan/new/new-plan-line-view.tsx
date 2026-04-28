'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { createPlanLine } from '@/actions/money-plan'
import { toast } from 'sonner'

const FREQUENCY_OPTIONS = [
  { v: 'one_off', label: 'One-off' },
  { v: 'weekly', label: 'Weekly' },
  { v: 'monthly', label: 'Monthly' },
  { v: 'quarterly', label: 'Quarterly' },
  { v: 'annual', label: 'Annual' },
  { v: 'variable', label: 'Variable' },
] as const

const COST_CATEGORIES = ['people', 'premises', 'tools', 'materials', 'growth', 'other']
const INCOME_CATEGORIES = ['revenue', 'grants', 'equity', 'loans']

type Direction = 'out' | 'in'
type Frequency = (typeof FREQUENCY_OPTIONS)[number]['v']

export function NewPlanLineView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [direction, setDirection] = useState<Direction>('out')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('people')
  const [amount, setAmount] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10))
  const [probability, setProbability] = useState('100')
  const [notes, setNotes] = useState('')

  const onDirectionChange = (v: Direction) => {
    setDirection(v)
    setCategory(v === 'out' ? 'people' : 'revenue')
  }

  const onSubmit = () => {
    if (!name.trim()) {
      toast.error('Name is required')
      return
    }
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Amount must be a positive number')
      return
    }
    startTransition(async () => {
      const result = await createPlanLine({
        name: name.trim(),
        direction,
        category,
        amount_cents: amountCents,
        frequency,
        effective_from: effectiveFrom,
        probability_pct: direction === 'in' ? Number(probability) : 100,
        notes: notes.trim() || null,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Line added')
      router.push('/money/plan')
    })
  }

  const categoryOptions = direction === 'out' ? COST_CATEGORIES : INCOME_CATEGORIES

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New plan line</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Add a single cost or income line to your plan.
          </p>
        </div>
        <Link href="/money/plan">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Line details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Direction</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={direction === 'out' ? 'default' : 'outline'}
                onClick={() => onDirectionChange('out')}
                disabled={pending}
              >
                Cost (out)
              </Button>
              <Button
                type="button"
                variant={direction === 'in' ? 'default' : 'outline'}
                onClick={() => onDirectionChange('in')}
                disabled={pending}
              >
                Income (in)
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder={direction === 'out' ? 'e.g. Senior engineer salary' : 'e.g. SaaS subscription revenue'}
            />
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
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as Frequency)}
                disabled={pending}
              >
                <SelectTrigger id="frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f.v} value={f.v}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                placeholder="0.00"
              />
            </div>
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
          </div>

          {direction === 'in' && (
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
              <p className="text-xs text-muted-foreground">
                Income lines are scaled by probability when projecting runway.
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={3}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Adding...' : 'Add line'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
