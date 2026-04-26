"use client"

/**
 * @file CoInvestmentNetworkSection.tsx
 *
 * @description Shows investors who share portfolio companies with the current investor.
 * Ranked by co-investment frequency. Professional+ users see syndication partner
 * intelligence with sector overlap and warm intro signals.
 */

import { useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardContent } from '@/components/ui/card'
import { Users, Building2, MapPin, Banknote, Sparkles, ChevronDown } from 'lucide-react'
import type { CoInvestor } from '@/actions/investors'

interface CoInvestmentNetworkSectionProps {
  coInvestors: CoInvestor[]
  /** Current investor's sectors for overlap calculation */
  investorSectors?: string[]
  /** Whether user has professional+ access for syndication details */
  hasIntelligenceAccess: boolean
}

function formatFundSize(gbp: number | undefined): string | null {
  if (!gbp) return null
  if (gbp >= 1_000_000_000) return `£${(gbp / 1_000_000_000).toFixed(1)}B`
  if (gbp >= 1_000_000) return `£${(gbp / 1_000_000).toFixed(0)}M`
  return `£${(gbp / 1_000).toFixed(0)}K`
}

function getSectorOverlap(a: string[] | undefined, b: string[] | undefined): string[] {
  if (!a?.length || !b?.length) return []
  const setB = new Set(b.map(s => s.toLowerCase()))
  return a.filter(s => setB.has(s.toLowerCase()))
}

export function CoInvestmentNetworkSection({
  coInvestors,
  investorSectors,
  hasIntelligenceAccess,
}: CoInvestmentNetworkSectionProps) {
  const [showAll, setShowAll] = useState(false)

  if (coInvestors.length === 0) return null

  const syndicationPartners = coInvestors.filter(c => c.sharedCompanyCount >= 3)
  const displayed = showAll ? coInvestors : coInvestors.slice(0, 10)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            Co-Investment Network
          </h2>
          <Badge variant="secondary" className="text-xs">
            {coInvestors.length} co-investor{coInvestors.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Co-investor grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {displayed.map((ci) => {
            const sectorOverlap = getSectorOverlap(investorSectors, ci.sectors)
            return (
              <Link
                key={ci.listingId}
                href={`/investors/${ci.listingId}`}
                className="group p-3 rounded-lg shadow-sm bg-card hover:-translate-y-0.5 active:scale-[0.99] transition-all duration-200 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-9 h-9 rounded-full bg-international-orange/10 flex items-center justify-center mt-0.5">
                    <Building2 className="h-4 w-4 text-international-orange" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground group-hover:text-international-orange transition-colors truncate">
                      {ci.firmName}
                    </p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {ci.sharedCompanyCount} shared investment{ci.sharedCompanyCount !== 1 ? 's' : ''}
                      </Badge>
                      {ci.firmType && (
                        <Badge variant="outline" className="text-xs">{ci.firmType}</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                      {ci.hqCity && (
                        <span className="flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {ci.hqCity}
                        </span>
                      )}
                      {ci.fundSizeGbp != null && ci.fundSizeGbp > 0 && (
                        <span className="flex items-center gap-0.5">
                          <Banknote className="h-3 w-3" />
                          {formatFundSize(ci.fundSizeGbp)}
                        </span>
                      )}
                    </div>
                    {/* Shared company names — professional+ only */}
                    {ci.sharedCompanyNames.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                        {ci.sharedCompanyNames.slice(0, 3).join(', ')}
                        {ci.sharedCompanyNames.length > 3 && ` +${ci.sharedCompanyNames.length - 3} more`}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Show all button */}
        {coInvestors.length > 10 && !showAll && (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
              <ChevronDown className="h-4 w-4 mr-1.5" />
              Show all {coInvestors.length} co-investors
            </Button>
          </div>
        )}

        {/* Syndication Partners — professional+ only */}
        {hasIntelligenceAccess && syndicationPartners.length > 0 && (
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-international-orange" />
              Syndication Partners
              <Badge variant="outline" className="text-xs text-success border-success/30">
                {syndicationPartners.length} frequent
              </Badge>
            </h3>
            <div className="space-y-3">
              {syndicationPartners.map((sp) => {
                const overlap = getSectorOverlap(investorSectors, sp.sectors)
                return (
                  <div key={sp.listingId} className="p-3 rounded-lg bg-success/5 border border-success/20">
                    <div className="flex items-center justify-between">
                      <Link
                        href={`/investors/${sp.listingId}`}
                        className="text-sm font-semibold text-foreground hover:text-international-orange transition-colors"
                      >
                        {sp.firmName}
                      </Link>
                      <Badge variant="success" className="text-xs">
                        {sp.sharedCompanyCount} co-investments
                      </Badge>
                    </div>
                    {sp.sharedCompanyNames.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-international-orange flex-shrink-0" />
                        Connected via: {sp.sharedCompanyNames.join(', ')}
                      </p>
                    )}
                    {overlap.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className="text-xs text-muted-foreground">Sector overlap:</span>
                        {overlap.map(s => (
                          <Badge key={s} variant="outline" className="text-[10px] py-0">{s}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
