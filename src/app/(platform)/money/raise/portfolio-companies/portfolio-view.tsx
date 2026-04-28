'use client'

/**
 * @file portfolio-view.tsx
 *
 * Portfolio companies directory. Reuses the legacy `searchPortfolioCompanies`
 * action and `getCompanyInvestors` detail fetcher (see src/actions/portfolio.ts).
 *
 * Filter model:
 *  - q / sector         server-side
 *  - country            client-side (post-filter on investor HQ ISO code;
 *                        applied against investors loaded in the detail dialog)
 *  - investor_count_min client-side post-filter on the current page (the
 *                        action doesn't expose this as a first-class filter)
 *
 * UX:
 *  - Cards (not dense rows) — company name primary, investor chips secondary
 *  - Debounced search (400ms)
 *  - Detail dialog opens on card click, shows all investors + deep-links to
 *    each investor's /money/raise/investor/[id] page
 */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Search,
  X,
  Briefcase,
  Building2,
  MapPin,
  Banknote,
  Users,
} from 'lucide-react'
import {
  getCompanyInvestors,
  type PortfolioCompanyInvestor,
  type PortfolioCompanyResult,
} from '@/actions/portfolio'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InitialState = {
  q: string
  sector: string
  country: string
  investorCountMin: number | null
  page: number
  pageSize: number
}

