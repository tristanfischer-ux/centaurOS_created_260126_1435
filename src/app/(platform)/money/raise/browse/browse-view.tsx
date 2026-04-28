'use client'

/**
 * @file browse-view.tsx
 *
 * Rich browse view for the investor directory. Semantic search + multi-facet
 * filter panel (client-driven, pushed via URL state) + optional match-score
 * sort and badges when the foundry has an active thesis.
 */

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Search,
  Plus,
  Check,
  ExternalLink,
  X,
  Sparkles,
  LayoutGrid,
  Table as TableIcon,
  MapPin,
} from 'lucide-react'
import { addInvestorToPipeline } from '@/actions/money-raise'
import type { MatchBreakdown, RichInvestorFilters, ScoredListingRow } from '@/lib/money/match-types'
import type { SubscriptionTier } from '@/lib/billing/plans'
import { ExportMenu } from '@/app/(platform)/money/raise/_shared/export-menu'
import {
  CompareTray,
  MAX_COMPARE,
} from '@/app/(platform)/money/raise/_shared/compare-tray'
import { CompareDialog } from '@/app/(platform)/money/raise/_shared/compare-dialog'
import { InvestorTableView } from './table-view'
import { InvestorMapView } from './map-view'
import {
  FilterPanel,
  buildBrowseQuery,
  type BrowseFilterDraft,
  STAGE_OPTIONS,
  SECTOR_OPTIONS,
  FIRM_TYPE_OPTIONS,
  COUNTRY_OPTIONS,
} from './filter-panel'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// View mode — grid (default) | table | map. Drives a client-only render swap;
// the server fetches the same `results` array regardless.
// ---------------------------------------------------------------------------

type ViewMode = 'grid' | 'table' | 'map'

function parseViewMode(v: string | null | undefined): ViewMode {
  if (v === 'table' || v === 'map') return v
  return 'grid'
}

// ---------------------------------------------------------------------------
// MatchScoreBadge — duplicated from /money/raise/for-you per spec (the for-you
// view is owned by a separate agent and imports the badge inline; we copy the
// ~20 LOC here rather than reach across route boundaries).
// ---------------------------------------------------------------------------

type ScoreBand = 'green' | 'blue' | 'amber' | 'grey'

