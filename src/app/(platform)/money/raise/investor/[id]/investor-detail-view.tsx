'use client'

/**
 * @file investor-detail-view.tsx
 *
 * Rich detail view for a single investor in the Money/Raise pipeline. The
 * sparse V2 shell stays (pipeline controls + portfolio table + news intel +
 * event log), but we now surface the full treasure trove of
 * `marketplace_listings.attributes` via co-located cards.
 */

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
import type { MatchBreakdown } from '@/lib/money/match-types'
import { toast } from 'sonner'

import { MatchScoreDisplay } from './match-score-display'
import { ThesisIcpSection } from './thesis-icp-section'
import { KeyPeopleCard } from './key-people-card'
import { FundPerformanceCard } from './fund-performance-card'
import { InvestmentPatternCard } from './investment-pattern-card'
import { ConnectionBriefCard } from './connection-brief-card'
import { HardwareFitCard } from './hardware-fit-card'
import { DataFreshnessCard } from './data-freshness-card'
import { RecentDealsCard } from './recent-deals-card'
import { TierLockSection } from '../../_shared/tier-lock-section'
import type { FirmContact } from './contact-detail-dialog'

// Soft-teaser preview length for portfolio — see InvestmentPatternCard / sidebar
const PORTFOLIO_TEASER_ROWS = 5

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

// ---------------------------------------------------------------------------
// Firm-attribute shape (mirrors what page.tsx extracts from attributes JSONB)
// ---------------------------------------------------------------------------

