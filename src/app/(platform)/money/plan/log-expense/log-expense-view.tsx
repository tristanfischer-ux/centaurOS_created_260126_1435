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
import { createPlanLine } from '@/actions/money-plan'
import { toast } from 'sonner'

const COST_CATEGORIES = ['people', 'premises', 'tools', 'materials', 'growth', 'other']

export function LogExpenseView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [vendor, setVendor] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('other')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  const onSubmit = () => {
    if (!vendor.trim()) {
      toast.error('Vendor is required')
      return
    }
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Amount must be a positive number')
      return
    }
    startTransition(async () => {
      const result = await createPlanLine({
        name: vendor.trim(),
        direction: 'out',
        category,
        amount_cents: amountCents,
        frequency: 'one_off',
        effective_from: date,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Expense logged')
      router.push('/money/cockpit')
    })
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log expense</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Record a one-off expense. It lands in your plan as a one-off cost line.
          </p>
        </div>
        <Link href="/money/cockpit">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Expense details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="vendor">Vendor / description</Label>
            <Input
              id="vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              disabled={pending}
              placeholder="e.g. Office supplies — Staples"
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
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select value={category} onValueChange={setCategory} disabled={pending}>
              <SelectTrigger id="category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Logging...' : 'Log expense'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
