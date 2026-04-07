"use client"

/**
 * @file PortfolioCompanyDialog.tsx
 *
 * @description Reusable dialog showing all investors in a portfolio company.
 * Used from both PortfolioDirectoryTab and PortfolioSection.
 * Shows rich investor cards with firm type, fund size, city, and navigation.
 */

import { useState, useEffect } from "react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Briefcase, Building2, MapPin, Banknote } from "lucide-react"
import { getCompanyInvestors, type PortfolioCompanyInvestor } from "@/actions/portfolio"

interface PortfolioCompanyDialogProps {
  companyName: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function formatAmount(usd: number | null): string {
  if (!usd) return "—"
  if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`
  return `$${usd.toLocaleString()}`
}

function formatFundSize(gbp: number | undefined): string | null {
  if (!gbp) return null
  if (gbp >= 1_000_000_000) return `£${(gbp / 1_000_000_000).toFixed(1)}B`
  if (gbp >= 1_000_000) return `£${(gbp / 1_000_000).toFixed(0)}M`
  return `£${(gbp / 1_000).toFixed(0)}K`
}

export function PortfolioCompanyDialog({ companyName, open, onOpenChange }: PortfolioCompanyDialogProps) {
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

  const totalInvested = investors.reduce((sum, inv) => sum + (inv.amount_usd ?? 0), 0)

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
          {!isLoading && investors.length > 0 && (
            <DialogDescription>
              {investors.length} investor{investors.length !== 1 ? "s" : ""}
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
        ) : investors.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2 text-center">
            <div className="rounded-full bg-muted p-3">
              <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No investor records found</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            {investors.map((inv, idx) => (
              <div
                key={`${inv.listing_id}-${idx}`}
                className="group p-3 rounded-lg border border-border bg-card hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-international-orange/10 flex items-center justify-center mt-0.5">
                      <Building2 className="h-4 w-4 text-international-orange" />
                    </div>
                    <div className="min-w-0 flex-1">
                      {inv.listing_id ? (
                        <Link
                          href={`/investors/${inv.listing_id}`}
                          className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors"
                          onClick={() => onOpenChange(false)}
                        >
                          {inv.firm_name}
                        </Link>
                      ) : (
                        <span className="text-sm font-semibold text-foreground">{inv.firm_name}</span>
                      )}
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {inv.firm_type && (
                          <Badge variant="outline" className="text-xs">{inv.firm_type}</Badge>
                        )}
                        {inv.hq_city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <MapPin className="h-3 w-3" />
                            {inv.hq_city}
                          </span>
                        )}
                        {inv.fund_size_gbp != null && inv.fund_size_gbp > 0 && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Banknote className="h-3 w-3" />
                            {formatFundSize(inv.fund_size_gbp)}
                          </span>
                        )}
                      </div>
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
