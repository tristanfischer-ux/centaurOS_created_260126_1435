'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  logInvestorTouch,
  moveInvestorStage,
  passInvestor,
  type InvestorDetail,
  type PipelineRow,
} from '@/actions/money-raise'
import { toast } from 'sonner'

const STAGE_OPTIONS: Array<PipelineRow['current_stage']> = [
  'target',
  'researching',
  'contacted',
  'meeting',
  'due_diligence',
  'verbal',
  'closed',
  'passed',
]

const TOUCH_TYPES = [
  { v: 'email', label: 'Email' },
  { v: 'call', label: 'Call' },
  { v: 'meeting', label: 'Meeting' },
  { v: 'message', label: 'Message (LinkedIn / WhatsApp)' },
  { v: 'note', label: 'Note (no contact)' },
] as const

function formatCurrency(cents: number | null): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

export function InvestorDetailView({ detail }: { detail: InvestorDetail }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [moveStage, setMoveStage] = useState<PipelineRow['current_stage']>(detail.state.current_stage)
  const [moveNotes, setMoveNotes] = useState('')
  const [touchType, setTouchType] = useState<string>('email')
  const [touchNotes, setTouchNotes] = useState('')
  const [touchDate, setTouchDate] = useState(new Date().toISOString().slice(0, 10))
  const [passReason, setPassReason] = useState('')
  const [passNarrative, setPassNarrative] = useState('')

  const onMove = () => {
    if (moveStage === detail.state.current_stage) {
      toast.error('Pick a different stage')
      return
    }
    startTransition(async () => {
      const result = await moveInvestorStage({
        pipeline_state_id: detail.state.id,
        to_stage: moveStage,
        notes: moveNotes.trim() || undefined,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Moved to ${moveStage}`)
      setMoveNotes('')
      router.refresh()
    })
  }

  const onLogTouch = () => {
    startTransition(async () => {
      const result = await logInvestorTouch({
        pipeline_state_id: detail.state.id,
        touch_type: touchType,
        notes: touchNotes.trim() || undefined,
        date: touchDate,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Touch logged')
      setTouchNotes('')
      router.refresh()
    })
  }

  const onPass = () => {
    if (!passReason.trim()) {
      toast.error('Pass reason is required')
      return
    }
    startTransition(async () => {
      const result = await passInvestor({
        pipeline_state_id: detail.state.id,
        reason: passReason.trim(),
        narrative: passNarrative.trim() || undefined,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Investor marked as passed')
      router.refresh()
    })
  }

  const investorName = detail.firm?.title ?? detail.state.investor_firm_id ?? detail.state.marketplace_listing_id ?? 'Investor'

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{investorName}</h1>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="secondary">{detail.state.current_stage}</Badge>
            {detail.state.match_score_cached !== null && (
              <Badge variant="outline">Match {detail.state.match_score_cached}%</Badge>
            )}
            {detail.state.commit_amount_cents !== null && (
              <Badge variant="success">
                Committed {formatCurrency(detail.state.commit_amount_cents)}
              </Badge>
            )}
          </div>
          {detail.firm?.country && (
            <p className="text-xs text-muted-foreground mt-2">{detail.firm.country}</p>
          )}
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Back to pipeline</Button>
        </Link>
      </header>

      {detail.firm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Firm</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 h-14 w-14 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                {detail.firm.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={detail.firm.image_url}
                    alt={`${detail.firm.title ?? 'Investor'} logo`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {(detail.firm.title ?? '?').slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {detail.firm.subcategory && (
                    <Badge variant="secondary" size="sm">{detail.firm.subcategory}</Badge>
                  )}
                  {(detail.firm.city || detail.firm.country) && (
                    <span className="text-xs text-muted-foreground">
                      {[detail.firm.city, detail.firm.country].filter(Boolean).join(' · ')}
                    </span>
                  )}
                  {detail.firm.founded_year && (
                    <span className="text-xs text-muted-foreground">Founded {detail.firm.founded_year}</span>
                  )}
                  {detail.firm.company_size && (
                    <span className="text-xs text-muted-foreground">{detail.firm.company_size}</span>
                  )}
                </div>
                {detail.firm.description && (
                  <p className="mt-2 text-muted-foreground">{detail.firm.description}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {detail.firm.website_url && (
                <a
                  href={detail.firm.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-international-orange underline"
                >
                  {detail.firm.website_url}
                </a>
              )}
              {detail.firm.contact_name && (
                <span className="text-muted-foreground">
                  Contact: {detail.firm.contact_name}
                  {detail.firm.contact_title ? ` (${detail.firm.contact_title})` : ''}
                </span>
              )}
              {detail.firm.contact_email && (
                <a href={`mailto:${detail.firm.contact_email}`} className="text-international-orange underline">
                  {detail.firm.contact_email}
                </a>
              )}
              {detail.firm.contact_linkedin && (
                <a href={detail.firm.contact_linkedin} target="_blank" rel="noreferrer" className="text-international-orange underline">
                  LinkedIn
                </a>
              )}
            </div>

            {detail.firm.last_enriched_at && (
              <p className="text-[10px] text-muted-foreground/70">
                Enriched {new Date(detail.firm.last_enriched_at).toLocaleDateString('en-GB')}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {detail.news && (detail.news.intel_summary || detail.news.current_focus) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent intel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {detail.news.current_focus && (
              <p><span className="font-semibold">Current focus:</span> {detail.news.current_focus}</p>
            )}
            {detail.news.intel_summary && (
              <p className="text-muted-foreground whitespace-pre-line">{detail.news.intel_summary}</p>
            )}
            <p className="text-[10px] text-muted-foreground/70">
              Updated {new Date(detail.news.generated_at).toLocaleDateString('en-GB')}
            </p>
          </CardContent>
        </Card>
      )}

      {detail.portfolio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Portfolio ({detail.portfolio.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 px-4">Company</th>
                    <th className="py-2 px-4">Sector</th>
                    <th className="py-2 px-4">Stage</th>
                    <th className="py-2 px-4 text-right">Amount</th>
                    <th className="py-2 px-4">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.portfolio.map((p) => (
                    <tr key={p.id} className="border-b border-border/50">
                      <td className="py-2 px-4 font-medium">
                        {p.source_url ? (
                          <a href={p.source_url} target="_blank" rel="noreferrer" className="hover:underline">
                            {p.company_name}
                          </a>
                        ) : (
                          p.company_name
                        )}
                      </td>
                      <td className="py-2 px-4 text-muted-foreground">{p.sector ?? '—'}</td>
                      <td className="py-2 px-4 text-muted-foreground">{p.stage ?? '—'}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-muted-foreground">
                        {p.amount_usd != null
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(p.amount_usd)
                          : '—'}
                      </td>
                      <td className="py-2 px-4 text-xs text-muted-foreground">
                        {p.investment_date ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Move stage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <Select
                value={moveStage}
                onValueChange={(v) => setMoveStage(v as PipelineRow['current_stage'])}
                disabled={pending}
              >
                <SelectTrigger id="stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="moveNotes">Notes (optional)</Label>
              <Textarea
                id="moveNotes"
                value={moveNotes}
                onChange={(e) => setMoveNotes(e.target.value)}
                rows={2}
                disabled={pending}
              />
            </div>
            <Button onClick={onMove} disabled={pending}>Move</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Log touch</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="touchType">Type</Label>
                <Select value={touchType} onValueChange={setTouchType} disabled={pending}>
                  <SelectTrigger id="touchType">
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
                <Label htmlFor="touchDate">Date</Label>
                <Input
                  id="touchDate"
                  type="date"
                  value={touchDate}
                  onChange={(e) => setTouchDate(e.target.value)}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="touchNotes">Notes</Label>
              <Textarea
                id="touchNotes"
                value={touchNotes}
                onChange={(e) => setTouchNotes(e.target.value)}
                rows={2}
                disabled={pending}
              />
            </div>
            <Button onClick={onLogTouch} disabled={pending}>Log touch</Button>
          </CardContent>
        </Card>
      </div>

      {detail.state.current_stage !== 'passed' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Mark as passed</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="passReason">Reason</Label>
              <Input
                id="passReason"
                value={passReason}
                onChange={(e) => setPassReason(e.target.value)}
                disabled={pending}
                placeholder="e.g. Stage too early"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="passNarrative">Narrative (optional)</Label>
              <Textarea
                id="passNarrative"
                value={passNarrative}
                onChange={(e) => setPassNarrative(e.target.value)}
                rows={2}
                disabled={pending}
                placeholder="What did they actually say?"
              />
            </div>
            <Button variant="ghost" onClick={onPass} disabled={pending}>
              Mark as passed
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Events ({detail.events.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {detail.events.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground text-center">No events yet.</p>
          ) : (
            <ol className="space-y-3">
              {detail.events.map((e) => (
                <li key={e.id} className="border-l-2 border-border pl-4 py-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{e.event_type.replace('_', ' ')}</span>
                    {e.from_stage && e.to_stage && (
                      <span className="text-muted-foreground">
                        {e.from_stage} → {e.to_stage}
                      </span>
                    )}
                    <span className="text-muted-foreground/70 ml-auto">
                      {new Date(e.created_at).toLocaleString('en-GB')}
                    </span>
                  </div>
                  {Object.keys(e.payload).length > 0 && (
                    <pre className="mt-2 text-[10px] text-muted-foreground bg-muted/30 rounded p-2 overflow-x-auto">
                      {JSON.stringify(e.payload, null, 2)}
                    </pre>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
