'use client'

import Link from 'next/link'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  extractThesisFromBusinessPlan,
  saveExtractedThesis,
  saveThesisVersion,
  type ThesisRow,
} from '@/actions/money-thesis'
import type { ExtractedThesis } from '@/lib/money/match-types'
import { toast } from 'sonner'
import { FileText, Sparkles, Target, Loader2 } from 'lucide-react'

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

const STAGE_OPTIONS = ['pre_seed', 'seed', 'series_a', 'series_b', 'growth', 'late_stage']
const SECTOR_OPTIONS = [
  'hardware',
  'software',
  'agri_tech',
  'climate',
  'health',
  'fintech',
  'industrial',
  'robotics',
  'deep_tech',
  'consumer',
]
const INSTRUMENT_OPTIONS = ['safe', 'priced_equity', 'convertible', 'asa']
const LEAD_OPTIONS = [
  { v: 'either', label: 'Either lead or follower' },
  { v: 'lead_only', label: 'Lead only' },
  { v: 'follower_only', label: 'Follower only' },
]

const EXTRACT_MAX_CHARS = 20_000
const EXTRACT_MIN_CHARS = 500
const EXTRACT_SWEET_MIN = 4_000

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function humanise(slug: string): string {
  return slug.replace(/_/g, ' ')
}

function formatSource(source: string | null | undefined): string {
  if (!source) return 'manual'
  if (source === 'business_plan') return 'business plan'
  return source
}

// --------------------------------------------------------------------------
// ChipGroup — multi-select badges
// --------------------------------------------------------------------------

function ChipGroup({
  options,
  selected,
  onChange,
  disabled,
  ariaLabel,
}: {
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  ariaLabel?: string
}) {
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v))
    else onChange([...selected, v])
  }
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={ariaLabel}>
      {options.map((o) => {
        const active = selected.includes(o)
        return (
          <Button
            key={o}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            disabled={disabled}
            aria-pressed={active}
            onClick={() => toggle(o)}
          >
            {humanise(o)}
          </Button>
        )
      })}
    </div>
  )
}

// --------------------------------------------------------------------------
// Extracted-thesis preview card
// --------------------------------------------------------------------------

