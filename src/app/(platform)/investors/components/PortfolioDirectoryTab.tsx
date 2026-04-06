"use client"

/**
 * @file PortfolioDirectoryTab.tsx
 *
 * @description Portfolio companies directory tab for the Investors page.
 * Shows portfolio companies from investor_portfolio_companies table
 * (materialized from JSONB attributes during Forge Capital push).
 * Falls back to aggregating from marketplace_listings JSONB until
 * the materialized table is populated.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, X, Briefcase, Loader2, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"
import { searchPortfolioCompanies, type PortfolioCompanyResult } from "@/actions/portfolio"

export function PortfolioDirectoryTab() {
  const [companies, setCompanies] = useState<PortfolioCompanyResult[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [query, setQuery] = useState("")
  const [debouncedQuery, setDebouncedQuery] = useState("")
  const [sectorFilter, setSectorFilter] = useState("")
  const [page, setPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Fetch on filter change
  useEffect(() => {
    setIsLoading(true)
    setPage(1)
    searchPortfolioCompanies({ query: debouncedQuery || undefined, sector: sectorFilter || undefined, page: 1, pageSize: 50 })
      .then((result) => {
        setCompanies(result.companies)
        setTotal(result.total)
        setHasMore(result.hasMore)
      })
      .catch(console.error)
      .finally(() => setIsLoading(false))
  }, [debouncedQuery, sectorFilter])

  const handleLoadMore = useCallback(async () => {
    setIsLoadingMore(true)
    try {
      const nextPage = page + 1
      const result = await searchPortfolioCompanies({
        query: debouncedQuery || undefined,
        sector: sectorFilter || undefined,
        page: nextPage,
        pageSize: 50,
      })
      setCompanies((prev) => [...prev, ...result.companies])
      setHasMore(result.hasMore)
      setPage(nextPage)
    } catch (err) {
      console.error("[PortfolioDirectoryTab] Load more failed:", err)
    } finally {
      setIsLoadingMore(false)
    }
  }, [page, debouncedQuery, sectorFilter])

  const formatAmount = (usd: number | null) => {
    if (!usd) return "—"
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`
    return `$${usd.toLocaleString()}`
  }

  return (
    <div className="space-y-4">
      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="search"
            placeholder="Search portfolio companies..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9 pr-9"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <select
          value={sectorFilter}
          onChange={(e) => setSectorFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">All Sectors</option>
          {["AI", "Climate", "Deep Tech", "FinTech", "Hardware", "Health", "SaaS", "Enterprise", "Robotics"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Stats */}
      <p className="text-sm text-muted-foreground">
        {isLoading ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading...
          </span>
        ) : (
          <>
            Showing <span className="font-semibold text-foreground">{companies.length.toLocaleString()}</span>
            {" "}of <span className="font-semibold text-foreground">{total.toLocaleString()}</span> portfolio companies
          </>
        )}
      </p>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      ) : companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 space-y-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Briefcase className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-foreground">No portfolio companies found</p>
          <p className="text-sm text-muted-foreground">Try adjusting your search or filters.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Company</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Investors</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">Sector</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Stage</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Amount</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider hidden md:table-cell">Description</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company, idx) => (
                  <tr
                    key={`${company.listing_id}-${company.company_name}-${idx}`}
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="font-medium text-foreground">{company.company_name}</div>
                      {company.firm_name && company.firm_name !== '—' && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          by{' '}
                          {company.listing_id ? (
                            <Link href={`/investors/${company.listing_id}`} className="text-international-orange hover:underline" onClick={(e) => e.stopPropagation()}>
                              {company.firm_name}
                            </Link>
                          ) : company.firm_name}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <span className="font-medium text-foreground">{company.investor_count}</span>
                      {company.investor_count > 1 && (
                        <span className="text-xs text-muted-foreground ml-1">investors</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      {company.sector ? (
                        <Badge variant="outline" className="text-xs">{company.sector}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 hidden md:table-cell">
                      {company.stage ? (
                        <Badge variant="secondary" className="text-xs">{company.stage}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 hidden lg:table-cell tabular-nums text-foreground">
                      {formatAmount(company.amount_usd)}
                    </td>
                    <td className="py-3 px-3 max-w-sm">
                      <p className="text-muted-foreground line-clamp-1 text-xs">{company.description || "—"}</p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="secondary" onClick={handleLoadMore} disabled={isLoadingMore}>
                {isLoadingMore ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Loading...
                  </>
                ) : (
                  `Load more (${Math.max(0, total - companies.length).toLocaleString()} remaining)`
                )}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
