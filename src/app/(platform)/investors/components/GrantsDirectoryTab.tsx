/**
 * @file GrantsDirectoryTab.tsx
 *
 * @description Dense table view of non-dilutive funding grants (3,042 records).
 * Features text search with 300ms debounce, country filter dropdown, active-only
 * toggle, row-click detail dialog, and load-more pagination.
 *
 * FLOW: Rendered inside InvestorPageTabs when the Grants tab is active.
 */

"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  Search,
  CheckCircle2,
  X,
  ExternalLink,
  ChevronDown,
  Loader2,
  FileText,
  Globe,
  Calendar,
  Building2,
  DollarSign,
  ShieldCheck,
  Users,
  Clock,
  Filter,
} from "lucide-react"
import { searchGrants, getGrantStats } from "@/actions/grants"
import type { InvestorGrant, GrantSearchFilters } from "@/actions/grants"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

/** Format a USD amount, or return null if not set */
function formatUSD(amount: number | null): string | null {
  if (amount == null) return null
  return currencyFormatter.format(amount)
}

/** Format an amount range like "$50,000 - $500,000" */
function formatAmountRange(min: number | null, max: number | null): string {
  const fMin = formatUSD(min)
  const fMax = formatUSD(max)
  if (fMin && fMax) return `${fMin} – ${fMax}`
  if (fMin) return `${fMin}+`
  if (fMax) return `Up to ${fMax}`
  return "—"
}

/** Quality score color: green 7+, amber 4-6, red <4 */
function qualityColor(score: number): string {
  if (score >= 7) return "bg-success"
  if (score >= 4) return "bg-warning"
  return "bg-destructive"
}

/** Quality text color for the number label */
function qualityTextColor(score: number): string {
  if (score >= 7) return "text-success"
  if (score >= 4) return "text-warning"
  return "text-destructive"
}

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-md" />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 space-y-4">
      <div className="rounded-full bg-muted p-4">
        <FileText className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="text-center space-y-1.5">
        <h3 className="text-base font-semibold text-foreground">
          {hasFilters ? "No grants match your filters" : "No grants found"}
        </h3>
        <p className="text-sm text-muted-foreground max-w-sm">
          {hasFilters
            ? "Try broadening your search or adjusting your filters."
            : "Grant data is being loaded. Check back shortly."}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Grant Detail Dialog
// ---------------------------------------------------------------------------

