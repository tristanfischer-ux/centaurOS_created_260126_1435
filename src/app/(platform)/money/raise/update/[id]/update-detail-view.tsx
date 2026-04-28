'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  markUpdateSent,
  updateInvestorUpdate,
  type InvestorUpdateRecipientRow,
  type InvestorUpdateRow,
} from '@/actions/money-updates'
import { toast } from 'sonner'

export function UpdateDetailView({
  update,
  recipients,
}: {
  update: InvestorUpdateRow
  recipients: InvestorUpdateRecipientRow[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [subject, setSubject] = useState(update.subject)
  const [monthLabel, setMonthLabel] = useState(update.month_label)
  const [bodyHtml, setBodyHtml] = useState(update.body_html)
  const [headlineQuote, setHeadlineQuote] = useState(update.headline_quote ?? '')
  const isReadonly = update.state === 'sent' || update.state === 'cancelled'

  const onSave = () => {
    startTransition(async () => {
      const result = await updateInvestorUpdate(update.id, {
        subject: subject.trim(),
        month_label: monthLabel.trim(),
        body_html: bodyHtml,
        headline_quote: headlineQuote.trim() || null,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Update saved')
      router.refresh()
    })
  }

  const onMarkSent = () => {
    if (!confirm('Mark this update as sent? You can\'t edit it after sending.')) return
    startTransition(async () => {
      const result = await markUpdateSent(update.id)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Marked as sent')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{update.subject}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant={update.state === 'sent' ? 'success' : 'secondary'}>{update.state}</Badge>
            <span className="text-xs text-muted-foreground">{update.month_label}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/money/raise/update">
            <Button variant="secondary" size="sm">Back to list</Button>
          </Link>
          {!isReadonly && (
            <Button size="sm" onClick={onMarkSent} disabled={pending}>
              Mark as sent
            </Button>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Content</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                disabled={pending || isReadonly}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="month">Month label</Label>
              <Input
                id="month"
                value={monthLabel}
                onChange={(e) => setMonthLabel(e.target.value)}
                disabled={pending || isReadonly}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quote">Headline quote (optional)</Label>
            <Input
              id="quote"
              value={headlineQuote}
              onChange={(e) => setHeadlineQuote(e.target.value)}
              disabled={pending || isReadonly}
              placeholder="e.g. 'Best month for the team since starting up'"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="body">Body</Label>
            <Textarea
              id="body"
              value={bodyHtml}
              onChange={(e) => setBodyHtml(e.target.value)}
              disabled={pending || isReadonly}
              rows={16}
              className="font-mono text-xs"
              placeholder="Write your update. HTML or plain text — both render."
            />
          </div>

          {!isReadonly && (
            <div className="flex justify-end pt-2">
              <Button onClick={onSave} disabled={pending}>
                {pending ? 'Saving...' : 'Save draft'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Recipients ({recipients.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recipients.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">
              No recipients yet. Recipients are added when you send to investor pipeline groups.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-4">Recipient</th>
                    <th className="py-2 pr-4">Stage at send</th>
                    <th className="py-2 pr-4">Delivered</th>
                    <th className="py-2 pr-4 text-right">Opens</th>
                    <th className="py-2 pr-4 text-right">Clicks</th>
                    <th className="py-2 pr-2">Replied</th>
                  </tr>
                </thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id} className="border-b border-border/50">
                      <td className="py-1.5 pr-4">
                        <span className="font-medium">{r.name ?? r.email}</span>
                        {r.name && <span className="text-muted-foreground ml-2">{r.email}</span>}
                      </td>
                      <td className="py-1.5 pr-4 text-muted-foreground">{r.stage_at_send ?? '—'}</td>
                      <td className="py-1.5 pr-4 text-muted-foreground">
                        {r.delivered_at ? new Date(r.delivered_at).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-right">{r.opened_count}</td>
                      <td className="py-1.5 pr-4 text-right">{r.clicked_count}</td>
                      <td className="py-1.5 pr-2 text-muted-foreground">
                        {r.replied_at ? '✓' : r.bounced_at ? <span className="text-destructive">bounced</span> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
