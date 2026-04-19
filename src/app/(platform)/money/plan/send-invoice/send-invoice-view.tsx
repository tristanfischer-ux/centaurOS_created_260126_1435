'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createPlanLine } from '@/actions/money-plan'
import { toast } from 'sonner'

export function SendInvoiceView() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [client, setClient] = useState('')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  )

  const onSubmit = () => {
    if (!client.trim()) {
      toast.error('Client name is required')
      return
    }
    const amountCents = Math.round(Number(amount) * 100)
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      toast.error('Amount must be a positive number')
      return
    }
    startTransition(async () => {
      const result = await createPlanLine({
        name: `Invoice — ${client.trim()}`,
        direction: 'in',
        category: 'revenue',
        amount_cents: amountCents,
        frequency: 'one_off',
        effective_from: dueDate,
        probability_pct: 90,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Invoice logged in plan')
      router.push('/money/cockpit')
    })
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Send invoice</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Records the invoice as expected income on the due date. Full Stripe invoice flow ships later.
          </p>
        </div>
        <Link href="/money/cockpit">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Invoice details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client">Client</Label>
            <Input
              id="client"
              value={client}
              onChange={(e) => setClient(e.target.value)}
              disabled={pending}
              placeholder="e.g. ACME Manufacturing Ltd"
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
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Logging...' : 'Log invoice'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
