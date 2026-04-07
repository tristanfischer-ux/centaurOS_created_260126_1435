"use client"

/**
 * @file PortfolioSection.tsx
 *
 * @description Grid of portfolio companies with sector, stage, and amount.
 * Renders as a card section within the investor detail page.
 * Clicking a company opens PortfolioCompanyDialog to see all investors.
 * Optionally highlights portfolio companies matching the user's sector.
 */

import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Briefcase, Sparkles } from 'lucide-react'
import { PortfolioCompanyDialog } from './PortfolioCompanyDialog'

interface PortfolioCompany {
  company_name: string
  sector?: string | null
  stage?: string | null
  amount_usd?: number | null
  description?: string | null
  why_appealing?: string | null
}

interface PortfolioSectionProps {
  companies: PortfolioCompany[]
  /** User's sector for portfolio overlap highlighting (professional+) */
  userSector?: string
}

// INTENT: Portfolio amounts are stored in USD (amount_usd) — source data currency.
// Display with explicit "USD" suffix so users don't confuse with GBP fund sizes elsewhere.
function formatAmount(usd: number): string {
  if (usd >= 1_000_000) {
    const m = usd / 1_000_000
    return `$${m % 1 === 0 ? m : m.toFixed(1)}M USD`
  }
  if (usd >= 1_000) {
    return `$${Math.round(usd / 1_000)}K USD`
  }
  return `$${usd.toLocaleString()} USD`
}

function isSectorMatch(companySector: string | null | undefined, userSector: string): boolean {
  if (!companySector) return false
  const lower = companySector.toLowerCase()
  const userLower = userSector.toLowerCase()
  return lower.includes(userLower) || userLower.includes(lower)
}

export function PortfolioSection({ companies, userSector }: PortfolioSectionProps) {
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null)

  if (companies.length === 0) return null

  // Sort matching companies to top when userSector is provided
  const sorted = userSector
    ? [...companies].sort((a, b) => {
        const aMatch = isSectorMatch(a.sector, userSector) ? 1 : 0
        const bMatch = isSectorMatch(b.sector, userSector) ? 1 : 0
        return bMatch - aMatch
      })
    : companies

  const matchCount = userSector
    ? sorted.filter(c => isSectorMatch(c.sector, userSector)).length
    : 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            Portfolio ({companies.length})
          </h2>
          {matchCount > 0 && (
            <span className="text-xs text-success flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {matchCount} of {companies.length} in your sector
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sorted.map((company, i) => {
            const isMatch = userSector && isSectorMatch(company.sector, userSector)
            return (
              <button
                type="button"
                key={`${company.company_name}-${i}`}
                onClick={() => setSelectedCompany(company.company_name)}
                className={`w-full text-left p-3 rounded-lg cursor-pointer hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 ${isMatch ? 'bg-success/5 border border-success/20' : 'bg-muted/50 hover:bg-muted'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{company.company_name}</p>
                      {isMatch && (
                        <Badge variant="outline" className="text-[10px] py-0 text-success border-success/30">
                          Match
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {company.sector && (
                        <Badge variant="secondary" className="text-xs">{company.sector}</Badge>
                      )}
                      {company.stage && (
                        <Badge variant="outline" className="text-xs">{company.stage}</Badge>
                      )}
                    </div>
                  </div>
                  {company.amount_usd != null && company.amount_usd > 0 && (
                    <span className="text-sm font-semibold text-foreground shrink-0">
                      {formatAmount(company.amount_usd)}
                    </span>
                  )}
                </div>
                {company.description && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{company.description}</p>
                )}
                {company.why_appealing && (
                  <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">{company.why_appealing}</p>
                )}
              </button>
            )
          })}
        </div>
      </CardContent>

      {/* Company investors dialog */}
      <PortfolioCompanyDialog
        companyName={selectedCompany}
        open={!!selectedCompany}
        onOpenChange={(open) => { if (!open) setSelectedCompany(null) }}
      />
    </Card>
  )
}