function ExtractedPreview({
  extracted,
  onSaveAndMatch,
  onEdit,
  pending,
}: {
  extracted: ExtractedThesis
  onSaveAndMatch: () => void
  onEdit: () => void
  pending: boolean
}) {
  return (
    <Card className="border-international-orange/30 bg-international-orange/5">
      <CardHeader>
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-international-orange" aria-hidden />
          Fiona&rsquo;s read of your plan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {extracted.summary && (
          <p className="text-sm leading-relaxed">{extracted.summary}</p>
        )}

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Stage</dt>
            <dd>
              {extracted.stage_tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {extracted.stage_tags.map((s) => (
                    <Badge key={s} variant="secondary">{humanise(s)}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Sectors</dt>
            <dd>
              {extracted.sector_tags.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {extracted.sector_tags.map((s) => (
                    <Badge key={s} variant="secondary">{humanise(s)}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Geography</dt>
            <dd>
              {extracted.geography.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {extracted.geography.map((g) => (
                    <Badge key={g} variant="outline">{g}</Badge>
                  ))}
                </div>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Cheque range</dt>
            <dd>
              {extracted.cheque_min_cents || extracted.cheque_max_cents ? (
                <span>
                  {extracted.cheque_min_cents
                    ? `£${Math.round((extracted.cheque_min_cents / 100)).toLocaleString('en-GB')}`
                    : '—'}
                  {' to '}
                  {extracted.cheque_max_cents
                    ? `£${Math.round((extracted.cheque_max_cents / 100)).toLocaleString('en-GB')}`
                    : '—'}
                </span>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </dd>
          </div>

          <div className="sm:col-span-2">
            <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Instrument</dt>
            <dd>
              {extracted.instrument ? (
                <Badge variant="secondary">{extracted.instrument}</Badge>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
            </dd>
          </div>

          {extracted.keywords.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Keywords</dt>
              <dd>
                <div className="flex flex-wrap gap-1">
                  {extracted.keywords.map((k) => (
                    <Badge key={k} variant="outline">{k}</Badge>
                  ))}
                </div>
              </dd>
            </div>
          )}
        </dl>

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button variant="secondary" onClick={onEdit} disabled={pending}>
            Edit before saving
          </Button>
          <Button
            onClick={onSaveAndMatch}
            disabled={pending}
            className="bg-international-orange hover:bg-international-orange-hover text-white"
          >
            {pending ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              'Save thesis + find matches'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --------------------------------------------------------------------------
// Main view
// --------------------------------------------------------------------------

export function ThesisView({
  thesis,
  versions,
}: {
  thesis: ThesisRow | null
  versions: Array<{ id: string; version: number; created_at: string }>
}) {
  const router = useRouter()
  const [savePending, startSave] = useTransition()
  const [extractPending, startExtract] = useTransition()

  // ---- Surface A state (edit current thesis) -----------------------------
  const [stageTags, setStageTags] = useState<string[]>(thesis?.stage_tags ?? [])
  const [sectorTags, setSectorTags] = useState<string[]>(thesis?.sector_tags ?? [])
  const [geography, setGeography] = useState<string>(thesis?.geography.join(', ') ?? 'GB')
  const [chequeMin, setChequeMin] = useState<string>(
    thesis?.cheque_min_cents ? String(thesis.cheque_min_cents / 100) : '',
  )
  const [chequeMax, setChequeMax] = useState<string>(
    thesis?.cheque_max_cents ? String(thesis.cheque_max_cents / 100) : '',
  )
  const [instruments, setInstruments] = useState<string[]>(thesis?.preferred_instrument ?? [])
  const [decisionWeeks, setDecisionWeeks] = useState<string>(
    thesis?.decision_speed_max_weeks ? String(thesis.decision_speed_max_weeks) : '',
  )
  const [leadPref, setLeadPref] = useState<string>(thesis?.lead_follower_pref ?? 'either')
  const [keywords, setKeywords] = useState<string>((thesis?.keywords ?? []).join(', '))
  const [summary, setSummary] = useState<string>('')
  const [editFormOpen, setEditFormOpen] = useState<boolean>(!!thesis)

  // ---- Surface B state (business-plan extraction) ------------------------
  const [planText, setPlanText] = useState<string>('')
  const [extracted, setExtracted] = useState<ExtractedThesis | null>(null)
  const extractCardRef = useRef<HTMLDivElement | null>(null)

  const planCharCount = planText.length
  const planTooShort = planCharCount > 0 && planCharCount < EXTRACT_MIN_CHARS
  const planTooLong = planCharCount > EXTRACT_MAX_CHARS
  const planSweetSpot = planCharCount >= EXTRACT_SWEET_MIN && planCharCount <= EXTRACT_MAX_CHARS

  const sourceLabel = useMemo(() => {
    const ds = thesis?.data_sources as { source?: string } | null | undefined
    return formatSource(ds?.source ?? null)
  }, [thesis])

  // ---- Handlers ----------------------------------------------------------

  const scrollToExtract = () => {
    extractCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const incoming = e.target.value
    if (incoming.length > EXTRACT_MAX_CHARS) {
      setPlanText(incoming.slice(0, EXTRACT_MAX_CHARS))
      toast.warning(
        `Truncated to ${EXTRACT_MAX_CHARS.toLocaleString('en-GB')} chars — paste the most relevant sections`,
      )
    } else {
      setPlanText(incoming)
    }
  }

  const onSaveManual = () => {
    if (stageTags.length === 0) {
      toast.error('Pick at least one stage')
      return
    }
    if (sectorTags.length === 0) {
      toast.error('Pick at least one sector')
      return
    }
    const geoArray = geography
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const keywordsArray = keywords
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const minCents = chequeMin ? Math.round(Number(chequeMin) * 100) : null
    const maxCents = chequeMax ? Math.round(Number(chequeMax) * 100) : null

    startSave(async () => {
      const result = await saveThesisVersion({
        stage_tags: stageTags,
        sector_tags: sectorTags,
        geography: geoArray,
        cheque_min_cents: minCents,
        cheque_max_cents: maxCents,
        keywords: keywordsArray,
        preferred_instrument: instruments,
        decision_speed_max_weeks: decisionWeeks ? Number(decisionWeeks) : null,
        lead_follower_pref: leadPref,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Thesis saved as version ${result.version}`)
      router.refresh()
    })
  }

  const onSaveAndFindMatches = () => {
    if (stageTags.length === 0) {
      toast.error('Pick at least one stage before finding matches')
      return
    }
    if (sectorTags.length === 0) {
      toast.error('Pick at least one sector before finding matches')
      return
    }
    const geoArray = geography
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean)
    const keywordsArray = keywords
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    const minCents = chequeMin ? Math.round(Number(chequeMin) * 100) : null
    const maxCents = chequeMax ? Math.round(Number(chequeMax) * 100) : null

    startSave(async () => {
      const result = await saveThesisVersion({
        stage_tags: stageTags,
        sector_tags: sectorTags,
        geography: geoArray,
        cheque_min_cents: minCents,
        cheque_max_cents: maxCents,
        keywords: keywordsArray,
        preferred_instrument: instruments,
        decision_speed_max_weeks: decisionWeeks ? Number(decisionWeeks) : null,
        lead_follower_pref: leadPref,
      })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(`Saved version ${result.version} — finding matches`)
      router.push('/money/raise/for-you')
    })
  }

  const onExtract = () => {
    if (planCharCount < EXTRACT_MIN_CHARS) {
      toast.error(`Paste at least ${EXTRACT_MIN_CHARS} characters of business-plan text`)
      return
    }
    startExtract(async () => {
      const result = await extractThesisFromBusinessPlan({ text: planText })
      if ('error' in result) {
        if (result.error === 'text_too_short') {
          toast.error('That text was too short to extract a thesis from.')
        } else if (result.error === 'ai_not_configured') {
          toast.error("Fiona isn't set up yet — ask your admin to add ANTHROPIC_API_KEY")
        } else if (result.error === 'extraction_failed') {
          toast.error("Fiona couldn't parse this plan. Try a clearer version or edit manually.")
        } else {
          toast.error(result.error)
        }
        return
      }
      setExtracted(result.extracted)
      toast.success('Fiona extracted a thesis from your plan')
    })
  }

  const onSaveExtractedAndMatch = () => {
    if (!extracted) return
    startSave(async () => {
      const result = await saveExtractedThesis({ extracted, source: 'business_plan' })
      if ('error' in result) {
        if (result.error === 'thesis_empty') {
          toast.error('The extracted thesis is empty — edit before saving.')
        } else {
          toast.error(result.error)
        }
        return
      }
      toast.success('Thesis saved — finding matching investors')
      router.push('/money/raise/for-you')
    })
  }

  const onEditExtracted = () => {
    if (!extracted) return
    setStageTags(extracted.stage_tags)
    setSectorTags(extracted.sector_tags)
    setGeography(extracted.geography.join(', '))
    setChequeMin(extracted.cheque_min_cents ? String(extracted.cheque_min_cents / 100) : '')
    setChequeMax(extracted.cheque_max_cents ? String(extracted.cheque_max_cents / 100) : '')
    setInstruments(extracted.instrument ? [extracted.instrument] : [])
    setKeywords(extracted.keywords.join(', '))
    setSummary(extracted.summary)
    setEditFormOpen(true)
    setExtracted(null)
    toast.info("Loaded Fiona's draft — tweak and save when ready")
    // Scroll back up so the user sees the populated fields
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const pending = savePending || extractPending
  const hasActiveThesis = !!thesis

  // ---- Render ------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Investor thesis</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {hasActiveThesis ? (
              <>
                <Badge variant="success">Active version {thesis.version}</Badge>
                <Badge variant="outline" className="capitalize">{sourceLabel}</Badge>
              </>
            ) : (
              <Badge variant="secondary">No thesis yet</Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {versions.length} version{versions.length === 1 ? '' : 's'} on file
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Your thesis drives investor match scores. Save a new version to update the pointer, or drop a business plan below and let Fiona extract one for you.
          </p>
        </div>
        <Link href="/money/raise">
          <Button variant="secondary" size="sm">Back to pipeline</Button>
        </Link>
      </header>

      {/* ================================================================= */}
      {/* Surface A — Current thesis                                         */}
      {/* ================================================================= */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" aria-hidden />
            Current thesis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasActiveThesis && !editFormOpen ? (
            <EmptyState
              icon={<Target className="h-10 w-10" />}
              title="You haven&rsquo;t set a thesis yet"
              description="Two options: paste your business plan and let Fiona extract one, or fill the fields manually."
              action={
                <div className="flex gap-2 justify-center flex-wrap">
                  <Button
                    onClick={scrollToExtract}
                    className="bg-international-orange hover:bg-international-orange-hover text-white"
                  >
                    <FileText className="h-4 w-4 mr-1" aria-hidden />
                    Paste business plan
                  </Button>
                  <Button variant="secondary" onClick={() => setEditFormOpen(true)}>
                    Build manually
                  </Button>
                </div>
              }
            />
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="stage-group">Stage</Label>
                <ChipGroup
                  options={STAGE_OPTIONS}
                  selected={stageTags}
                  onChange={setStageTags}
                  disabled={pending}
                  ariaLabel="Funding stages"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sector-group">Sector</Label>
                <ChipGroup
                  options={SECTOR_OPTIONS}
                  selected={sectorTags}
                  onChange={setSectorTags}
                  disabled={pending}
                  ariaLabel="Sectors"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="geography">Geography (ISO codes, comma-separated)</Label>
                <Input
                  id="geography"
                  value={geography}
                  onChange={(e) => setGeography(e.target.value)}
                  disabled={pending}
                  placeholder="GB, US, DE"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chequeMin">Cheque min (&pound;)</Label>
                  <Input
                    id="chequeMin"
                    type="number"
                    inputMode="decimal"
                    value={chequeMin}
                    onChange={(e) => setChequeMin(e.target.value)}
                    disabled={pending}
                    placeholder="50000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="chequeMax">Cheque max (&pound;)</Label>
                  <Input
                    id="chequeMax"
                    type="number"
                    inputMode="decimal"
                    value={chequeMax}
                    onChange={(e) => setChequeMax(e.target.value)}
                    disabled={pending}
                    placeholder="500000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="instrument-group">Preferred instrument</Label>
                <ChipGroup
                  options={INSTRUMENT_OPTIONS}
                  selected={instruments}
                  onChange={setInstruments}
                  disabled={pending}
                  ariaLabel="Preferred instruments"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="keywords">
                  Keywords (comma-separated) &mdash; used for semantic match
                </Label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  disabled={pending}
                  placeholder="e.g. carbon capture, industrial robotics, DTC skincare"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="decisionWeeks">Max decision speed (weeks)</Label>
                  <Input
                    id="decisionWeeks"
                    type="number"
                    value={decisionWeeks}
                    onChange={(e) => setDecisionWeeks(e.target.value)}
                    disabled={pending}
                    placeholder="6"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leadPref">Lead preference</Label>
                  <select
                    id="leadPref"
                    value={leadPref}
                    onChange={(e) => setLeadPref(e.target.value)}
                    disabled={pending}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {LEAD_OPTIONS.map((o) => (
                      <option key={o.v} value={o.v}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {summary && (
                <div className="space-y-2">
                  <Label htmlFor="summary">Summary</Label>
                  <Textarea
                    id="summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    disabled={pending}
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">
                    Editable summary from Fiona&rsquo;s draft. Stored in the version&rsquo;s data_sources.summary field.
                  </p>
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-end pt-2">
                <Button variant="secondary" onClick={onSaveManual} disabled={pending}>
                  {savePending ? 'Saving…' : 'Save new version'}
                </Button>
                <Button
                  onClick={onSaveAndFindMatches}
                  disabled={pending}
                  className="bg-international-orange hover:bg-international-orange-hover text-white"
                >
                  {savePending ? 'Saving…' : 'Save thesis + find matches'}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Surface B — Auto-extract from business plan                        */}
      {/* ================================================================= */}
      <Card ref={extractCardRef} className="border-international-orange/20">
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-international-orange" aria-hidden />
            Auto-extract from business plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plan-text">
              Paste your business plan, investor deck text, or Series A narrative
            </Label>
            <Textarea
              id="plan-text"
              value={planText}
              onChange={handleTextareaChange}
              disabled={extractPending}
              rows={10}
              placeholder="Paste the strongest 4,000–20,000 characters of your plan: problem, solution, traction, team, and what you&rsquo;re raising for…"
              aria-describedby="plan-text-helper"
            />
            <div
              id="plan-text-helper"
              className="flex flex-wrap items-center justify-between gap-2 text-xs"
            >
              <span
                className={
                  planTooShort
                    ? 'text-destructive'
                    : planSweetSpot
                      ? 'text-international-orange'
                      : 'text-muted-foreground'
                }
              >
                {planCharCount.toLocaleString('en-GB')} / {EXTRACT_MAX_CHARS.toLocaleString('en-GB')} characters
                {planTooShort && ` (need at least ${EXTRACT_MIN_CHARS})`}
                {planSweetSpot && ' — good length'}
                {planTooLong && ' — truncated'}
              </span>
              <span className="text-muted-foreground">
                Sweet spot: {EXTRACT_SWEET_MIN.toLocaleString('en-GB')}–
                {EXTRACT_MAX_CHARS.toLocaleString('en-GB')} chars
              </span>
            </div>
          </div>

          <div
            aria-live="polite"
            role="status"
            className="min-h-[1.25rem] text-xs text-muted-foreground"
          >
            {extractPending && (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Fiona is reading your plan&hellip;
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              This consumes 1 specialist call. Fiona is the fundraising advisor.
            </p>
            <Button
              onClick={onExtract}
              disabled={pending || planCharCount < EXTRACT_MIN_CHARS}
              className="bg-international-orange hover:bg-international-orange-hover text-white"
            >
              {extractPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden />
                  Extracting&hellip;
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-1" aria-hidden />
                  Extract thesis
                </>
              )}
            </Button>
          </div>

          {extracted && (
            <ExtractedPreview
              extracted={extracted}
              onSaveAndMatch={onSaveExtractedAndMatch}
              onEdit={onEditExtracted}
              pending={savePending}
            />
          )}
        </CardContent>
      </Card>

      {/* ================================================================= */}
      {/* Version history                                                    */}
      {/* ================================================================= */}
      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Version history</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {versions.map((v) => (
                <li key={v.id} className="py-2 flex items-center justify-between">
                  <span>Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString('en-GB')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