type PortfolioViewProps = {
  companies: PortfolioCompanyResult[]
  /** Filter-matched deduped count (from the action). */
  total: number
  /** All-library deduped count (from count_unique_portfolio_companies RPC). */
  uniqueCompaniesTotal: number
  hasMore: boolean
  initial: InitialState
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function buildQuery(args: {
  q: string
  sector: string
  country: string
  investorCountMin: number | null
  page: number
}): string {
  const params = new URLSearchParams()
  if (args.q) params.set('q', args.q)
  if (args.sector) params.set('sector', args.sector)
  if (args.country) params.set('country', args.country)
  if (args.investorCountMin != null) {
    params.set('investor_count_min', String(args.investorCountMin))
  }
  if (args.page > 1) params.set('page', String(args.page))
  return params.toString()
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatAmount(usd: number | null): string {
  if (!usd) return '—'
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`
  return `$${usd.toLocaleString('en-GB')}`
}

function formatFundSize(gbp: number | undefined): string | null {
  if (!gbp) return null
  if (gbp >= 1_000_000_000) return `£${(gbp / 1_000_000_000).toFixed(1)}B`
  if (gbp >= 1_000_000) return `£${(gbp / 1_000_000).toFixed(0)}M`
  return `£${(gbp / 1_000).toFixed(0)}K`
}

const SECTOR_OPTIONS = [
  'AI',
  'Climate',
  'Deep Tech',
  'FinTech',
  'Hardware',
  'Health',
  'SaaS',
  'Enterprise',
  'Robotics',
]

// ---------------------------------------------------------------------------
// Detail dialog (inlined — reads getCompanyInvestors on open)
// ---------------------------------------------------------------------------

function PortfolioCompanyDetailDialog({
  companyName,
  open,
  onOpenChange,
  countryIso,
}: {
  companyName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Optional client-side country filter — hides investors whose HQ doesn't match. */
  countryIso: string
}) {
  const [investors, setInvestors] = useState<PortfolioCompanyInvestor[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!companyName || !open) return
    setIsLoading(true)
    getCompanyInvestors(companyName)
      .then((result) => setInvestors(result.investors))
      .catch(() => setInvestors([]))
      .finally(() => setIsLoading(false))
  }, [companyName, open])

  const filtered = useMemo(() => {
    if (!countryIso) return investors
    const needle = countryIso.toLowerCase()
    // GOTCHA: hq_city is a city name, not ISO. We best-effort match on the
    // investor-level record; when no country fields are present the filter
    // simply keeps the row rather than hiding signal the user expects to see.
    return investors.filter((inv) => {
      const city = (inv.hq_city ?? '').toLowerCase()
      return city ? city.includes(needle) : true
    })
  }, [investors, countryIso])

  const totalInvested = filtered.reduce((sum, inv) => sum + (inv.amount_usd ?? 0), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-international-orange/10 flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-international-orange" />
            </div>
            {companyName}
          </DialogTitle>
          {!isLoading && filtered.length > 0 && (
            <DialogDescription>
              {filtered.length} investor{filtered.length !== 1 ? 's' : ''}
              {totalInvested > 0 && ` · ${formatAmount(totalInvested)} total invested`}
            </DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
            <div className="rounded-full bg-muted p-3">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No investor records found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((inv, idx) => (
              <div
                key={`${inv.listing_id}-${idx}`}
                className="group p-3 rounded-lg border border-border bg-card transition-all hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-international-orange/10 flex items-center justify-center mt-0.5">
                      <Building2 className="h-4 w-4 text-international-orange" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {inv.listing_id ? (
                        <Link
                          href={`/money/raise/investor/${inv.listing_id}`}
                          className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors"
                          onClick={() => onOpenChange(false)}
                        >
                          {inv.firm_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">
                          {inv.firm_name}
                        </span>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {inv.firm_type && (
                          <Badge variant="outline" className="text-xs">
                            {inv.firm_type}
                          </Badge>
                        )}
                        {inv.hq_city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            {inv.hq_city}
                          </span>
                        )}
                        {inv.fund_size_gbp != null && inv.fund_size_gbp > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Banknote className="h-3 w-3" aria-hidden="true" />
                            {formatFundSize(inv.fund_size_gbp)}
                          </span>
                        )}
                      </div>
                      {inv.stage && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Stage: <span className="text-foreground">{inv.stage}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {inv.amount_usd != null && inv.amount_usd > 0 && (
                    <span className="text-sm font-semibold text-foreground tabular-nums flex-shrink-0">
                      {formatAmount(inv.amount_usd)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Company card
// ---------------------------------------------------------------------------

function PortfolioCompanyCard({
  company,
  onOpen,
}: {
  company: PortfolioCompanyResult
  onOpen: (name: string) => void
}) {
  const investorNames = company.investor_names.slice(0, 3)
  const extra = Math.max(0, company.investor_count - investorNames.length)

  return (
    <article
      className={cn(
        'flex h-full flex-col rounded-lg border bg-card text-card-foreground transition-all',
        'hover:border-international-orange/40 hover:shadow-sm cursor-pointer',
      )}
      onClick={() => onOpen(company.company_name)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(company.company_name)
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`Open detail for ${company.company_name}`}
    >
      <CardContent className="flex flex-1 flex-col gap-3 py-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3
              className="text-base font-semibold leading-tight text-foreground"
              title={company.company_name}
            >
              {company.company_name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {company.sector && (
                <Badge variant="outline" size="sm">
                  {company.sector}
                </Badge>
              )}
              {company.stage && (
                <Badge variant="secondary" size="sm">
                  {company.stage}
                </Badge>
              )}
              {company.amount_usd != null && company.amount_usd > 0 && (
                <span className="tabular-nums text-foreground">
                  {formatAmount(company.amount_usd)}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Badge variant="info" size="sm" className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" aria-hidden="true" />
              {company.investor_count}
            </Badge>
          </div>
        </header>

        {company.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">{company.description}</p>
        )}

        {/* Backed-by chips */}
        <div className="mt-auto space-y-1.5 pt-1">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Backed by {company.investor_count}{' '}
            {company.investor_count === 1 ? 'investor' : 'investors'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {investorNames.map((name) => (
              <Badge key={name} variant="outline" size="sm">
                {name}
              </Badge>
            ))}
            {extra > 0 && (
              <span className="text-xs text-international-orange hover:underline">
                +{extra} more
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </article>
  )
}

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export function PortfolioView({
  companies,
  total,
  uniqueCompaniesTotal,
  hasMore,
  initial,
}: PortfolioViewProps) {
  const router = useRouter()
  const [q, setQ] = useState(initial.q)
  const [sector, setSector] = useState(initial.sector)
  const [country, setCountry] = useState(initial.country)
  const [investorCountMin, setInvestorCountMin] = useState<string>(
    initial.investorCountMin != null ? String(initial.investorCountMin) : '',
  )
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep local state aligned when URL changes.
  useEffect(() => {
    setQ(initial.q)
  }, [initial.q])
  useEffect(() => {
    setSector(initial.sector)
  }, [initial.sector])
  useEffect(() => {
    setCountry(initial.country)
  }, [initial.country])
  useEffect(() => {
    setInvestorCountMin(
      initial.investorCountMin != null ? String(initial.investorCountMin) : '',
    )
  }, [initial.investorCountMin])

  const pushUrl = (args: {
    q?: string
    sector?: string
    country?: string
    investorCountMin?: number | null
    page?: number
  }) => {
    const qs = buildQuery({
      q: args.q ?? q,
      sector: args.sector ?? sector,
      country: args.country ?? country,
      investorCountMin:
        args.investorCountMin !== undefined
          ? args.investorCountMin
          : investorCountMin
            ? Math.max(1, Math.floor(Number(investorCountMin)))
            : null,
      page: args.page ?? 1,
    })
    router.push(`/money/raise/portfolio-companies${qs ? `?${qs}` : ''}`)
  }

  // Debounced q — push URL 400ms after typing stops.
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

  const onSubmitInvestorCountMin = () => {
    pushUrl({
      investorCountMin: investorCountMin
        ? Math.max(1, Math.floor(Number(investorCountMin)))
        : null,
      page: 1,
    })
  }

  // Client-side refinement on investor_count_min (legacy action has no such
  // first-class filter — spec explicitly permits page-local refinement).
  const filteredCompanies = useMemo(() => {
    const minNum = investorCountMin
      ? Math.max(1, Math.floor(Number(investorCountMin)))
      : null
    if (minNum == null) return companies
    return companies.filter((c) => c.investor_count >= minNum)
  }, [companies, investorCountMin])

  const hasFilters =
    q.length > 0 ||
    sector.length > 0 ||
    country.length > 0 ||
    investorCountMin.length > 0

  const clearAll = () => {
    setQ('')
    setSector('')
    setCountry('')
    setInvestorCountMin('')
    router.push('/money/raise/portfolio-companies')
  }

  const startIdx = (initial.page - 1) * initial.pageSize + 1
  const endIdx = startIdx + companies.length - 1
  const clientTrimmed = filteredCompanies.length < companies.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">
          Portfolio companies
          <span className="ml-2 text-base font-normal text-muted-foreground">
            · {uniqueCompaniesTotal.toLocaleString('en-GB')}{' '}
            {uniqueCompaniesTotal === 1 ? 'company' : 'companies'}
          </span>
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Deduplicated across every investor in our library. Each card shows who
          has backed the company — open a card to see the full investor list and
          deep-link into each firm&apos;s profile.
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
          placeholder="Search portfolio companies…"
          className="h-11 pl-10 text-sm"
          aria-label="Search portfolio companies"
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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <Label htmlFor="portfolio-sector" className="text-xs text-muted-foreground">
            Sector
          </Label>
          <select
            id="portfolio-sector"
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
            {SECTOR_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="portfolio-country" className="text-xs text-muted-foreground">
            Country (ISO or city)
          </Label>
          <Input
            id="portfolio-country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            onBlur={() => pushUrl({ country, page: 1 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') pushUrl({ country, page: 1 })
            }}
            placeholder="e.g. GB, London"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="portfolio-min-investors" className="text-xs text-muted-foreground">
            Min investor count
          </Label>
          <Input
            id="portfolio-min-investors"
            type="number"
            min={1}
            inputMode="numeric"
            value={investorCountMin}
            onChange={(e) => setInvestorCountMin(e.target.value)}
            onBlur={onSubmitInvestorCountMin}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmitInvestorCountMin()
            }}
            placeholder="e.g. 3"
            className="mt-1"
          />
        </div>
      </div>

      {/* Range / total summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {companies.length > 0
            ? `Showing ${startIdx.toLocaleString('en-GB')}–${endIdx.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} matches`
            : 'No companies match those filters'}
          {clientTrimmed && (
            <span className="ml-2">
              (filtered to {filteredCompanies.length.toLocaleString('en-GB')} on this page)
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
      {filteredCompanies.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <EmptyState
              icon={<Briefcase className="h-10 w-10" />}
              title="No portfolio companies match"
              description="Remove a filter, widen the minimum investor count, or clear the search box."
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
          {filteredCompanies.map((c, idx) => (
            <PortfolioCompanyCard
              key={`${c.company_name}-${idx}`}
              company={c}
              onOpen={setSelectedCompany}
            />
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

      {/* Detail dialog */}
      <PortfolioCompanyDetailDialog
        companyName={selectedCompany}
        open={!!selectedCompany}
        onOpenChange={(open) => {
          if (!open) setSelectedCompany(null)
        }}
        countryIso={country}
      />
    </div>
  )
}
