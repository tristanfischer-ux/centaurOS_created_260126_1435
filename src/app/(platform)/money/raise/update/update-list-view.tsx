'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail } from 'lucide-react'
import { draftInvestorUpdate, type InvestorUpdateRow } from '@/actions/money-updates'
import { toast } from 'sonner'

function defaultMonthLabel(): string {
  return new Date().toLocaleString('en-GB', { month: 'long', year: 'numeric' })
}

function statusBadge(state: InvestorUpdateRow['state']) {
  if (state === 'sent') return <Badge variant="success" size="sm">Sent</Badge>
  if (state === 'scheduled') return <Badge variant="warning" size="sm">Scheduled</Badge>
  if (state === 'cancelled') return <Badge variant="destructive" size="sm">Cancelled</Badge>
  return <Badge variant="secondary" size="sm">Draft</Badge>
}

export function UpdateListView({ updates }: { updates: InvestorUpdateRow[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [showDraftForm, setShowDraftForm] = useState(updates.length === 0)
  const [monthLabel, setMonthLabel] = useState(defaultMonthLabel())
  const [subject, setSubject] = useState('')

  const onDraft = () => {
    if (!monthLabel.trim() || !subject.trim()) {
      toast.error('Month and subject are required')
      return
    }
    startTransition(async () => {
      const result = await draftInvestorUpdate({
        month_label: monthLabel.trim(),
        subject: subject.trim(),
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Draft created')
      router.push(`/money/raise/update/${result.id}`)
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investor updates</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Monthly updates for your investors. Drafts are kept private until you mark them sent.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/money/raise">
            <Button variant="secondary" size="sm">Back to pipeline</Button>
          </Link>
          {!showDraftForm && (
            <Button size="sm" onClick={() => setShowDraftForm(true)}>
              Draft new update
            </Button>
          )}
        </div>
      </header>

      {showDraftForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft new update</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="month">Month label</Label>
                <Input
                  id="month"
                  value={monthLabel}
                  onChange={(e) => setMonthLabel(e.target.value)}
                  disabled={pending}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. Fractional Forge — April update"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowDraftForm(false)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={onDraft} disabled={pending}>
                {pending ? 'Creating...' : 'Create draft'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {updates.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Mail className="h-12 w-12" />}
              title="No updates yet"
              description="Draft your first monthly update to keep investors informed."
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {updates.map((u) => (
            <Link
              key={u.id}
              href={`/money/raise/update/${u.id}`}
              className="block"
            >
              <Card className="hover:bg-muted/30 transition-colors">
                <CardContent className="py-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{u.subject}</span>
                      {statusBadge(u.state)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {u.month_label} ·{' '}
                      {u.sent_at
                        ? `Sent ${new Date(u.sent_at).toLocaleDateString('en-GB')}`
                        : `Created ${new Date(u.created_at).toLocaleDateString('en-GB')}`}
                    </p>
                  </div>
                  {u.state === 'sent' && (
                    <div className="text-right text-xs tabular-nums text-muted-foreground shrink-0">
                      <div>{u.aggregate_delivered} delivered</div>
                      <div>{u.aggregate_opened} opened</div>
                      <div>{u.aggregate_replied} replied</div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
