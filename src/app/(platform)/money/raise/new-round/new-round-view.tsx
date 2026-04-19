'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createRound } from '@/actions/money-raise'
import { toast } from 'sonner'

const STAGE_OPTIONS = [
  { v: 'pre_seed', label: 'Pre-seed' },
  { v: 'seed', label: 'Seed' },
  { v: 'series_a', label: 'Series A' },
  { v: 'series_b', label: 'Series B' },
  { v: 'bridge', label: 'Bridge' },
] as const

const INSTRUMENT_OPTIONS = [
  { v: 'safe_post', label: 'SAFE — post-money' },
  { v: 'safe_pre', label: 'SAFE — pre-money' },
  { v: 'priced', label: 'Priced equity' },
  { v: 'convertible', label: 'Convertible note' },
  { v: 'asa', label: 'ASA (UK)' },
] as const

export function NewRoundView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [stage, setStage] = useState<string>('pre_seed')
  const [target, setTarget] = useState('')
  const [closeDate, setCloseDate] = useState(
    new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )
  const [instrument, setInstrument] = useState<string>('safe_post')
  const [cap, setCap] = useState('')
  const [discount, setDiscount] = useState('')

  const onSubmit = () => {
    if (!name.trim()) {
      toast.error('Round name is required')
      return
    }
    const targetCents = Math.round(Number(target) * 100)
    if (!Number.isFinite(targetCents) || targetCents <= 0) {
      toast.error('Target must be a positive number')
      return
    }
    const capCents = cap ? Math.round(Number(cap) * 100) : undefined
    const discountPct = discount ? Number(discount) : undefined
    startTransition(async () => {
      const result = await createRound({
        name: name.trim(),
        stage,
        target_cents: targetCents,
        close_date: closeDate,
        instrument,
        cap_cents: capCents,
        discount_pct: discountPct,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Round created')
      router.push('/money/raise')
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Create round</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Define your fundraise round. You can add investors to the pipeline once it exists.
          </p>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Round details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Round name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              placeholder="e.g. Pre-seed · Summer 2026"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <Select value={stage} onValueChange={setStage} disabled={pending}>
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="instrument">Instrument</Label>
              <Select value={instrument} onValueChange={setInstrument} disabled={pending}>
                <SelectTrigger id="instrument">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_OPTIONS.map((i) => (
                    <SelectItem key={i.v} value={i.v}>{i.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="target">Target (£)</Label>
              <Input
                id="target"
                type="number"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                disabled={pending}
                placeholder="500000"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="close">Target close date</Label>
              <Input
                id="close"
                type="date"
                value={closeDate}
                onChange={(e) => setCloseDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          {(instrument === 'safe_post' || instrument === 'safe_pre' || instrument === 'convertible') && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cap">Valuation cap (£) — optional</Label>
                <Input
                  id="cap"
                  type="number"
                  inputMode="decimal"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. 5000000"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount">Discount (%) — optional</Label>
                <Input
                  id="discount"
                  type="number"
                  inputMode="numeric"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. 20"
                />
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Creating...' : 'Create round'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