export type FirmAttributes = {
  investment_thesis: string | null
  ideal_company_profile: string | null
  value_add: string | null
  firm_type: string | null
  fund_size_gbp: number | null
  cheque_range_gbp: { min: number | null; max: number | null } | null
  stage_focus: string[]
  sectors: string[]
  geo_focus: string[]
  is_active_deploying: boolean | null
  hardware_fit_score: number | null
  investment_pattern: string | null
  connection_brief: string | null
  warm_intro_paths: unknown
  fund_performance: unknown
  fund_history: unknown
  exits: unknown
  recent_deals: unknown
  recent_deals_summary: string | null
  data_source: string | null
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCurrencyCents(cents: number | null): string {
  if (cents === null) return '—'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(cents / 100)
}

function formatGbp(gbp: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(gbp)
}

function formatChequeRange(
  range: FirmAttributes['cheque_range_gbp'],
): string | null {
  if (!range) return null
  const { min, max } = range
  if (min == null && max == null) return null
  if (min != null && max != null) return `${formatGbp(min)} – ${formatGbp(max)}`
  if (min != null) return `${formatGbp(min)}+`
  if (max != null) return `up to ${formatGbp(max)}`
  return null
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function InvestorDetailView({
  detail,
  contacts,
  firmAttributes,
  dataQualityScore,
  matchBreakdown,
  currentTier,
}: {
  detail: InvestorDetail
  contacts: FirmContact[]
  firmAttributes: FirmAttributes
  dataQualityScore: number | null
  matchBreakdown: MatchBreakdown | null
  /** Foundry subscription tier — drives tier-locked sections. */
  currentTier: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [moveStage, setMoveStage] = useState<PipelineRow['current_stage']>(
    detail.state.current_stage,
  )
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

  const firm = detail.firm
  const investorName =
    firm?.title ?? detail.state.investor_firm_id ?? detail.state.marketplace_listing_id ?? 'Investor'
  const chequeRange = formatChequeRange(firmAttributes.cheque_range_gbp)
  const fundSize =
    firmAttributes.fund_size_gbp != null ? formatGbp(firmAttributes.fund_size_gbp) : null
  const stageFocus = firmAttributes.stage_focus.slice(0, 4)
  const sectors = firmAttributes.sectors.slice(0, 6)
  const geoFocus = firmAttributes.geo_focus.slice(0, 4)

  return (
    <div className="space-y-6">
      {/* ============================================================== */}
      {/* Top banner                                                    */}
      {/* ============================================================== */}
      <header className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4 min-w-0 flex-1">
          <div className="flex-shrink-0 h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden">
            {firm?.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={firm.image_url}
                alt={`${investorName} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-muted-foreground">
                {investorName.slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{investorName}</h1>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <Badge variant="secondary">{detail.state.current_stage}</Badge>
              {detail.state.match_score_cached !== null && !matchBreakdown && (
                <Badge variant="outline">Match {detail.state.match_score_cached}%</Badge>
              )}
              {detail.state.commit_amount_cents !== null && (
                <Badge variant="success">
                  Committed {formatCurrencyCents(detail.state.commit_amount_cents)}
                </Badge>
              )}
              {firm?.subcategory && <Badge variant="secondary">{firm.subcategory}</Badge>}
              {firmAttributes.firm_type && (
                <Badge variant="outline">{firmAttributes.firm_type}</Badge>
              )}
              {firmAttributes.is_active_deploying === true && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/50 bg-emerald-50 text-emerald-700"
                >
                  Actively deploying
                </Badge>
              )}
            </div>
            {(firm?.city || firm?.country) && (
              <p className="text-xs text-muted-foreground mt-2">
                {[firm?.city, firm?.country].filter(Boolean).join(' · ')}
              </p>
            )}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs mt-2">
              {firm?.website_url && (
                <a
                  href={firm.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-international-orange underline"
                >
                  {firm.website_url}
                </a>
              )}
              {firm?.contact_email && (
                <a
                  href={`mailto:${firm.contact_email}`}
                  className="text-international-orange underline"
                >
                  {firm.contact_email}
                </a>
              )}
              {firm?.contact_linkedin && (
                <a
                  href={firm.contact_linkedin}
                  target="_blank"
                  rel="noreferrer"
                  className="text-international-orange underline"
                >
                  LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">
            Back to pipeline
          </Button>
        </Link>
      </header>

      {/* Deploy + focus summary strip */}
      {(chequeRange || fundSize || stageFocus.length > 0 || sectors.length > 0 || geoFocus.length > 0) && (
        <div className="rounded-lg border bg-card p-4 space-y-2">
          <dl className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 text-sm">
            {chequeRange && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Cheque range
                </dt>
                <dd className="mt-0.5 font-semibold text-foreground tabular-nums">{chequeRange}</dd>
              </div>
            )}
            {fundSize && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Fund size
                </dt>
                <dd className="mt-0.5 font-semibold text-foreground tabular-nums">{fundSize}</dd>
              </div>
            )}
            {stageFocus.length > 0 && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Stage focus
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {stageFocus.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
            {geoFocus.length > 0 && (
              <div>
                <dt className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Geography
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {geoFocus.map((g) => (
                    <Badge key={g} variant="outline" className="text-[10px]">
                      {g}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          {sectors.length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">
                Sectors
              </p>
              <div className="flex flex-wrap gap-1">
                {sectors.map((s) => (
                  <Badge key={s} variant="secondary" className="text-[10px]">
                    {s}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Match score block — only when we have a cached breakdown */}
      {matchBreakdown && <MatchScoreDisplay breakdown={matchBreakdown} />}

      {/* ============================================================== */}
      {/* Two-column body                                                */}
      {/* ============================================================== */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* --- Left column --------------------------------------------------- */}
        <div className="space-y-6 min-w-0">
          <ThesisIcpSection
            investmentThesis={firmAttributes.investment_thesis}
            idealCompanyProfile={firmAttributes.ideal_company_profile}
            valueAdd={firmAttributes.value_add}
          />

          {firm?.description && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">About the firm</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
                  {firm.description}
                </p>
              </CardContent>
            </Card>
          )}

          {detail.portfolio.length > 0 && (
            <PortfolioTable
              portfolio={detail.portfolio}
              investorName={investorName}
              currentTier={currentTier}
            />
          )}

          <RecentDealsCard
            recentDealsSummary={firmAttributes.recent_deals_summary}
            recentDeals={firmAttributes.recent_deals}
          />

          {detail.news && (detail.news.intel_summary || detail.news.current_focus) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">News intel</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {detail.news.current_focus && (
                  <p>
                    <span className="font-semibold">Current focus:</span>{' '}
                    {detail.news.current_focus}
                  </p>
                )}
                {detail.news.intel_summary && (
                  <p className="text-muted-foreground whitespace-pre-line">
                    {detail.news.intel_summary}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/70">
                  Updated {new Date(detail.news.generated_at).toLocaleDateString('en-GB')}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Pipeline action cards — move / log-touch / pass */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Move stage
                </CardTitle>
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
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
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
                <Button onClick={onMove} disabled={pending}>
                  Move
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Log touch
                </CardTitle>
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
                          <SelectItem key={t.v} value={t.v}>
                            {t.label}
                          </SelectItem>
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
                <Button onClick={onLogTouch} disabled={pending}>
                  Log touch
                </Button>
              </CardContent>
            </Card>
          </div>

          {detail.state.current_stage !== 'passed' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Mark as passed
                </CardTitle>
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

        {/* --- Right column (sidebar) -------------------------------------- */}
        <aside className="space-y-6 min-w-0">
          {/* Key people / partners — Starter+ */}
          <TierLockSection
            requiredTier="starter"
            currentTier={currentTier}
            title="Key people"
            teaser="Starter unlocks partner names, titles, and seniority for every firm."
          >
            <KeyPeopleCard contacts={contacts} />
          </TierLockSection>

          {/* Fund performance — Starter+ */}
          <TierLockSection
            requiredTier="starter"
            currentTier={currentTier}
            title="Fund performance"
            teaser="Starter unlocks fund history, returns, and exit activity."
          >
            <FundPerformanceCard
              fundPerformance={firmAttributes.fund_performance}
              fundHistory={firmAttributes.fund_history}
              exits={firmAttributes.exits}
            />
          </TierLockSection>

          {/* Investment pattern — Starter+ */}
          <TierLockSection
            requiredTier="starter"
            currentTier={currentTier}
            title="Investment pattern"
            teaser="Starter unlocks how they deploy cheques, stage cadence, and sector mix."
          >
            <InvestmentPatternCard
              investmentPattern={firmAttributes.investment_pattern}
              portfolio={detail.portfolio}
            />
          </TierLockSection>

          {/* Connection brief — Pro+ */}
          <TierLockSection
            requiredTier="pro"
            currentTier={currentTier}
            title="Connection brief"
            teaser="Professional unlocks the connection brief and warm-intro paths for this firm."
          >
            <ConnectionBriefCard
              connectionBrief={firmAttributes.connection_brief}
              warmIntroPaths={firmAttributes.warm_intro_paths}
            />
          </TierLockSection>

          <HardwareFitCard score={firmAttributes.hardware_fit_score} />
          <DataFreshnessCard
            dataQualityScore={dataQualityScore}
            lastEnrichedAt={firm?.last_enriched_at}
            dataSource={firmAttributes.data_source}
          />
        </aside>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PortfolioTable
//
// Always shows the first PORTFOLIO_TEASER_ROWS rows. If there are more rows
// and the user is below Starter, the remainder renders as a locked teaser.
// ---------------------------------------------------------------------------

function PortfolioTable({
  portfolio,
  investorName,
  currentTier,
}: {
  portfolio: InvestorDetail['portfolio']
  investorName: string
  currentTier: string | null
}) {
  const tierRank: Record<string, number> = {
    free: 0,
    seed: 1,
    starter: 2,
    professional: 3,
    enterprise: 4,
  }
  const rank = tierRank[currentTier ?? 'free'] ?? 0
  const hasStarter = rank >= tierRank.starter
  const teaser = portfolio.slice(0, PORTFOLIO_TEASER_ROWS)
  const rest = portfolio.slice(PORTFOLIO_TEASER_ROWS)
  const hiddenCount = hasStarter ? 0 : rest.length

  const renderRows = (rows: InvestorDetail['portfolio']) => (
    <>
      {rows.map((p) => (
        <tr key={p.id} className="border-b border-border/50">
          <td className="py-2 px-4 font-medium">
            {p.source_url ? (
              <a
                href={p.source_url}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
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
              ? new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  maximumFractionDigits: 0,
                }).format(p.amount_usd)
              : '—'}
          </td>
          <td className="py-2 px-4 text-xs text-muted-foreground">
            {p.investment_date ?? '—'}
          </td>
        </tr>
      ))}
    </>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">
          Portfolio ({portfolio.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              Portfolio companies for {investorName}
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th scope="col" className="py-2 px-4">Company</th>
                <th scope="col" className="py-2 px-4">Sector</th>
                <th scope="col" className="py-2 px-4">Stage</th>
                <th scope="col" className="py-2 px-4 text-right">Amount</th>
                <th scope="col" className="py-2 px-4">Date</th>
              </tr>
            </thead>
            <tbody>
              {renderRows(teaser)}
              {hasStarter && rest.length > 0 && renderRows(rest)}
            </tbody>
          </table>
        </div>
        {hiddenCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-3 text-xs">
            <span className="text-muted-foreground">
              {hiddenCount} more{' '}
              {hiddenCount === 1 ? 'portfolio company' : 'portfolio companies'} hidden
            </span>
            <Link
              href="/pricing?plan=starter"
              className="font-medium text-international-orange hover:underline"
            >
              Upgrade to Startup Team to see all {'->'}
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