function scoreBand(score: number): ScoreBand {
  if (score >= 80) return 'green'
  if (score >= 60) return 'blue'
  if (score >= 40) return 'amber'
  return 'grey'
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

function MatchScoreBadge({ score }: { score: number }) {
  const band = scoreBand(score)
  return (
    <div
      role="img"
      aria-label={`Match score: ${score} out of 100`}
      className={cn(
        'flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-full border-2 font-semibold leading-none',
        bandRingClass(band),
      )}
    >
      <span className="text-base tabular-nums">{score}</span>
      <span className="mt-0.5 text-[8px] font-medium uppercase tracking-wider opacity-70">
        /100
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Types passed from the server page
// ---------------------------------------------------------------------------

type SortMode = 'match' | 'freshness' | 'az'

type InitialState = {
  q: string
  sort: SortMode
  page: number
  limit: number
  filters: RichInvestorFilters
  matchSortFellBackToFreshness: boolean
}

type BrowseViewProps = {
  results: ScoredListingRow[]
  total: number
  mode: 'semantic' | 'ilike'
  hasActiveThesis: boolean
  scoresByListingId: Record<string, { total: number; breakdown: MatchBreakdown }> | null
  alreadyInPipelineIds: string[]
  subcategories: readonly string[]
  /** Foundry subscription tier — drives the Explorer upgrade CTA + Pro badge. */
  currentTier: SubscriptionTier
  initial: InitialState
}

// ---------------------------------------------------------------------------
// Upgrade CTA card — injected into the results grid for Explorer users with
// > 25 total matches so they see what they're missing.
// ---------------------------------------------------------------------------

function BrowseUpgradeCta({ total }: { total: number }) {
  const moreCount = Math.max(0, total - 25)
  return (
    <Card className="flex h-full flex-col border-international-orange/40 bg-international-orange/5">
      <CardContent className="flex flex-1 flex-col justify-between gap-3 py-5">
        <div className="space-y-2">
          <Badge
            variant="outline"
            className="border-international-orange/60 bg-international-orange/10 text-international-orange"
          >
            Upgrade
          </Badge>
          <h3 className="text-base font-semibold text-foreground">
            Upgrade to Startup Team to see {moreCount.toLocaleString()} more{' '}
            {moreCount === 1 ? 'firm' : 'firms'}
          </h3>
          <p className="text-xs text-muted-foreground">
            150 investor profiles per month, verified emails, and portfolio intel across the
            full UK directory.
          </p>
        </div>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            asChild
            size="sm"
            className="bg-international-orange hover:bg-international-orange/90"
          >
            <Link href="/pricing?plan=starter">View Startup Team — £49/mo</Link>
          </Button>
          <p className="text-[11px] text-muted-foreground">No contracts. Cancel anytime.</p>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function richToDraft(filters: RichInvestorFilters): BrowseFilterDraft {
  return {
    subcategory: filters.subcategory ?? [],
    country: filters.country ?? [],
    stage: filters.stage ?? [],
    sector: filters.sector ?? [],
    firm_type: filters.firm_type ?? [],
    cheque_min:
      filters.cheque_min_cents != null ? Math.round(filters.cheque_min_cents / 100) : null,
    cheque_max:
      filters.cheque_max_cents != null ? Math.round(filters.cheque_max_cents / 100) : null,
  }
}

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

function labelForCountry(iso: string): string {
  return COUNTRY_OPTIONS.find((c) => c.value === iso)?.label ?? iso
}
function labelForStage(value: string): string {
  return STAGE_OPTIONS.find((s) => s.value === value)?.label ?? value
}
function labelForSector(value: string): string {
  return SECTOR_OPTIONS.find((s) => s.value === value)?.label ?? value
}
function labelForFirmType(value: string): string {
  return FIRM_TYPE_OPTIONS.find((s) => s.value === value)?.label ?? value
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

function InvestorCard({
  row,
  scoreEntry,
  showScore,
  alreadyInPipeline,
  isAdding,
  onAdd,
  isCompareSelected,
  onToggleCompare,
}: {
  row: ScoredListingRow
  scoreEntry: { total: number; breakdown: MatchBreakdown } | null
  showScore: boolean
  alreadyInPipeline: boolean
  isAdding: boolean
  onAdd: (listingId: string) => void
  isCompareSelected: boolean
  onToggleCompare: (listingId: string) => void
}) {
  const chequeRange = formatChequeRange(row.highlights.cheque_range_gbp)
  const stages = (row.highlights.stage_focus ?? []).slice(0, 3)
  const sectors = (row.highlights.sectors ?? []).slice(0, 3)
  const loc = [row.city, row.country_iso ?? row.country].filter(Boolean).join(' · ')

  return (
    <Card
      className={cn(
        'flex h-full flex-col',
        isCompareSelected && 'ring-2 ring-international-orange/60',
      )}
    >
      <CardContent className="flex flex-1 flex-col gap-3 py-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
            {row.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={row.image_url}
                alt={`${row.title ?? 'Investor'} logo`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-sm font-bold text-muted-foreground">
                {(row.title ?? '?').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold" title={row.title ?? ''}>
              {row.title ?? 'Unnamed investor'}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {row.subcategory && (
                <Badge variant="secondary" size="sm">
                  {row.subcategory}
                </Badge>
              )}
              {loc && <span className="text-xs text-muted-foreground">{loc}</span>}
              {row.website_url && (
                <a
                  href={row.website_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-0.5 text-xs text-international-orange hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Website <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          {showScore && scoreEntry && (
            <div className="flex flex-col items-end gap-1">
              <MatchScoreBadge score={scoreEntry.total} />
              <Badge
                variant="outline"
                size="sm"
                className="border-international-orange/40 bg-international-orange/5 text-[9px] uppercase tracking-wider text-international-orange"
                title="Match-score breakdowns unlock on Professional"
              >
                Pro
              </Badge>
            </div>
          )}
        </div>

        {row.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{row.description}</p>
        )}

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

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          {alreadyInPipeline ? (
            <Button size="sm" variant="secondary" disabled>
              <Check className="mr-1 h-4 w-4" />
              In pipeline
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-international-orange hover:bg-international-orange/90"
              disabled={isAdding}
              onClick={() => onAdd(row.id)}
            >
              <Plus className="mr-1 h-4 w-4" />
              {isAdding ? 'Adding…' : 'Add to pipeline'}
            </Button>
          )}
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={isCompareSelected ? 'secondary' : 'ghost'}
              onClick={() => onToggleCompare(row.id)}
              aria-pressed={isCompareSelected}
              aria-label={isCompareSelected ? 'Remove from compare' : 'Add to compare'}
            >
              {isCompareSelected ? 'In compare' : 'Compare'}
            </Button>
            <Link href={`/money/raise/investor/${row.id}`}>
              <Button size="sm" variant="ghost">
                View
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// ViewToggle — icon-button group for switching between grid/table/map. Used
// in the header row next to the sort select.
// ---------------------------------------------------------------------------

function ViewToggle({
  current,
  onChange,
}: {
  current: ViewMode
  onChange: (next: ViewMode) => void
}) {
  const options: Array<{ value: ViewMode; label: string; Icon: typeof LayoutGrid }> = [
    { value: 'grid', label: 'Grid', Icon: LayoutGrid },
    { value: 'table', label: 'Table', Icon: TableIcon },
    { value: 'map', label: 'Map', Icon: MapPin },
  ]
  return (
    <div
      role="group"
      aria-label="View mode"
      className="inline-flex rounded-md border border-border bg-background p-0.5"
    >
      {options.map(({ value, label, Icon }) => {
        const active = current === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            aria-pressed={active}
            aria-label={`${label} view`}
            title={`${label} view`}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors',
              'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              active
                ? 'bg-international-orange text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function BrowseInvestorsView({
  results,
  total,
  mode,
  hasActiveThesis,
  scoresByListingId,
  alreadyInPipelineIds,
  subcategories,
  currentTier,
  initial,
}: BrowseViewProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [addingId, setAddingId] = useState<string | null>(null)
  const [q, setQ] = useState(initial.q)
  const [pipelineIds, setPipelineIds] = useState<Set<string>>(
    () => new Set(alreadyInPipelineIds),
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // View mode (grid | table | map) — synced to the `view` URL param.
  const view = parseViewMode(searchParams?.get('view'))

  // Compare selection — pure client state. Stores whole rows so tray chips +
  // the compare dialog survive pagination (the server-provided `results`
  // array only contains the current page). Persisting via URL is out of
  // scope per the spec.
  const [comparedRows, setComparedRows] = useState<Map<string, ScoredListingRow>>(
    () => new Map(),
  )
  const [compareOpen, setCompareOpen] = useState(false)

  const comparedIds = useMemo(() => new Set(comparedRows.keys()), [comparedRows])
  const comparedList = useMemo(() => Array.from(comparedRows.values()), [comparedRows])

  const pushView = (next: ViewMode) => {
    // Preserve every other URL param; only mutate `view`.
    const params = new URLSearchParams(searchParams?.toString() ?? '')
    if (next === 'grid') {
      params.delete('view')
    } else {
      params.set('view', next)
    }
    const qs = params.toString()
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const toggleCompare = (id: string) => {
    setComparedRows((prev) => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_COMPARE) {
        const row = results.find((r) => r.id === id)
        if (row) next.set(id, row)
      } else {
        toast.info(`You can compare up to ${MAX_COMPARE} investors at once.`)
        return prev
      }
      return next
    })
  }

  const removeFromCompare = (id: string) => {
    setComparedRows((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  const clearCompare = () => setComparedRows(new Map())

  const openCompare = () => {
    if (comparedList.length < 2) {
      toast.info('Select at least 2 investors to compare.')
      return
    }
    setCompareOpen(true)
  }

  // Keep local `q` state aligned when server-side reloads change the URL.
  useEffect(() => {
    setQ(initial.q)
  }, [initial.q])

  const draft = useMemo<BrowseFilterDraft>(() => richToDraft(initial.filters), [initial.filters])

  // Debounced search — push URL after 400ms of no typing.
  useEffect(() => {
    if (q === initial.q) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const qs = buildBrowseQuery({
        q,
        sort: initial.sort,
        filters: draft,
        page: 1,
      })
      router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // intentionally omit `draft` / `initial.sort` deps — we only want this to
    // fire on q changes; other URL changes arrive as fresh renders already.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const pushSort = (next: SortMode) => {
    const qs = buildBrowseQuery({
      q,
      sort: next,
      filters: draft,
      page: 1,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const pushPage = (nextPage: number) => {
    const qs = buildBrowseQuery({
      q,
      sort: initial.sort,
      filters: draft,
      page: nextPage,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const clearFilterValue = (
    key: 'subcategory' | 'country' | 'stage' | 'sector' | 'firm_type',
    value: string,
  ) => {
    const next: BrowseFilterDraft = {
      ...draft,
      [key]: draft[key].filter((v) => v !== value),
    }
    const qs = buildBrowseQuery({
      q,
      sort: initial.sort,
      filters: next,
      page: 1,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const clearCheque = (which: 'cheque_min' | 'cheque_max') => {
    const next: BrowseFilterDraft = { ...draft, [which]: null }
    const qs = buildBrowseQuery({
      q,
      sort: initial.sort,
      filters: next,
      page: 1,
    })
    router.push(`/money/raise/browse${qs ? `?${qs}` : ''}`)
  }

  const clearAll = () => {
    router.push('/money/raise/browse')
  }

  const handleAdd = (listingId: string) => {
    setAddingId(listingId)
    startTransition(async () => {
      const res = await addInvestorToPipeline({ marketplace_listing_id: listingId })
      setAddingId(null)
      if ('error' in res) {
        toast.error(res.error)
        return
      }
      setPipelineIds((prev) => {
        const nextSet = new Set(prev)
        nextSet.add(listingId)
        return nextSet
      })
      if (res.already_existed) {
        toast.info('Already in pipeline')
      } else {
        toast.success('Added to pipeline')
      }
      router.refresh()
    })
  }

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    for (const v of draft.subcategory) {
      chips.push({
        key: `subcategory:${v}`,
        label: `Type: ${v}`,
        onRemove: () => clearFilterValue('subcategory', v),
      })
    }
    for (const v of draft.firm_type) {
      chips.push({
        key: `firm_type:${v}`,
        label: `Firm: ${labelForFirmType(v)}`,
        onRemove: () => clearFilterValue('firm_type', v),
      })
    }
    for (const v of draft.stage) {
      chips.push({
        key: `stage:${v}`,
        label: `Stage: ${labelForStage(v)}`,
        onRemove: () => clearFilterValue('stage', v),
      })
    }
    for (const v of draft.sector) {
      chips.push({
        key: `sector:${v}`,
        label: `Sector: ${labelForSector(v)}`,
        onRemove: () => clearFilterValue('sector', v),
      })
    }
    for (const v of draft.country) {
      chips.push({
        key: `country:${v}`,
        label: `Country: ${labelForCountry(v)}`,
        onRemove: () => clearFilterValue('country', v),
      })
    }
    if (draft.cheque_min != null) {
      chips.push({
        key: `cheque_min`,
        label: `Min cheque £${draft.cheque_min.toLocaleString('en-GB')}`,
        onRemove: () => clearCheque('cheque_min'),
      })
    }
    if (draft.cheque_max != null) {
      chips.push({
        key: `cheque_max`,
        label: `Max cheque £${draft.cheque_max.toLocaleString('en-GB')}`,
        onRemove: () => clearCheque('cheque_max'),
      })
    }
    return chips
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  const startIdx = (initial.page - 1) * initial.limit + 1
  const endIdx = startIdx + results.length - 1
  const hasMore = initial.page * initial.limit < total
  const showMatchBadges = hasActiveThesis && scoresByListingId != null
  // Explorer-tier monetisation CTA: only on page 1, only when there's headroom
  // above the 25-row free view, only for free tier. Shown AFTER the 25 cards.
  const showExplorerUpgradeCta =
    currentTier === 'free' && initial.page === 1 && total > 25 && results.length > 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Browse investors</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? 'firm' : 'firms'}
            <span className="mx-2 opacity-60">·</span>
            <span className="inline-flex items-center gap-1">
              mode:&nbsp;
              <span className="font-medium">
                {mode === 'semantic' ? 'semantic search' : 'keyword match'}
              </span>
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle current={view} onChange={pushView} />
          <Label htmlFor="browse-sort" className="text-xs text-muted-foreground">
            Sort
          </Label>
          <Select value={initial.sort} onValueChange={(v) => pushSort(v as SortMode)}>
            <SelectTrigger id="browse-sort" className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="match" disabled={!hasActiveThesis}>
                Match score{!hasActiveThesis ? ' (need thesis)' : ''}
              </SelectItem>
              <SelectItem value="freshness">Most recently enriched</SelectItem>
              <SelectItem value="az">A–Z</SelectItem>
            </SelectContent>
          </Select>
          <ExportMenu
            kind="browse"
            currentTier={currentTier}
            context={{
              query: initial.q,
              filters: initial.filters,
              includeMatchScore: hasActiveThesis,
            }}
          />
        </div>
      </header>

      {/* Thesis-required banner */}
      {initial.matchSortFellBackToFreshness && (
        <div className="flex items-start gap-3 rounded-md border border-amber-400/50 bg-amber-50 p-3 text-sm text-amber-900">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            Build a thesis on{' '}
            <Link
              href="/money/raise/thesis"
              className="font-medium underline decoration-amber-600/50 underline-offset-2 hover:text-amber-950"
            >
              /money/raise/thesis
            </Link>{' '}
            to sort by match score. Showing most recently enriched instead.
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search investors by thesis, ICP, sector, keyword…"
          className="h-11 pl-10 text-sm"
          aria-label="Search investors"
        />
      </div>

      {/* Grid — filter sidebar + results */}
      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        <FilterPanel
          initialFilters={draft}
          subcategories={subcategories}
          currentQuery={q}
          currentSort={initial.sort}
        />

        <div className="space-y-4">
          {/* Active-filter chips */}
          {activeChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeChips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={c.onRemove}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1 text-xs text-foreground hover:border-international-orange hover:text-international-orange"
                  aria-label={`Remove filter: ${c.label}`}
                >
                  {c.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-international-orange hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Range / total summary */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {results.length > 0
                ? `Showing ${startIdx}–${endIdx} of ${total.toLocaleString()}`
                : 'No results for those filters'}
            </span>
            <Link href="/money/raise" className="text-international-orange hover:underline">
              Back to pipeline
            </Link>
          </div>

          {/* Results — render swap based on selected view mode. */}
          {results.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon={<Search className="h-10 w-10" />}
                  title="No investors match your filters"
                  description="Try broadening your search or removing a filter."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={clearAll}
                      disabled={activeChips.length === 0 && !q}
                    >
                      Clear all filters
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : view === 'table' ? (
            <InvestorTableView
              results={results}
              hasActiveThesis={hasActiveThesis}
              scoresByListingId={scoresByListingId}
              currentTier={currentTier}
              onToggleCompare={toggleCompare}
              comparedIds={comparedIds}
            />
          ) : view === 'map' ? (
            <InvestorMapView results={results} />
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {results.map((row) => {
                  const scoreEntry = scoresByListingId?.[row.id] ?? null
                  return (
                    <InvestorCard
                      key={row.id}
                      row={row}
                      scoreEntry={scoreEntry}
                      showScore={showMatchBadges}
                      alreadyInPipeline={pipelineIds.has(row.id)}
                      isAdding={isPending && addingId === row.id}
                      onAdd={handleAdd}
                      isCompareSelected={comparedIds.has(row.id)}
                      onToggleCompare={toggleCompare}
                    />
                  )
                })}
              </div>
              {showExplorerUpgradeCta && (
                <div className="pt-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <div className="md:col-span-2 xl:col-span-3">
                      <BrowseUpgradeCta total={total} />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              disabled={initial.page <= 1}
              onClick={() => pushPage(initial.page - 1)}
            >
              ← Previous
            </Button>
            <span className="text-xs text-muted-foreground">Page {initial.page}</span>
            <Button
              variant="secondary"
              disabled={!hasMore}
              onClick={() => pushPage(initial.page + 1)}
            >
              Next →
            </Button>
          </div>
        </div>
      </div>

      {/* Compare tray — sticky bottom bar, shown when ≥1 investor selected. */}
      <CompareTray
        investors={comparedList}
        onRemove={removeFromCompare}
        onClear={clearCompare}
        onCompare={openCompare}
      />

      {/* Compare dialog — rendered only when open + ≥2 selected. */}
      <CompareDialog
        open={compareOpen}
        investors={comparedList}
        scoresByListingId={scoresByListingId}
        onClose={() => setCompareOpen(false)}
      />
    </div>
  )
}
