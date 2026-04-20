'use client'

/**
 * @file grants-view.tsx
 *
 * Non-dilutive funding directory. Reuses the legacy `searchGrants` action
 * from `@/actions/grants`. URL-backed state so back/forward and deep-links
 * work.
 *
 * Filter model:
 *  - q        server-side (title / managing_body / description; semantic if >=3 chars)
 *  - country  server-side (exact match on country column)
 *  - sector   client-side (substring, case-insens on sector_focus[]) — the
 *             action does not expose sector as a first-class filter
 *  - amount   client-side (range match on amount_min/max fields) — same
 *             reason; applies to the current page
 *
 * Deadline badge semantics:
 *   <14 days  → destructive
 *   <30 days  → warning
 *   <60 days  → secondary
 *   beyond    → no badge
 *   rolling   → info "Rolling deadline"
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Search,
  X,
  ExternalLink,
  Calendar,
  Globe,
  Banknote,
  Clock,
} from 'lucide-react'
import type { InvestorGrant } from '@/actions/grants'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InitialState = {
  q: string
  country: string
  sector: string
  amountMin: number | null
  amountMax: number | null
  page: number
  pageSize: number
}

type GrantsViewProps = {
  grants: InvestorGrant[]
  total: number
  hasMore: boolean
  initial: InitialState
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function buildQuery(args: {
  q: string
  country: string
  sector: string
  amountMin: number | null
  amountMax: number | null
  page: number
}): string {
  const params = new URLSearchParams()
  if (args.q) params.set('q', args.q)
  if (args.country) params.set('country', args.country)
  if (args.sector) params.set('sector', args.sector)
  if (args.amountMin != null) params.set('amount_min', String(args.amountMin))
  if (args.amountMax != null) params.set('amount_max', String(args.amountMax))
  if (args.page > 1) params.set('page', String(args.page))
  return params.toString()
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

/** Short GBP formatter: £50k, £2.3m */
function formatGbpShort(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(n)
}

/** Exact GBP formatter for tooltip: £50,000 */
function formatGbpExact(n: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n)
}

type AmountDisplay = { short: string; exact: string } | null

function formatAmountRange(min: number | null, max: number | null): AmountDisplay {
  if (min == null && max == null) return null
  if (min != null && max != null) {
    if (min === max) {
      return { short: formatGbpShort(min), exact: formatGbpExact(min) }
    }
    return {
      short: `${formatGbpShort(min)}–${formatGbpShort(max)}`,
      exact: `${formatGbpExact(min)} – ${formatGbpExact(max)}`,
    }
  }
  if (min != null) {
    return { short: `${formatGbpShort(min)}+`, exact: `${formatGbpExact(min)}+` }
  }
  // max != null
  return {
    short: `up to ${formatGbpShort(max!)}`,
    exact: `up to ${formatGbpExact(max!)}`,
  }
}

/** Convert 2-letter ISO code to flag emoji. Returns empty string for non-ISO. */
function countryFlagEmoji(country: string): string {
  const code = country.trim().toUpperCase()
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return ''
  const base = 127397 // regional-indicator-A offset from 'A'
  return String.fromCodePoint(code.charCodeAt(0) + base, code.charCodeAt(1) + base)
}

type DeadlineInfo =
  | { kind: 'none' }
  | { kind: 'rolling' }
  | { kind: 'dated'; date: Date; iso: string; daysLeft: number | null; label: string }

function parseDeadline(grant: InvestorGrant): DeadlineInfo {
  if (grant.deadline_type === 'rolling') return { kind: 'rolling' }
  if (!grant.deadline) return { kind: 'none' }
  const parsed = new Date(grant.deadline)
  if (isNaN(parsed.getTime())) {
    return {
      kind: 'dated',
      date: new Date(),
      iso: grant.deadline,
      daysLeft: null,
      label: grant.deadline,
    }
  }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dayMs = 1000 * 60 * 60 * 24
  const daysLeft = Math.floor((parsed.getTime() - today.getTime()) / dayMs)
  return {
    kind: 'dated',
    date: parsed,
    iso: parsed.toISOString().slice(0, 10),
    daysLeft,
    label: parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
  }
}

type DeadlineBadgeSpec = {
  variant: 'destructive' | 'warning' | 'secondary'
  text: string
} | null

