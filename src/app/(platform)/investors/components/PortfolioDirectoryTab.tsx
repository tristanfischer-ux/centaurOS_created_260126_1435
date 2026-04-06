"use client"

/**
 * @file PortfolioDirectoryTab.tsx
 *
 * @description Portfolio companies directory tab for the Investors page.
 * Shows portfolio companies from investor_portfolio_companies table.
 * Clicking a company opens a dialog showing all investors who invested in it.
 */

import { useState, useCallback, useEffect, useRef } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Search, X, Briefcase, Loader2, Building2 } from "lucide-react"
import Link from "next/link"
import { searchPortfolioCompanies, getCompanyInvestors, type PortfolioCompanyResult, type PortfolioCompanyInvestor } from "@/actions/portfolio"

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

  // Detail dialog state
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)
  const [companyInvestors, setCompanyInvestors] = useState<PortfolioCompanyInvestor[]>([])
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

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

  const handleRowClick = useCallback(async (companyName: string) => {
    setSelectedCompany(companyName)
    setIsLoadingDetail(true)
    try {
      const result = await getCompanyInvestors(companyName)
      setCompanyInvestors(result.investors)
    } catch (err) {
      console.error("[PortfolioDirectoryTab] Failed to load investors:", err)
      setCompanyInvestors([])
    } finally {
      setIsLoadingDetail(false)
    }
  }, [])

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
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => handleRowClick(company.company_name)}
                  >
                    <td className="py-3 px-3">
                      <div className="font-medium text-foreground hover:text-international-orange transition-colors">{company.company_name}</div>
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
                      <span className="text-xs text-muted-foreground ml-1">{company.investor_count === 1 ? 'investor' : 'investors'}</span>
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
                    <td className="py-3 px-3 max-w-sm hidden md:table-cell">
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

      {/* Company Detail Dialog */}
      <Dialog open={!!selectedCompany} onOpenChange={(open) => { if (!open) setSelectedCompany(null) }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-international-orange" />
              {selectedCompany}
            </DialogTitle>
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="space-y-3 py-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded" />
              ))}
            </div>
          ) : companyInvestors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No investor records found.</p>
          ) : (
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-muted-foreground mb-3">
                {companyInvestors.length} investor{companyInvestors.length !== 1 ? 's' : ''} in this company
              </p>
              {companyInvestors.map((inv, idx) => (
                <div
                  key={`${inv.listing_id}-${idx}`}
                  className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-international-orange/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-international-orange" />
                    </div>
                    <div className="min-w-0">
                      {inv.listing_id ? (
                        <Link
                          href={`/investors/${inv.listing_id}`}
                          className="text-sm font-medium text-foreground hover:text-international-orange transition-colors"
                          onClick={() => setSelectedCompany(null)}
                        >
                          {inv.firm_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-medium text-foreground">{inv.firm_name}</span>
                      )}
                      {inv.stage && (
                        <span className="text-xs text-muted-foreground ml-2">{inv.stage}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-sm tabular-nums text-foreground flex-shrink-0">
                    {formatAmount(inv.amount_usd)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