function GrantDetailDialog({
  grant,
  open,
  onOpenChange,
}: {
  grant: InvestorGrant | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!grant) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="text-xl pr-8">{grant.grant_name}</DialogTitle>
          <DialogDescription className="flex items-center gap-2 pt-1">
            {grant.managing_body && (
              <span className="text-muted-foreground">{grant.managing_body}</span>
            )}
            {grant.country && (
              <>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground">{grant.country}</span>
              </>
            )}
          </DialogDescription>
          <div className="pt-2">
            {grant.actively_accepting ? (
              <Badge variant="success" size="sm">Accepting Applications</Badge>
            ) : (
              <Badge variant="secondary" size="sm">Closed</Badge>
            )}
            {grant.equity_free && (
              <Badge variant="info" size="sm" className="ml-2">Equity-Free</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* Description */}
          {grant.description && (
            <p className="text-sm text-muted-foreground leading-relaxed">
              {grant.description}
            </p>
          )}

          {/* Grant Details */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-international-orange" />
              Grant Details
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <DetailRow label="Amount Range" value={formatAmountRange(grant.amount_min_usd, grant.amount_max_usd)} />
              <DetailRow label="Total Pool" value={formatUSD(grant.total_pool_usd) ?? "—"} />
              <DetailRow label="Country" value={grant.country ?? "—"} />
              <DetailRow label="Region" value={grant.region ?? "—"} />
              {grant.sector_focus && grant.sector_focus.length > 0 && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Sector Focus:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {grant.sector_focus.map(s => (
                      <Badge key={s} variant="outline" size="sm">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {grant.stage_focus && grant.stage_focus.length > 0 && (
                <div className="sm:col-span-2">
                  <span className="text-muted-foreground">Stage Focus:</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {grant.stage_focus.map(s => (
                      <Badge key={s} variant="outline" size="sm">{s}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {(grant.trl_min != null || grant.trl_max != null) && (
                <DetailRow
                  label="TRL Range"
                  value={
                    grant.trl_min != null && grant.trl_max != null
                      ? `TRL ${grant.trl_min} – ${grant.trl_max}`
                      : grant.trl_min != null
                        ? `TRL ${grant.trl_min}+`
                        : `Up to TRL ${grant.trl_max}`
                  }
                />
              )}
              <DetailRow
                label="Equity Free"
                value={grant.equity_free ? "Yes" : "No"}
              />
            </div>
          </div>

          {/* Eligibility */}
          {(grant.eligibility_summary || grant.company_size_max || grant.company_age_max_years || grant.cofunding_pct != null) && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-international-orange" />
                Eligibility
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {grant.eligibility_summary && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground">Summary:</span>
                    <p className="text-foreground mt-1">{grant.eligibility_summary}</p>
                  </div>
                )}
                {grant.company_size_max != null && (
                  <DetailRow label="Max Company Size" value={`${grant.company_size_max.toLocaleString()} employees`} />
                )}
                {grant.company_age_max_years != null && (
                  <DetailRow label="Max Company Age" value={`${grant.company_age_max_years} years`} />
                )}
                {grant.cofunding_pct != null && (
                  <DetailRow label="Co-funding Required" value={`${grant.cofunding_pct}%`} />
                )}
              </div>
            </div>
          )}

          {/* Deadline */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Calendar className="h-4 w-4 text-international-orange" />
              Deadline
            </h4>
            <div className="text-sm">
              {grant.deadline_type === "rolling" ? (
                <Badge variant="info" size="sm">Rolling Deadline</Badge>
              ) : grant.deadline ? (
                <span className="text-foreground">{grant.deadline}</span>
              ) : (
                <span className="text-muted-foreground">Not specified</span>
              )}
              {grant.deadline_type && grant.deadline_type !== "rolling" && (
                <span className="text-muted-foreground ml-2">({grant.deadline_type})</span>
              )}
            </div>
          </div>

          {/* Deep profile */}
          {grant.deep_profile && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-international-orange" />
                Deep Profile
              </h4>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {grant.deep_profile}
              </p>
            </div>
          )}

          {/* Quality score */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Data Quality</span>
              <span className={cn("font-semibold", qualityTextColor(grant.data_quality_score))}>
                {grant.data_quality_score.toFixed(1)} / 10
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", qualityColor(grant.data_quality_score))}
                style={{ width: `${Math.min(100, (grant.data_quality_score / 10) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Footer links */}
        <DialogFooter className="pt-2 gap-2 sm:gap-2">
          {grant.website && (
            <Button variant="secondary" size="sm" asChild>
              <a href={grant.website} target="_blank" rel="noopener noreferrer">
                <Globe className="h-4 w-4 mr-1.5" />
                Website
              </a>
            </Button>
          )}
          {grant.application_url && (
            <Button size="sm" asChild>
              <a href={grant.application_url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-1.5" />
                Apply
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Simple key-value row for the detail dialog */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground ml-1.5 font-medium">{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function GrantsDirectoryTab() {
  // Data state
  const [grants, setGrants] = useState<InvestorGrant[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Filter state
  const [query, setQuery] = useState("")
  const [activeOnly, setActiveOnly] = useState(true)
  const [selectedCountry, setSelectedCountry] = useState("")
  const [page, setPage] = useState(1)

  // Stats for country dropdown
  const [countries, setCountries] = useState<{ name: string; count: number }[]>([])
  const [statsTotal, setStatsTotal] = useState(0)
  const [statsActive, setStatsActive] = useState(0)

  // Detail dialog
  const [selectedGrant, setSelectedGrant] = useState<InvestorGrant | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Debounce ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // INTENT: Fetch stats once on mount for country dropdown + summary
  useEffect(() => {
    getGrantStats().then(stats => {
      setCountries(stats.countries)
      setStatsTotal(stats.total)
      setStatsActive(stats.activeCount)
    }).catch(err => {
      console.error("[GrantsDirectoryTab] Failed to fetch stats:", err)
    })
  }, [])

  // INTENT: Fetch grants when filters change (debounced for query, immediate for toggles)
  const fetchGrants = useCallback(async (filters: GrantSearchFilters, append = false) => {
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
    }

    try {
      const result = await searchGrants(filters)
      if (append) {
        setGrants(prev => [...prev, ...result.grants])
      } else {
        setGrants(result.grants)
      }
      setTotal(result.total)
      setHasMore(result.hasMore)
    } catch (err) {
      console.error("[GrantsDirectoryTab] Search failed:", err)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  // FLOW: Trigger search when query/filters change (debounce query input)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(() => {
      setPage(1)
      fetchGrants({
        query: query || undefined,
        country: selectedCountry || undefined,
        activeOnly,
        page: 1,
        pageSize: 50,
      })
    }, 300)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, activeOnly, selectedCountry, fetchGrants])

  // Load more handler
  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchGrants(
      {
        query: query || undefined,
        country: selectedCountry || undefined,
        activeOnly,
        page: nextPage,
        pageSize: 50,
      },
      true,
    )
  }

  const handleRowClick = (grant: InvestorGrant) => {
    setSelectedGrant(grant)
    setDialogOpen(true)
  }

  const hasFilters = query.length > 0 || selectedCountry !== "" || !activeOnly

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground">{statsTotal.toLocaleString()}</span> grants
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-success">{statsActive.toLocaleString()}</span> accepting
        </span>
        <span>·</span>
        <span>
          <span className="font-semibold text-foreground">{countries.length}</span> countries
        </span>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        {/* Search input */}
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search grants, organisations..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="pl-9 pr-8"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Country dropdown */}
        <div className="relative">
          <select
            value={selectedCountry}
            onChange={e => setSelectedCountry(e.target.value)}
            className={cn(
              "h-10 rounded-md border border-input bg-background px-3 pr-8 text-sm text-foreground",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "appearance-none cursor-pointer",
            )}
            aria-label="Filter by country"
          >
            <option value="">All Countries</option>
            {countries.map(c => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        </div>

        {/* Active toggle */}
        <Button
          variant={activeOnly ? "default" : "secondary"}
          size="sm"
          onClick={() => setActiveOnly(!activeOnly)}
          className="shrink-0"
        >
          <Filter className="h-4 w-4 mr-1.5" />
          Accepting Applications
        </Button>
      </div>

      {/* Results count */}
      {!loading && (
        <p className="text-xs text-muted-foreground">
          Showing {grants.length.toLocaleString()} of {total.toLocaleString()} results
        </p>
      )}

      {/* Table */}
      {loading ? (
        <TableSkeleton />
      ) : grants.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Grant Name</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Managing Body</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Country</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Amount Range</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Deadline</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">Sector Focus</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Equity Free</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground w-24">Quality</th>
              </tr>
            </thead>
            <tbody>
              {grants.map(grant => (
                <tr
                  key={grant.id}
                  onClick={() => handleRowClick(grant)}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  {/* Grant Name */}
                  <td className="px-4 py-3">
                    <div className="font-semibold text-foreground leading-tight">
                      {grant.grant_name}
                    </div>
                    {/* INTENT: Show managing body on mobile since column is hidden */}
                    <div className="text-xs text-muted-foreground mt-0.5 lg:hidden">
                      {grant.managing_body ?? "—"}
                    </div>
                  </td>

                  {/* Managing Body */}
                  <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell max-w-[200px] truncate">
                    {grant.managing_body ?? "—"}
                  </td>

                  {/* Country */}
                  <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                    {grant.country ?? "—"}
                  </td>

                  {/* Amount Range */}
                  <td className="px-4 py-3 text-foreground font-medium hidden lg:table-cell whitespace-nowrap">
                    {formatAmountRange(grant.amount_min_usd, grant.amount_max_usd)}
                  </td>

                  {/* Deadline */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    {grant.deadline_type === "rolling" ? (
                      <Badge variant="info" size="sm">
                        <Clock className="h-3 w-3" />
                        Rolling
                      </Badge>
                    ) : grant.deadline ? (
                      <span className="text-muted-foreground">{grant.deadline}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Sector Focus */}
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <div className="flex items-center gap-1 flex-wrap">
                      {grant.sector_focus && grant.sector_focus.length > 0 ? (
                        <>
                          {grant.sector_focus.slice(0, 2).map(s => (
                            <Badge key={s} variant="outline" size="sm">{s}</Badge>
                          ))}
                          {grant.sector_focus.length > 2 && (
                            <span className="text-xs text-muted-foreground ml-0.5">
                              +{grant.sector_focus.length - 2}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>

                  {/* Equity Free */}
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    {grant.equity_free ? (
                      <CheckCircle2 className="h-4 w-4 text-success mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground mx-auto" />
                    )}
                  </td>

                  {/* Quality */}
                  <td className="px-4 py-3 w-24">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn("h-full rounded-full", qualityColor(grant.data_quality_score))}
                          style={{ width: `${Math.min(100, (grant.data_quality_score / 10) * 100)}%` }}
                        />
                      </div>
                      <span className={cn("text-xs font-medium tabular-nums", qualityTextColor(grant.data_quality_score))}>
                        {grant.data_quality_score.toFixed(0)}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Load more */}
      {hasMore && !loading && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Load More Grants
          </Button>
        </div>
      )}

      {/* Detail dialog */}
      <GrantDetailDialog
        grant={selectedGrant}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  )
}