function deadlineBadgeSpec(info: DeadlineInfo): DeadlineBadgeSpec {
  if (info.kind !== 'dated') return null
  if (info.daysLeft == null || info.daysLeft < 0) return null
  if (info.daysLeft < 14) {
    return {
      variant: 'destructive',
      text: info.daysLeft === 0 ? 'Closes today' : `${info.daysLeft}d left`,
    }
  }
  if (info.daysLeft < 30) return { variant: 'warning', text: `${info.daysLeft}d left` }
  if (info.daysLeft < 60) return { variant: 'secondary', text: `${info.daysLeft}d left` }
  return null
}

// ---------------------------------------------------------------------------
// Eligibility summary (expand/collapse)
// ---------------------------------------------------------------------------

const ELIGIBILITY_CUTOFF = 200

function EligibilitySummary({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  if (text.length <= ELIGIBILITY_CUTOFF) {
    return <p className="text-sm text-muted-foreground leading-relaxed">{text}</p>
  }
  return (
    <p className="text-sm text-muted-foreground leading-relaxed">
      {expanded ? text : `${text.slice(0, ELIGIBILITY_CUTOFF).trimEnd()}…`}{' '}
      <button
        type="button"
        onClick={() => setExpanded((s) => !s)}
        className="font-medium text-international-orange hover:underline"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </p>
  )
}

// ---------------------------------------------------------------------------
// Grant card
// ---------------------------------------------------------------------------

function GrantCard({ grant }: { grant: InvestorGrant }) {
  const amount = formatAmountRange(grant.amount_min_usd, grant.amount_max_usd)
  const deadline = parseDeadline(grant)
  const badge = deadlineBadgeSpec(deadline)
  const flag = grant.country ? countryFlagEmoji(grant.country) : ''
  const sectors = (grant.sector_focus ?? []).slice(0, 3)

  return (
    <article className="flex h-full flex-col rounded-lg border bg-card text-card-foreground transition-all">
      <CardContent className="flex flex-1 flex-col gap-3 py-5">
          {/* Header: title + country flag */}
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3
                className="text-base font-semibold leading-tight text-foreground"
                title={grant.grant_name}
              >
                {grant.grant_name}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {grant.managing_body && (
                  <span className="truncate" title={grant.managing_body}>
                    {grant.managing_body}
                  </span>
                )}
                {grant.managing_body && grant.country && <span aria-hidden="true">·</span>}
                {grant.country && (
                  <span className="inline-flex items-center gap-1">
                    {flag && (
                      <span aria-hidden="true" className="text-sm leading-none">
                        {flag}
                      </span>
                    )}
                    <span>{grant.country}</span>
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              {grant.equity_free && (
                <Badge variant="info" size="sm">
                  Equity-free
                </Badge>
              )}
              {!grant.actively_accepting && (
                <Badge variant="secondary" size="sm">
                  Closed
                </Badge>
              )}
            </div>
          </header>

          {/* Amount + deadline row */}
          <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
            {amount && (
              <div>
                <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="h-3 w-3" aria-hidden="true" />
                    Amount
                  </span>
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-foreground">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span tabIndex={0} className="cursor-help">
                          {amount.short}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span>{amount.exact}</span>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </dd>
              </div>
            )}
            <div>
              <dt className="font-medium uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3 w-3" aria-hidden="true" />
                  Deadline
                </span>
              </dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-foreground">
                {deadline.kind === 'rolling' && (
                  <Badge variant="info" size="sm">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Rolling
                  </Badge>
                )}
                {deadline.kind === 'dated' && (
                  <>
                    <time dateTime={deadline.iso}>{deadline.label}</time>
                    {badge && (
                      <Badge variant={badge.variant} size="sm">
                        {badge.text}
                      </Badge>
                    )}
                  </>
                )}
                {deadline.kind === 'none' && (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
            </div>
          </dl>

          {/* Eligibility */}
          {grant.eligibility_summary && (
            <div>
              <EligibilitySummary text={grant.eligibility_summary} />
            </div>
          )}

          {/* Sector chips */}
          {sectors.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {sectors.map((s) => (
                <Badge key={s} variant="outline" size="sm">
                  {s}
                </Badge>
              ))}
              {grant.sector_focus && grant.sector_focus.length > sectors.length && (
                <span className="text-xs text-muted-foreground">
                  +{grant.sector_focus.length - sectors.length}
                </span>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="mt-auto flex items-center gap-2 pt-2">
            {grant.application_url && (
              <Button size="sm" asChild>
                <a
                  href={grant.application_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply
                  <ExternalLink className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </Button>
            )}
            {grant.website && (
              <Button size="sm" variant="ghost" asChild>
                <a
                  href={grant.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Globe className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                  Website
                </a>
              </Button>
            )}
          </div>
      </CardContent>
    </article>
  )
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function GrantsView({ grants, total, hasMore, initial }: GrantsViewProps) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [country, setCountry] = useState(initial.country)
  const [sector, setSector] = useState(initial.sector)
  const [amountMin, setAmountMin] = useState<string>(
    initial.amountMin != null ? String(initial.amountMin) : '',
  )
  const [amountMax, setAmountMax] = useState<string>(
    initial.amountMax != null ? String(initial.amountMax) : '',
  )
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state aligned when server reloads change the URL.
  useEffect(() => {
    setQ(initial.q)
  }, [initial.q])
  useEffect(() => {
    setCountry(initial.country)
  }, [initial.country])
  useEffect(() => {
    setSector(initial.sector)
  }, [initial.sector])
  useEffect(() => {
    setAmountMin(initial.amountMin != null ? String(initial.amountMin) : '')
  }, [initial.amountMin])
  useEffect(() => {
    setAmountMax(initial.amountMax != null ? String(initial.amountMax) : '')
  }, [initial.amountMax])

  const pushUrl = (args: {
    q?: string
    country?: string
    sector?: string
    amountMin?: number | null
    amountMax?: number | null
    page?: number
  }) => {
    const qs = buildQuery({
      q: args.q ?? q,
      country: args.country ?? country,
      sector: args.sector ?? sector,
      amountMin:
        args.amountMin !== undefined
          ? args.amountMin
          : amountMin
            ? Math.max(0, Math.floor(Number(amountMin)))
            : null,
      amountMax:
        args.amountMax !== undefined
          ? args.amountMax
          : amountMax
            ? Math.max(0, Math.floor(Number(amountMax)))
            : null,
      page: args.page ?? 1,
    })
    router.push(`/money/raise/grants${qs ? `?${qs}` : ''}`)
  }

  // Debounced q — push URL 400ms after typing stops
  useEffect(() => {
    if (q === initial.q) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      pushUrl({ q, page: 1 })
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  // Build country options from the current page's country column. Pragmatic —
  // the action does not expose a country-list endpoint, so refinement is
  // limited to countries seen on this page plus the currently selected one.
  const countryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const g of grants) {
      if (g.country) set.add(g.country)
    }
    if (country) set.add(country)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'en-GB'))
  }, [grants, country])

  // Sector options from the current page's sector_focus arrays.
  const sectorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const g of grants) {
      for (const s of g.sector_focus ?? []) set.add(s)
    }
    if (sector) set.add(sector)
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'en-GB'))
  }, [grants, sector])

  // Client-side refinement: amount range + sector. Country and q are
  // server-side; they come pre-applied in `grants`.
  const filteredGrants = useMemo(() => {
    const minNum = amountMin ? Math.max(0, Math.floor(Number(amountMin))) : null
    const maxNum = amountMax ? Math.max(0, Math.floor(Number(amountMax))) : null
    const sectorLc = sector.toLowerCase()
    return grants.filter((g) => {
      // Amount range: a grant matches if its [grantMin, grantMax] overlaps the
      // user's [minNum, maxNum]. If either side of the grant range is null,
      // treat as open-ended on that side.
      if (minNum != null || maxNum != null) {
        const gMin = g.amount_min_usd
        const gMax = g.amount_max_usd
        if (gMin == null && gMax == null) return false
        const grantMin = gMin ?? 0
        const grantMax = gMax ?? Number.POSITIVE_INFINITY
        if (minNum != null && grantMax < minNum) return false
        if (maxNum != null && grantMin > maxNum) return false
      }
      // Sector substring match against any entry in sector_focus.
      if (sectorLc) {
        const sectors = g.sector_focus ?? []
        const hit = sectors.some((s) => s.toLowerCase().includes(sectorLc))
        if (!hit) return false
      }
      return true
    })
  }, [grants, amountMin, amountMax, sector])

  const hasFilters =
    q.length > 0 ||
    country.length > 0 ||
    sector.length > 0 ||
    amountMin.length > 0 ||
    amountMax.length > 0

  const clearAll = () => {
    setQ('')
    setCountry('')
    setSector('')
    setAmountMin('')
    setAmountMax('')
    router.push('/money/raise/grants')
  }

  const onSubmitFilters = () => {
    pushUrl({
      amountMin: amountMin ? Math.max(0, Math.floor(Number(amountMin))) : null,
      amountMax: amountMax ? Math.max(0, Math.floor(Number(amountMax))) : null,
      page: 1,
    })
  }

  const startIdx = (initial.page - 1) * initial.pageSize + 1
  const endIdx = startIdx + grants.length - 1
  const clientTrimmed = filteredGrants.length < grants.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Non-dilutive funding
          <span className="ml-2 text-base font-normal text-muted-foreground">
            · {total.toLocaleString('en-GB')} {total === 1 ? 'grant' : 'grants'}
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Search grants, innovation funding, and R&amp;D programmes — filter by
          country, sector, and cheque size. All figures shown in £.
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search grants, programmes, managing bodies…"
          className="h-11 pl-10 text-sm"
          aria-label="Search grants"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Filter row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="grants-country" className="text-xs text-muted-foreground">
            Country
          </Label>
          <select
            id="grants-country"
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              pushUrl({ country: e.target.value, page: 1 })
            }}
            className={cn(
              'mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            )}
          >
            <option value="">All countries</option>
            {countryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="grants-sector" className="text-xs text-muted-foreground">
            Sector
          </Label>
          <select
            id="grants-sector"
            value={sector}
            onChange={(e) => {
              setSector(e.target.value)
              pushUrl({ sector: e.target.value, page: 1 })
            }}
            className={cn(
              'mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            )}
          >
            <option value="">All sectors</option>
            {sectorOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="grants-amount-min" className="text-xs text-muted-foreground">
            Min amount (£)
          </Label>
          <Input
            id="grants-amount-min"
            type="number"
            min={0}
            inputMode="numeric"
            value={amountMin}
            onChange={(e) => setAmountMin(e.target.value)}
            onBlur={onSubmitFilters}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitFilters()
            }}
            placeholder="e.g. 50000"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="grants-amount-max" className="text-xs text-muted-foreground">
            Max amount (£)
          </Label>
          <Input
            id="grants-amount-max"
            type="number"
            min={0}
            inputMode="numeric"
            value={amountMax}
            onChange={(e) => setAmountMax(e.target.value)}
            onBlur={onSubmitFilters}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitFilters()
            }}
            placeholder="e.g. 500000"
            className="mt-1"
          />
        </div>
      </div>

      {/* Range / total summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {grants.length > 0
            ? `Showing ${startIdx.toLocaleString('en-GB')}–${endIdx.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')}`
            : 'No grants match those filters'}
          {clientTrimmed && (
            <span className="ml-2">
              (filtered to {filteredGrants.length.toLocaleString('en-GB')} on this page)
            </span>
          )}
        </span>
        <div className="flex items-center gap-3">
          {hasFilters && (
            <button
              type="button"
              onClick={clearAll}
              className="font-medium hover:text-international-orange hover:underline"
            >
              Clear all
            </button>
          )}
          <Link
            href="/money/raise"
            className="text-international-orange hover:underline"
          >
            Back to pipeline
          </Link>
        </div>
      </div>

      {/* Results */}
      {filteredGrants.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="No grants match — try broadening your search"
              description="Remove a filter, widen the amount range, or clear the search box."
              action={
                hasFilters ? (
                  <Button variant="secondary" size="sm" onClick={clearAll}>
                    Clear all filters
                  </Button>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredGrants.map((g) => (
            <GrantCard key={g.id} grant={g} />
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="secondary"
          disabled={initial.page <= 1}
          onClick={() => pushUrl({ page: initial.page - 1 })}
        >
          ← Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {initial.page.toLocaleString('en-GB')}
        </span>
        <Button
          variant="secondary"
          disabled={!hasMore}
          onClick={() => pushUrl({ page: initial.page + 1 })}
        >
          Next →
        </Button>
      </div>
    </div>
  )
}
