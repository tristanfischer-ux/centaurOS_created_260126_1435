'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Plus, Check, ExternalLink } from 'lucide-react'
import { addInvestorToPipeline } from '@/actions/money-raise'
import type { MatchBreakdown, ScoredListingRow } from '@/lib/money/match-types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Score-band helpers
// ---------------------------------------------------------------------------

type ScoreBand = 'green' | 'blue' | 'amber' | 'grey'

function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'green'
  if (score >= 60) return 'blue'
  if (score >= 40) return 'amber'
  return 'grey'
}

/**
 * Inline hex fills — deliberately NOT Tailwind classes. Legacy MatchPillarBars
 * learned (the hard way) that Tailwind classes like `bg-success` can silently
 * fail to render when the component ships through different CSS bundles. Hex
 * fallbacks guarantee colour parity. Colours chosen to match the ≥80 / 60-79 /
 * 40-59 / <40 bands in the spec.
 */
function bandFillHex(band: ScoreBand): string {
  switch (band) {
    case 'green':
      return '#22c55e'
    case 'blue':
      return '#3b82f6'
    case 'amber':
      return '#f59e0b'
    case 'grey':
      return '#94a3b8'
  }
}

function bandRingClass(band: ScoreBand): string {
  switch (band) {
    case 'green':
      return 'border-emerald-500/50 bg-emerald-50 text-emerald-700'
    case 'blue':
      return 'border-blue-500/50 bg-blue-50 text-blue-700'
    case 'amber':
      return 'border-amber-500/50 bg-amber-50 text-amber-700'
    case 'grey':
      return 'border-border bg-muted/50 text-muted-foreground'
  }
}

// ---------------------------------------------------------------------------
// MatchScoreBadge — circular 0-100 indicator
// ---------------------------------------------------------------------------

function MatchScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score)
  return (
    <div
      role="img"
      aria-label={`Match score: ${score} out of 100`}
      className={cn(
        'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-full border-2 font-semibold leading-none',
        bandRingClass(band),
      )}
    >
      <span className="text-lg tabular-nums">{score}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider opacity-70">
        /100
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// MatchPillarBars — 6 horizontal mini-bars
// ---------------------------------------------------------------------------

const PILLAR_ORDER: Array<{
  key: keyof MatchBreakdown['pillars']
  label: string
  full: string
}> = [
  { key: 'thesis', label: 'Thesis', full: 'Thesis' },
  { key: 'geography', label: 'Geo', full: 'Geography' },
  { key: 'stage', label: 'Stage', full: 'Stage' },
  { key: 'cheque', label: 'Cheque', full: 'Cheque' },
  { key: 'activity', label: 'Activity', full: 'Activity' },
  { key: 'confidence', label: 'Confidence', full: 'Confidence' },
]

function MatchPillarBars({
  pillars,
  overallBand,
}: {
  pillars: MatchBreakdown['pillars']
  overallBand: ScoreBand
}) {
  const ariaLabel = `Pillar breakdown: ${PILLAR_ORDER.map(
    (p) => `${p.full} ${pillars[p.key] ?? 0}`,
  ).join(', ')}`
  const fill = bandFillHex(overallBand)
  return (
    <div role="img" aria-label={ariaLabel} className="grid grid-cols-6 gap-1.5">
      {PILLAR_ORDER.map(({ key, label, full }) => {
        const v = Math.max(0, Math.min(100, pillars[key] ?? 0))
        return (
          <div
            key={key}
            className="flex flex-col items-center gap-1"
            title={`${full}: ${v}`}
          >
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${v}%`, backgroundColor: fill }}
              />
            </div>
            <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground leading-none">
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card + view
// ---------------------------------------------------------------------------

type ScoredItem = {
  listing: ScoredListingRow
  breakdown: MatchBreakdown
  cached_score: number | null
}

type SortMode = 'score' | 'enriched' | 'az'

const SORT_OPTIONS: Array<{ value: SortMode; label: string }> = [
  { value: 'score', label: 'Match score (default)' },
  { value: 'enriched', label: 'Recently enriched' },
  { value: 'az', label: 'A–Z' },
]

function formatChequeRange(
  range: ScoredListingRow['highlights']['cheque_range_gbp'],
): string | null {
  if (!range) return null
  const { min, max } = range
  if (min == null && max == null) return null
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n)
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`
  if (min != null) return `${fmt(min)}+`
  if (max != null) return `up to ${fmt(max)}`
  return null
}

function MatchCard({
  item,
  alreadyInPipeline,
  isAdding,
  onAdd,
}: {
  item: ScoredItem
  alreadyInPipeline: boolean
  isAdding: boolean
  onAdd: (listingId: string) => void
}) {
  const { listing, breakdown } = item
  const band = scoreBand(breakdown.total)
  const chequeRange = formatChequeRange(listing.highlights.cheque_range_gbp)
  const stages = (listing.highlights.stage_focus ?? []).slice(0, 3)
  const sectors = (listing.highlights.sectors ?? []).slice(0, 3)
  const reasons = (breakdown.reasons ?? []).slice(0, 3)
  const loc = [listing.city, listing.country_iso ?? listing.country]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="flex h-full flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 py-5">
        {/* Header — logo + title + score */}
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {listing.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={listing.image_url}
                alt={`${listing.title ?? 'Investor'} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">
                {(listing.title ?? '?').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold" title={listing.title ?? ''}>
              {listing.title ?? 'Unnamed investor'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {listing.subcategory && (
                <Badge variant="secondary" size="sm">
                  {listing.subcategory}
                </Badge>
              )}
              {loc && <span className="text-xs text-muted-foreground">{loc}</span>}
              {listing.website_url && (
                <a
                  href={listing.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-international-orange hover:underline"
                >
                  Website <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <MatchScoreBadge score={breakdown.total} />
        </div>

        {/* Pillar bars */}
        <MatchPillarBars pillars={breakdown.pillars} overallBand={band} />

        {/* Top reasons */}
        {reasons.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {reasons.map((r) => (
              <Badge key={r} variant="outline" size="sm" className="font-normal">
                {r}
              </Badge>
            ))}
          </div>
        )}

        {/* Cheque / stages / sectors */}
        <dl className="grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-3">
          {chequeRange && (
            <div>
              <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                Cheque
              </dt>
              <dd className="mt-0.5 text-foreground">{chequeRange}</dd>
            </div>
          )}
          {stages.length > 0 && (
            <div>
              <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                Stages
              </dt>
              <dd className="mt-0.5 text-foreground">{stages.join(', ')}</dd>
            </div>
          )}
          {sectors.length > 0 && (
            <div>
              <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                Sectors
              </dt>
              <dd className="mt-0.5 text-foreground">{sectors.join(', ')}</dd>
            </div>
          )}
        </dl>

        {/* CTAs */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {alreadyInPipeline ? (
            <Button size="sm" variant="secondary" disabled>
              <Check className="mr-1 h-4 w-4" />
              Added
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-international-orange hover:bg-international-orange/90"
              disabled={isAdding}
              onClick={() => onAdd(listing.id)}
            >
              <Plus className="mr-1 h-4 w-4" />
              {isAdding ? 'Adding…' : 'Add to pipeline'}
            </Button>
          )}
          <Link href={`/money/raise/investor/${listing.id}`}>
            <Button size="sm" variant="ghost">
              View details
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

export function ForYouView({
  scored,
  thesisId,
  alreadyInPipelineIds,
}: {
  scored: ScoredItem[]
  thesisId: string
  alreadyInPipelineIds: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [sort, setSort] = useState<SortMode>('score')
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(
    () => new Set(alreadyInPipelineIds),
  )

  const sorted = useMemo(() => {
    const items = [...scored]
    if (sort === 'score') {
      items.sort((a, b) => b.breakdown.total - a.breakdown.total)
    } else if (sort === 'enriched') {
      items.sort((a, b) => {
        const ta = a.listing.last_enriched_at ? Date.parse(a.listing.last_enriched_at) : 0
        const tb = b.listing.last_enriched_at ? Date.parse(b.listing.last_enriched_at) : 0
        return tb - ta
      })
    } else {
      items.sort((a, b) =>
        (a.listing.title ?? '').localeCompare(b.listing.title ?? '', 'en-GB', {
          sensitivity: 'base',
        }),
      )
    }
    return items
  }, [scored, sort])

  // "Last updated" — freshest last_enriched_at in the set, else "just now".
  const lastUpdatedLabel = useMemo(() => {
    const stamps = scored
      .map((s) => s.listing.last_enriched_at)
      .filter((x): x is string => !!x)
      .map((s) => Date.parse(s))
      .filter((n) => Number.isFinite(n) && n > 0)
    if (stamps.length === 0) return 'just now'
    const mostRecent = Math.max(...stamps)
    const deltaMin = Math.max(0, Math.round((Date.now() - mostRecent) / 60_000))
    if (deltaMin < 1) return 'just now'
    if (deltaMin < 60) return `${deltaMin} min${deltaMin === 1 ? '' : 's'} ago`
    const hours = Math.round(deltaMin / 60)
    if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
    const days = Math.round(hours / 24)
    return `${days} day${days === 1 ? '' : 's'} ago`
  }, [scored])

  const handleAdd = (listingId: string) => {
    setAddingId(listingId)
    startTransition(async () => {
      const res = await addInvestorToPipeline({ marketplace_listing_id: listingId })
      setAddingId(null)
      if ('error' in res) {
        toast.error(res.error)
      } else {
        setPipelineIds((prev) => {
          const next = new Set(prev)
          next.add(listingId)
          return next
        })
        if (res.already_existed) {
          toast.info('Already in pipeline')
        } else {
          toast.success('Added to pipeline')
        }
        router.refresh()
      }
    })
  }

  if (sorted.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Your top investor matches</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Based on thesis · last updated {lastUpdatedLabel}
          </p>
        </header>
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="No matches yet"
              description="Try widening your thesis — more stages, sectors, or geographies — to pull in more candidates."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Link href="/money/raise/thesis">
                    <Button>Edit thesis</Button>
                  </Link>
                  <Link href="/money/raise/browse">
                    <Button variant="secondary">Browse all</Button>
                  </Link>
                </div>
              }
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Your top {sorted.length} investor matches
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Based on thesis · last updated {lastUpdatedLabel}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="foryou-sort" className="text-xs text-muted-foreground">
            Sort
          </label>
          <Select value={sort} onValueChange={(v) => setSort(v as SortMode)}>
            <SelectTrigger id="foryou-sort" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((item) => (
          <MatchCard
            key={item.listing.id}
            item={item}
            alreadyInPipeline={pipelineIds.has(item.listing.id)}
            isAdding={isPending && addingId === item.listing.id}
            onAdd={handleAdd}
          />
        ))}
      </div>

      <footer className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
        <span>Thesis version {thesisId.slice(0, 8)}</span>
        <Link href="/money/raise/thesis" className="text-international-orange hover:underline">
          Refine thesis →
        </Link>
      </footer>
    </div>
  )
}
