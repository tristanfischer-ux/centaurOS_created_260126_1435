'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CircleDot } from 'lucide-react'
import { logInvestorTouch, type InvestorPickerOption } from '@/actions/money-raise'
import { toast } from 'sonner'

const TOUCH_TYPES = [
  { v: 'email', label: 'Email' },
  { v: 'call', label: 'Call' },
  { v: 'meeting', label: 'Meeting' },
  { v: 'message', label: 'Message (LinkedIn / WhatsApp)' },
  { v: 'note', label: 'Note (no contact)' },
] as const

export function LogTouchView({ investors }: { investors: InvestorPickerOption[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [investorId, setInvestorId] = useState<string>(investors[0]?.id ?? '')
  const [touchType, setTouchType] = useState<string>('email')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  if (investors.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Log touch</h1>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<CircleDot className="h-12 w-12" />}
              title="No investors in pipeline"
              description="Add investors to your pipeline before logging touches."
              action={
                <Link href="/money/raise">
                  <Button>Go to pipeline</Button>
                </Link>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  const onSubmit = () => {
    if (!investorId) {
      toast.error('Pick an investor')
      return
    }
    startTransition(async () => {
      const result = await logInvestorTouch({
        pipeline_state_id: investorId,
        touch_type: touchType,
        notes: notes.trim() || undefined,
        date,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Touch logged')
      router.push(`/money/raise/investor/${investorId}`)
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log touch</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Quick-log a touch with an investor. Resolves any open overdue-touch reminders.
          </p>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Cancel</Button>
        </Link>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Touch details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="investor">Investor</Label>
            <Select value={investorId} onValueChange={setInvestorId} disabled={pending}>
              <SelectTrigger id="investor">
                <SelectValue placeholder="Pick an investor" />
              </SelectTrigger>
              <SelectContent>
                {investors.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.label} <span className="text-muted-foreground">— {i.current_stage}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <Select value={touchType} onValueChange={setTouchType} disabled={pending}>
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOUCH_TYPES.map((t) => (
                    <SelectItem key={t.v} value={t.v}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
              rows={4}
              placeholder="What was discussed? What's the ask? Outcome?"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={onSubmit} disabled={pending}>
              {pending ? 'Logging...' : 'Log touch'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
